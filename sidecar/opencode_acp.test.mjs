// Tests du chemin ACP opencode (plan 045) — mapping session/update → kinds
// Atelier, fusion d'usage, adjacence de l'émetteur, réponses automatiques aux
// requêtes serveur→client. Formes wire = sonde réelle du 2026-07-16
// (opencode 1.18.3), voir plans/045-acp-client-rust.md.
import { describe, expect, it } from "vitest";
import { makeTurnEmitter, parseAcpLines } from "./providers/acp_common.mjs";
import {
  handleOpencodeIncoming,
  mapOpencodePromptResult,
  mapOpencodeSessionUpdate,
} from "./providers/opencode.mjs";

const freshCtx = () => ({ toolMeta: new Map(), seenEdits: new Set(), lastUsageUpdate: null });

describe("mapOpencodeSessionUpdate", () => {
  it("agent_thought_chunk -> thinking_delta (forme wire sonde)", () => {
    const evs = mapOpencodeSessionUpdate({
      sessionUpdate: "agent_thought_chunk",
      messageId: "msg_f6c3e52ef001NvAQVFEJa7Oxg6",
      content: { type: "text", text: "The user wants me" },
    }, freshCtx());
    expect(evs).toEqual([{ kind: "thinking_delta", text: "The user wants me" }]);
  });

  it("agent_message_chunk -> delta", () => {
    const evs = mapOpencodeSessionUpdate({
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_1",
      content: { type: "text", text: "ok" },
    }, freshCtx());
    expect(evs).toEqual([{ kind: "delta", text: "ok" }]);
  });

  it("tool_call sans contenu -> output string vide (contrat front)", () => {
    const evs = mapOpencodeSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "call_1",
      title: "bash",
      kind: "execute",
    }, freshCtx());
    expect(evs).toHaveLength(1);
    const ev = evs[0];
    expect(ev.kind).toBe("tool_update");
    expect(ev.name).toBe("bash");
    expect(ev.status).toBe("running");
    expect(ev.source).toBe("opencode");
    expect(typeof ev.output).toBe("string"); // REQUIS : jamais undefined
    expect(ev.output).toBe("");
  });

  it("tool_call_update avec diff -> tool_update completed + edit, dédupliqué", () => {
    const ctx = freshCtx();
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_3",
      status: "completed",
      content: [{ type: "diff", path: "/a.txt", oldText: "", newText: "x" }],
    };
    const evs = mapOpencodeSessionUpdate(update, ctx);
    expect(evs).toHaveLength(2);
    expect(evs[0].kind).toBe("tool_update");
    expect(evs[0].status).toBe("completed");
    expect(evs[0].output).toBe("# /a.txt\nx");
    expect(evs[1]).toEqual({ kind: "edit", files: ["/a.txt"] });
    // même update rejouée avec le même ctx : plus d'edit (dédup seenEdits)
    const evs2 = mapOpencodeSessionUpdate(update, ctx);
    expect(evs2).toHaveLength(1);
    expect(evs2[0].kind).toBe("tool_update");
  });

  it("tool_call_update de suivi sans title reprend le cache (nom/input)", () => {
    const ctx = freshCtx();
    mapOpencodeSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "call_2",
      title: "write",
      kind: "edit",
      rawInput: { path: "/tmp/a" },
    }, ctx);
    const evs = mapOpencodeSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_2",
      status: "completed",
    }, ctx);
    expect(evs[0].name).toBe("write");
    expect(evs[0].input).toEqual({ path: "/tmp/a" });
    expect(evs[0].status).toBe("completed");
    expect(typeof evs[0].output).toBe("string");
  });

  it("statuts : failed/completed/running + heuristique contenu", () => {
    const cases = [
      [{ status: "failed" }, "failed"],
      [{ status: "completed" }, "completed"],
      [{ status: "in_progress" }, "running"],
      [{ content: [{ type: "text", text: "fini" }] }, "completed"], // pas de statut mais contenu
      [{}, "running"],
    ];
    for (const [extra, want] of cases) {
      const evs = mapOpencodeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "c",
        ...extra,
      }, freshCtx());
      expect(evs[0].status).toBe(want);
    }
  });

  it("usage_update absorbé dans le ctx, jamais émis (forme wire sonde)", () => {
    const ctx = freshCtx();
    const evs = mapOpencodeSessionUpdate({
      sessionUpdate: "usage_update",
      used: 80401,
      size: 200000,
      cost: { amount: 0, currency: "USD" },
    }, ctx);
    expect(evs).toEqual([]);
    expect(ctx.lastUsageUpdate.size).toBe(200000);
  });

  it("updates de bruit ignorées (available_commands_update, user_message_chunk, inconnues)", () => {
    for (const k of ["available_commands_update", "user_message_chunk", "current_mode_update", "inconnu_futur"]) {
      expect(mapOpencodeSessionUpdate({ sessionUpdate: k }, freshCtx())).toEqual([]);
    }
  });
});

