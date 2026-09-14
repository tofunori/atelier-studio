import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console});
vm.runInContext(bundle, context);
const {captureEditorViewport, restoreEditorViewport, revealLineRange} = context.AtelierStudioCore;

function editorHarness(){
  const calls = [];
  const editor = {
    lineCount: () => 100,
    getCursor: (which) => which === "anchor" ? {line:40,ch:2} : {line:41,ch:5},
    getScrollInfo: () => ({left:12,top:900}),
    operation: (fn) => fn(),
    setSelection: (anchor, head) => calls.push(["selection", anchor, head]),
    scrollTo: (left, top) => calls.push(["scrollTo", left, top]),
    refresh: () => calls.push(["refresh"]),
    setCursor: (position) => calls.push(["cursor", position]),
    scrollIntoView: (range, margin) => calls.push(["reveal", range, margin]),
    focus: () => calls.push(["focus"]),
  };
  return {editor,calls};
}

test("viewport snapshot restores selection and exact scroll coordinates", () => {
  const h = editorHarness();
  const snapshot = captureEditorViewport(h.editor);
  restoreEditorViewport(h.editor, snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [
    ["selection",{line:40,ch:2},{line:41,ch:5}],
    ["scrollTo",12,900],
    ["refresh"],
  ]);
});

test("line reveal uses a CM5-compatible range and clamps context", () => {
  const h = editorHarness();
  const range = revealLineRange(h.editor,{fromLine:96,toLine:98,contextAfter:5,margin:150,focus:true});
  assert.deepEqual(JSON.parse(JSON.stringify(range)), {from:{line:96,ch:0},to:{line:99,ch:0}});
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [
    ["cursor",{line:96,ch:0}],
    ["reveal",{from:{line:96,ch:0},to:{line:99,ch:0}},150],
    ["focus"],
  ]);
});
