import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { route, emitProviderGlobal, __resetHarnessStateForTest } from "./router.mjs";
import { ThreadStore } from "./store.mjs";
import { createHarnessJournal } from "./harness_journal.mjs";

// état harnais par-thread module-level → réinitialiser entre tests (ids réutilisés)
beforeEach(() => __resetHarnessStateForTest());

// Scénarios défectueux du plan 025 signalés en revue (tests ROUGES d'abord).
// Chaque bloc reproduit un défaut réel du harnais avant sa correction.

const flush = () => new Promise((r) => setTimeout(r, 15));

function setup({ providerImpl, provider = "claude", withJournal = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "as-hard-"));
  const store = new ThreadStore(join(dir, "threads.json"));
  const harnessJournal = withJournal ? createHarnessJournal({ baseDir: dir }) : null;
  const emitted = [];
  const ctx = {
    send: (m) => emitted.push(m),
    broadcast: (m) => emitted.push(m),
    store,
    harnessJournal,
    history: {},
    sessions: {},
    gitops: {
      snapshot: vi.fn(async () => "s".repeat(40)),
      isRepo: async () => true,
      changedSince: async () => [],
      numstat: async () => [],
      restore: vi.fn(async () => {}),
    },
    ledger: { append: vi.fn(async () => {}) },
    providers: { [provider]: providerImpl },
    connectionId: "client-owner",
    clientInstanceId: "instance-owner",
  };
  return { ctx, emitted, store, harnessJournal, dir };
}

const evs = (emitted) => emitted.filter((m) => m.type === "event").map((m) => m.event);
const send = (extra) => ({
  type: "send", threadId: "t", projectRoot: "/p", prompt: "p", provider: "claude",
  clientMessageId: extra?.clientMessageId ?? "m1",
  displayEvent: { kind: "user", text: extra?.prompt ?? "p" }, ...extra,
});

describe("Bug 1 — course entre deux sends concurrents (même thread)", () => {
  it("un seul turn démarre (un seul snapshot) ; le second est mis en file", async () => {
    const runs = [];
    const { ctx, emitted } = setup({
      providerImpl: { send: (opts) => { runs.push(opts); } },
    });
    // deux sends du MÊME thread lancés en parallèle (deux frames WS rapprochées) ;
    // le second en mode queue pour vérifier qu'il n'est PAS exécuté en parallèle
    await Promise.all([
      route(send({ clientMessageId: "m1", prompt: "premier" }), ctx),
      route(send({ clientMessageId: "m2", prompt: "second", mode: "queue" }), ctx),
    ]);
    await flush();
    // sans sérialisation, les deux franchiraient le check « running » et
    // démarreraient chacun un turn (2 snapshots, 2 runs) ; ici un seul
    expect(ctx.gitops.snapshot).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(1);
    const users = evs(emitted).filter((e) => e.kind === "user");
    expect(users).toHaveLength(2);
    const turnIds = new Set(users.map((u) => u.meta?.turnId));
    expect(turnIds.size).toBe(2); // 1 actif + 1 réservé en file
  });
});

describe("Bug 2 — changement de provider pendant un run", () => {
  it("un send d'un AUTRE provider pendant un run ne steere pas le turn en cours", async () => {
    const claudeRuns = [];
    const codexRuns = [];
    const { ctx, emitted } = setup({ providerImpl: { send: (o) => claudeRuns.push(o) } });
    ctx.providers.codex = { run: (o) => { codexRuns.push(o); return new Promise(() => {}); }, steer: vi.fn() };

    await route(send({ provider: "claude", clientMessageId: "m1" }), ctx);
    await flush();
    expect(claudeRuns).toHaveLength(1);
    // pendant le run Claude, un send Codex arrive
    await route(send({ provider: "codex", clientMessageId: "m2" }), ctx);
    await flush();
    // le turn Claude en cours ne doit PAS être steeré vers Codex ;
    // Codex ne doit pas non plus démarrer un run concurrent qui écraserait le dispatcher
    expect(ctx.providers.codex.steer).not.toHaveBeenCalled();
    expect(codexRuns).toHaveLength(0);
    // un signal explicite est renvoyé (erreur ou file), pas un cross-wiring silencieux
    const users = evs(emitted).filter((e) => e.kind === "user");
    const errs = emitted.filter((m) => m.type === "error");
    expect(users.length === 1 || errs.length >= 1).toBe(true);
  });
});

