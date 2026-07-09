import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import {
  acpMethodNotFoundResponse,
  buildAcpPromptText,
  handleIncoming,
  makeTurnEmitter,
  mapPromptError,
  mapPromptResult,
  mapSessionUpdate,
  openGrokSession,
  parseAcpLines,
  selectionFromOptions,
  stopServer,
} from "./grok.mjs";

function loadFixture(name) {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

describe("grok ACP — framing NDJSON", () => {
  it("découpe des lignes complètes et conserve le reliquat", () => {
    const { messages, rest } = parseAcpLines('{"a":1}\n{"b":2}\n{"c":3');
    expect(messages).toEqual([{ a: 1 }, { b: 2 }]);
    expect(rest).toBe('{"c":3');
  });

  it("recolle un message JSON-RPC coupé en chunks arbitraires", () => {
    const first = parseAcpLines('{"jsonrpc":"2.0","method":"session/up');
    expect(first.messages).toEqual([]);
    const second = parseAcpLines('date","params":{"a":1}}\n', first.rest);
    expect(second.messages).toEqual([{ jsonrpc: "2.0", method: "session/update", params: { a: 1 } }]);
    expect(second.rest).toBe("");
  });

  it("coupe en trois morceaux minuscules (1-2 caractères) sans perdre de message", () => {
    const raw = '{"x":1}\n{"y":2}\n';
    let carry = "";
    const all = [];
    for (let i = 0; i < raw.length; i += 2) {
      const { messages, rest } = parseAcpLines(raw.slice(i, i + 2), carry);
      carry = rest;
      all.push(...messages);
    }
    expect(all).toEqual([{ x: 1 }, { y: 2 }]);
    expect(carry).toBe("");
  });

  it("ignore une ligne JSON corrompue sans planter", () => {
    const { messages, rest } = parseAcpLines('{"ok":true}\nnot json at all\n{"ok":2}\n');
    expect(messages).toEqual([{ ok: true }, { ok: 2 }]);
    expect(rest).toBe("");
  });
});

describe("grok ACP — mapping sessionUpdate -> kinds Atelier (fixture réelle run3.log)", () => {
  const fixture = loadFixture("grok-acp-turn.jsonl");
  const updates = fixture.map((m) => m.params.update);

  it("agent_thought_chunk -> thinking_delta (accumulation testée sur la fixture)", () => {
    const chunks = updates.filter((u) => u.sessionUpdate === "agent_thought_chunk");
    expect(chunks.length).toBeGreaterThan(0);
    const events = chunks.flatMap(mapSessionUpdate);
    expect(events.every((e) => e.kind === "thinking_delta")).toBe(true);
    expect(events.map((e) => e.text).join("")).toBe("The user wants me");
  });

  it("tool_call -> tool_update {id,name,status:running}", () => {
    const update = updates.find((u) => u.sessionUpdate === "tool_call");
    const [ev] = mapSessionUpdate(update);
    expect(ev).toMatchObject({
      kind: "tool_update",
      id: "call-1fdd61c5-945e-4832-b501-76767eabc0af-0",
      name: "write",
      status: "running",
    });
  });

  it("tool_call_update avec diff -> tool_update (statut/output) + edit {files}", () => {
    const update = updates.find((u) => u.sessionUpdate === "tool_call_update");
    const events = mapSessionUpdate(update);
    expect(events).toHaveLength(2);
    const [toolEv, editEv] = events;
    expect(toolEv).toMatchObject({ kind: "tool_update", id: update.toolCallId, status: "completed" });
    expect(toolEv.output).toContain("DONE");
    expect(editEv).toEqual({
      kind: "edit",
      files: ["/private/tmp/claude-501/-Users-tofunori-Documents-atelier-studio/b4e47354-4bee-448c-90db-684db229c02d/scratchpad/grok-stdio-probe/result.txt"],
    });
  });

  it("une seconde tool_call_update sans _meta ne dégrade pas la carte déjà connue (ctx.toolMeta)", () => {
    // Vérifié en E2E réel (2026-07-08) : le CLI peut ré-émettre un
    // tool_call_update pour le même toolCallId sans _meta["x.ai/tool"] ni
    // rawInput — juste une confirmation de statut/diff identique.
    const first = updates.find((u) => u.sessionUpdate === "tool_call_update");
    const sparse = { sessionUpdate: "tool_call_update", toolCallId: first.toolCallId, content: first.content };
    const ctx = { toolMeta: new Map(), seenEdits: new Set() };
    const [firstEv, firstEdit] = mapSessionUpdate(first, ctx);
    expect(firstEv.name).toBe("write");
    expect(firstEdit.kind).toBe("edit");
    const [secondEv] = mapSessionUpdate(sparse, ctx);
    expect(secondEv.name).toBe("write"); // pas "tool" générique
    expect(secondEv.input).toEqual(first.rawInput); // repris du cache, pas null
    // le diff identique n'est pas ré-émis en edit une seconde fois
    const secondEvents = mapSessionUpdate(sparse, ctx);
    expect(secondEvents.filter((e) => e.kind === "edit")).toHaveLength(0);
  });

  it("sans ctx (mapping pur, un seul event) : une update sans _meta retombe sur 'tool' générique", () => {
    const first = updates.find((u) => u.sessionUpdate === "tool_call_update");
    const sparse = { sessionUpdate: "tool_call_update", toolCallId: first.toolCallId, content: first.content };
    const [ev] = mapSessionUpdate(sparse);
    expect(ev.name).toBe("tool");
    expect(ev.input).toBeNull();
  });

  it("hook_execution -> toujours ignoré, échecs compris (hooks cmux/muxy/orca hors hôte = bruit permanent)", () => {
    const hooks = updates.filter((u) => u.sessionUpdate === "hook_execution");
    expect(hooks.length).toBeGreaterThan(0);
    for (const h of hooks) expect(mapSessionUpdate(h)).toEqual([]);
    const failing = {
      sessionUpdate: "hook_execution",
      event_name: "user_prompt_submit",
      runs: [{ name: "global/orca-status:user_prompt_submit[0]", status: { status: "failed", elapsed_ms: 3 } }],
    };
    expect(mapSessionUpdate(failing)).toEqual([]);
  });

  it("pending_interaction -> tool informatif (une ligne)", () => {
    const update = updates.find((u) => u.sessionUpdate === "pending_interaction");
    expect(mapSessionUpdate(update)).toEqual([{ kind: "tool", name: "permission (permission)" }]);
  });

  it("interaction_resolved -> ignoré (table de la spec)", () => {
    const update = updates.find((u) => u.sessionUpdate === "interaction_resolved");
    expect(mapSessionUpdate(update)).toEqual([]);
  });

  it("event/notification inconnu -> ignoré silencieusement, jamais de throw", () => {
    const update = updates.find((u) => u.sessionUpdate === "some_future_event_type");
    expect(update).toBeTruthy();
    expect(() => mapSessionUpdate(update)).not.toThrow();
    expect(mapSessionUpdate(update)).toEqual([]);
  });

  it("update vide/absent -> ignoré silencieusement", () => {
    expect(mapSessionUpdate(undefined)).toEqual([]);
    expect(mapSessionUpdate({})).toEqual([]);
  });

  it("plan -> todos (best-effort, non observé en direct dans les sondes)", () => {
    const update = {
      sessionUpdate: "plan",
      entries: [
        { content: "Lire le fichier", status: "completed" },
        { content: "Écrire le correctif", status: "in_progress" },
      ],
    };
    expect(mapSessionUpdate(update)).toEqual([{
      kind: "todos",
      items: [
        { text: "Lire le fichier", completed: true },
        { text: "Écrire le correctif", completed: false },
      ],
    }]);
  });

  it("plan sans entries -> ignoré", () => {
    expect(mapSessionUpdate({ sessionUpdate: "plan" })).toEqual([]);
  });
});

describe("grok ACP — fin de tour (réponse session/prompt)", () => {
  it("stopReason cancelled -> done ok:true avec usage réel (fixture réelle run4.log)", () => {
    const [{ result }] = loadFixture("grok-acp-cancel.jsonl").filter((m) => m.id === 10);
    const done = mapPromptResult(result);
    expect(done).toEqual({
      kind: "done",
      ok: true,
      result: "",
      usage: { context: 29160, output: 263, cost: null, turns: null, window: null },
    });
  });

  it("stopReason end_turn -> done ok:true", () => {
    const done = mapPromptResult({
      stopReason: "end_turn",
      _meta: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
    });
    expect(done).toEqual({ kind: "done", ok: true, result: "", usage: { context: 100, output: 20, cost: null, turns: null, window: null } });
  });

  it("usage.window = 500k pour grok-4.5 (docs xAI)", () => {
    const done = mapPromptResult({
      stopReason: "end_turn",
      _meta: { totalTokens: 168000, outputTokens: 400 },
    }, { model: "grok-4.5" });
    expect(done.usage).toEqual({ context: 168000, output: 400, cost: null, turns: null, window: 500_000 });
  });

  it("stopReason inconnu/absent -> done ok:false", () => {
    expect(mapPromptResult({ stopReason: "refusal", _meta: {} }).ok).toBe(false);
    expect(mapPromptResult(null).ok).toBe(false);
  });

  it("erreur JSON-RPC -> event error", () => {
    expect(mapPromptError(new Error("boom"))).toEqual({ kind: "error", message: "boom" });
    expect(mapPromptError("plain string")).toEqual({ kind: "error", message: "plain string" });
  });
});

describe("grok ACP — requête serveur inattendue", () => {
  it("acpMethodNotFoundResponse construit une erreur JSON-RPC standard", () => {
    expect(acpMethodNotFoundResponse(7, "fs/read_text_file")).toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32601, message: "Method not found: fs/read_text_file" },
    });
  });

  it("handleIncoming répond method-not-found à toute requête entrante (jamais de silence)", () => {
    const writes = [];
    const fakeProc = { stdin: { write: (s) => writes.push(s) } };
    handleIncoming(fakeProc, { jsonrpc: "2.0", id: 3, method: "fs/read_text_file", params: { path: "/x" } });
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual(acpMethodNotFoundResponse(3, "fs/read_text_file"));
  });

  it("handleIncoming ignore silencieusement une notification hors-tour (_x.ai/mcp/*)", () => {
    const writes = [];
    const fakeProc = { stdin: { write: (s) => writes.push(s) } };
    expect(() => handleIncoming(fakeProc, {
      jsonrpc: "2.0",
      method: "_x.ai/mcp/servers_updated",
      params: { mcpServers: [{ name: "x", env: [{ name: "SECRET", value: "should-never-be-read" }] }] },
    })).not.toThrow();
    expect(writes).toHaveLength(0);
  });

  it("handleIncoming ignore une notification session/update sans handler enregistré (tour déjà fini / replay session/load)", () => {
    const writes = [];
    const fakeProc = { stdin: { write: (s) => writes.push(s) } };
    expect(() => handleIncoming(fakeProc, {
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: "no-handler-for-this-one", update: { sessionUpdate: "agent_message_chunk", content: { text: "x" } } },
    })).not.toThrow();
    expect(writes).toHaveLength(0);
  });
});

