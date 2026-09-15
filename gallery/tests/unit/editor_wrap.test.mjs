import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const core = context.AtelierStudioCore;

test("shared wrap controller applies fixed, window, and off layouts to an editor", () => {
  const values = new Map();
  const wrapper = {style: {maxWidth: "", borderRight: ""}};
  const calls = [];
  const editor = {
    getWrapperElement: () => wrapper,
    setOption: (...args) => calls.push(["setOption", ...args]),
    refresh: () => calls.push(["refresh"]),
  };
  const controller = core.createEditorWrapController({
    getEditor: () => editor,
    storage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)},
    document: {}, window: {},
  });
  // Chaque apply() pose lineWrapping ET fluidText (texte fluide, 2026-09-08)
  // puis refresh() : on lit les options par nom, pas par position.
  const optionsSince = (from) => Object.fromEntries(calls.slice(from).filter(([k]) => k === "setOption").map(([, name, value]) => [name, value]));
  let mark = calls.length;
  controller.apply("72");
  assert.equal(wrapper.style.maxWidth, "calc(72ch + 70px)");
  assert.equal(wrapper.style.borderRight, "1px solid #33384a");
  assert.deepEqual(optionsSince(mark), {lineWrapping: true, fluidText: false});
  assert.deepEqual(calls.at(-1), ["refresh"]);
  mark = calls.length;
  controller.apply("fluid");
  assert.equal(wrapper.style.maxWidth, "");
  assert.deepEqual(optionsSince(mark), {lineWrapping: true, fluidText: true});
  mark = calls.length;
  controller.apply("off");
  assert.equal(wrapper.style.maxWidth, "");
  assert.deepEqual(optionsSince(mark), {lineWrapping: false, fluidText: false});
  assert.equal(controller.current(), "off");
});
