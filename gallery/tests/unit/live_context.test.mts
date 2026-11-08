// « Le chat sait ce que tu regardes » : forme du message `atelier-live-context`
// posté par les éditeurs et le lecteur PDF, différé et dédoublonné.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console, fetch, setTimeout, clearTimeout});
vm.runInContext(bundle, context);
const core = context.AtelierStudioCore;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    setTimeout: (fn: () => void) => { const id = next++; pending.set(id, fn); return id; },
    clearTimeout: (id: number) => { pending.delete(id); },
    run() { const fns = [...pending.values()]; pending.clear(); fns.forEach((fn) => fn()); },
    get size() { return pending.size; },
  };
}

test("editor context: cursor line when nothing is selected", () => {
  assert.deepEqual(plain(core.buildEditorLiveContext({
    path: "/p/thesis/ch1.tex", kind: "tex", selection: "",
    from: {line: 41, ch: 3}, to: {line: 41, ch: 3}, cursor: {line: 41, ch: 3},
  })), {path: "/p/thesis/ch1.tex", name: "ch1.tex", kind: "tex", line: 42});
});

test("editor context: selected range is 1-based and ignores a trailing column-0 head", () => {
  const ctx = plain(core.buildEditorLiveContext({
    path: "/p/a.py", kind: "code", selection: "a\nb\n",
    from: {line: 9, ch: 0}, to: {line: 11, ch: 0}, cursor: {line: 11, ch: 0},
  }));
  assert.deepEqual(ctx, {path: "/p/a.py", name: "a.py", kind: "code", lineFrom: 10, lineTo: 11, selection: "a\nb\n"});
  const reversed = plain(core.buildEditorLiveContext({
    path: "/p/a.py", kind: "code", selection: "xy",
    from: {line: 5, ch: 4}, to: {line: 2, ch: 1},
  }));
  assert.equal(reversed.lineFrom, 3);
  assert.equal(reversed.lineTo, 6);
});

test("editor context: selection cut at 12000 chars, whitespace is not a selection, no path is null", () => {
  const long = "x".repeat(13000);
  const ctx = core.buildEditorLiveContext({path: "/p/a.tex", kind: "tex", selection: long, from: {line: 0, ch: 0}, to: {line: 0, ch: 13000}});
  assert.equal(ctx.selection.length, 12000);
  const blank = plain(core.buildEditorLiveContext({path: "/p/a.tex", kind: "tex", selection: "  \n", from: {line: 3, ch: 0}, to: {line: 4, ch: 0}, cursor: {line: 4, ch: 0}}));
  assert.equal(blank.selection, undefined);
  assert.equal(blank.line, 5);
  assert.equal(core.buildEditorLiveContext({path: null, kind: "tex"}), null);
});

test("comments: open notes only, document order, max 10, line of `from`", () => {
  const annotations = [
    {id: "b", from: {line: 30, ch: 0}, to: {line: 30, ch: 5}, text: "albedo", comment: " cite Ren 2021 "},
    {id: "h", from: {line: 1, ch: 0}, to: {line: 1, ch: 4}, text: "just a highlight", comment: "", kind: "hl"},
    {id: "a", from: {line: 4, ch: 2}, to: {line: 4, ch: 9}, text: "", comment: "reword"},
  ];
  assert.deepEqual(plain(core.liveContextComments(annotations)), [
    {text: "reword", line: 5},
    {text: "cite Ren 2021", line: 31, quote: "albedo"},
  ]);
  const many = Array.from({length: 14}, (_, i) => ({from: {line: i, ch: 0}, text: "q", comment: `c${i}`}));
  assert.equal(core.liveContextComments(many).length, 10);
  const ctx = core.buildEditorLiveContext({path: "/p/a.tex", kind: "tex", cursor: {line: 0, ch: 0}, comments: core.liveContextComments(many)});
  assert.equal(ctx.comments.length, 10);
  assert.equal(plain(core.buildEditorLiveContext({path: "/p/a.tex", kind: "tex", cursor: {line: 0, ch: 0}, comments: []})).comments, undefined);
});

