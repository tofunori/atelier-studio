import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console, fetch, setTimeout, clearTimeout});
vm.runInContext(bundle, context);
const {attachEditorSelection} = context.AtelierStudioCore;

function harness({native = true, text = "alpha beta"} = {}) {
  const listeners = new Map();
  const requests = [];
  const marks = [];
  const editor = {
    hasNativeSelectionHighlight: native,
    getSelection: () => text,
    getCursor: (which) => which === "from" ? {line: 4, ch: 2} : {line: 5, ch: 3},
    markText: (from, to, options) => {
      const mark = {from, to, options, cleared: false, clear(){ this.cleared = true; }};
      marks.push(mark); return mark;
    },
    on: (event, callback) => listeners.set(event, callback),
    off: (event) => listeners.delete(event),
  };
  const hostWindow = {};
  const bridge = attachEditorSelection({
    editor,
    delayMs: 0,
    hostWindow,
    fetchImpl: async (url, init) => { requests.push({url, init}); return {ok:true}; },
    buildPayload: (selection) => ({
      text: selection.text,
      words: selection.words,
      lines: selection.lines,
      page: `L${selection.from.line + 1}-L${selection.to.line + 1}`,
    }),
  });
  return {bridge, editor, hostWindow, listeners, marks, requests};
}

test("selection bridge publishes the logical range without a CM6 follow-up mark", () => {
  const h = harness({native:true});
  h.bridge.publish();
  assert.equal(h.marks.length, 0);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(JSON.parse(h.requests[0].init.body), {
    text:"alpha beta", words:2, lines:2, page:"L5-L6",
  });
});

test("selection bridge keeps the CM5 fallback marker behind the shared seam", () => {
  const h = harness({native:false});
  h.bridge.publish();
  assert.equal(h.marks.length, 1);
  assert.equal(h.hostWindow._clMark, h.marks[0]);
  h.bridge.clear();
  assert.equal(h.marks[0].cleared, true);
  assert.equal(h.hostWindow._clMark, null);
});

test("selection bridge respects comparison-mode guards", () => {
  const h = harness();
  let skipped = 0;
  const guarded = attachEditorSelection({
    editor:h.editor, delayMs:0, hostWindow:h.hostWindow,
    fetchImpl:async (url, init) => { h.requests.push({url, init}); return {ok:true}; },
    buildPayload:() => ({}), canPublish:() => false, onSkipped:() => { skipped += 1; },
  });
  guarded.publish();
  assert.equal(skipped, 1);
  assert.equal(h.requests.length, 0);
});
