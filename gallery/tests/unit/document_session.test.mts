import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const bundle = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = vm.createContext({console});
vm.runInContext(bundle, context);
const {createDocumentSession, planDraftRestore} = context.AtelierStudioCore;

test("document session loads, saves, and tracks a typed baseline", async () => {
  let text = "initial";
  let disk = {text: "from disk", mtime: 10};
  const events: any[] = [];
  const writes = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async (next, mtime) => { writes.push({next, mtime}); disk = {text: next, mtime: 11}; return {mtime: 11}; },
    getText: () => text,
    applyText: (next: string) => { text = next; },
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
    applyText: (next: string) => { text = next; },
    externalReload: "when-clean",
  });
  await session.load();
  text = "local";
  session.markDirty();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), false);
  assert.equal(text, "local");
});

// Audit 2026-10-18, problème 4 : « always » remplaçait le tampon modifié par
// la version disque toutes les 2 s (éditeur de code). C'est désormais un
// alias de « when-clean » : un tampon propre suit le disque, un tampon
// modifié n'est jamais remplacé.
test("always policy reloads a clean buffer but never replaces a dirty one", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  const events = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next: string) => { text = next; },
    externalReload: "always",
    onEvent: (event) => events.push(event),
  });
  await session.load();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.pollOnce(), true);
  assert.equal(text, "agent");
  assert.equal(events[1].kind, "external-reload");
  assert.equal(events[1].previousText, "base");
  text = "local";
  session.markDirty();
  disk = {text: "agent 2", mtime: 3};
  assert.equal(await session.pollOnce(), false);
  assert.equal(text, "local", "le tampon modifié reste");
  assert.equal(session.state.dirty, true);
  assert.equal(session.state.mtime, 2, "la garde de la sauvegarde reste armée");
});

test("save conflicts advance the known mtime without clearing dirty state", async () => {
  let text = "local";
  const events: any[] = [];
  const session = createDocumentSession({
    read: async () => ({text: "base", mtime: 1}),
    write: async () => ({error: "conflit", mtime: 2}),
    getText: () => text,
    applyText: (next: string) => { text = next; },
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

// Audit 2026-10-18, problème 4 : la politique « reload » remplaçait le
// tampon par la version disque au 409 du ⌘S (LaTeX, code). La politique
// « merge » relit le disque, fusionne et rejoue la sauvegarde.
test("merge conflict policy merges the disk version and retries the save", async () => {
  let text = "a\nb\nc\n";
  let disk = {text: "a\nb\nc\n", mtime: 1};
  const writes: any[] = [];
  const events: any[] = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async (next: string, mtime: number) => {
      writes.push({next, mtime});
      if (Math.abs(mtime - disk.mtime) > 0.001) return {error: "conflit", mtime: disk.mtime};
      disk = {text: next, mtime: disk.mtime + 1};
      return {mtime: disk.mtime};
    },
    getText: () => text,
    applyText: (next: string) => { text = next; },
    merge: (base: string, local: string, remote: string) =>
      base === "a\nb\nc\n" && remote === "a\nb\nC\n" && local === "A\nb\nc\n" ? "A\nb\nC\n" : null,
    conflictPolicy: "merge",
    onEvent: (event) => events.push(event),
  });
  await session.load();
  text = "A\nb\nc\n";
  session.markDirty();
  disk = {text: "a\nb\nC\n", mtime: 2};
  assert.equal(await session.save(), true);
  assert.equal(text, "A\nb\nC\n", "les deux deltas coexistent");
  assert.equal(disk.text, "A\nb\nC\n", "la sauvegarde rejouée porte la fusion");
  assert.deepEqual(writes.map((write) => write.mtime), [1, 2]);
  assert.equal(session.state.dirty, false);
  assert.deepEqual(events.map((event) => event.kind), ["loaded", "external-merge", "saved"]);
});

test("merge conflict policy keeps the buffer when the merge fails and reports the disk version", async () => {
  let text = "base";
  let disk = {text: "base", mtime: 1};
  const events: any[] = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async (next: string, mtime: number) => {
      if (Math.abs(mtime - disk.mtime) > 0.001) return {error: "conflit", mtime: disk.mtime};
      disk = {text: next, mtime: disk.mtime + 1};
      return {mtime: disk.mtime};
    },
    getText: () => text,
    applyText: (next: string) => { text = next; },
    merge: () => null,
    conflictPolicy: "merge",
    onEvent: (event) => events.push(event),
  });
  await session.load();
  text = "local";
  session.markDirty();
  disk = {text: "agent", mtime: 2};
  assert.equal(await session.save(), false);
  assert.equal(text, "local", "le tampon n'est jamais remplacé");
  assert.equal(disk.text, "agent", "le premier ⌘S n'écrase pas l'agent");
  assert.equal(session.state.dirty, true);
  const conflict = events.find((event) => event.kind === "conflict");
  assert.ok(conflict, JSON.stringify(events.map((event) => event.kind)));
  assert.equal(conflict.snapshot.text, "agent", "la version disque est fournie pour l'historique");
  assert.equal(conflict.previousText, "base");
  assert.equal(events.some((event) => event.kind === "external-reload"), false);
  // Second ⌘S assumé : la version de l'utilisateur est gardée.
  assert.equal(await session.save(), true);
  assert.equal(disk.text, "local");
  assert.equal(session.state.dirty, false);
});

