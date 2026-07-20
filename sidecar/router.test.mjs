import { beforeEach, describe, it, expect, vi } from "vitest";
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

import { __resetHarnessStateForTest, route } from "./router.mjs";
import * as threadStoreModule from "./store.mjs";

beforeEach(() => __resetHarnessStateForTest());

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

  it("getAgentHistory lit le rollout enfant Codex sans recopier le prompt parent", async () => {
    const sent = [];
    const codexHistory = vi.fn(async (threadId) => [
      { kind: "user", text: "très long prompt parent" },
      { kind: "text", text: `mise à jour de ${threadId}` },
    ]);
    await route({ type: "getAgentHistory", parentThreadId: "parent", agentThreadId: "child" }, {
      send: (message) => sent.push(message),
      sessions: { codexHistory },
    });
    expect(codexHistory).toHaveBeenCalledWith("child");
    expect(sent).toEqual([{
      type: "agentHistory",
      parentThreadId: "parent",
      agentThreadId: "child",
      events: [{ kind: "text", text: "mise à jour de child" }],
    }]);
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

  it("getHistory Grok préfère le transcript natif quand le journal a perdu les réponses", async () => {
    const sent = [];
    const native = [
      { kind: "user", text: "tour supprimé" },
      { kind: "text", text: "réponse supprimée" },
      { kind: "user", text: "contexte brut\n\nquestion\n\n<atelier-gallery-integration>secret</atelier-gallery-integration>" },
      { kind: "text", text: "réponse Grok" },
    ];
    const grokHistory = vi.fn(async () => native);
    await route({ type: "getHistory", threadId: "g1" }, {
      send: (message) => sent.push(message),
      store: { get: () => ({ id: "g1", provider: "grok", sessionId: "sid", projectRoot: "/p" }) },
      sessions: { grokHistory },
      harnessJournal: {
        hasJournal: () => true,
        materialize: async () => [
          { kind: "user", text: "question", label: "Citation de la conversation" },
          { kind: "done", ok: true },
        ],
      },
    });
    expect(grokHistory).toHaveBeenCalledWith("sid", "/p");
    expect(sent[0].events).toEqual([
      { kind: "user", text: "question", label: "Citation de la conversation" },
      { kind: "text", text: "réponse Grok" },
    ]);
  });

  it("getHistory ne réaffiche jamais le bloc file-scope archivé dans le journal", async () => {
    const sent = [];
    await route({ type: "getHistory", threadId: "k1" }, {
      send: (message) => sent.push(message),
      store: { get: () => ({ id: "k1", provider: "kimi", sessionId: "sid", projectRoot: "/p" }) },
      harnessJournal: {
        hasJournal: () => true,
        materialize: async () => [{
          kind: "user",
          text: "question\n\n<atelier-file-scope>old</atelier-file-scope>",
        }],
      },
    });
    expect(sent[0].events).toEqual([{ kind: "user", text: "question" }]);
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
  it("generateCommitMsg envoie le vrai diff indexé et retourne résumé + description", async () => {
    const sent = [];
    const commitMessage = vi.fn(async (diff, root) => {
      expect(diff).toContain("diff --git a/src/app.ts b/src/app.ts");
      expect(diff).toContain("+export const ready = true;");
      expect(root).toBe("/proj");
      return {
        title: "Améliore la génération des commits",
        description: "Analyse le diff indexé et explique les changements importants.",
      };
    });
    const diffStaged = vi.fn(async () => "diff --git a/src/app.ts b/src/app.ts\n+export const ready = true;");
    await route({ type: "generateCommitMsg", projectRoot: "/proj", scope: "staged" }, {
      send: (message) => sent.push(message),
      gitops: { diffStaged },
      providers: { claude: { commitMessage } },
    });

    expect(diffStaged).toHaveBeenCalledWith("/proj", null);
    expect(sent).toEqual([{
      type: "commitMsg",
      projectRoot: "/proj",
      message: "Améliore la génération des commits",
      description: "Analyse le diff indexé et explique les changements importants.",
    }]);
  });

  it("generateCommitMsg résume les changements non indexés sans toucher à l’index", async () => {
    const sent = [];
    const diff = vi.fn(async () => "diff --git a/src/app.ts b/src/app.ts\n+const ready = true;");
    const commitMessage = vi.fn(async () => ({
      title: "Ajoute l’état prêt",
      description: "Décrit les changements du worktree avant leur indexation.",
    }));
    await route({ type: "generateCommitMsg", projectRoot: "/proj", scope: "changes" }, {
      send: (message) => sent.push(message),
      gitops: { diff },
      providers: { claude: { commitMessage } },
    });
    expect(diff).toHaveBeenCalledWith("/proj", null);
    expect(commitMessage).toHaveBeenCalledWith(expect.stringContaining("const ready"), "/proj");
    expect(sent[0]).toMatchObject({ type: "commitMsg", message: "Ajoute l’état prêt" });
  });
  it("route la création, la suppression et la fusion de branche avec un rafraîchissement Git", async () => {
    const sent = [];
    const createBranch = vi.fn(async () => "figures-2026");
    const deleteBranch = vi.fn(async () => "topic");
    const mergeBranch = vi.fn(async () => "topic");
    const ctx = {
      send: (message) => sent.push(message),
      gitops: { createBranch, deleteBranch, mergeBranch },
    };

    await route({ type: "gitCreateBranch", projectRoot: "/proj", branch: "figures-2026" }, ctx);
    await route({ type: "gitDeleteBranch", projectRoot: "/proj", branch: "topic" }, ctx);
    await route({ type: "gitMergeBranch", projectRoot: "/proj", branch: "topic" }, ctx);

    expect(createBranch).toHaveBeenCalledWith("/proj", "figures-2026");
    expect(deleteBranch).toHaveBeenCalledWith("/proj", "topic");
    expect(mergeBranch).toHaveBeenCalledWith("/proj", "topic");
    expect(sent.filter((message) => message.type === "gitSyncDone")).toEqual([
      { type: "gitSyncDone", op: "create-branch", projectRoot: "/proj", out: "figures-2026" },
      { type: "gitSyncDone", op: "delete-branch", projectRoot: "/proj", out: "topic" },
      { type: "gitSyncDone", op: "merge-branch", projectRoot: "/proj", out: "topic" },
    ]);
  });

  it("route le log, les détails, le diff d’un fichier et le revert avec le HEAD attendu", async () => {
    const sent = []; const broadcast = [];
    const log = vi.fn(async () => ({ commits: [{ sha: "a".repeat(40) }], hasMore: false, skip: 0 }));
    const commitDetails = vi.fn(async () => ({ sha: "a".repeat(40), subject: "test" }));
    const commitFileContents = vi.fn(async () => ({ before: "old", after: "new", binary: false }));
    const revertCommit = vi.fn(async () => "b".repeat(40));
    const ctx = { send: (m) => sent.push(m), broadcast: (m) => broadcast.push(m), gitops: { log, commitDetails, commitFileContents, revertCommit } };
    await route({ type: "gitLog", projectRoot: "/proj", limit: 20 }, ctx);
    await route({ type: "gitCommitDetails", projectRoot: "/proj", sha: "a".repeat(40) }, ctx);
    await route({ type: "gitCommitFileDiff", projectRoot: "/proj", sha: "a".repeat(40), path: "src/a.ts", previousPath: "src/old.ts" }, ctx);
    await route({ type: "gitRevertCommit", projectRoot: "/proj", sha: "a".repeat(40), expectedHead: "c".repeat(40) }, ctx);
    expect(log).toHaveBeenCalled(); expect(commitDetails).toHaveBeenCalled();
    expect(commitFileContents).toHaveBeenCalledWith("/proj", "a".repeat(40), "src/a.ts", "src/old.ts");
    expect(revertCommit).toHaveBeenCalledWith("/proj", "a".repeat(40), "c".repeat(40));
    expect(sent.map((m) => m.type)).toEqual(["gitLog", "gitCommitDetails", "gitCommitFileDiff", "gitHistoryActionDone"]);
    expect(broadcast.at(-1)?.type).toBe("gitChanged");
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
    expect(sends[1].prompt).toMatch(/^ensuite\n\n<atelier-file-scope>/);
    expect(sends[1].prompt).toContain("pre-existing worktree change");
    expect(sends[1].prompt).toContain("atelier-gallery-tool");
    // un snapshot par turn EXÉCUTÉ (jamais pour un queued en attente)
    expect(gitops.snapshot).toHaveBeenCalledTimes(2);

    await sends[1].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    const dones = doneEvents(emitted);
    expect(dones).toHaveLength(2);
    expect(dones[1].meta?.turnId).toBe(users[1].meta.turnId);
  });

  it("mode plan : transforme le texte final en artefact proposed_plan durable", async () => {
    const sends = [];
    const { ctx, emitted } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });

    await route({
      type: "send", provider: "claude", threadId: "t-plan", projectRoot: "/p",
      prompt: "prépare le plan", clientMessageId: "m-plan", permissionMode: "plan",
      displayEvent: { kind: "user", text: "prépare le plan" },
    }, ctx);
    await sends[0].onEvent({ kind: "text", text: "# Plan\n\n1. Auditer\n2. Corriger" });
    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();

    const plan = emitted.find((message) => message.type === "event" && message.event?.kind === "proposed_plan")?.event;
    expect(plan).toMatchObject({
      markdown: "# Plan\n\n1. Auditer\n2. Corriger",
      provider: "claude",
      source: "plan-mode",
    });
    expect(plan.planId).toMatch(/^plan-/);
    expect(plan.meta?.durable).toBe(true);
  });

  it("verrouille les tours écrivants par projet mais autorise un lecteur plan", async () => {
    const sends = [];
    const { ctx, emitted } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });

    await route({
      type: "send", provider: "claude", threadId: "writer-1", projectRoot: "/shared",
      prompt: "corrige", clientMessageId: "writer-message", permissionMode: "bypassPermissions",
    }, ctx);
    await route({
      type: "send", provider: "claude", threadId: "writer-2", projectRoot: "/shared",
      prompt: "corrige aussi", clientMessageId: "blocked-message", permissionMode: "bypassPermissions",
    }, ctx);
    expect(sends).toHaveLength(1);
    expect(emitted.some((message) => message.type === "error"
      && message.threadId === "writer-2"
      && String(message.message).includes("projet verrouillé"))).toBe(true);

    await route({
      type: "send", provider: "claude", threadId: "reader", projectRoot: "/shared",
      prompt: "audite seulement", clientMessageId: "reader-message", permissionMode: "plan",
    }, ctx);
    expect(sends).toHaveLength(2);

    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await sends[1].onEvent({ kind: "done", ok: true, result: "" });
    await flush();

    await route({
      type: "send", provider: "claude", threadId: "writer-2", projectRoot: "/shared",
      prompt: "réessaie", clientMessageId: "retry-message", permissionMode: "bypassPermissions",
    }, ctx);
    expect(sends).toHaveLength(3);
    await sends[2].onEvent({ kind: "done", ok: true, result: "" });
  });

  it("done : expose le checkpoint du tour et les fichiers réellement changés", async () => {
    const sends = [];
    const { ctx, emitted, gitops } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });
    gitops.changedSince.mockResolvedValue(["src/a.ts", "README.md"]);

    await route({
      type: "send", provider: "claude", threadId: "t-checkpoint", projectRoot: "/p",
      prompt: "modifie", clientMessageId: "m-checkpoint",
      displayEvent: { kind: "user", text: "modifie" },
    }, ctx);
    await sends[0].onEvent({ kind: "done", ok: true, result: "fait" });
    await flush();

    const done = doneEvents(emitted)[0];
    expect(done.filesChanged).toEqual(["src/a.ts", "README.md"]);
    expect(done.checkpoint).toEqual({ snapshotSha: "s".repeat(40), filesChanged: ["src/a.ts", "README.md"] });
  });

  it("edit : transporte le snapshot d'avant-tour jusqu'au chat", async () => {
    const sends = [];
    const { ctx, emitted, gitops } = makeTurnCtx({
      providerImpl: { send: (opts) => sends.push(opts) },
    });
    gitops.numstat.mockResolvedValue({ add: 7, del: 2 });
    await route({
      type: "send", provider: "claude", threadId: "t-edit-base", projectRoot: "/p",
      prompt: "modifie", clientMessageId: "m-edit-base",
      displayEvent: { kind: "user", text: "modifie" },
    }, ctx);
    await sends[0].onEvent({ kind: "edit", files: ["/p/src/a.ts"] });
    await flush();

    const edit = emitted.find((message) => message.type === "event" && message.event?.kind === "edit")?.event;
    expect(edit).toMatchObject({
      projectRoot: "/p",
      baseSha: "s".repeat(40),
      files: [{ path: "src/a.ts", add: 7, del: 2 }],
    });
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

describe("sélection de tour — repli lastTurn (pièges connus : démotion read-only)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 10));

  function makeCtx(providers) {
    const emitted = [];
    const dir = mkdtempSync(join(tmpdir(), "as-sel-"));
    const { ThreadStore } = threadStoreModule;
    const store = new ThreadStore(join(dir, "threads.json"));
    const ctx = {
      send: (m) => emitted.push(m),
      broadcast: (m) => emitted.push(m),
      store,
      gitops: {
        snapshot: vi.fn(async () => "s".repeat(40)),
        isRepo: async () => true,
        changedSince: vi.fn(async () => []),
        numstat: vi.fn(async () => []),
        status: async () => ({ files: [] }),
      },
      ledger: { append: vi.fn(async () => {}), getAll: async () => [] },
      providers,
    };
    return { ctx, emitted };
  }

  it("renvoi nu (rewind/autofix) : réutilise model/effort/permissionMode du dernier tour", async () => {
    const runs = [];
    const { ctx } = makeCtx({
      codex: { run: vi.fn((opts) => { runs.push(opts); return Promise.resolve({ sessionId: "s1" }); }) },
    });
    await route({
      type: "send", provider: "codex", threadId: "t-sel", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1",
      model: "gpt-5.6-sol", effort: "medium", permissionMode: "bypassPermissions",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await flush();
    await runs[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    // renvoi programmatique SANS sélection (reverted/autofix, App.tsx)
    await route({
      type: "send", provider: "codex", threadId: "t-sel", projectRoot: "/p",
      prompt: "renvoi nu", clientMessageId: "m2",
      displayEvent: { kind: "user", text: "renvoi nu" },
    }, ctx);
    await flush();

    expect(runs).toHaveLength(2);
    expect(runs[1].permissionMode).toBe("bypassPermissions");
    expect(runs[1].model).toBe("gpt-5.6-sol");
    expect(runs[1].effort).toBe("medium");
  });

  it("injecte au provider l’outil Galerie mais conserve le displayEvent utilisateur intact", async () => {
    const runs = [];
    const { ctx } = makeCtx({
      grok: { run: vi.fn((opts) => { runs.push(opts); return Promise.resolve({ sessionId: "g1" }); }) },
    });
    await route({
      type: "send", provider: "grok", threadId: "t-gallery", projectRoot: "/projet",
      prompt: "montre-moi ces figures", clientMessageId: "m-gallery",
      displayEvent: { kind: "user", text: "montre-moi ces figures" },
    }, ctx);
    await flush();
    expect(runs[0].prompt).toContain("montre-moi ces figures");
    expect(runs[0].prompt).toContain("atelier-gallery-tool");
    expect(runs[0].prompt).toContain('show --project-root "/projet"');
  });

  it("titre automatiquement depuis le message visible, jamais depuis le contexte injecté", async () => {
    const runs = [];
    const titleConversation = vi.fn(async () => "Analyse spectrale hivernale");
    const { ctx } = makeCtx({
      grok: { run: vi.fn((opts) => { runs.push(opts); return Promise.resolve({ sessionId: "g-title" }); }) },
      claude: { titleConversation },
    });
    await route({
      type: "send", provider: "grok", threadId: "t-title", projectRoot: "/projet",
      prompt: "/projet/figures/albedo.png\n\nAnalyse les tendances saisonnières", clientMessageId: "m-title",
      displayEvent: { kind: "user", text: "Analyse les tendances saisonnières" },
    }, ctx);
    await flush();
    expect(ctx.store.get("t-title").title).toBe("Analyse les tendances saisonnières");
    await runs[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    expect(titleConversation).toHaveBeenCalledWith("Analyse les tendances saisonnières");
    expect(ctx.store.get("t-title").title).toBe("Analyse spectrale hivernale");
  });

  it("verrouille le provider du fil et exige un handoff vers une nouvelle destination", async () => {
    const sends = [];
    const runs = [];
    const endClaude = vi.fn();
    const { ctx, emitted } = makeCtx({
      claude: { send: (opts) => sends.push(opts), endSession: endClaude },
      codex: { run: vi.fn((opts) => { runs.push(opts); return Promise.resolve({ sessionId: "s2" }); }) },
    });
    await route({
      type: "send", provider: "claude", threadId: "t-ho", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1",
      model: "claude-sonnet-5", effort: "high", permissionMode: "acceptEdits",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await flush();
    await sends[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();
    // Changer le provider sur le même id est désormais refusé.
    await route({
      type: "send", provider: "codex", threadId: "t-ho", projectRoot: "/p",
      prompt: "renvoi nu", clientMessageId: "m2",
      displayEvent: { kind: "user", text: "renvoi nu" },
    }, ctx);
    await flush();

    expect(runs).toHaveLength(0);
    expect(ctx.store.get("t-ho")).toMatchObject({ provider: "claude" });
    expect(emitted).toContainEqual(expect.objectContaining({ type: "error", threadId: "t-ho" }));

    // Le handoff explicite crée un fil Codex lié, sans toucher à la source.
    await route({
      type: "send", provider: "codex", threadId: "t-ho-codex", handoffFromThreadId: "t-ho", projectRoot: "/p",
      prompt: "renvoi nu", clientMessageId: "m3",
      displayEvent: { kind: "user", text: "renvoi nu" },
    }, ctx);
    await flush();

    expect(runs).toHaveLength(1);
    expect(runs[0].sessionId).toBeNull();
    expect(endClaude).not.toHaveBeenCalled();
    expect(ctx.store.get("t-ho")).toMatchObject({ provider: "claude" });
    expect(ctx.store.get("t-ho-codex")).toMatchObject({
      provider: "codex",
      handoff: { sourceThreadId: "t-ho", sourceProvider: "claude", targetProvider: "codex" },
    });
  });

  it("goalGet/codexCompact : transmettent le permissionMode du thread au provider", async () => {
    const getGoal = vi.fn(async () => null);
    const compactThread = vi.fn(async () => {});
    const runs = [];
    const { ctx } = makeCtx({
      codex: {
        run: vi.fn((opts) => { runs.push(opts); return Promise.resolve({ sessionId: "s3" }); }),
        setGoal: vi.fn(async () => null), getGoal, clearGoal: vi.fn(async () => null),
        compactThread,
      },
    });
    await route({
      type: "send", provider: "codex", threadId: "t-goal", projectRoot: "/p",
      prompt: "premier", clientMessageId: "m1", permissionMode: "bypassPermissions",
      displayEvent: { kind: "user", text: "premier" },
    }, ctx);
    await flush();
    await runs[0].onEvent({ kind: "done", ok: true, result: "" });
    await flush();

    await route({ type: "goalGet", threadId: "t-goal" }, ctx);
    expect(getGoal).toHaveBeenCalledWith(
      expect.objectContaining({ permissionMode: "bypassPermissions" }),
    );
    await route({ type: "codexCompact", threadId: "t-goal" }, ctx);
    expect(compactThread).toHaveBeenCalledWith(
      expect.objectContaining({ permissionMode: "bypassPermissions" }),
    );
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
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
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

    await route({ type: "interactionResponse", threadId: "i1",
      clientInstanceId: "11111111-1111-4111-8111-111111111111", requestId: pendingEv.requestId,
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
    await route({ type: "interactionResponse", threadId: "i2", clientInstanceId: "11111111-1111-4111-8111-111111111111", requestId: ev1.requestId, response: { allow: true } }, ctx);
    await route({ type: "interactionResponse", threadId: "i2", clientInstanceId: "11111111-1111-4111-8111-111111111111", requestId: ev1.requestId, response: { allow: false } }, ctx);
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

  it("Always allow session approuve les demandes suivantes sans nouvelle carte", async () => {
    const { ctx, emitted, getRelay } = interactionSetup();
    await route({ type: "send", provider: "codex", threadId: "i-session", projectRoot: "/p",
      prompt: "x", clientMessageId: "m1", displayEvent: { kind: "user", text: "x" } }, ctx);
    await flush();

    const first = getRelay()({ interactionType: "approval", title: "Commande", detail: "ls" });
    await flush();
    const pending = interactions(emitted).find((event) => event.state === "pending");
    await route({ type: "interactionResponse", threadId: "i-session",
      clientInstanceId: "11111111-1111-4111-8111-111111111111", requestId: pending.requestId,
      response: { allow: true, scope: "session" } }, ctx);
    expect(await first).toEqual({ allow: true, scope: "session" });
    await flush();
    const before = interactions(emitted).length;

    await expect(getRelay()({ interactionType: "approval", title: "Commande", detail: "pwd" }))
      .resolves.toEqual({ allow: true, scope: "session" });
    expect(interactions(emitted)).toHaveLength(before);
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

describe("base de connaissances (kbAdd)", () => {
  it("épingle une source web avec texte fourni et répond kbAdded", async () => {
    const prev = process.env.ATELIER_APP_DIR;
    process.env.ATELIER_APP_DIR = mkdtempSync(join(tmpdir(), "atelier-kb-router-"));
    try {
      const sent = [];
      await route({
        type: "kbAdd", kind: "web", origin: "https://exemple.org/revue",
        title: "Page capturée",
        text: "Texte capturé depuis le browser intégré, suffisamment long pour être indexé et retrouvé.",
      }, { send: (m) => sent.push(m) });
      expect(sent[0].type).toBe("kbAdded");
      expect(sent[0].source).toMatchObject({ kind: "web", title: "Page capturée" });
      expect(sent[0].refreshed).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ATELIER_APP_DIR;
      else process.env.ATELIER_APP_DIR = prev;
    }
  });

  it("kbPromotePage : aperçu puis écriture confirmée seulement", async () => {
    const prev = process.env.ATELIER_APP_DIR;
    process.env.ATELIER_APP_DIR = mkdtempSync(join(tmpdir(), "atelier-kb-page-"));
    try {
      const sent = [];
      const puts = [];
      const ctx = {
        send: (m) => sent.push(m),
        kbDeps: { runGbrain: (args, opts) => {
          if (args[0] === "get") return "Error [page_not_found]: Page not found\n";
          puts.push({ args, input: opts?.input });
          return "ok";
        } },
      };
      await route({
        type: "kbAdd", kind: "note", title: "Page à écrire",
        text: "Contenu de note suffisamment long pour être indexé par le moteur de passages.",
      }, ctx);
      const id = sent[0].source.id;
      await route({ type: "kbPromotePage", id }, ctx);
      expect(sent[1].type).toBe("kbPagePreview");
      expect(sent[1].slug).toBe("atelier/page-a-ecrire");
      expect(puts).toHaveLength(0);
      await route({ type: "kbPromotePage", id, slug: sent[1].slug, write: true }, ctx);
      expect(sent[2]).toMatchObject({ type: "kbPageWritten", slug: "atelier/page-a-ecrire", updated: false });
      expect(puts).toHaveLength(1);
      expect(puts[0].input).toContain("from: atelier");
    } finally {
      if (prev === undefined) delete process.env.ATELIER_APP_DIR;
      else process.env.ATELIER_APP_DIR = prev;
    }
  });

  it("gbrainSearch relaie les résultats et met l'échec NAS dans la réponse", async () => {
    const sent = [];
    const ctx = {
      send: (m) => sent.push(m),
      kbDeps: { runGbrain: () => "[0.42] papers/aubry-wake-2022 -- Fire and Ice\n" },
    };
    await route({ type: "gbrainSearch", query: "albédo", limit: 5 }, ctx);
    expect(sent[0].type).toBe("gbrainResults");
    expect(sent[0].results).toEqual([{ slug: "papers/aubry-wake-2022", snippet: "Fire and Ice" }]);

    const down = [];
    await route({ type: "gbrainSearch", query: "albédo" }, {
      send: (m) => down.push(m),
      kbDeps: { runGbrain: () => { throw new Error("gbrain : délai dépassé (NAS injoignable ?)"); } },
    });
    expect(down[0].type).toBe("gbrainResults");
    expect(down[0].results).toEqual([]);
    expect(down[0].error).toMatch(/NAS injoignable/);
  });

  it("kbPromote répond kbPromoted (spawn injecté) et kbError en échec", async () => {
    const prev = process.env.ATELIER_APP_DIR;
    process.env.ATELIER_APP_DIR = mkdtempSync(join(tmpdir(), "atelier-kb-promote-"));
    try {
      const sent = [];
      const ctx = {
        send: (m) => sent.push(m),
        kbPromoteDeps: { spawn: () => ({ status: 0, stdout: "ok", stderr: "" }) },
      };
      await route({
        type: "kbAdd", kind: "note", title: "À promouvoir",
        text: "Contenu de note suffisamment long pour être indexé par le moteur de passages.",
      }, ctx);
      await route({ type: "kbPromote", id: sent[0].source.id }, ctx);
      expect(sent[1]).toEqual({ type: "kbPromoted", id: sent[0].source.id });
      await route({ type: "kbPromote", id: "inexistant" }, ctx);
      expect(sent[2].type).toBe("kbError");
      expect(sent[2].message).toMatch(/Source inconnue/);
    } finally {
      if (prev === undefined) delete process.env.ATELIER_APP_DIR;
      else process.env.ATELIER_APP_DIR = prev;
    }
  });

  it("répond kbError sur kind invalide, sans jeter", async () => {
    const sent = [];
    await route({ type: "kbAdd", kind: "vhs" }, { send: (m) => sent.push(m) });
    expect(sent[0].type).toBe("kbError");
    expect(sent[0].message).toMatch(/Kind non pris en charge/);
  });

  it("kbList puis kbRemove renvoient la liste à jour et purgent les threads", async () => {
    const prev = process.env.ATELIER_APP_DIR;
    process.env.ATELIER_APP_DIR = mkdtempSync(join(tmpdir(), "atelier-kb-router-"));
    try {
      const storePath = join(mkdtempSync(join(tmpdir(), "atelier-kb-purge-")), "threads.json");
      const store = new threadStoreModule.ThreadStore(storePath);
      const sent = [];
      const ctx = { send: (m) => sent.push(m), store };
      await route({
        type: "kbAdd", kind: "note", title: "Note picker",
        text: "Contenu de note suffisamment long pour être indexé par le moteur de passages.",
      }, ctx);
      const sourceId = sent[0].source.id;
      // deux threads référencent la source ; un troisième non
      store.upsert({ id: "t-a", kbSourceIds: [sourceId, "autre"], kbFullContent: [sourceId] });
      store.upsert({ id: "t-b", kbSourceIds: [sourceId] });
      store.upsert({ id: "t-c", kbSourceIds: ["autre"] });
      await route({ type: "kbList" }, ctx);
      expect(sent[1].type).toBe("kbSources");
      expect(sent[1].sources).toHaveLength(1);
      await route({ type: "kbRemove", id: sourceId }, ctx);
      expect(sent[2]).toMatchObject({ type: "kbSources", sources: [] });
      expect(sent[3].type).toBe("threads");
      expect(store.get("t-a")).toMatchObject({ kbSourceIds: ["autre"], kbFullContent: [] });
      expect(store.get("t-b")).toMatchObject({ kbSourceIds: [] });
      expect(store.get("t-c")).toMatchObject({ kbSourceIds: ["autre"] });
    } finally {
      if (prev === undefined) delete process.env.ATELIER_APP_DIR;
      else process.env.ATELIER_APP_DIR = prev;
    }
  });

  it("upsertThread persiste kbSourceIds/kbFullContent et broadcast threads", async () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "atelier-kb-threads-")), "threads.json");
    const store = new threadStoreModule.ThreadStore(storePath);
    const sent = [];
    const ctx = { send: (m) => sent.push(m), store };
    await route({ type: "upsertThread", thread: {
      id: "t-kb", provider: "codex", kbSourceIds: ["9c81", "gbrain"], kbFullContent: ["9c81"],
    } }, ctx);
    expect(sent[0].type).toBe("threads");
    expect(sent[0].threads[0]).toMatchObject({ id: "t-kb", kbSourceIds: ["9c81", "gbrain"] });
    // patch partiel : les champs kb survivent au merge et au disque
    await route({ type: "upsertThread", thread: { id: "t-kb", title: "Renommé" } }, ctx);
    const reloaded = new threadStoreModule.ThreadStore(storePath);
    expect(reloaded.get("t-kb")).toMatchObject({
      title: "Renommé", kbSourceIds: ["9c81", "gbrain"], kbFullContent: ["9c81"],
    });
    // id manquant → erreur propre
    await route({ type: "upsertThread", thread: { title: "sans id" } }, ctx);
    expect(sent.at(-1).type).toBe("error");
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