describe("Bug 6/8 — goal durable journalisé + séquences après clear/compact/goal", () => {
  it("un goal émis est journalisé avec meta et rejoué par materialize", async () => {
    const { ctx, harnessJournal } = setup({
      provider: "codex",
      providerImpl: {
        run: (opts) => {
          opts.onEvent({ kind: "goal", goal: { objective: "analyser l'albédo", status: "active", tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 } });
          opts.onEvent({ kind: "done", ok: true, result: "" });
          return Promise.resolve({ sessionId: "cx" });
        },
      },
    });
    await route(send({ provider: "codex" }), ctx);
    await flush();
    const mat = await harnessJournal.materialize("t");
    const goal = mat.find((e) => e.kind === "goal");
    expect(goal, "le goal doit survivre au reload via le journal").toBeTruthy();
    expect(goal.meta?.sequence).toBeGreaterThan(0);
  });

  it("un goal hors-turn sans harnais actif est hydraté, séquencé et journalisé", async () => {
    const { ctx, store, harnessJournal } = setup({
      provider: "codex",
      providerImpl: { run: vi.fn() },
    });
    store.upsert({ id: "t", provider: "codex", projectRoot: "/p", sessionId: "cx-idle" });
    ctx.sessions.codexHistory = vi.fn(async () => []);

    await emitProviderGlobal("t", {
      kind: "goal",
      goal: { objective: "goal hors turn", status: "active" },
    }, ctx);

    const mat = await harnessJournal.materialize("t");
    const goal = mat.find((e) => e.kind === "goal");
    expect(goal?.goal?.objective).toBe("goal hors turn");
    expect(goal?.meta?.sequence).toBeGreaterThan(0);
  });

  it("goalGet passe par le harnais et survit au reload", async () => {
    const goal = { objective: "goal relu", status: "active" };
    const { ctx, store, harnessJournal } = setup({
      provider: "codex",
      providerImpl: {
        setGoal: vi.fn(),
        getGoal: vi.fn(async () => goal),
      },
    });
    store.upsert({ id: "t", provider: "codex", projectRoot: "/p", sessionId: "cx-goal" });
    ctx.sessions.codexHistory = vi.fn(async () => []);

    await route({ type: "goalGet", threadId: "t", explicit: true }, ctx);

    const mat = await harnessJournal.materialize("t");
    expect(mat.find((e) => e.kind === "goal")?.goal).toEqual(goal);
  });

  it("clear migre l'ancien transcript avant d'effacer la session native", async () => {
    const { ctx, store, harnessJournal } = setup({
      provider: "codex",
      providerImpl: { run: vi.fn() },
    });
    store.upsert({ id: "t", provider: "codex", projectRoot: "/p", sessionId: "cx-legacy" });
    ctx.sessions.codexHistory = vi.fn(async () => [
      { kind: "user", text: "ancienne question" },
      { kind: "text", text: "ancienne réponse" },
    ]);

    await route({ type: "codexClear", threadId: "t" }, ctx);

    expect(ctx.sessions.codexHistory).toHaveBeenCalledWith("cx-legacy");
    const mat = await harnessJournal.materialize("t");
    expect(mat.some((e) => e.kind === "user" && e.text === "ancienne question")).toBe(true);
    expect(mat.some((e) => e.kind === "tool" && e.name === "__session-cleared")).toBe(true);
  });

  it("les frontières __session-cleared / __compacted portent meta et n'introduisent pas de trou de sequence", async () => {
    const { ctx, emitted, store, harnessJournal } = setup({
      provider: "codex",
      providerImpl: { run: () => new Promise(() => {}), compactThread: vi.fn(async () => {}) },
    });
    store.upsert({ id: "t", provider: "codex", projectRoot: "/p", sessionId: "cx" });
    // compact d'abord (a besoin de la session), puis clear (qui la remet à null)
    await route({ type: "codexCompact", threadId: "t" }, ctx);
    await route({ type: "codexClear", threadId: "t" }, ctx);
    await flush();
    const frontier = evs(emitted).filter((e) => e.kind === "tool" &&
      (e.name === "__session-cleared" || e.name === "__compacted"));
    expect(frontier.length).toBe(2);
    for (const f of frontier) {
      expect(f.meta?.sequence, `${f.name} doit porter une sequence`).toBeGreaterThan(0);
    }
    // séquences strictement croissantes
    const seqs = frontier.map((f) => f.meta.sequence);
    expect(seqs[1]).toBeGreaterThan(seqs[0]);
    // et journalisées
    const mat = await harnessJournal.materialize("t");
    expect(mat.some((e) => e.kind === "tool" && e.name === "__session-cleared")).toBe(true);
  });
});

