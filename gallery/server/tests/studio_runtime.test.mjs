import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_runtime.bundle.js", import.meta.url), "utf8");

function createHarness({search = "", hash = "", stored = {}} = {}) {
  const fetchCalls = [];
  const postMessages = [];
  const classes = new Set();
  const values = new Map(Object.entries(stored));
  const location = {
    search,
    hash,
    href: `http://127.0.0.1:3000/latex_studio.html${search}${hash}`,
    origin: "http://127.0.0.1:3000",
  };
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const window = {
    location,
    localStorage: storage,
    sessionStorage: storage,
    document: {documentElement: {classList: {add: (name) => classes.add(name)}}},
    fetch: (input, init) => {
      fetchCalls.push({input, init});
      return Promise.resolve({ok: true});
    },
    top: {postMessage: (payload, target) => postMessages.push({payload, target})},
  };
  window.window = window;
  const context = vm.createContext({window, document: window.document, location, URL, URLSearchParams, Request, console});
  vm.runInContext(bundle, context);
  return {runtime: context.AtelierStudioRuntime, window, fetchCalls, postMessages, classes, values};
}

test("token runtime authenticates same-origin requests exactly once", async () => {
  const harness = createHarness({search: "?path=paper.tex&token=secret"});
  harness.runtime.bootstrap({tokenFetch: true});
  harness.runtime.bootstrap({tokenFetch: true});
  await harness.window.fetch("/code?path=paper.tex");
  await harness.window.fetch("https://example.org/code?path=paper.tex");

  assert.equal(harness.window.__tokq, "&token=secret");
  assert.equal(harness.fetchCalls[0].input, "/code?path=paper.tex&token=secret");
  assert.equal(harness.fetchCalls[1].input, "https://example.org/code?path=paper.tex");
});

test("host bridge persists the iframe nonce and adds it to every message", () => {
  const harness = createHarness({hash: "#atelier_nonce=abc-123"});
  harness.runtime.bootstrap({hostBridge: true, tokenFetch: false});
  harness.window.__atelierPost({type: "atelier-open-pdf", pdf: "paper.pdf"});

  assert.equal(harness.values.get("atelier_nonce"), "abc-123");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.postMessages)), [{
    payload: {type: "atelier-open-pdf", pdf: "paper.pdf", nonce: "abc-123"},
    target: "*",
  }]);
});

test("LaTeX startup policy prevents split-view flash unless explicitly enabled", () => {
  const editorOnly = createHarness();
  editorOnly.runtime.bootstrap({latexDisplayPolicy: true, tokenFetch: false});
  assert.equal(editorOnly.classes.has("tex-editor-only"), true);

  const split = createHarness({stored: {texPdfVisible: "1"}});
  split.runtime.bootstrap({latexDisplayPolicy: true, tokenFetch: false});
  assert.equal(split.classes.has("tex-editor-only"), false);

  const pdf = createHarness({search: "?mode=pdf"});
  pdf.runtime.bootstrap({latexDisplayPolicy: true, tokenFetch: false});
  assert.equal(pdf.classes.has("tex-editor-only"), false);
});
