import { afterEach, describe, expect, it, vi } from "vitest";
import { materializeHarnessHistory, reduceHarnessEvent } from "./harnessEvents";
import type { AgentEvent } from "./ws";
import { makeMeta } from "../test/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("historique indexé — parité avec le flux immuable", () => {
  it("préserve les remplacements, suppressions et doublons sur des tours entrelacés", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    let seed = 314159;
    const random = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 16) % n;
    };
    for (let trial = 0; trial < 40; trial++) {
      const trace: AgentEvent[] = [];
      for (let i = 0; i < 300; i++) {
        const meta = random(5) === 0 ? undefined : makeMeta({
          eventId: `e${random(80)}`, turnId: `t${random(4)}`,
          itemId: `i${random(3)}`, messageId: `m${random(8)}`, sequence: random(200),
        });
        const text = ["a", " 🧊", " code\n", "", "é"][random(5)];
        const kind = ["user", "delta", "thinking_delta", "stream_set", "text", "thinking", "done", "error", "tool_update", "activity", "interaction", "todos", "goal", "thinking_progress"][random(14)];
        const event = kind === "user" ? { kind, text: "Question", meta }
          : kind === "done" ? { kind, ok: true, result: "", meta }
          : kind === "error" ? { kind, message: "interrompu", meta }
          : kind === "tool_update" ? { kind, id: `tool${random(2)}`, name: "read", output: text, status: "completed", meta }
          : kind === "activity" ? { kind, id: `a${random(2)}`, name: "read", title: text, status: "completed", meta }
          : kind === "interaction" ? { kind, requestId: `r${random(3)}`, status: "answered", meta }
          : kind === "todos" ? { kind, items: [], meta }
          : kind === "goal" ? { kind, goal: { objective: text }, meta }
          : { kind, text, meta };
        trace.push(event as AgentEvent);
      }
      const original = structuredClone(trace);
      expect(materializeHarnessHistory(trace)).toEqual(trace.reduce(reduceHarnessEvent, []));
      expect(trace).toEqual(original);
    }
  });

  it("libère les anciennes identités et réindexe les rangées après suppression", () => {
    const meta = (eventId: string, turnId = "t1") => makeMeta({ eventId, turnId });
    const first: AgentEvent = { kind: "delta", text: "", meta: meta("a") };
    const trace: AgentEvent[] = [
      first,
      { kind: "tool_update", id: "tool", name: "read", output: "", status: "running", meta: meta("tool-start", "t2") },
      { kind: "done", ok: true, result: "", meta: meta("done") },
      { kind: "tool_update", id: "tool", name: "read", output: "ok", status: "completed", meta: meta("tool-end", "t2") },
      { kind: "delta", text: "B", meta: meta("b") },
      first,
      first,
    ];
    expect(materializeHarnessHistory(trace)).toEqual(trace.reduce(reduceHarnessEvent, []));
  });

  it("charge un long historique sans modifier les événements fournis", () => {
    const trace: AgentEvent[] = Array.from({ length: 12_000 }, (_, i) => ({
      kind: "user", text: `Question ${i}`, ts: i,
      meta: makeMeta({ eventId: `e${i}`, turnId: `t${i}`, messageId: `m${i}` }),
    }));
    trace.forEach(Object.freeze);
    Object.freeze(trace);
    const result = materializeHarnessHistory(trace);
    expect(result).toEqual(trace);
    expect(result).not.toBe(trace);
  });
});