describe("Bug 7 — permission Claude via le harnais (meta + journal)", () => {
  it("une demande de permission Claude (mode Ask) passe par le harnais avec meta et est journalisée", async () => {
    let permResolve;
    const { ctx, emitted, harnessJournal } = setup({
      providerImpl: {
        send: (opts) => {
          // le SDK Claude demande une permission via onPermissionRequest (bloquant)
          Promise.resolve(opts.onPermissionRequest?.({ toolName: "Bash", input: { command: "rm x" } }))
            .then((allow) => { permResolve = allow; opts.onEvent({ kind: "done", ok: true, result: "" }); });
        },
      },
    });
    await route(send({ permissionMode: "default" }), ctx);
    await flush();
    // la demande doit apparaître comme événement harnais (interaction) avec meta,
    // pas comme un message top-level {type:"permissionRequest"} sans turnId
    const inter = evs(emitted).find((e) => e.kind === "interaction" && e.interactionType === "approval");
    expect(inter, "la permission Claude doit être un événement interaction harnais").toBeTruthy();
    expect(inter.meta?.turnId, "attribuée au turn actif").toBeTruthy();
    // répondable via interactionResponse
    await route({
      type: "interactionResponse", threadId: "autre-thread",
      requestId: inter.requestId, clientInstanceId: "instance-owner", response: { allow: true },
    }, ctx);
    await flush();
    expect(permResolve).toBeUndefined();
    await route({
      type: "interactionResponse", threadId: "t",
      requestId: inter.requestId, clientInstanceId: "instance-attaquant", response: { allow: true },
    }, { ...ctx, connectionId: "client-attaquant", clientInstanceId: "instance-attaquant" });
    await flush();
    expect(permResolve).toBeUndefined();
    await route({
      type: "interactionResponse", threadId: "t",
      requestId: inter.requestId, clientInstanceId: "instance-owner", response: { allow: true },
    }, { ...ctx, connectionId: "client-reconnecte", clientInstanceId: "instance-owner" });
    await flush();
    expect(permResolve).toBe(true);
    // journalisée
    const mat = await harnessJournal.materialize("t");
    expect(mat.some((e) => e.kind === "interaction")).toBe(true);
  });
});

describe("Bug 11 — migration legacy retentable après échec", () => {
  it("un seed legacy qui échoue ne bloque pas définitivement l'historique (retenté au send suivant)", async () => {
    let loaderCalls = 0;
    const { ctx, harnessJournal } = setup({
      providerImpl: { send: (opts) => opts.onEvent({ kind: "done", ok: true, result: "" }) },
    });
    ctx.store.upsert({ id: "t", provider: "claude", projectRoot: "/p",
      sessionId: "123e4567-e89b-42d3-a456-426614174000" });
    ctx.history.claudeHistory = vi.fn(async () => {
      loaderCalls++;
      if (loaderCalls === 1) throw new Error("NAS momentanément injoignable");
      return [{ kind: "user", text: "ancienne question" }, { kind: "text", text: "ancienne réponse" }];
    });
    // 1er send : le seed échoue
    await route(send({ clientMessageId: "m1" }), ctx);
    await flush();
    // 2e send : le seed doit être RETENTÉ (pas marqué comme fait à vide)
    await route(send({ clientMessageId: "m2" }), ctx);
    await flush();
    expect(loaderCalls).toBeGreaterThanOrEqual(2);
    const mat = await harnessJournal.materialize("t");
    expect(mat.some((e) => e.kind === "user" && String(e.text).includes("ancienne question")),
      "l'historique legacy doit finir par être seedé").toBe(true);
  });

  it("un seedLegacy qui retourne false est retenté au send suivant", async () => {
    let loaderCalls = 0;
    let seedCalls = 0;
    const { ctx, harnessJournal: realJournal } = setup({
      providerImpl: { send: (opts) => opts.onEvent({ kind: "done", ok: true, result: "" }) },
    });
    ctx.store.upsert({ id: "t", provider: "claude", projectRoot: "/p",
      sessionId: "123e4567-e89b-42d3-a456-426614174000" });
    ctx.history.claudeHistory = vi.fn(async () => {
      loaderCalls++;
      return [{ kind: "user", text: "legacy à préserver" }];
    });
    ctx.harnessJournal = {
      ...realJournal,
      seedLegacy: async (...args) => {
        seedCalls++;
        if (seedCalls === 1) return false;
        return realJournal.seedLegacy(...args);
      },
    };

    await route(send({ clientMessageId: "m1" }), ctx);
    await flush();
    await route(send({ clientMessageId: "m2" }), ctx);
    await flush();

    expect(seedCalls).toBe(2);
    expect(loaderCalls).toBe(2);
    expect((await realJournal.materialize("t")).some((e) => e.text === "legacy à préserver")).toBe(true);
  });
});

