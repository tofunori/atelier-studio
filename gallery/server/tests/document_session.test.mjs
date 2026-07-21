import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console});
vm.runInContext(bundle, context);
const {createDocumentSession} = context.AtelierStudioCore;

test("document session loads, saves, and tracks a typed baseline", async () => {
  let text = "initial";
  let disk = {text: "from disk", mtime: 10};
  const events = [];
  const writes = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async (next, mtime) => { writes.push({next, mtime}); disk = {text: next, mtime: 11}; return {mtime: 11}; },
    getText: () => text,
    applyText: (next) => { text = next; },
    onEvent: (event) => events.push(event.kind),
  });

  await session.load();
  assert.equal(text, "from disk");
  assert.equal(session.state.dirty, false);
  text = "edited";
  session.markDirty();
  assert.equal(await session.save(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{next: "edited", mtime: 10}]);
  assert.deepEqual(events, ["loaded", "saved"]);
  assert.equal(session.state.baseline, "edited");
});

test("when-clean policy ignores external changes while the buffer is dirty", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "when-clean",
  });
  await session.load();
  text = "local";
  session.markDirty();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), false);
  assert.equal(text, "local");
});

test("always policy applies an external snapshot and reports the previous baseline", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  const events = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "always",
    onEvent: (event) => events.push(event),
  });
  await session.load();
  text = "local";
  session.markDirty();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), true);
  assert.equal(text, "agent");
  assert.equal(events[1].kind, "external-reload");
  assert.equal(events[1].previousText, "base");
});

test("save conflicts advance the known mtime without clearing dirty state", async () => {
  let text = "local";
  const events = [];
  const session = createDocumentSession({
    read: async () => ({text: "base", mtime: 1}),
    write: async () => ({error: "conflit", mtime: 2}),
    getText: () => text,
    applyText: (next) => { text = next; },
    onEvent: (event) => events.push(event.kind),
  });
  await session.load();
  text = "local";
  session.markDirty();
  assert.equal(await session.save(), false);
  assert.equal(session.state.mtime, 2);
  assert.equal(session.state.dirty, true);
  assert.deepEqual(events, ["loaded", "conflict"]);
});

test("reload conflict policy replaces local text without a conflict event", async () => {
  let text = "base";
  let reads = 0;
  const events = [];
  const session = createDocumentSession({
    read: async () => (++reads === 1 ? {text: "base", mtime: 1} : {text: "agent", mtime: 2}),
    write: async () => ({error: "conflit", mtime: 2}),
    getText: () => text,
    applyText: (next) => { text = next; },
    conflictPolicy: "reload",
    externalReload: "always",
    onEvent: (event) => events.push(event.kind),
  });
  await session.load();
  text = "local";
  session.markDirty();
  assert.equal(await session.save(), false);
  assert.equal(text, "agent");
  assert.equal(session.state.dirty, false);
  assert.deepEqual(events, ["loaded", "external-reload"]);
});

test("acceptSaved adopts a restored snapshot without a network roundtrip", async () => {
  let text = "base";
  const session = createDocumentSession({
    read: async () => ({text: "base", mtime: 1}),
    write: async () => ({mtime: 2}),
    getText: () => text,
    applyText: (next) => { text = next; },
  });
  await session.load();
  session.acceptSaved({text: "restored", mtime: 8}, true);
  assert.equal(text, "restored");
  assert.equal(session.state.mtime, 8);
  assert.equal(session.state.baseline, "restored");
});
