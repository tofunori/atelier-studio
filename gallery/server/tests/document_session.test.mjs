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

test("stat short-circuit skips read when the mtime has not moved", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  let reads = 0;
  let stats = 0;
  const session = createDocumentSession({
    read: async () => { reads += 1; return disk; },
    stat: async () => { stats += 1; return disk.mtime; },
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "always",
  });
  await session.load();
  assert.equal(reads, 1);
  assert.equal(await session.pollOnce(), false);
  assert.equal(stats, 1);
  assert.equal(reads, 1, "read must not run when stat reports the same mtime");
  assert.equal(text, "base");
});

test("stat short-circuit falls through to read when the mtime has moved", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  let reads = 0;
  const session = createDocumentSession({
    read: async () => { reads += 1; return disk; },
    stat: async () => disk.mtime,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "always",
  });
  await session.load();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), true);
  assert.equal(reads, 2, "read must run once stat reports a moved mtime");
  assert.equal(text, "agent");
});

test("stat failure retries next tick and never falls through to a full read", async () => {
  let text = "base";
  let reads = 0;
  const session = createDocumentSession({
    read: async () => { reads += 1; return {text: "base", mtime: 1}; },
    stat: async () => { throw new Error("network down"); },
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "always",
  });
  await session.load();
  assert.equal(reads, 1);
  assert.equal(await session.pollOnce(), false);
  assert.equal(reads, 1, "a failed stat must not fall through to read");
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

// Fusion à trois voies (2026-09-11) : « when-clean » ignorait les modifs de
// l'agent sur disque tant que le buffer était sale — et la sauvegarde
// (conflictPolicy reload) écrasait ensuite les retouches locales. Avec
// `merge`, la version disque s'applique sur le buffer sale ; les deux deltas
// survivent quand ils ne se chevauchent pas.
test("when-clean with merge applies a disk change onto a dirty buffer", async () => {
  let text = "a\nb\nc\n";
  let disk = {text: "a\nb\nc\n", mtime: 1};
  const events = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "when-clean",
    merge: (base, local, remote) => {
      // fusion ligne à ligne minimale pour le test : delta disque = c→C
      if (base === "a\nb\nc\n" && remote === "a\nb\nC\n" && local.endsWith("c\n")) return local.slice(0, -2) + "C\n";
      return null;
    },
    onEvent: (event) => events.push(event),
  });
  await session.load();
  text = "A\nb\nc\n";
  session.markDirty();
  disk = {text: "a\nb\nC\n", mtime: 2};
  assert.equal(await session.pollOnce(), true);
  assert.equal(text, "A\nb\nC\n", "les deux deltas coexistent");
  assert.equal(session.state.dirty, true, "le buffer fusionné reste à sauvegarder");
  assert.equal(session.state.mtime, 2, "la sauvegarde suivante ne fera pas conflit");
  assert.equal(session.state.baseline, "a\nb\nC\n", "la base devient la version disque");
  const merged = events.find((event) => event.kind === "external-merge");
  assert.ok(merged, JSON.stringify(events.map((event) => event.kind)));
  assert.equal(merged.previousText, "A\nb\nc\n");
  assert.equal(merged.text, "A\nb\nC\n");
  assert.equal(merged.snapshot.text, "a\nb\nC\n");
});

test("when-clean with merge keeps the local buffer and reports a conflict once when the merge fails", async () => {
  let text = "a\nb\nc\n";
  let disk = {text: "a\nb\nc\n", mtime: 1};
  const events = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "when-clean",
    merge: () => null,
    onEvent: (event) => events.push(event),
  });
  await session.load();
  text = "a\nb\nlocal\n";
  session.markDirty();
  disk = {text: "a\nb\nagent\n", mtime: 2};
  assert.equal(await session.pollOnce(), false);
  assert.equal(await session.pollOnce(), false);
  assert.equal(text, "a\nb\nlocal\n");
  assert.equal(session.state.mtime, 1, "le mtime connu reste celui de la base : la sauvegarde verra le conflit");
  const conflicts = events.filter((event) => event.kind === "conflict");
  assert.equal(conflicts.length, 1, "un seul avertissement par version disque");
  assert.equal(conflicts[0].mtime, 2);
  disk = {text: "a\nb\nagent 2\n", mtime: 3};
  assert.equal(await session.pollOnce(), false);
  assert.equal(events.filter((event) => event.kind === "conflict").length, 2, "nouvelle version disque : nouvel avertissement");
});

test("when-clean with merge still reloads a clean buffer as external-reload", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  const events = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next) => { text = next; },
    externalReload: "when-clean",
    merge: () => { throw new Error("ne doit pas être appelé sur un buffer propre"); },
    onEvent: (event) => events.push(event.kind),
  });
  await session.load();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), true);
  assert.equal(text, "agent");
  assert.deepEqual(events, ["loaded", "external-reload"]);
});