describe("grok ACP — sélection modèle/effort par session (session/set_mode)", () => {
  it("extrait la sélection courante depuis les options fusionnées model+mode", () => {
    const options = [
      { id: "grok-4.5", category: "model", selected: true },
      { id: "grok-composer-2.5-fast", category: "model", selected: false },
      { id: "high", category: "mode", selected: false },
      { id: "medium", category: "mode", selected: false },
      { id: "low", category: "mode", selected: true },
    ];
    expect(selectionFromOptions(options)).toEqual({ model: "grok-4.5", effort: "low" });
  });

  it("options vides/absentes -> sélection vide", () => {
    expect(selectionFromOptions(undefined)).toEqual({});
    expect(selectionFromOptions([])).toEqual({});
  });
});

describe("grok ACP — makeTurnEmitter (adjacence bloc live -> bloc final)", () => {
  // Le reducer du front (App.tsx) ne remplace la bulle streaming/thinking_live
  // par son bloc final que si elle est le DERNIER event : tout event intercalé
  // laisse une bulle orpheline (caret qui clignote) + un texte dupliqué.
  it("un event tool après des deltas flush d'abord le text final (scénario hooks fin de tour, observé 2026-07-08)", () => {
    const out = [];
    const { emit, flush } = makeTurnEmitter((ev) => out.push(ev));
    emit({ kind: "thinking_delta", text: "réflé" });
    emit({ kind: "thinking_delta", text: "chit" });
    emit({ kind: "delta", text: "Allo" });
    emit({ kind: "delta", text: " — prêt." });
    emit({ kind: "tool", name: "hook stop: 1 échec" });
    flush();
    expect(out.map((e) => e.kind)).toEqual([
      "thinking_delta", "thinking_delta",
      "thinking",              // flushé AVANT le premier delta (transition)
      "delta", "delta",
      "text",                  // flushé AVANT le tool — la bulle streaming est encore dernière
      "tool",
    ]);
    expect(out.find((e) => e.kind === "thinking").text).toBe("réfléchit");
    expect(out.find((e) => e.kind === "text").text).toBe("Allo — prêt.");
  });

  it("fin de tour sans event intercalé : flush() clôt le buffer actif, jamais deux fois", () => {
    const out = [];
    const { emit, flush } = makeTurnEmitter((ev) => out.push(ev));
    emit({ kind: "delta", text: "Salut" });
    flush();
    flush(); // idempotent
    expect(out.map((e) => e.kind)).toEqual(["delta", "text"]);
  });

  it("retour au thinking après du texte : le text est flushé à la transition", () => {
    const out = [];
    const { emit, flush } = makeTurnEmitter((ev) => out.push(ev));
    emit({ kind: "delta", text: "Partie 1" });
    emit({ kind: "thinking_delta", text: "hmm" });
    emit({ kind: "delta", text: "Partie 2" });
    flush();
    expect(out.map((e) => e.kind)).toEqual([
      "delta", "text", "thinking_delta", "thinking", "delta", "text",
    ]);
  });

  it("tool_update entre deltas et fin : jamais d'event entre les deltas et leur bloc final", () => {
    const out = [];
    const { emit, flush } = makeTurnEmitter((ev) => out.push(ev));
    emit({ kind: "delta", text: "je vais créer le fichier" });
    emit({ kind: "tool_update", id: "c1", name: "write", status: "running" });
    emit({ kind: "delta", text: "fait." });
    flush();
    const kinds = out.map((e) => e.kind);
    expect(kinds).toEqual(["delta", "text", "tool_update", "delta", "text"]);
    // invariant : chaque "text" suit immédiatement le dernier delta de son bloc
    kinds.forEach((k, i) => {
      if (k === "text") expect(kinds[i - 1]).toBe("delta");
    });
  });
});

