import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const bundled = await build({entryPoints: [new URL("../../src/studio/features/markdown/wysiwyg_selection.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "iife", globalName: "MarkdownSelection"});
const source = bundled.outputFiles[0].text;
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (value: { message?: string; annots?: undefined[]; error?: string; }, ok = true) => ({ok, json: async () => value});

async function fixture(t: test.TestContext) {
  const dom = new JSDOM('<div class="toastui-editor-ww-container"><div class="ProseMirror">First passage. Second passage.</div></div>',
    {url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true});
  const win = dom.window;
  const posts = [], writes = [], quotes = [], ackTimers = new Map();
  let nextTimer = 100000, writer = () => response({}), quote = () => response({message: "quoted passage"});
  const originalTimeout = win.setTimeout.bind(win), originalClear = win.clearTimeout.bind(win);
  win.setTimeout = (fn, ms: number, ...args) => {
    if (ms >= 900) {const id = nextTimer++; ackTimers.set(id, fn); return id;}
    return originalTimeout(fn, ms, ...args);
  };
  win.clearTimeout = (id) => {ackTimers.delete(id); originalClear(id);};
  win.__atelierNonce = "test-nonce";
  win.Range.prototype.getBoundingClientRect = () => ({left: 40, right: 180, top: 40, bottom: 60, width: 140, height: 20});
  win.fetch = async (url: string, init: { body: string; method: string; }) => {
    if (url === "/quote") {quotes.push(JSON.parse(init.body)); return quote();}
    if (init?.method === "POST") {writes.push(JSON.parse(init.body)); return writer();}
    return response({annots: []});
  };
  win.eval(source + "\nwindow.MarkdownSelection = MarkdownSelection;");
  const controller = win.MarkdownSelection.createMarkdownWysiwygSelection({path: "notes.md",
    getMarkdown: () => "First passage. Second passage.", postToHost: (payload) => posts.push(payload)});
  t.after(() => {controller.destroy(); win.close();});
  const actions = win.document.querySelector(".markdown-selection-actions");
  const note = win.document.querySelector(".markdown-annotation-editor");
  const add = actions.querySelector('[aria-label="Ajouter au chat"]');
  const input = note.querySelector("textarea");
  const select = async (text, capture = true) => {
    const node = win.document.querySelector(".ProseMirror").firstChild;
    const range = win.document.createRange(), offset = node.data.indexOf(text);
    range.setStart(node, offset); range.setEnd(node, offset + text.length);
    win.getSelection().removeAllRanges(); win.getSelection().addRange(range);
    if (capture) {
      win.document.dispatchEvent(new win.MouseEvent("mouseup", {bubbles: true}));
      await new Promise(resolve => originalTimeout(resolve, 10));
    }
  };
  const annotate = () => actions.querySelector('[aria-label="Annoter"]').click();
  const submit = (value = "my note", direct = false) => {
    input.value = value; note.querySelector(direct ? ".send-direct" : ".send2").click();
  };
  const ack = (ok = true, requestId = posts.at(-1)?.requestId, extra: Record<string, any> = {}) => win.dispatchEvent(new win.MessageEvent("message", {
    source: win.top, data: {type: "atelier-add-to-chat-ack", nonce: "test-nonce", requestId, ok, error: "Ajout refusé", ...extra},
  }));
  const timeout = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [id, callback] = ackTimers.entries().next().value;
      ackTimers.delete(id); callback(); await tick();
    }
  };
  await select("First passage.");
  return {win, posts, writes, quotes, actions, note, add, input, select, annotate, submit, ack, timeout, controller,
    setWriter(fn) {writer = fn;}, setQuote(fn) {quote = fn;}};
}

test("WYSIWYG quote waits for matching ACK, stays busy, and blocks duplicate dispatch", async t => {
  const f = await fixture(t);
  f.add.click(); f.add.onclick(new f.win.MouseEvent("click")); await tick();
  assert.equal(f.quotes.length, 1); assert.equal(f.posts.length, 1);
  assert.equal(f.add.disabled, true); assert.equal(f.actions.getAttribute("aria-busy"), "true");
  assert.equal(f.win.getSelection().toString(), "First passage.");
  f.ack(true, "wrong"); f.ack(true, undefined, {nonce: "wrong"}); await tick();
  assert.equal(f.add.disabled, true);
  f.ack(); await tick();
  assert.equal(f.win.getSelection().rangeCount, 0); assert.equal(f.actions.style.display, "none");
  assert.equal(f.add.disabled, false);
});

test("WYSIWYG quote refusal retains the selection and retries the same insertion", async t => {
  const f = await fixture(t);
  f.add.click(); await tick(); f.ack(false); await tick();
  assert.equal(f.win.getSelection().toString(), "First passage.");
  assert.equal(f.actions.style.display, "flex"); assert.equal(f.add.disabled, false);
  assert.match(f.actions.textContent, /Ajout refusé/);
  f.win.document.dispatchEvent(new f.win.MouseEvent("mouseup", {bubbles: true}));
  await new Promise(resolve => setTimeout(resolve, 10));
  f.add.click(); await tick();
  assert.equal(f.quotes.length, 1); assert.equal(f.posts.length, 2);
  assert.equal(f.posts[0].requestId, f.posts[1].requestId);
  f.ack(); await tick(); assert.equal(f.win.getSelection().rangeCount, 0);
});

test("WYSIWYG quote timeout retains a stable identity across automatic and manual retries", async t => {
  const f = await fixture(t);
  f.add.click(); await tick(); await f.timeout();
  assert.equal(f.posts.length, 3); assert.equal(f.add.disabled, false);
  assert.match(f.actions.textContent, /non confirmé/);
  assert.equal(f.win.getSelection().toString(), "First passage.");
  f.add.click(); await tick();
  assert.equal(new Set(f.posts.map(p => p.requestId)).size, 1);
  f.ack(); await tick(); assert.equal(f.actions.style.display, "none");
});

for (const captured of [true, false]) test(`late quote ACK preserves a newer selection (captured=${captured})`, async t => {
  const f = await fixture(t);
  f.add.click(); await tick();
  await f.select("Second passage.", captured);
  f.ack(); await tick();
  assert.equal(f.win.getSelection().toString(), "Second passage.");
  assert.equal(f.actions.style.display, "flex");
});

test("WYSIWYG note remains busy until ACK and refusal retries without another annotation", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit(); await tick();
  f.input.dispatchEvent(new f.win.KeyboardEvent("keydown", {key: "Enter", bubbles: true})); await tick();
  assert.equal(f.writes.length, 1); assert.equal(f.posts.length, 1);
  assert.equal(f.input.disabled, true); assert.equal(f.note.getAttribute("aria-busy"), "true");
  assert.equal(f.note.style.display, "flex");
  f.ack(false); await tick();
  assert.equal(f.input.disabled, false); assert.equal(f.input.value, "my note");
  assert.equal(f.note.style.display, "flex"); assert.match(f.note.textContent, /Ajout refusé/);
  f.submit(); await tick();
  assert.equal(f.writes.length, 1); assert.equal(f.posts.length, 2);
  assert.equal(f.posts[0].requestId, f.posts[1].requestId);
  assert.equal(f.posts[0].pdfAnnotation.id, f.posts[1].pdfAnnotation.id);
  f.ack(); await tick();
  assert.equal(f.note.style.display, "none"); assert.equal(f.win.getSelection().rangeCount, 0);
});

test("WYSIWYG direct note timeout retries without duplicating its persisted mark or direct insertion", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit("direct note", true); await tick(); await f.timeout();
  assert.equal(f.input.value, "direct note"); assert.equal(f.input.disabled, false);
  assert.match(f.note.textContent, /non confirmé/);
  f.submit("direct note", true); await tick();
  assert.equal(f.writes.length, 1); assert.equal(f.posts.length, 4);
  assert.equal(new Set(f.posts.map(p => p.requestId)).size, 1);
  assert.ok(f.posts.every(p => p.direct === true));
  f.ack(); await tick(); assert.equal(f.note.style.display, "none");
});

