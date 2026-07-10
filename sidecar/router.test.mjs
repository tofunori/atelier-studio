import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock du provider d'images : pas d'appel réseau réel dans les tests du routeur.
vi.mock("./providers/images.mjs", () => ({
  generateImage: async () => ({
    b64: Buffer.from("fake-png-bytes").toString("base64"),
    size: "1024x1024",
    model: "seedream-test",
    usage: { generated_images: 1 },
  }),
  resolveArkApiKey: () => "sk-test",
  resolveArkModel: () => "seedream-test",
}));
vi.mock("./providers/codex_image.mjs", () => ({
  generateImageViaCodex: async () => ({
    b64: Buffer.from("codex-png-bytes").toString("base64"),
    size: "2K",
    model: "gpt-image-2",
    usage: null,
  }),
}));

import { route } from "./router.mjs";
import * as threadStoreModule from "./store.mjs";

describe("route", () => {
  it("répond pong au ping", async () => {
    const sent = [];
    await route({ type: "ping" }, { send: (m) => sent.push(m) });
    expect(sent).toEqual([{ type: "pong" }]);
  });
  it("signale un type inconnu", async () => {
    const sent = [];
    await route({ type: "nope" }, { send: (m) => sent.push(m) });
    expect(sent[0].type).toBe("error");
  });
  it("getHistory route chaque provider vers SON loader, jamais celui d'un autre", async () => {
    const mkCtx = (provider, extra = {}) => {
      const sent = [];
      const loaders = {
        claude: vi.fn(async () => [{ kind: "text", text: "claude" }]),
        codex: vi.fn(async () => [{ kind: "text", text: "codex" }]),
        grok: vi.fn(async () => [{ kind: "text", text: "grok" }]),
      };
      const ctx = {
        send: (m) => sent.push(m),
        store: { get: () => ({ id: "t1", provider, sessionId: "s1", projectRoot: "/p" }) },
        history: { claudeHistory: loaders.claude },
        sessions: { codexHistory: loaders.codex, grokHistory: loaders.grok },
        ...extra,
      };
      return { ctx, sent, loaders };
    };

    for (const provider of ["claude", "codex", "grok"]) {
      const { ctx, sent, loaders } = mkCtx(provider);
      await route({ type: "getHistory", threadId: "t1" }, ctx);
      expect(sent[0].events).toEqual([{ kind: "text", text: provider }]);
      for (const [name, fn] of Object.entries(loaders)) {
        expect(fn.mock.calls.length, `${provider} ne doit appeler que ${provider}, pas ${name}`)
          .toBe(name === provider ? 1 : 0);
      }
    }

    // provider dynamique avec history() propre (API/OpenCode)
    const apiHistory = vi.fn(async () => [{ kind: "user", text: "q" }, { kind: "text", text: "r" }]);
    const api = mkCtx("openrouter", { providers: { openrouter: { history: apiHistory } } });
    await route({ type: "getHistory", threadId: "t1" }, api.ctx);
    expect(apiHistory).toHaveBeenCalledWith("s1", "/p");
    expect(api.sent[0].events).toHaveLength(2);
    expect(api.loaders.codex).not.toHaveBeenCalled();

    // provider inconnu sans history : [] + aucun loader d'un autre format
    const unknown = mkCtx("mystery", { providers: {} });
    await route({ type: "getHistory", threadId: "t1" }, unknown.ctx);
    expect(unknown.sent[0]).toEqual({ type: "history", threadId: "t1", events: [] });
    expect(unknown.loaders.codex).not.toHaveBeenCalled();
    expect(unknown.loaders.claude).not.toHaveBeenCalled();
  });

  it("getUsage agrège turns/output par modèle pour aujourd'hui via ledger.getAll", async () => {
    const sent = [];
    const today = new Date().toISOString();
    await route({ type: "getUsage" }, {
      send: (m) => sent.push(m),
      providers: {},
      ledger: {
        getAll: vi.fn(async () => [
          { ts: today, model: "gpt-x", usage: { output: 100 } },
          { ts: today, model: "gpt-x", usage: { output: 50 } },
          { ts: today, model: "claude-y", usage: { output: 7 } },
          { ts: "2020-01-01T00:00:00.000Z", model: "gpt-x", usage: { output: 999 } },
        ]),
      },
    });
    expect(sent[0].type).toBe("usage");
    expect(sent[0].models).toEqual({
      "gpt-x": { turns: 2, output: 150 },
      "claude-y": { turns: 1, output: 7 },
    });
  });

  it("gitUndoLastTurn refusé : envoie gitUndoLastTurnError, jamais Done", async () => {
    const sent = [];
    await route({ type: "gitUndoLastTurn", threadId: "t1" }, {
      send: (m) => sent.push(m),
      store: { get: () => ({ id: "t1", projectRoot: "/proj", lastSnapshot: "a".repeat(40) }) },
      gitops: { restore: async () => { throw new Error("restauration refusée : 1 chemin(s) créé(s) après le snapshot (x.txt). Rien n'a été modifié."); } },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("gitUndoLastTurnError");
    expect(sent[0].threadId).toBe("t1");
    expect(sent[0].projectRoot).toBe("/proj");
    expect(sent[0].message).toMatch(/refusée/);
    expect(sent.some((m) => m.type === "gitUndoLastTurnDone")).toBe(false);
  });
  it("gitUndoLastTurn réussi : gitChanged puis gitUndoLastTurnDone", async () => {
    const sent = [];
    const sha = "b".repeat(40);
    await route({ type: "gitUndoLastTurn", threadId: "t1" }, {
      send: (m) => sent.push(m),
      store: { get: () => ({ id: "t1", projectRoot: "/proj", lastSnapshot: sha }) },
      gitops: { restore: async () => {} },
    });
    expect(sent.map((m) => m.type)).toEqual(["gitChanged", "gitUndoLastTurnDone"]);
    expect(sent[1].sha).toBe(sha);
  });
  it("répond zotero-introuvable quand la base Zotero manque", async () => {
    const sent = [];
    await route(
      { type: "zoteroSearch", query: "albedo" },
      { send: (m) => sent.push(m), zotero: { available: () => false } },
    );
    expect(sent[0]).toEqual({ type: "zoteroItems", items: [], error: "zotero-introuvable" });
  });
  it("ajoute citeKey et fav aux résultats Zotero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-zotero-"));
    const favsPath = join(dir, "zotero-favs.json");
    const sent = [];
    const item = {
      key: "ABC12345",
      title: "Smoke deposition",
      creators: "Smith",
      year: "2024",
      publication: "",
      tags: [],
      hasPdf: true,
      pdfKey: "PDF12345",
      pdfFile: "paper.pdf",
    };
    await route({ type: "zoteroFav", key: item.key, on: true }, {
      send: (m) => sent.push(m),
      zoteroFavsPath: favsPath,
    });
    await route({ type: "zoteroSearch", query: "smoke" }, {
      send: (m) => sent.push(m),
      zoteroFavsPath: favsPath,
      zotero: {
        available: () => true,
        search: () => [item],
        citeKey: () => "smith2024",
      },
    });
    expect(JSON.parse(readFileSync(favsPath, "utf8"))).toEqual([item.key]);
    expect(sent.at(-1)).toMatchObject({
      type: "zoteroItems",
      items: [{ key: item.key, citeKey: "smith2024", fav: true }],
    });
  });
  it("retitre les conversations aux titres bruts ou dupliqués", async () => {
    const threads = new Map([
      ["a", {
        id: "a",
        title: "/Users/tofunori/projet",
        provider: "claude",
        projectRoot: "/Users/tofunori/projet",
        sessionId: "s-a",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      ["b", {
        id: "b",
        title: "allo",
        provider: "codex",
        projectRoot: "",
        sessionId: "s-b",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }],
      ["c", {
        id: "c",
        title: "allo",
        provider: "claude",
        projectRoot: "",
        sessionId: "s-c",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }],
      ["d", {
        id: "d",
        title: "Titre propre",
        provider: "claude",
        projectRoot: "",
        sessionId: "s-d",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }],
    ]);
    const emitted = [];
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store: {
        list: () => [...threads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        get: (id) => threads.get(id),
        upsert: (patch) => threads.set(patch.id, { ...threads.get(patch.id), ...patch }),
      },
      providers: {
        claude: {
          titleConversation: async (text) => `Titre ${text.slice(0, 5)}`,
        },
      },
      history: {
        claudeHistory: async (sessionId) => [{ kind: "user", text: `claude ${sessionId}` }],
      },
      sessions: {
        codexHistory: async (sessionId) => [{ kind: "user", text: `codex ${sessionId}` }],
      },
    };

    await route({ type: "retitleAll" }, ctx);

    expect(threads.get("a").title).toBe("Titre claud");
    expect(threads.get("b").title).toBe("Titre codex");
    expect(threads.get("c").title).toBe("Titre claud");
    expect(threads.get("d").title).toBe("Titre propre");
    expect(emitted.filter((m) => m.type === "threads")).toHaveLength(3);
    expect(emitted.at(-1)).toMatchObject({ type: "retitleAllDone", scanned: 3, renamed: 3 });
  });
});

describe("moveThread", () => {
  function makeStore(initial) {
    const threads = new Map(initial.map((th) => [th.id, { ...th }]));
    return {
      list: () => [...threads.values()],
      get: (id) => threads.get(id),
      upsert: (patch) => {
        const merged = { ...(threads.get(patch.id) ?? {}), ...patch };
        threads.set(patch.id, merged);
        return merged;
      },
    };
  }

  it("déplace un thread idle vers un autre projet (store mis à jour + broadcast)", async () => {
    const store = makeStore([{ id: "t1", projectRoot: "/proj-a", status: "idle" }]);
    const emitted = [];
    await route(
      { type: "moveThread", threadId: "t1", projectRoot: "/proj-b" },
      { send: () => {}, broadcast: (m) => emitted.push(m), store },
    );
    expect(store.get("t1").projectRoot).toBe("/proj-b");
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("threads");
  });

  it("refuse si le thread est en cours d'exécution (status running)", async () => {
    const store = makeStore([{ id: "t1", projectRoot: "/proj-a", status: "running" }]);
    const sent = [];
    const emitted = [];
    await route(
      { type: "moveThread", threadId: "t1", projectRoot: "/proj-b" },
      { send: (m) => sent.push(m), broadcast: (m) => emitted.push(m), store },
    );
    expect(store.get("t1").projectRoot).toBe("/proj-a"); // inchangé
    expect(sent[0].type).toBe("error");
    expect(emitted).toHaveLength(0);
  });

  it("erreur si le thread est introuvable", async () => {
    const store = makeStore([]);
    const sent = [];
    await route(
      { type: "moveThread", threadId: "inconnu", projectRoot: "/proj-b" },
      { send: (m) => sent.push(m), store },
    );
    expect(sent[0].type).toBe("error");
  });

  it("no-op silencieux si la cible est le projet courant du thread", async () => {
    const store = makeStore([{ id: "t1", projectRoot: "/proj-a", status: "idle" }]);
    const sent = [];
    const emitted = [];
    await route(
      { type: "moveThread", threadId: "t1", projectRoot: "/proj-a" },
      { send: (m) => sent.push(m), broadcast: (m) => emitted.push(m), store },
    );
    expect(sent).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("rejette une cible qui n'est pas un chemin absolu", async () => {
    const store = makeStore([{ id: "t1", projectRoot: "/proj-a", status: "idle" }]);
    const sent = [];
    await route(
      { type: "moveThread", threadId: "t1", projectRoot: "proj-relatif" },
      { send: (m) => sent.push(m), store },
    );
    expect(store.get("t1").projectRoot).toBe("/proj-a");
    expect(sent[0].type).toBe("error");
  });
});

describe("attribution des tours (plan 025)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 10));

  function makeTurnCtx({ provider = "claude", providerImpl }) {
    const emitted = [];
    const dir = mkdtempSync(join(tmpdir(), "as-turn-"));
    const { ThreadStore } = threadStoreModule;
    const store = new ThreadStore(join(dir, "threads.json"));
    const gitops = {
      snapshot: vi.fn(async () => "s".repeat(40)),
      isRepo: async () => true,
      changedSince: vi.fn(async () => []),
      numstat: vi.fn(async () => []),
      status: async () => ({ files: [] }),
    };
    const ledger = { append: vi.fn(async () => {}), getAll: async () => [] };
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store,
      gitops,
      ledger,
      providers: { [provider]: providerImpl },
    };
    return { ctx, emitted, gitops, ledger };
  }

  const userEvents = (emitted) =>
    emitted.filter((m) => m.type === "event" && m.event?.kind === "user").map((m) => m.event);
  const doneEvents = (emitted) =>
    emitted.filter((m) => m.type === "event" && m.event?.kind === "done").map((m) => m.event);

  it("steer : même turnId, messageId propre, AUCUN snapshot/ledger supplémentaire", async () => {
    const sends = [];
    const { ctx, emitted, gitops, ledger } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });

    await route({
      type: "send", provider: "claude", threadId: "t1", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await route({
      type: "send", provider: "claude", threadId: "t1", projectRoot: "/p",
      prompt: "correction en vol", clientMessageId: "m2", mode: "steer",
      displayEvent: { kind: "user", text: "correction en vol" },
    }, ctx);

    const users = userEvents(emitted);
    expect(users).toHaveLength(2);
    expect(users[0].meta?.turnId).toBeTruthy();
    expect(users[0].meta?.messageId).toBe("m1");
    expect(users[1].meta?.turnId).toBe(users[0].meta.turnId);
    expect(users[1].meta?.messageId).toBe("m2");
    expect(gitops.snapshot).toHaveBeenCalledTimes(1);

    // terminal du turn actif : exactement UN ledger pour tout le turn steeré
    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    expect(ledger.append).toHaveBeenCalledTimes(1);
    const dones = doneEvents(emitted);
    expect(dones).toHaveLength(1);
    expect(dones[0].meta?.turnId).toBe(users[0].meta.turnId);
  });

  it("queue : turnId réservé visible immédiatement, provider différé jusqu'au terminal", async () => {
    const sends = [];
    const { ctx, emitted, gitops } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });

    await route({
      type: "send", provider: "claude", threadId: "t2", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await route({
      type: "send", provider: "claude", threadId: "t2", projectRoot: "/p",
      prompt: "ensuite", clientMessageId: "m2", mode: "queue",
      displayEvent: { kind: "user", text: "ensuite" },
    }, ctx);

    // la bulle user queued est actée tout de suite, avec un turnId NEUF…
    const users = userEvents(emitted);
    expect(users).toHaveLength(2);
    expect(users[1].meta?.turnId).toBeTruthy();
    expect(users[1].meta?.turnId).not.toBe(users[0].meta?.turnId);
    // …mais le provider n'est PAS rappelé avant le terminal du turn actif
    expect(sends).toHaveLength(1);

    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    expect(sends).toHaveLength(2);
    expect(sends[1].prompt).toBe("ensuite");
    // un snapshot par turn EXÉCUTÉ (jamais pour un queued en attente)
    expect(gitops.snapshot).toHaveBeenCalledTimes(2);

    await sends[1].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    const dones = doneEvents(emitted);
    expect(dones).toHaveLength(2);
    expect(dones[1].meta?.turnId).toBe(users[1].meta.turnId);
  });

  it("steer refusé par le provider → queue avec le MÊME messageId, sans double bulle user", async () => {
    const runs = [];
    const { ctx, emitted } = makeTurnCtx({
      provider: "codex",
      providerImpl: {
        steer: vi.fn(async () => false),
        run: vi.fn((opts) => {
          runs.push(opts);
          return new Promise(() => {});
        }),
      },
    });

    await route({
      type: "send", provider: "codex", threadId: "t3", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await flush();
    await route({
      type: "send", provider: "codex", threadId: "t3", projectRoot: "/p",
      prompt: "pendant le run", clientMessageId: "m2", mode: "steer",
      displayEvent: { kind: "user", text: "pendant le run" },
    }, ctx);
    await flush();

    const users = userEvents(emitted);
    expect(users).toHaveLength(2);
    expect(users[1].meta?.messageId).toBe("m2");
    expect(users[1].meta?.turnId).not.toBe(users[0].meta?.turnId);
    // pas de deuxième run tant que le turn actif n'est pas terminé
    expect(runs).toHaveLength(1);
  });
});

describe("journal canonique câblé (plan 025 step 7)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 25));

  it("seed legacy au premier send, replay via getHistory (journal préféré aux loaders)", async () => {
    const { createHarnessJournal } = await import("./harness_journal.mjs");
    const dir = mkdtempSync(join(tmpdir(), "as-jr-"));
    const { ThreadStore } = threadStoreModule;
    const store = new ThreadStore(join(dir, "threads.json"));
    const harnessJournal = createHarnessJournal({ baseDir: dir });
    const emitted = [];
    const sends = [];
    const claudeLoader = vi.fn(async () => [
      { kind: "user", text: "ancienne question" },
      { kind: "text", text: "ancienne réponse" },
    ]);
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store,
      harnessJournal,
      history: { claudeHistory: claudeLoader },
      sessions: {},
      gitops: { snapshot: async () => "s".repeat(40), isRepo: async () => true, changedSince: async () => [], numstat: async () => [] },
      ledger: { append: async () => {} },
      providers: { claude: { send: (opts) => sends.push(opts) } },
    };
    // thread PRÉEXISTANT avec session provider (upgrade) — le seed doit précéder le turn
    store.upsert({ id: "jt", provider: "claude", projectRoot: "/p",
      sessionId: "123e4567-e89b-42d3-a456-426614174000", title: "vieux fil" });

    await route({ type: "send", provider: "claude", threadId: "jt", projectRoot: "/p",
      prompt: "nouvelle question", clientMessageId: "m1",
      displayEvent: { kind: "user", text: "nouvelle question" } }, ctx);
    await sends[0].onEvent({ kind: "text", text: "nouvelle réponse" });
    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    expect(claudeLoader).toHaveBeenCalledTimes(1); // le seed a lu l'historique provider

    emitted.length = 0;
    await route({ type: "getHistory", threadId: "jt" }, ctx);
    await flush();
    const hist = emitted.find((m) => m.type === "history");
    expect(hist).toBeTruthy();
    const texts = hist.events.filter((e) => e.kind === "user" || e.kind === "text").map((e) => e.text);
    // parité : l'historique ancien (legacy-import) ET le nouveau turn, sans doublon
    expect(texts).toEqual(["ancienne question", "ancienne réponse", "nouvelle question", "nouvelle réponse"]);
    expect(hist.events[0].meta.origin).toBe("legacy-import");
    expect(hist.events.at(-1).meta.origin).not.toBe("legacy-import");
    // le loader provider n'est PAS rappelé : journal préféré, jamais concaténé
    expect(claudeLoader).toHaveBeenCalledTimes(1);
    // séquences strictement croissantes (le sérialiseur a repris après le seed)
    const seqs = hist.events.map((e) => e.meta.sequence);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });
});

describe("relay d'interactions (plan 025 step 5)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 10));

  function interactionSetup() {
    const emitted = [];
    const dir = mkdtempSync(join(tmpdir(), "as-int-"));
    const { ThreadStore } = threadStoreModule;
    const store = new ThreadStore(join(dir, "threads.json"));
    let relay = null;
    let providerDone = null;
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store,
      gitops: { snapshot: async () => "s".repeat(40), isRepo: async () => true, changedSince: async () => [], numstat: async () => [] },
      ledger: { append: async () => {} },
      providers: {
        codex: {
          run: (opts) => {
            relay = opts.onInteraction;
            return new Promise((resolve) => { providerDone = () => { opts.onEvent({ kind: "done", ok: true, result: "" }); resolve({ sessionId: "cx-1" }); }; });
          },
        },
      },
    };
    return { ctx, emitted, getRelay: () => relay, finishProvider: () => providerDone?.() };
  }

  const interactions = (emitted) =>
    emitted.filter((m) => m.type === "event" && m.event?.kind === "interaction").map((m) => m.event);

  it("pending → réponse WS → answered ; valeurs secrètes JAMAIS dans answerSummary", async () => {
    const { ctx, emitted, getRelay } = interactionSetup();
    await route({ type: "send", provider: "codex", threadId: "i1", projectRoot: "/p",
      prompt: "x", clientMessageId: "m1", displayEvent: { kind: "user", text: "x" } }, ctx);
    await flush();

    const relayPromise = getRelay()({
      interactionType: "user_input",
      title: "L'agent a besoin d'une réponse",
      fields: [
        { id: "q1", header: "Token", question: "Ton token ?", secret: true },
        { id: "q2", header: "Nom", question: "Ton nom ?" },
      ],
      itemId: "it-9",
    });
    await flush();

    const pendingEv = interactions(emitted).find((e) => e.state === "pending");
    expect(pendingEv).toBeTruthy();
    expect(pendingEv.meta?.turnId).toBeTruthy();
    expect(pendingEv.meta?.itemId).toBe("it-9");

    await route({ type: "interactionResponse", requestId: pendingEv.requestId,
      response: { answers: { q1: "SECRET-XYZ", q2: "Thierry" } } }, ctx);
    const resp = await relayPromise;
    expect(resp.answers.q1).toBe("SECRET-XYZ"); // la valeur atteint le provider…
    await flush();
    const answered = interactions(emitted).find((e) => e.state === "answered");
    expect(answered).toBeTruthy();
    expect(answered.answerSummary).toContain("Thierry");
    expect(answered.answerSummary).not.toContain("SECRET-XYZ"); // …jamais le résumé
    expect(JSON.stringify(interactions(emitted))).not.toContain("SECRET-XYZ");
  });

  it("réponse double ignorée ; fin de turn → interactions pendantes déclinées", async () => {
    const { ctx, emitted, getRelay, finishProvider } = interactionSetup();
    await route({ type: "send", provider: "codex", threadId: "i2", projectRoot: "/p",
      prompt: "x", clientMessageId: "m1", displayEvent: { kind: "user", text: "x" } }, ctx);
    await flush();

    // interaction 1 : répondue deux fois — la seconde est un no-op idempotent
    const p1 = getRelay()({ interactionType: "approval", title: "Exécution de commande", detail: "ls" });
    await flush();
    const ev1 = interactions(emitted).find((e) => e.state === "pending");
    await route({ type: "interactionResponse", requestId: ev1.requestId, response: { allow: true } }, ctx);
    await route({ type: "interactionResponse", requestId: ev1.requestId, response: { allow: false } }, ctx);
    expect((await p1).allow).toBe(true);
    await flush();
    expect(interactions(emitted).filter((e) => e.requestId === ev1.requestId && e.state !== "pending")).toHaveLength(1);

    // interaction 2 : jamais répondue — le terminal du turn la décline sûrement
    const p2 = getRelay()({ interactionType: "approval", title: "Exécution de commande", detail: "rm x" });
    await flush();
    finishProvider();
    await flush();
    expect(await p2).toBeNull();
    const declined = interactions(emitted).find((e) => e.state === "declined");
    expect(declined).toBeTruthy();
    const kinds = emitted.filter((m) => m.type === "event").map((m) => m.event.kind);
    expect(kinds.indexOf("done")).toBeGreaterThan(kinds.lastIndexOf("interaction"));
  });

  it("autoResolutionMs borné : expiration → refus sûr + état expired", async () => {
    const { ctx, emitted, getRelay } = interactionSetup();
    await route({ type: "send", provider: "codex", threadId: "i3", projectRoot: "/p",
      prompt: "x", clientMessageId: "m1", displayEvent: { kind: "user", text: "x" } }, ctx);
    await flush();

    const p = getRelay()({ interactionType: "approval", title: "Exécution", detail: "sleep", autoResolutionMs: 1000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(await p).toBeNull();
    expect(interactions(emitted).some((e) => e.state === "expired")).toBe(true);
  });
});

describe("quickAsk", () => {
  // laisse se dérouler les microtâches du .then/.catch de p.run(...)
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("isole chaque qaId dans sa propre session (jamais threadId null)", async () => {
    const calls = [];
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: (opts) => {
            calls.push(opts);
            return Promise.resolve({ sessionId: "s-" + opts.threadId });
          },
          endSession: () => {},
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await route({ type: "quickAsk", qaId: "b", prompt: "coucou" }, ctx);
    await flush();
    expect(calls.map((c) => c.threadId)).toEqual(["qa:a", "qa:b"]);
    expect(calls.some((c) => c.threadId === null)).toBe(false);
  });

  it("ferme la session (endSession) après le tour, keyée par qaId", async () => {
    const ended = [];
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: () => Promise.resolve({ sessionId: "1234-abcd" }),
          endSession: (tid) => ended.push(tid),
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await flush();
    expect(ended).toContain("qa:a");
  });

  it("passe permissionMode bypassPermissions au provider", async () => {
    let captured;
    const ctx = {
      send: () => {},
      providers: {
        claude: {
          run: (opts) => {
            captured = opts;
            return Promise.resolve({ sessionId: "x" });
          },
          endSession: () => {},
        },
      },
    };
    await route({ type: "quickAsk", qaId: "a", prompt: "salut" }, ctx);
    await flush();
    expect(captured.permissionMode).toBe("bypassPermissions");
  });

  it("generateImage répond via broadcast (survit à la socket fermée), pas via send", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gen-"));
    const sent = [];
    const emitted = [];
    await route(
      { type: "generateImage", prompt: "un glacier", size: "1K", projectRoot: dir },
      { send: (m) => sent.push(m), broadcast: (m) => emitted.push(m) },
    );
    // La réponse DOIT passer par broadcast : une génération de ~140 s survit
    // souvent à la socket qui l'a demandée. ctx.send la perdrait silencieusement.
    const onBroadcast = emitted.find((m) => m.type === "imageGenerated");
    expect(onBroadcast).toBeTruthy();
    expect(onBroadcast.error).toBeUndefined();
    expect(onBroadcast.path).toContain("generated");
    expect(onBroadcast.projectRoot).toBe(dir);
    expect(sent.find((m) => m.type === "imageGenerated")).toBeUndefined();
    // fichier PNG + provenance JSON réellement écrits
    expect(readFileSync(onBroadcast.metaPath, "utf8")).toContain("un glacier");
    // moteur par défaut = seedream, tracé dans la provenance
    expect(onBroadcast.engine).toBe("seedream");
  });

  it("generateImage engine=codex passe par le provider Codex (gpt-image-2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gen-codex-"));
    const emitted = [];
    await route(
      { type: "generateImage", prompt: "un glacier", engine: "codex", projectRoot: dir },
      { send: () => {}, broadcast: (m) => emitted.push(m) },
    );
    const m = emitted.find((x) => x.type === "imageGenerated");
    expect(m).toBeTruthy();
    expect(m.error).toBeUndefined();
    expect(m.engine).toBe("codex");
    expect(m.model).toBe("gpt-image-2");
    expect(readFileSync(m.metaPath, "utf8")).toContain("codex");
  });
});
