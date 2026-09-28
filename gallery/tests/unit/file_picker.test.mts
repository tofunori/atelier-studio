import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {JSDOM} from "jsdom";
import {build} from "esbuild";

const source = (await build({entryPoints: [new URL("../../src/studio/core/index.ts", import.meta.url).pathname], bundle: true, write: false, format: "iife", globalName: "AtelierStudioCore"})).outputFiles[0].text;
const context: import("node:vm").Context = {};
vm.runInNewContext(source, context);
const core = context.AtelierStudioCore;

test("recent Studio files are deduplicated, ordered, and capped", () => {
  const values = new Map([["studioRecents", JSON.stringify(Array.from({length: 12}, (_, index) => `/p/${index}.tex`))]]);
  const storage = {getItem: (key) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value)};
  core.addRecentStudioFile("/p/5.tex", storage);
  const recent = core.recentStudioFiles(storage);
  assert.equal(recent[0], "/p/5.tex");
  assert.equal(recent.length, 10);
  assert.equal(recent.filter((item) => item === "/p/5.tex").length, 1);
});

test("Studio file routing keeps TeX in LaTeX and everything else in Code", () => {
  assert.equal(core.studioPageForPath("/project/main.tex"), "latex_studio.html");
  assert.equal(core.studioPageForPath("/project/notes.md"), "code_editor.html");
  assert.equal(core.studioPageForPath("/project/model.py"), "code_editor.html");
});

function pickerFixture(t: test.TestContext) {
  const dom = new JSDOM('<button id="open">Ouvrir</button><div id="picker"><div><div id="path"></div><div id="list"></div></div></div>', {url:"http://localhost"});
  t.after(() => dom.window.close());
  const win = dom.window, doc = win.document;
  win.fetch = async () => ({ok:true,json:async () => ({path:"/project",items:[{name:"notes.md",dir:false},{name:"data.csv",dir:false},{name:"sources",dir:true}]})});
  const opener = doc.getElementById("open"); opener.focus();
  const picker = core.createStudioFilePicker({currentPath:"/project/main.tex",picker:doc.getElementById("picker"),pathLabel:doc.getElementById("path"),list:doc.getElementById("list"),openButton:opener,window:win,document:doc});
  return {win,doc,opener,picker};
}

test("file picker focuses native actions, supports arrow/Home/End and traps Tab until Escape", async t => {
  const {win,doc,opener,picker} = pickerFixture(t);
  await picker.show();
  const buttons = [...doc.querySelectorAll("#list button")];
  assert.equal(buttons.length,3); assert.equal(doc.activeElement,buttons[0]);
  assert.equal(doc.querySelector('[role="dialog"]').getAttribute("aria-modal"),"true");
  const key = (key: string, shiftKey = false) => doc.activeElement.dispatchEvent(new win.KeyboardEvent("keydown",{key,shiftKey,bubbles:true,cancelable:true}));
  key("ArrowDown"); assert.equal(doc.activeElement,buttons[1]);
  key("End"); assert.equal(doc.activeElement,buttons[2]);
  key("Tab"); assert.equal(doc.activeElement,buttons[0]);
  key("Tab",true); assert.equal(doc.activeElement,buttons[2]);
  key("Home"); assert.equal(doc.activeElement,buttons[0]);
  key("Escape"); assert.equal(doc.activeElement,opener); assert.equal(doc.getElementById("picker").classList.contains("show"),false);
});

test("a pending picker request cannot reopen it after Escape", async t => {
  const {win,doc,opener,picker} = pickerFixture(t);
  let resolve;
  win.fetch = () => new Promise(r => {resolve = r;});
  const pending = picker.show(); picker.hide();
  resolve({ok:true,json:async () => ({path:"/project",items:[{name:"x.md",dir:false}]})}); await pending;
  assert.equal(doc.getElementById("picker").classList.contains("show"),false); assert.equal(doc.activeElement,opener);
});

test("picker network failure stays navigable and presents retry", async t => {
  const {win,doc,picker} = pickerFixture(t);
  win.fetch = async () => {throw new Error("offline");};
  await picker.show();
  assert.match(doc.getElementById("path").textContent,/Impossible/);
  assert.equal(doc.activeElement.textContent,"Réessayer");
});
