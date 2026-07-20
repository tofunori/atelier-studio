// Kimi Code ACP (plan 046, étape 9) — parité Node du provider Rust :
// MÊME fixture wire (rust/crates/atelier-providers/tests/fixtures/
// fake_kimi_acp.mjs), même mapping d'optionId, mêmes erreurs actionnables,
// même limite image. Les tests d'intégration pilotent le vrai module
// (client ACP singleton) via un wrapper exécutable ATELIER_KIMI_BIN.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildKimiPromptBlocks,
  describeKimiPermission,
  history,
  interrupt,
  kimiImageBlock,
  kimiPermissionOutcome,
  KIMI_IMAGE_MAX_BYTES,
  listSessions,
  mapKimiPermissionMode,
  mapKimiPromptResult,
  mapKimiSessionUpdate,
  mapKimiThinking,
  replayToHistory,
  run,
  stopAcpServer,
} from "./providers/kimi.mjs";

const FIXTURE = resolve(
  import.meta.dirname,
  "../rust/crates/atelier-providers/tests/fixtures/fake_kimi_acp.mjs",
);

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-acp-test-"));
  const wrapper = join(tmp, "kimi");
  // Le client lance `<bin> acp` : le wrapper exec le fixture partagé ; le mode
  // passe par FAKE_KIMI_MODE (argv[2] vaut "acp" ⇒ nominal).
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${FIXTURE}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  process.env.ATELIER_KIMI_BIN = wrapper;
});
afterAll(() => {
  stopAcpServer();
  delete process.env.ATELIER_KIMI_BIN;
  delete process.env.FAKE_KIMI_MODE;
  rmSync(tmp, { recursive: true, force: true });
});
afterEach(() => {
  // chaque test repart d'un process propre (mode env relu au spawn)
  stopAcpServer();
  delete process.env.FAKE_KIMI_MODE;
});

const freshCtx = () => ({ toolMeta: new Map(), seenEdits: new Set(), lastUsageUpdate: null });

async function turn(overrides = {}) {
  const events = [];
  const result = await run({
    threadId: overrides.threadId ?? "t-kimi",
    cwd: overrides.cwd ?? "/tmp/fake-kimi-proj",
    prompt: overrides.prompt ?? "bonjour",
    inputs: overrides.inputs,
    sessionId: overrides.sessionId,
    model: overrides.model,
    effort: overrides.effort,
    permissionMode: overrides.permissionMode,
    onInteraction: overrides.onInteraction,
    onEvent: (ev) => events.push(ev),
  });
  return { result, events, text: events.filter((e) => e.kind === "delta").map((e) => e.text).join("") };
}

// ---------------------------------------------------------------------------
describe("mapKimiSessionUpdate (miroir kimi_map.rs)", () => {
  it("thought → thinking_delta, message → delta", () => {
    const ctx = freshCtx();
    expect(mapKimiSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "je pense" } }, ctx))
      .toEqual([{ kind: "thinking_delta", text: "je pense" }]);
    expect(mapKimiSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } }, ctx))
      .toEqual([{ kind: "delta", text: "ok" }]);
  });

  it("tool_call : source kimi, toolCallId préfixé turn conservé, output string", () => {
    const ctx = freshCtx();
    const [ev] = mapKimiSessionUpdate(
      { sessionUpdate: "tool_call", toolCallId: "3:call_abc", title: "Bash", kind: "execute", rawInput: { command: "ls" } },
      ctx,
    );
    expect(ev).toMatchObject({ kind: "tool_update", id: "3:call_abc", name: "Bash", status: "running", source: "kimi" });
    expect(typeof ev.output).toBe("string");
  });

  it("tool_call_update : statut/output + edit dédupliqué", () => {
    const ctx = freshCtx();
    mapKimiSessionUpdate({ sessionUpdate: "tool_call", toolCallId: "1:c", title: "Write", kind: "edit" }, ctx);
    const u = {
      sessionUpdate: "tool_call_update",
      toolCallId: "1:c",
      status: "completed",
      content: [{ type: "diff", path: "/tmp/a.txt", oldText: "", newText: "neuf" }],
    };
    const evs = mapKimiSessionUpdate(u, ctx);
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ status: "completed", name: "Write" });
    expect(evs[1]).toEqual({ kind: "edit", files: ["/tmp/a.txt"] });
    expect(mapKimiSessionUpdate(u, ctx)).toHaveLength(1); // dédup
  });

  it("plan → singleton todos (completed/in_progress/pending)", () => {
    const evs = mapKimiSessionUpdate(
      {
        sessionUpdate: "plan",
        entries: [
          { content: "Lire", priority: "medium", status: "completed" },
          { content: "Écrire", priority: "medium", status: "in_progress" },
          { content: "Tester", priority: "medium", status: "pending" },
        ],
      },
      freshCtx(),
    );
    expect(evs).toEqual([
      {
        kind: "todos",
        items: [
          { text: "Lire", completed: true, active: false },
          { text: "Écrire", completed: false, active: true },
          { text: "Tester", completed: false, active: false },
        ],
      },
    ]);
  });

  it("config_option_update / available_commands_update / inconnu : jamais transcript", () => {
    const ctx = freshCtx();
    for (const u of [
      { sessionUpdate: "config_option_update", configOptions: [] },
      { sessionUpdate: "available_commands_update", availableCommands: [] },
      { sessionUpdate: "session_info_update", title: "x" },
      { sessionUpdate: "extension_future" },
    ]) {
      expect(mapKimiSessionUpdate(u, ctx)).toEqual([]);
    }
  });
});