test("editing a refused note updates its existing mark and creates a new logical request", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit("version one"); await tick(); f.ack(false); await tick();
  f.submit("version two"); await tick();
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].annots.length, 1);
  assert.equal(f.writes[0].annots[0].id, f.writes[1].annots[0].id);
  assert.equal(f.writes[1].annots[0].comment, "version two");
  assert.notEqual(f.posts[0].requestId, f.posts[1].requestId);
  f.ack(); await tick();
});

test("annotation save failure keeps the draft and a retry persists only one mark", async t => {
  const f = await fixture(t);
  f.setWriter(() => response({error: "disk full"}, false));
  f.annotate(); f.submit(); await tick();
  assert.equal(f.posts.length, 0); assert.equal(f.input.value, "my note");
  assert.equal(f.input.disabled, false); assert.match(f.note.textContent, /Enregistrement impossible/);
  f.setWriter(() => response({})); f.submit(); await tick();
  assert.equal(f.writes[1].annots.length, 1);
  assert.equal(f.writes[0].annots[0].id, f.writes[1].annots[0].id);
  f.ack(); await tick();
});

test("late note ACK does not close or enable a newer pending draft", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit("first note"); await tick();
  const firstId = f.posts[0].requestId;
  f.win.document.dispatchEvent(new f.win.KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
  await f.select("Second passage."); f.annotate(); f.submit("second note"); await tick();
  f.ack(true, firstId); await tick();
  assert.equal(f.note.style.display, "flex"); assert.equal(f.input.value, "second note");
  assert.equal(f.input.disabled, true); assert.equal(f.win.getSelection().toString(), "Second passage.");
  f.ack(); await tick(); assert.equal(f.note.style.display, "none");
});