test("pdf context: page / pageCount and absolute path from the gallery root", () => {
  assert.equal(core.resolvePdfLivePath({file: "out/paper.pdf", projectRoot: "/Users/t/these/"}), "/Users/t/these/out/paper.pdf");
  assert.equal(core.resolvePdfLivePath({file: "out/paper.pdf", projectRoot: null}), "out/paper.pdf");
  assert.equal(core.resolvePdfLivePath({file: "x.pdf", projectRoot: "/r", texPdf: "/abs/main.pdf"}), "/abs/main.pdf");
  assert.equal(core.resolvePdfLivePath({file: "kb-pdf/42", projectRoot: "/r"}), "kb-pdf/42");
  assert.equal(core.resolvePdfLivePath({file: null, projectRoot: "/r"}), null);
  assert.deepEqual(plain(core.buildPdfLiveContext({path: "/r/out/paper.pdf", page: 3, pageCount: 12, selection: ""})),
    {path: "/r/out/paper.pdf", name: "paper.pdf", kind: "pdf", page: 3, pageCount: 12});
  assert.equal(core.buildPdfLiveContext({path: "/r/a.pdf", page: 2, pageCount: 4, selection: "ice"}).selection, "ice");
});

test("publisher: debounced, posts only on change, repost forces the current value", () => {
  const timers = fakeTimers();
  const posted: any[] = [];
  let line = 1;
  const publisher = core.createLiveContextPublisher({
    build: () => core.buildEditorLiveContext({path: "/p/a.tex", kind: "tex", cursor: {line: line - 1, ch: 0}}),
    postToHost: (payload: unknown) => posted.push(plain(payload)),
    timers,
  });
  publisher.schedule(); publisher.schedule(); publisher.schedule();
  assert.equal(posted.length, 0);
  assert.equal(timers.size, 1);
  timers.run();
  assert.deepEqual(posted, [{type: "atelier-live-context", context: {path: "/p/a.tex", name: "a.tex", kind: "tex", line: 1}}]);
  publisher.schedule(); timers.run();
  assert.equal(posted.length, 1, "unchanged value is not re-posted");
  line = 7; publisher.schedule(); timers.run();
  assert.equal(posted.length, 2);
  assert.equal(posted[1].context.line, 7);
  publisher.repost();
  assert.equal(posted.length, 3, "tab activation re-posts the same value");
  publisher.dispose(); publisher.schedule(); timers.run();
  assert.equal(posted.length, 3);
});

test("selection bridge: cursorActivity also feeds the live context, tab activation re-posts", () => {
  const timers = fakeTimers();
  const listeners = new Map<string, () => void>();
  const messages: Array<(event: any) => void> = [];
  const parent = {};
  const hostWindow: any = {
    parent,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    addEventListener: (type: string, fn: (event: any) => void) => { if (type === "message") messages.push(fn); },
    removeEventListener: () => undefined,
  };
  let selection = "";
  let from = {line: 2, ch: 0}, to = {line: 2, ch: 0};
  const editor = {
    hasNativeSelectionHighlight: true,
    getSelection: () => selection,
    getCursor: (which?: string) => which === "from" ? from : to,
    markText: () => ({clear() {}}),
    on: (event: string, cb: () => void) => listeners.set(event, cb),
    off: (event: string) => listeners.delete(event),
  };
  const posted: any[] = [];
  core.attachEditorSelection({
    editor, delayMs: 0, hostWindow,
    fetchImpl: async () => ({ok: true}),
    buildPayload: () => ({}),
    liveContext: {path: "/p/ch1.tex", kind: "tex", postToHost: (p: unknown) => posted.push(plain(p)),
      comments: () => [{line: 3, quote: "q", text: "t"}]},
  });
  timers.run();
  assert.deepEqual(posted.at(-1).context, {path: "/p/ch1.tex", name: "ch1.tex", kind: "tex", line: 3,
    comments: [{line: 3, quote: "q", text: "t"}]});
  selection = "alpha"; from = {line: 4, ch: 0}; to = {line: 4, ch: 5};
  listeners.get("cursorActivity")!();
  timers.run();
  assert.equal(posted.at(-1).context.selection, "alpha");
  assert.equal(posted.at(-1).context.lineFrom, 5);
  const count = posted.length;
  messages.forEach((fn) => fn({source: {}, data: {type: "atelier-tab-activated"}}));
  assert.equal(posted.length, count, "only the parent frame may ask for a re-post");
  messages.forEach((fn) => fn({source: parent, data: {type: "atelier-tab-activated"}}));
  assert.equal(posted.length, count + 1);
});