describe("grok ACP — contrat frontend tool_update.output (crash 2026-07-08)", () => {
  // ws.ts déclare output: string (requis) et Chat.tsx fait event.output.length
  // sans garde — un tool_update sans output a fait crasher toute l'UI.
  it("tool_call initial -> output toujours string (jamais undefined)", () => {
    const fixture = loadFixture("grok-acp-turn.jsonl");
    const update = fixture.map((m) => m.params.update).find((u) => u.sessionUpdate === "tool_call");
    const [ev] = mapSessionUpdate(update);
    expect(typeof ev.output).toBe("string");
  });
  it("tool_call_update sans contenu -> output string vide", () => {
    const [ev] = mapSessionUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c1" });
    expect(typeof ev.output).toBe("string");
  });
});

describe("grok ACP — pièces jointes (buildAcpPromptText)", () => {
  it("sans pièce jointe : prompt inchangé", () => {
    expect(buildAcpPromptText("salut", {})).toBe("salut");
    expect(buildAcpPromptText("salut")).toBe("salut");
  });
  it("imagePath + attachments référencés par chemin, dédoublonnés", () => {
    const out = buildAcpPromptText("regarde ça", {
      imagePath: "/tmp/a.png",
      attachments: [{ path: "/tmp/a.png" }, { path: "/tmp/doc.pdf" }, { imagePath: "/tmp/b.jpg" }],
    });
    expect(out).toContain("regarde ça");
    expect(out).toContain("/tmp/a.png");
    expect(out).toContain("/tmp/doc.pdf");
    expect(out).toContain("/tmp/b.jpg");
    expect(out.match(/\/tmp\/a\.png/g)).toHaveLength(1);
  });
});