test("a new selection made while a note awaits ACK regains its actions after confirmation", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit("first note"); await tick();
  await f.select("Second passage.");
  f.ack(); await tick();
  assert.equal(f.note.style.display, "none");
  assert.equal(f.win.getSelection().toString(), "Second passage.");
  assert.equal(f.actions.style.display, "flex");
  f.add.click(); await tick();
  assert.equal(f.quotes[0].text, "Second passage.");
  f.ack(); await tick();
});

test("deleting a refused note removes its saved annotation and preserves a newer selection", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit(); await tick(); f.ack(false); await tick();
  await f.select("Second passage.");
  f.note.querySelector(".delete-note").click(); await tick();
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].annots.length, 0);
  assert.equal(f.note.style.display, "none");
  assert.equal(f.win.getSelection().toString(), "Second passage.");
  assert.equal(f.actions.style.display, "flex");
});

test("failed deletion keeps the refused note retryable and restores its saved mark", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit(); await tick(); f.ack(false); await tick();
  f.setWriter(() => response({error: "disk full"}, false));
  f.note.querySelector(".delete-note").click(); await tick();
  assert.equal(f.note.style.display, "flex"); assert.equal(f.input.value, "my note");
  assert.equal(f.input.disabled, false); assert.match(f.note.textContent, /Suppression non enregistrée/);
  f.setWriter(() => response({}));
  f.note.querySelector(".delete-note").click(); await tick();
  assert.equal(f.writes.length, 3); assert.equal(f.writes[2].annots.length, 0);
  assert.equal(f.note.style.display, "none");
});

test("deletion after a failed note edit also removes the previous persisted version", async t => {
  const f = await fixture(t);
  f.annotate(); f.submit("version one"); await tick(); f.ack(false); await tick();
  f.setWriter(() => response({error: "disk full"}, false));
  f.submit("version two"); await tick();
  assert.match(f.note.textContent, /Enregistrement impossible/);
  f.setWriter(() => response({}));
  f.note.querySelector(".delete-note").click(); await tick();
  assert.equal(f.writes.length, 3); assert.equal(f.writes[2].annots.length, 0);
  assert.equal(f.note.style.display, "none");
});

test("destroying the editor prevents an in-flight quote from posting later", async t => {
  const f = await fixture(t);
  let resolve;
  f.setQuote(() => new Promise(done => {resolve = done;}));
  f.add.click(); f.controller.destroy(); resolve(response({message: "late quote"})); await tick();
  assert.equal(f.posts.length, 0);
});