test("onDirtyChange reports each transition once", async () => {
  let text = "base";
  const transitions: boolean[] = [];
  const session = createDocumentSession({
    read: async () => ({text: "base", mtime: 1}),
    write: async () => ({mtime: 2}),
    getText: () => text,
    applyText: (next: string) => { text = next; },
    onDirtyChange: (dirty: boolean) => transitions.push(dirty),
  });
  await session.load();
  text = "x";
  session.markDirty();
  session.markDirty();
  assert.equal(await session.save(), true);
  assert.deepEqual(transitions, [true, false]);
});

test("a save that races with typing leaves the buffer dirty", async () => {
  let text = "base";
  const session = createDocumentSession({
    read: async () => ({text: "base", mtime: 1}),
    write: async () => { text = "typed during save"; return {mtime: 2}; },
    getText: () => text,
    applyText: (next: string) => { text = next; },
  });
  await session.load();
  text = "first";
  session.markDirty();
  assert.equal(await session.save(), true);
  assert.equal(session.state.baseline, "first");
  assert.equal(session.state.dirty, true, "la frappe pendant l'écriture reste à enregistrer");
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
    applyText: (next: string) => { text = next; },
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
    applyText: (next: string) => { text = next; },
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
    applyText: (next: string) => { text = next; },
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
    applyText: (next: string) => { text = next; },
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
    applyText: (next: string) => { text = next; },
    externalReload: "when-clean",
    merge: (base: string, local: string, remote: string) => {
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
    applyText: (next: string) => { text = next; },
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
  const events: any[] = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async () => ({mtime: 1}),
    getText: () => text,
    applyText: (next: string) => { text = next; },
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

// Audit 2026-10-18, problème 1 : le brouillon de secours revient comme tampon
// MODIFIÉ, jamais écrit dans le fichier.
test("planDraftRestore: no draft, or a draft equal to the disk, restores nothing", () => {
  const disk = {text: "disk", mtime: 5};
  assert.equal(planDraftRestore(null, disk).outcome, "none");
  assert.equal(planDraftRestore({text: "disk", base: "old", baseMtime: 1}, disk).outcome, "none");
});

test("planDraftRestore: a draft typed on the current disk version comes back as is", () => {
  const plan = planDraftRestore({text: "draft", base: "disk", baseMtime: 5}, {text: "disk", mtime: 5});
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), {outcome: "restored", text: "draft", base: "disk", baseMtime: 5});
});

test("planDraftRestore: a draft on an older version is merged when possible", () => {
  const merge = (base: string, local: string, remote: string) =>
    base === "a\nb\n" && local === "A\nb\n" && remote === "a\nB\n" ? "A\nB\n" : null;
  const plan = planDraftRestore({text: "A\nb\n", base: "a\nb\n", baseMtime: 1}, {text: "a\nB\n", mtime: 2}, merge);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), {outcome: "merged", text: "A\nB\n", base: "a\nB\n", baseMtime: 2});
});

test("planDraftRestore: an overlapping change keeps the draft on its own base", () => {
  const plan = planDraftRestore({text: "local", base: "base", baseMtime: 1}, {text: "agent", mtime: 2}, () => null);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), {outcome: "conflict", text: "local", base: "base", baseMtime: 1});
});

test("adoptDraft restores the draft as a dirty buffer without writing the file", async () => {
  let text = "";
  const writes: string[] = [];
  const transitions: boolean[] = [];
  const reasons: string[] = [];
  const session = createDocumentSession({
    read: async () => ({text: "disk", mtime: 5}),
    write: async (next: string) => { writes.push(next); return {mtime: 6}; },
    getText: () => text,
    applyText: (next: string, reason: string) => { text = next; reasons.push(reason); },
    onDirtyChange: (dirty: boolean) => transitions.push(dirty),
  });
  await session.load();
  assert.equal(session.adoptDraft({text: "draft", base: "disk", baseMtime: 5}), "restored");
  assert.equal(text, "draft");
  assert.deepEqual(reasons, ["load", "draft"]);
  assert.equal(session.state.dirty, true);
  assert.deepEqual(transitions, [true]);
  assert.deepEqual(writes, [], "rien n'est écrit sans ⌘S");
  assert.equal(await session.save(), true);
  assert.deepEqual(writes, ["draft"]);
});

test("adoptDraft in conflict keeps the stale base so the next save cannot overwrite silently", async () => {
  let text = "";
  let disk = {text: "agent", mtime: 2};
  const events: any[] = [];
  const session = createDocumentSession({
    read: async () => disk,
    write: async (next: string, mtime: number) => {
      if (Math.abs(mtime - disk.mtime) > 0.001) return {error: "conflit", mtime: disk.mtime};
      disk = {text: next, mtime: disk.mtime + 1};
      return {mtime: disk.mtime};
    },
    getText: () => text,
    applyText: (next: string) => { text = next; },
    merge: () => null,
    conflictPolicy: "merge",
    onEvent: (event) => events.push(event),
  });
  await session.load();
  assert.equal(session.adoptDraft({text: "local", base: "base", baseMtime: 1}), "conflict");
  assert.equal(text, "local");
  assert.equal(session.state.mtime, 1);
  assert.equal(await session.save(), false, "premier ⌘S : conflit signalé");
  assert.equal(disk.text, "agent");
  assert.equal(text, "local");
  assert.ok(events.some((event) => event.kind === "conflict" && event.snapshot?.text === "agent"));
});
