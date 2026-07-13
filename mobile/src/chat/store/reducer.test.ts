import { describe, expect, it } from "vitest";
import { materializeHistory, reduceChat, reduceDurable } from "./reducer.ts";
import { emptyThreadState, type WireLikeEvent } from "./types.ts";

function meta(seq: number, eventId: string, turnId = "turn-1") {
  return {
    schemaVersion: 1,
    eventId,
    sequence: seq,
    turnId,
    provider: "claude",
    threadId: "t",
    durable: true,
    ts: 1000 + seq,
    origin: "provider",
  };
}

describe("reduceDurable live ≡ materialize", () => {
  it("deltas coalesce then text final", () => {
    const events: WireLikeEvent[] = [
      { kind: "user", text: "Hi", meta: meta(1, "u1") },
      { kind: "delta", text: "Hel", meta: { ...meta(2, "d1"), durable: false } },
      { kind: "delta", text: "lo", meta: { ...meta(3, "d2"), durable: false } },
      { kind: "text", text: "Hello", meta: meta(4, "t1") },
      { kind: "done", ok: true, result: "ok", meta: meta(5, "done") },
    ];
    let live = emptyThreadState("t").durable;
    for (const ev of events) live = reduceDurable(live, ev);
    const replay = materializeHistory("t", events);
    expect(Object.keys(live.itemsById).sort()).toEqual(Object.keys(replay.itemsById).sort());
    const textItems = Object.values(live.itemsById).filter((i) => i.kind === "text");
    expect(textItems.some((i) => i.text === "Hello")).toBe(true);
    expect(live.turnsById["turn-1"].status).toBe("done");
  });

  it("idempotent eventId", () => {
    const ev: WireLikeEvent = { kind: "text", text: "x", meta: meta(1, "e1") };
    let d = emptyThreadState("t").durable;
    d = reduceDurable(d, ev);
    const d2 = reduceDurable(d, ev);
    expect(d2).toBe(d);
  });

  it("optimistic user then ack", () => {
    let s = emptyThreadState("t");
    s = reduceChat(s, {
      type: "optimistic_user",
      messageId: "m1",
      text: "Bonjour",
      clientRequestId: "c1",
    });
    expect(s.transport.status).toBe("sending");
    expect(s.durable.itemsById["msg:m1"]?.provisional).toBe(true);
    s = reduceChat(s, {
      type: "event",
      event: {
        kind: "user",
        text: "Bonjour",
        meta: { ...meta(1, "server-u"), messageId: "m1", turnId: "turn-1" },
      },
    });
    // may create new turn — ack by messageId on provisional
    const users = Object.values(s.durable.itemsById).filter((i) => i.kind === "user");
    expect(users.some((u) => u.text === "Bonjour")).toBe(true);
  });

  it("préserve les détails structurés d'un outil pour l'activité mobile", () => {
    const state = reduceDurable(emptyThreadState("t").durable, {
      kind: "tool_update",
      id: "call-1",
      name: "Bash",
      input: { command: "pwd" },
      output: "/tmp/project",
      status: "completed",
      exitCode: 0,
      durationMs: 1250,
      meta: { ...meta(1, "tool-1"), itemId: "call-1" },
    });
    const tool = Object.values(state.itemsById).find((item) => item.kind === "tool");
    expect(tool).toMatchObject({
      toolName: "Bash",
      toolInput: { command: "pwd" },
      toolStatus: "completed",
      toolExitCode: 0,
      toolDurationMs: 1250,
      text: "/tmp/project",
    });
  });
});

describe("scroll presentation actions", () => {
  it("reading accumulates newItemCount on events", () => {
    let s = emptyThreadState("t");
    s = reduceChat(s, { type: "set_scroll_mode", mode: "reading" });
    s = reduceChat(s, {
      type: "event",
      event: { kind: "delta", text: "a", meta: { ...meta(1, "d1"), durable: false } },
    });
    expect(s.presentation.newItemCount).toBeGreaterThan(0);
    s = reduceChat(s, { type: "clear_new_items" });
    expect(s.presentation.scrollMode).toBe("pinned");
    expect(s.presentation.newItemCount).toBe(0);
  });
});