describe("Bug 4/5 — fork par fromThreadId+eventId, revert par eventId (journal)", () => {
  async function seededThread() {
    const { ctx, emitted, harnessJournal } = setup({
      providerImpl: {
        send: (opts) => {
          opts.onSession?.("123e4567-e89b-42d3-a456-426614174000"); // fork/revert exigent une session
          opts.onEvent({ kind: "text", text: "réponse 1" });
          opts.onEvent({ kind: "done", ok: true, result: "réponse 1" });
        },
      },
    });
    await route(send({ clientMessageId: "m1", prompt: "question 1" }), ctx);
    // déterministe (pas de sleep) : le broadcast du terminal prouve que tous
    // les dispatchs ont eu lieu (donc tous les appends sont enfilés), puis
    // flush attend que la file d'écriture du journal soit vidée sur disque
    await vi.waitFor(() => {
      if (!evs(emitted).some((e) => e.kind === "done")) throw new Error("turn pas terminé");
    });
    await harnessJournal.flush("t");
    const durable = evs(emitted).filter((e) => e.meta?.eventId);
    return { ctx, harnessJournal, durable };
  }

  it("forkThread copie le journal jusqu'au eventId de fork (pas tout le fil)", async () => {
    const { ctx, harnessJournal, durable } = await seededThread();
    const forkPoint = durable.find((e) => e.kind === "user"); // fork juste après le 1er user
    await route({
      type: "forkThread", fromThreadId: "t", newThreadId: "fork-A", eventId: forkPoint.meta.eventId,
    }, ctx);
    // la copie est lancée fire-and-forget par le router mais enfilée pendant
    // route() — flush l'attend, là où un sleep fixe flakait sous charge
    await harnessJournal.flush("t");
    const forked = await harnessJournal.materialize("fork-A");
    expect(forked.length).toBeGreaterThan(0);
    // le fork ne contient QUE jusqu'au point de fork (le user), pas le done final
    expect(forked.some((e) => e.kind === "done")).toBe(false);
    expect(forked.some((e) => e.kind === "user")).toBe(true);
  });

  it("forkThread Grok crée une session neuve et injecte le contexte une seule fois", async () => {
    const prompts = [];
    const { ctx, store } = setup({
      provider: "grok",
      providerImpl: {
        run: async (opts) => {
          prompts.push(opts.prompt);
          opts.onEvent({ kind: "text", text: "branche" });
          opts.onEvent({ kind: "done", ok: true, result: "branche" });
          return { sessionId: "grok-fork-session" };
        },
      },
    });
    store.upsert({ id: "grok-src", provider: "grok", projectRoot: "/p", sessionId: "grok-source", title: "Grok source" });

    await route({
      type: "forkThread",
      fromThreadId: "grok-src",
      newThreadId: "grok-fork",
      contextEvents: [
        { kind: "user", text: "question source" },
        { kind: "text", text: "réponse source" },
      ],
    }, ctx);
    const fork = store.get("grok-fork");
    expect(fork.provider).toBe("grok");
    expect(fork.sessionId).toBeNull();
    expect(fork.forkContext).toContain("question source");

    await route(send({
      threadId: "grok-fork",
      provider: "grok",
      prompt: "nouvelle question",
      clientMessageId: "grok-fork-message",
    }), ctx);
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    expect(prompts[0]).toContain("réponse source");
    expect(prompts[0]).toMatch(/fin du fil transmis[\s\S]*nouvelle question/);
    await vi.waitFor(() => expect(store.get("grok-fork").sessionId).toBe("grok-fork-session"));
    expect(store.get("grok-fork").forkContext).toBeNull();
  });

  it("revert tronque le journal par eventId (non destructif)", async () => {
    const { ctx, harnessJournal, durable } = await seededThread();
    const text = durable.find((e) => e.kind === "text");
    await route({ type: "revert", threadId: "t", eventId: text.meta.eventId }, ctx);
    await flush();
    const mat = await harnessJournal.materialize("t");
    // le texte reverté et ce qui suit disparaissent du replay
    expect(mat.some((e) => e.kind === "text" && e.text === "réponse 1")).toBe(false);
    expect(mat.some((e) => e.kind === "done")).toBe(false);
    // mais l'user d'avant reste
    expect(mat.some((e) => e.kind === "user")).toBe(true);
  });

  it("blocs galerie/zotero : injectés au premier tour de session seulement", async () => {
    const prompts = [];
    const { ctx, emitted } = setup({
      providerImpl: {
        send: (opts) => {
          prompts.push(opts.prompt);
          opts.onSession?.("123e4567-e89b-42d3-a456-426614174000");
          opts.onEvent({ kind: "text", text: "ok" });
          opts.onEvent({ kind: "done", ok: true, result: "" });
        },
      },
    });
    await route(send({ clientMessageId: "m1", prompt: "premier" }), ctx);
    await vi.waitFor(() => {
      if (evs(emitted).filter((e) => e.kind === "done").length < 1) throw new Error("tour 1 pas fini");
    });
    await route(send({ clientMessageId: "m2", prompt: "second" }), ctx);
    await vi.waitFor(() => {
      if (evs(emitted).filter((e) => e.kind === "done").length < 2) throw new Error("tour 2 pas fini");
    });
    expect(prompts[0]).toContain("<atelier-gallery-integration>");
    expect(prompts[0]).toContain("<atelier-zotero-passages>");
    // session déjà semée : plus de re-injection des instructions statiques
    expect(prompts[1]).not.toContain("<atelier-gallery-integration>");
    expect(prompts[1]).not.toContain("<atelier-zotero-passages>");
  });

  it("revert files restaure le checkpoint sans tronquer le transcript", async () => {
    const { ctx, harnessJournal, durable } = await seededThread();
    const done = durable.find((e) => e.kind === "done");
    const before = await harnessJournal.materialize("t");

    await route({
      type: "revert",
      scope: "files",
      threadId: "t",
      eventId: done.meta.eventId,
      turnId: done.meta.turnId,
      snapshotSha: done.checkpoint.snapshotSha,
    }, ctx);
    await flush();

    // checkpoint sans filesChanged (changedSince → []) : restauration complète
    expect(ctx.gitops.restore).toHaveBeenCalledWith("/p", done.checkpoint.snapshotSha, null);
    expect(await harnessJournal.materialize("t")).toEqual(before);
  });

  it("revert files passe le périmètre du checkpoint (filesChanged) à restore", async () => {
    const { ctx, emitted, harnessJournal } = setup({
      providerImpl: {
        send: (opts) => {
          opts.onSession?.("123e4567-e89b-42d3-a456-426614174000");
          opts.onEvent({ kind: "text", text: "réponse 1" });
          opts.onEvent({ kind: "done", ok: true, result: "réponse 1" });
        },
      },
    });
    // le tour a touché deux fichiers : le checkpoint durable porte le périmètre
    ctx.gitops.changedSince = async () => ["src/a.ts", "README.md"];
    await route(send({ clientMessageId: "m1", prompt: "question 1" }), ctx);
    await vi.waitFor(() => {
      if (!evs(emitted).some((e) => e.kind === "done")) throw new Error("turn pas terminé");
    });
    await harnessJournal.flush("t");
    const done = evs(emitted).filter((e) => e.meta?.eventId).find((e) => e.kind === "done");

    await route({
      type: "revert",
      scope: "files",
      threadId: "t",
      eventId: done.meta.eventId,
      turnId: done.meta.turnId,
      snapshotSha: done.checkpoint.snapshotSha,
    }, ctx);
    await flush();

    expect(ctx.gitops.restore).toHaveBeenCalledWith("/p", done.checkpoint.snapshotSha, ["src/a.ts", "README.md"]);
  });
});

describe("Bug 13 — nativeTurnId câblé depuis le provider", () => {
  it("un nativeTurnId annoncé par le provider apparaît dans la meta des événements du turn", async () => {
    const { ctx, emitted } = setup({
      provider: "codex",
      providerImpl: {
        run: (opts) => {
          opts.onEvent({ kind: "started", nativeTurnId: "codex-turn-42" });
          opts.onEvent({ kind: "text", text: "réponse" });
          opts.onEvent({ kind: "done", ok: true, result: "réponse" });
          return Promise.resolve({ sessionId: "cx" });
        },
      },
    });
    await route(send({ provider: "codex" }), ctx);
    await flush();
    const text = evs(emitted).find((e) => e.kind === "text");
    expect(text?.meta?.nativeTurnId).toBe("codex-turn-42");
    const done = evs(emitted).find((e) => e.kind === "done");
    expect(done?.meta?.nativeTurnId).toBe("codex-turn-42");
  });
});