describe("grok ACP — openGrokSession (repli session/load -> session/new sur thread déplacé)", () => {
  // vérifié en direct sans appel modèle (scratchpad moveThread-probe/
  // probe_load_cross_cwd.py) : session/load avec un cwd différent de l'origine
  // échoue (FS_NOT_FOUND) sans tuer le process ACP — d'où le repli ci-dessous.
  beforeEach(() => stopServer()); // reset loadedGrokSessions/grokSessionSelection entre tests

  function fakeSrv(handlers, { alive = true } = {}) {
    return {
      request: (method, params) => handlers[method](params),
      proc: { exitCode: alive ? null : 1, killed: !alive },
    };
  }

  it("session/load réussit : pas de repli, même sessionId", async () => {
    const srv = fakeSrv({
      "session/load": async () => ({ _meta: {} }),
      "session/new": async () => { throw new Error("ne doit pas être appelé"); },
    });
    const { sessionId } = await openGrokSession(srv, { sessionId: "sid-ok", cwd: "/proj-a" });
    expect(sessionId).toBe("sid-ok");
  });

  it("session/load échoue, process ACP sain : repli session/new (nouveau sessionId)", async () => {
    const srv = fakeSrv({
      "session/load": async () => { throw new Error("Path not found."); },
      "session/new": async () => ({ sessionId: "sid-new", _meta: {} }),
    });
    const { sessionId } = await openGrokSession(srv, { sessionId: "sid-moved", cwd: "/proj-b" });
    expect(sessionId).toBe("sid-new");
  });

  it("session/load échoue, process ACP mort : pas de repli, l'erreur remonte", async () => {
    const srv = fakeSrv(
      {
        "session/load": async () => { throw new Error("grok agent stdio a quitté"); },
        "session/new": async () => { throw new Error("ne doit pas être appelé"); },
      },
      { alive: false },
    );
    await expect(openGrokSession(srv, { sessionId: "sid-dead", cwd: "/proj-c" })).rejects.toThrow();
  });

  it("session déjà chargée dans ce process : pas de re-load", async () => {
    const calls = [];
    const srv = fakeSrv({
      "session/load": async () => { calls.push("load"); return { _meta: {} }; },
      "session/new": async () => { calls.push("new"); return { sessionId: "x", _meta: {} }; },
    });
    await openGrokSession(srv, { sessionId: "sid-cached", cwd: "/proj-a" });
    calls.length = 0;
    const { sessionId } = await openGrokSession(srv, { sessionId: "sid-cached", cwd: "/proj-a" });
    expect(sessionId).toBe("sid-cached");
    expect(calls).toEqual([]);
  });
});
