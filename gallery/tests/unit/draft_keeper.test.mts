// Brouillon de secours des éditeurs (audit 2026-10-18, problème 1) : le
// gardien écrit le tampon modifié sur le serveur galerie, l'efface quand le
// tampon redevient propre, publie l'état « modifié » à l'app hôte et obéit à
// ses demandes (abandon, écriture immédiate) — jamais d'écriture du fichier.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console});
vm.runInContext(bundle, context);
const {createDraftKeeper, createDocumentSession} = context.AtelierStudioCore;

type Request = {url: string; init?: {method?: string; body?: string; keepalive?: boolean}};

function harness(options: {standalone?: boolean; draft?: unknown} = {}) {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const parent = {};
  const win: any = {
    setTimeout: (fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
  };
  win.self = win;
  win.top = options.standalone ? win : parent;
  win.parent = options.standalone ? win : parent;
  const requests: Request[] = [];
  const posted: any[] = [];
  const fetchImpl = async (url: string, init?: Request["init"]) => {
    requests.push({url, init});
    const body = url.startsWith("/draft?") ? {ok: true, draft: options.draft ?? null} : {ok: true};
    return {ok: true, json: async () => body};
  };
  const fire = (type: string, event: any = {}) => {
    for (const fn of listeners.get(type) ?? []) fn(event);
  };
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const fn of pending) fn();
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {win, parent, requests, posted, fetchImpl, fire, runTimers, settle, timers};
}

function bodies(requests: Request[]) {
  return requests.filter((request) => request.init?.method === "POST").map((request) => JSON.parse(request.init!.body!));
}

test("a dirty buffer is written as a draft after the delay, never more than once per delay", async () => {
  const h = harness();
  let text = "base";
  let dirty = false;
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => text, getBase: () => ({text: "base", mtime: 7}),
    isDirty: () => dirty, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win, delayMs: 1000,
  });
  text = "typed"; dirty = true;
  keeper.setDirty(true);
  keeper.noteChange();
  keeper.noteChange();
  assert.equal(h.timers.size, 1, "une seule écriture programmée pendant la frappe");
  h.runTimers();
  await h.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(bodies(h.requests))), [{path: "/p/a.tex", text: "typed", base: "base", baseMtime: 7}]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.posted)), [{type: "atelier-dirty", dirty: true, path: "/p/a.tex"}]);
});

test("returning to a clean buffer clears the draft and tells the host", async () => {
  const h = harness();
  let dirty = true;
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => "typed", getBase: () => ({text: "base", mtime: 7}),
    isDirty: () => dirty, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win,
  });
  keeper.setDirty(true);
  h.runTimers();
  await h.settle();
  dirty = false;
  keeper.setDirty(false);
  await h.settle();
  await h.settle();
  const sent = JSON.parse(JSON.stringify(bodies(h.requests)));
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], {path: "/p/a.tex", clear: true});
  assert.deepEqual(JSON.parse(JSON.stringify(h.posted.map((payload) => payload.dirty))), [true, false]);
});

test("pagehide sends the last draft with keepalive", async () => {
  const h = harness();
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => "last words", getBase: () => ({text: "base", mtime: 7}),
    isDirty: () => true, fetchImpl: h.fetchImpl, window: h.win,
  });
  keeper.noteChange();
  h.fire("pagehide");
  await h.settle();
  assert.equal(h.timers.size, 0, "l'écriture programmée est remplacée par l'envoi de sortie");
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].init?.keepalive, true);
  assert.equal(JSON.parse(h.requests[0].init!.body!).text, "last words");
});

test("the host can discard the draft (close without saving) and is acknowledged", async () => {
  const h = harness();
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => "typed", getBase: () => ({text: "base", mtime: 7}),
    isDirty: () => true, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win,
  });
  keeper.setDirty(true);
  h.fire("message", {source: {}, data: {type: "atelier-discard-draft"}});
  await h.settle();
  assert.equal(h.requests.length, 0, "seule la fenêtre parente est obéie");
  h.fire("message", {source: h.parent, data: {type: "atelier-discard-draft"}});
  await h.settle();
  await h.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(bodies(h.requests))), [{path: "/p/a.tex", clear: true}]);
  assert.ok(h.posted.some((payload) => payload.type === "atelier-draft-discarded"));
  h.runTimers();
  h.fire("pagehide");
  await h.settle();
  assert.equal(h.requests.length, 1, "plus aucun brouillon après l'abandon");
});

test("the host can ask for an immediate write before reloading the frame", async () => {
  const h = harness();
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => "typed", getBase: () => ({text: "base", mtime: 7}),
    isDirty: () => true, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win,
  });
  keeper.noteChange();
  h.fire("message", {source: h.parent, data: {type: "atelier-flush-draft"}});
  await h.settle();
  await h.settle();
  assert.equal(h.timers.size, 0);
  assert.equal(bodies(h.requests)[0].text, "typed");
  assert.ok(h.posted.some((payload) => payload.type === "atelier-draft-flushed"));
});

test("restore hands the server draft to the session, which keeps it dirty and unsaved", async () => {
  const h = harness({draft: {text: "draft", base: "disk", baseMtime: 5, savedAt: 1700000000}});
  let text = "";
  const writes: string[] = [];
  const session = createDocumentSession({
    read: async () => ({text: "disk", mtime: 5}),
    write: async (next: string) => { writes.push(next); return {mtime: 6}; },
    getText: () => text,
    applyText: (next: string) => { text = next; },
  });
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => text, getBase: () => ({text: session.state.baseline, mtime: session.state.mtime}),
    isDirty: () => session.state.dirty, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win,
  });
  await session.load();
  const result = await keeper.restore((draft: any) => session.adoptDraft(draft));
  assert.equal(result.outcome, "restored");
  assert.equal(result.savedAt, 1700000000);
  assert.equal(text, "draft");
  assert.equal(session.state.dirty, true);
  assert.deepEqual(writes, []);
  assert.equal(h.requests[0].url, "/draft?path=%2Fp%2Fa.tex");
  assert.deepEqual(JSON.parse(JSON.stringify(h.posted)), [{type: "atelier-dirty", dirty: true, path: "/p/a.tex"}]);
});

test("a stale draft identical to the disk is cleared on restore", async () => {
  const h = harness({draft: {text: "disk", base: "older", baseMtime: 1}});
  const keeper = createDraftKeeper({
    path: "/p/a.tex", getText: () => "disk", getBase: () => ({text: "disk", mtime: 5}),
    isDirty: () => false, postToHost: (payload: any) => h.posted.push(payload),
    fetchImpl: h.fetchImpl, window: h.win,
  });
  const result = await keeper.restore(() => "none");
  await h.settle();
  await h.settle();
  assert.equal(result.outcome, "none");
  assert.deepEqual(JSON.parse(JSON.stringify(bodies(h.requests))), [{path: "/p/a.tex", clear: true}]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.posted)), [{type: "atelier-dirty", dirty: false, path: "/p/a.tex"}]);
});

test("a standalone page asks the browser before leaving a dirty buffer, an embedded one does not", () => {
  for (const standalone of [true, false]) {
    const h = harness({standalone});
    createDraftKeeper({
      path: "/p/a.tex", getText: () => "typed", getBase: () => ({text: "base", mtime: 7}),
      isDirty: () => true, fetchImpl: h.fetchImpl, window: h.win,
    });
    let prevented = false;
    h.fire("beforeunload", {preventDefault: () => { prevented = true; }});
    assert.equal(prevented, standalone);
  }
});