describe("mapKimiPromptResult (aucun usage synthétique)", () => {
  it("contrat 0.26 réel ({stopReason} seul) : done SANS clé usage", () => {
    const done = mapKimiPromptResult({ stopReason: "end_turn" }, freshCtx());
    expect(done).toEqual({ kind: "done", ok: true, result: "" });
    expect("usage" in done).toBe(false);
  });

  it("usage réel fourni : mappé et enrichi du dernier usage_update", () => {
    const ctx = freshCtx();
    mapKimiSessionUpdate(
      { sessionUpdate: "usage_update", used: 1234, size: 200000, cost: { amount: 0.005, currency: "USD" } },
      ctx,
    );
    const done = mapKimiPromptResult(
      { stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 7, totalTokens: 107 } },
      ctx,
    );
    expect(done.usage).toEqual({ context: 107, output: 7, cost: 0.005, turns: null, window: 200000 });
  });

  it("cancelled = succès ; refusal = échec", () => {
    expect(mapKimiPromptResult({ stopReason: "cancelled" }, {}).ok).toBe(true);
    expect(mapKimiPromptResult({ stopReason: "refusal" }, {}).ok).toBe(false);
  });
});

describe("permissions : spec fidèle + outcome opaque", () => {
  const ordinary = {
    sessionId: "s1",
    toolCall: {
      toolCallId: "3:c1",
      title: "Bash",
      content: [{ type: "content", content: { type: "text", text: "Requesting approval to run `ls`" } }],
    },
    options: [
      { optionId: "approve_once", name: "Approve once", kind: "allow_once" },
      { optionId: "approve_always", name: "Approve for this session", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  };

  it("permission ordinaire : approval avec choices dans l'ordre EXACT", () => {
    const spec = describeKimiPermission(ordinary);
    expect(spec.interactionType).toBe("approval");
    expect(spec.title).toBe("Bash");
    expect(spec.choices.map((c) => c.optionId)).toEqual(["approve_once", "approve_always", "reject"]);
    expect(spec.choices[1].label).toBe("Approve for this session");
  });

  it("plan review : toutes les options plan_* dans l'ordre reçu", () => {
    const spec = describeKimiPermission({
      toolCall: { title: "ExitPlanMode", content: [] },
      options: [
        { optionId: "plan_opt_0", name: "A", kind: "allow_once" },
        { optionId: "plan_opt_1", name: "B", kind: "allow_once" },
        { optionId: "plan_revise", name: "Revise", kind: "reject_once" },
        { optionId: "plan_reject_and_exit", name: "Reject and Exit", kind: "reject_once" },
      ],
    });
    expect(spec.choices.map((c) => c.optionId)).toEqual([
      "plan_opt_0", "plan_opt_1", "plan_revise", "plan_reject_and_exit",
    ]);
  });

  it("AskUserQuestion : user_input à UNE question, values opaques, Skip exclu", () => {
    const spec = describeKimiPermission({
      toolCall: { title: "AskUserQuestion", content: [{ type: "content", content: { type: "text", text: "Quelle couleur ?" } }] },
      options: [
        { optionId: "q0_opt_0", name: "Rouge", kind: "allow_once" },
        { optionId: "q0_opt_1", name: "Vert", kind: "allow_once" },
        { optionId: "q0_skip", name: "Skip", kind: "reject_once" },
      ],
    });
    expect(spec.interactionType).toBe("user_input");
    expect(spec.fields).toHaveLength(1);
    expect(spec.fields[0].question).toBe("Quelle couleur ?");
    expect(spec.fields[0].options).toEqual([
      { label: "Rouge", value: "q0_opt_0" },
      { label: "Vert", value: "q0_opt_1" },
    ]);
  });

  it("sans options : null (refus sûr)", () => {
    expect(describeKimiPermission({ toolCall: { title: "Bash" }, options: [] })).toBeNull();
  });

  it("outcome : aller-retour optionId EXACT ; inconnu/vide/timeout ⇒ cancelled", () => {
    expect(kimiPermissionOutcome(ordinary, { optionId: "reject" }))
      .toEqual({ outcome: { outcome: "selected", optionId: "reject" } });
    for (const answer of [null, { optionId: "hack" }, { answers: {} }, { answers: { q0: "pas-un-id" } }, { autre: true }]) {
      expect(kimiPermissionOutcome(ordinary, answer).outcome.outcome).toBe("cancelled");
    }
  });

  it("outcome : réponse user_input {answers} porte l'id opaque", () => {
    const params = {
      options: [
        { optionId: "q0_opt_0", name: "Rouge", kind: "allow_once" },
        { optionId: "q0_skip", name: "Skip", kind: "reject_once" },
      ],
    };
    expect(kimiPermissionOutcome(params, { answers: { q0: "q0_opt_0" } }))
      .toEqual({ outcome: { outcome: "selected", optionId: "q0_opt_0" } });
  });

  it("outcome legacy {allow} : mappé sur les ids canoniques SEULEMENT s'ils existent", () => {
    expect(kimiPermissionOutcome(ordinary, { allow: true, scope: "session" }).outcome.optionId).toBe("approve_always");
    expect(kimiPermissionOutcome(ordinary, { allow: false }).outcome.optionId).toBe("reject");
    const plan = { options: [{ optionId: "plan_approve", kind: "allow_once" }] };
    expect(kimiPermissionOutcome(plan, { allow: true }).outcome.outcome).toBe("cancelled");
  });
});

describe("mappings modes/thinking verrouillés", () => {
  it("modes Atelier → Kimi", () => {
    expect(mapKimiPermissionMode("default")).toBe("default");
    expect(mapKimiPermissionMode("plan")).toBe("plan");
    expect(mapKimiPermissionMode("acceptEdits")).toBe("auto");
    expect(mapKimiPermissionMode("bypassPermissions")).toBe("yolo");
    expect(mapKimiPermissionMode("exotique")).toBeNull();
  });

  it("thinking off/on seulement — jamais low/medium/high inventés", () => {
    expect(mapKimiThinking("")).toBeNull();
    expect(mapKimiThinking("on")).toBe("on");
    expect(mapKimiThinking("off")).toBe("off");
    expect(mapKimiThinking("none")).toBe("off");
    expect(() => mapKimiThinking("high")).toThrow(/off\/on/);
  });
});

describe("inputs et images (mêmes limites que Rust)", () => {
  it("texte seul et resource_link pour skills/mentions", () => {
    expect(buildKimiPromptBlocks("salut", undefined)).toEqual([{ type: "text", text: "salut" }]);
    const blocks = buildKimiPromptBlocks("ignoré", [
      { type: "text", text: "prompt complet" },
      { type: "skill", name: "revue", path: "/tmp/skills/revue.md" },
    ]);
    expect(blocks[0]).toEqual({ type: "text", text: "prompt complet" });
    expect(blocks[1]).toEqual({ type: "resource_link", uri: "file:///tmp/skills/revue.md", name: "revue" });
  });

  it("input inconnu (blob…) : échec FORT avant le prompt", () => {
    expect(() => buildKimiPromptBlocks("p", [{ type: "blob", data: "x" }])).toThrow(/blob/);
  });

  it("image : encodée base64 + MIME ; extension/taille/lisibilité refusées avec le NOM", () => {
    const png = join(tmp, "mini.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    const block = kimiImageBlock(png);
    expect(block.mimeType).toBe("image/png");
    expect(block.data.length).toBeGreaterThan(0);

    const weird = join(tmp, "donnees.tiff");
    writeFileSync(weird, "x");
    expect(() => kimiImageBlock(weird)).toThrow(/donnees\.tiff/);
    expect(() => kimiImageBlock("/nulle/part/x.png")).toThrow(/\/nulle\/part\/x\.png/);

    const big = join(tmp, "grosse.png");
    writeFileSync(big, Buffer.alloc(KIMI_IMAGE_MAX_BYTES + 1));
    expect(() => kimiImageBlock(big)).toThrow(/trop volumineuse/);
  });
});

describe("replayToHistory (import session/load)", () => {
  it("coalesce user/thinking/text et mappe les tools", () => {
    const events = replayToHistory([
      { sessionUpdate: "user_message_chunk", content: { type: "text", text: "question " } },
      { sessionUpdate: "user_message_chunk", content: { type: "text", text: "historique" } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "réponse" } },
      { sessionUpdate: "tool_call", toolCallId: "1:h", title: "Read", kind: "read" },
      { sessionUpdate: "tool_call_update", toolCallId: "1:h", status: "completed" },
    ]);
    expect(events.map((e) => e.kind)).toEqual(["user", "text", "tool_update", "tool_update"]);
    expect(events[0].text).toBe("question historique");
  });

  it("nettoie les blocs injectés et supprime les messages réduits à un rappel système", () => {
    const events = replayToHistory([
      { sessionUpdate: "user_message_chunk", content: { type: "text",
        text: "Ca veut dire quoi<atelier-zotero-passages>\noutil pdf\n</atelier-zotero-passages>\n\n<atelier-file-scope>\npolitique interne\n</atelier-file-scope>" } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "réponse" } },
      { sessionUpdate: "user_message_chunk", content: { type: "text",
        text: "<system-reminder>rappel outillage</system-reminder>" } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "suite" } },
    ]);
    const users = events.filter((e) => e.kind === "user").map((e) => e.text);
    expect(users).toEqual(["Ca veut dire quoi"]);
    expect(events.filter((e) => e.kind === "text")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Intégration : le VRAI module contre le fixture partagé.
describe("run() contre fake_kimi_acp.mjs (fixture partagé Rust/Node)", () => {
  it("tour nominal : thinking + texte + done sans usage, sessionId retourné", async () => {
    const { result, events, text } = await turn({});
    expect(result.sessionId).toMatch(/^session_fake_/);
    expect(events.some((e) => e.kind === "thinking_delta")).toBe(true);
    expect(text).toContain("réponse");
    const done = events.find((e) => e.kind === "done");
    expect(done.ok).toBe(true);
    expect("usage" in done).toBe(false);
  });

  it("tour muet (end_turn sans aucun chunk) : erreur actionnable + done ok:false", async () => {
    const { events } = await turn({ prompt: "[silent] question" });
    const err = events.find((e) => e.kind === "error");
    expect(err?.message).toContain("compact");
    const done = events.find((e) => e.kind === "done");
    expect(done.ok).toBe(false);
  });

  it("alignement model/thinking/mode via session/set_config_option", async () => {
    const { text } = await turn({ model: "fake-k3", effort: "off", permissionMode: "acceptEdits" });
    expect(text).toContain("model=fake-k3,thinking=off,mode=auto");
  });

  it("modèle inconnu : le tour s'arrête AVANT le prompt, choix listés", async () => {
    await expect(turn({ model: "gpt-4" })).rejects.toThrow(/gpt-4.*fake-k3/s);
  });

  it("thinking on refusé pour un modèle sans thinking ; off = no-op accepté", async () => {
    const { result } = await turn({ model: "fake-k3-mini" });
    await expect(turn({ sessionId: result.sessionId, effort: "on" })).rejects.toThrow(/thinking/);
    const ok = await turn({ sessionId: result.sessionId, effort: "off" });
    expect(ok.result.sessionId).toBe(result.sessionId);
  });

  it("permission relayée : spec avec choices, optionId opaque aller-retour", async () => {
    const specs = [];
    const { text } = await turn({
      prompt: "[permission]",
      onInteraction: async (spec) => {
        specs.push(spec);
        return { optionId: "approve_always" };
      },
    });
    expect(text).toContain("perm:selected:approve_always");
    expect(specs).toHaveLength(1);
    expect(specs[0].choices.map((c) => c.optionId)).toEqual(["approve_once", "approve_always", "reject"]);
  });

  it("sans UI ou optionId inconnu : cancelled — JAMAIS d'auto-approbation", async () => {
    const none = await turn({ prompt: "[permission]" });
    expect(none.text).toContain("perm:cancelled");
    const bad = await turn({ prompt: "[permission]", onInteraction: async () => ({ optionId: "je-n-existe-pas" }) });
    expect(bad.text).toContain("perm:cancelled");
  });

  it("plan review + question : ids opaques exacts", async () => {
    const { text } = await turn({
      prompt: "[plan-review] [question]",
      onInteraction: async (spec) =>
        spec.interactionType === "user_input"
          ? { answers: { q0: "q0_opt_2" } }
          : { optionId: "plan_opt_1" },
    });
    expect(text).toContain("perm:selected:plan_opt_1");
    expect(text).toContain("perm:selected:q0_opt_2");
  });

  it("authRequired : erreur actionnable kimi login, aucun repli", async () => {
    process.env.FAKE_KIMI_MODE = "auth_required";
    await expect(turn({})).rejects.toThrow(/kimi login/);
  });

  it("session -32602 : erreur actionnable, la NOUVELLE session attend le tour suivant", async () => {
    await expect(turn({ sessionId: "session_disparue" })).rejects.toThrow(/n'existe plus/);
    const retry = await turn({ sessionId: "session_disparue" });
    expect(retry.result.sessionId).toMatch(/^session_fake_/);
  });

  it("resume : session persistée rouverte SANS replay (session/resume)", async () => {
    // session_known_b n'a jamais été ouverte dans ce process : le provider
    // passe par session/resume — le fixture la connaît et ne rejoue RIEN
    // (seul session/load rejoue, contrat vérifié).
    const out = await turn({ sessionId: "session_known_b", cwd: "/tmp/fake-kimi/proj-b" });
    expect(out.result.sessionId).toBe("session_known_b");
    expect(out.events.some((e) => e.kind === "user")).toBe(false);
    // reuse direct au tour suivant (déjà ouverte, pas de nouveau resume)
    const again = await turn({ sessionId: "session_known_b", cwd: "/tmp/fake-kimi/proj-b" });
    expect(again.result.sessionId).toBe("session_known_b");
  });

  it("image : envoyée au wire, base64 jamais dans les events", async () => {
    const png = join(tmp, "shot.png");
    const bytes = Buffer.from("fake-png-bytes");
    writeFileSync(png, bytes);
    const { events, text } = await turn({
      prompt: "regarde [image]",
      inputs: [
        { type: "text", text: "regarde [image]" },
        { type: "local_image", path: png },
      ],
    });
    const b64 = bytes.toString("base64");
    expect(text).toContain(`img:image/png:${b64.length}`);
    for (const ev of events) {
      expect(JSON.stringify(ev)).not.toContain(b64);
    }
  });

  it("interrupt : session/cancel termine le tour en done ok", async () => {
    const pending = turn({ threadId: "t-cancel", prompt: "[cancel]" });
    await new Promise((r) => setTimeout(r, 250));
    await interrupt("t-cancel");
    const { events } = await pending;
    const done = events.find((e) => e.kind === "done");
    expect(done.ok).toBe(true);
  });

  it("listSessions natif : mapping, titre null → préfixe, date invalide tolérée, filtre cwd", async () => {
    const all = await listSessions("");
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: "session_known_a", title: "Session A", projectRoot: "/tmp/fake-kimi/proj-a" });
    expect(all[0].mtime).toBeGreaterThan(0);
    expect(all[1]).toMatchObject({ id: "session_known_b", title: "session_known_b", mtime: 0 });
    const filtered = await listSessions("/tmp/fake-kimi/proj-b");
    expect(filtered.map((s) => s.id)).toEqual(["session_known_b"]);
  });

  it("history : load rejoue UNE fois, la session devient réutilisable sans doublon", async () => {
    const events = await history("session_known_a", "/tmp/fake-kimi/proj-a");
    expect(events.map((e) => e.kind)).toEqual(["user", "text", "tool_update", "tool_update"]);
    expect(events[0].text).toBe("question historique");
    // second import : déjà ouverte ⇒ journal Atelier, pas de doublon
    expect(await history("session_known_a", "/tmp/fake-kimi/proj-a")).toEqual([]);
    // le prompt suivant réutilise la MÊME session sans re-load
    const { result, events: turnEvents } = await turn({ sessionId: "session_known_a" });
    expect(result.sessionId).toBe("session_known_a");
    expect(turnEvents.some((e) => e.kind === "user")).toBe(false);
  });

  it("history : session supprimée entre list et load ⇒ []", async () => {
    expect(await history("session_effacee", "/tmp/fake-kimi/proj-a")).toEqual([]);
  });
});