describe("mapOpencodePromptResult", () => {
  it("fusionne usage inline (tokens) + usage_update (window/cost) — formes sonde", () => {
    const ctx = freshCtx();
    mapOpencodeSessionUpdate({
      sessionUpdate: "usage_update",
      used: 80401,
      size: 200000,
      cost: { amount: 0, currency: "USD" },
    }, ctx);
    const done = mapOpencodePromptResult({
      stopReason: "end_turn",
      usage: { inputTokens: 78609, outputTokens: 4, totalTokens: 80437, thoughtTokens: 32, cachedReadTokens: 1792 },
      _meta: {},
    }, ctx);
    expect(done.kind).toBe("done");
    expect(done.ok).toBe(true);
    expect(done.usage.context).toBe(80437);
    expect(done.usage.output).toBe(4);
    expect(done.usage.window).toBe(200000);
    expect(done.usage.cost).toBe(0);
  });

  it("cancelled = succès, refusal = échec, défauts sûrs sans usage", () => {
    expect(mapOpencodePromptResult({ stopReason: "cancelled" }).ok).toBe(true);
    const refusal = mapOpencodePromptResult({ stopReason: "refusal" });
    expect(refusal.ok).toBe(false);
    expect(refusal.usage.context).toBe(0);
    expect(refusal.usage.window).toBe(null);
  });
});

describe("makeTurnEmitter (adjacence, partagé via acp_common)", () => {
  it("flush du buffer actif avant tout event intercalé", () => {
    const kinds = [];
    const { emit, flush } = makeTurnEmitter((ev) => kinds.push(ev.kind));
    emit({ kind: "thinking_delta", text: "a" });
    emit({ kind: "delta", text: "b" }); // -> flush du thinking d'abord
    emit({ kind: "tool_update", id: "t", name: "bash", status: "running", output: "", input: null, source: "opencode" });
    flush();
    expect(kinds).toEqual(["thinking_delta", "thinking", "delta", "text", "tool_update"]);
  });
});

describe("handleOpencodeIncoming (requêtes serveur→client)", () => {
  const fakeProc = () => {
    const writes = [];
    return { writes, stdin: { write: (s) => writes.push(JSON.parse(s)) } };
  };

  it("session/request_permission -> allow_once automatique (options sonde)", () => {
    const proc = fakeProc();
    handleOpencodeIncoming(proc, {
      jsonrpc: "2.0",
      id: 9,
      method: "session/request_permission",
      params: {
        options: [
          { optionId: "once", kind: "allow_once", name: "Allow once" },
          { optionId: "always", kind: "allow_always", name: "Always allow" },
          { optionId: "reject", kind: "reject_once", name: "Reject" },
        ],
      },
    });
    expect(proc.writes).toHaveLength(1);
    expect(proc.writes[0].id).toBe(9);
    expect(proc.writes[0].result.outcome).toEqual({ outcome: "selected", optionId: "once" });
  });

  it("permission sans options -> cancelled ; méthode inconnue -> -32601", () => {
    const proc = fakeProc();
    handleOpencodeIncoming(proc, { id: 1, method: "session/request_permission", params: {} });
    expect(proc.writes[0].result.outcome).toEqual({ outcome: "cancelled" });
    handleOpencodeIncoming(proc, { id: 2, method: "fs/read_text_file", params: { path: "/x" } });
    expect(proc.writes[1].error.code).toBe(-32601);
    expect(proc.writes[1].error.message).toContain("fs/read_text_file");
  });
});

describe("parseAcpLines (framing partagé via acp_common)", () => {
  it("reporte le reliquat et ignore les lignes corrompues", () => {
    const first = parseAcpLines('{"a":1}\npas json\n{"b":', "");
    expect(first.messages).toEqual([{ a: 1 }]);
    expect(first.rest).toBe('{"b":');
    const second = parseAcpLines("2}\n", first.rest);
    expect(second.messages).toEqual([{ b: 2 }]);
    expect(second.rest).toBe("");
  });
});
