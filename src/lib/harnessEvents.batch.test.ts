import { afterEach, describe, expect, it, vi } from "vitest";
import { reduceHarnessEvent, reduceHarnessEvents } from "./harnessEvents";
import type { AgentEvent } from "./ws";
import { makeMeta } from "../test/fixtures";

afterEach(() => vi.restoreAllMocks());
const delta = (text: string, id: string, turnId = "t1"): AgentEvent => ({
  kind: "delta", text, meta: makeMeta({ eventId: id, turnId }),
});
const sequential = (initial: AgentEvent[], trace: AgentEvent[]) => trace.reduce(reduceHarnessEvent, initial);

describe("réduction par lots — parité séquentielle", () => {
  it("préserve timestamps, références historiques, métadonnées et immutabilité", () => {
    const initial: AgentEvent[] = [{ kind: "text", text: "Historique", ts: 12 }];
    const trace = Array.from({ length: 1000 }, (_, i) => delta(`fragment ${i} 🧊 `, `e${i}`));
    const out = reduceHarnessEvents(initial, trace);
    expect(out).toEqual(sequential(initial, trace));
    expect(out[0]).toBe(initial[0]);
    expect(initial).toHaveLength(1);
  });

  it("un doublon courant est ignoré, une identité remplacée suit la sémantique existante", () => {
    const first = delta("A", "a");
    const second = delta("B", "b");
    const initial = sequential([], [first]);
    const trace = [first, second, second, first];
    expect(reduceHarnessEvents(initial, trace)).toEqual(sequential(initial, trace));
    expect(reduceHarnessEvents(initial, [first, first])).toBe(initial);
  });

  it("compte les identités dupliquées présentes dans plusieurs rangées", () => {
    const initial: AgentEvent[] = [
      { kind: "text", text: "old", meta: makeMeta({ eventId: "a" }), ts: 1 },
      { kind: "streaming", text: "A", meta: makeMeta({ eventId: "a" }), ts: 1 },
    ];
    const trace = [delta("B", "b"), delta("C", "a")];
    expect(reduceHarnessEvents(initial, trace)).toEqual(sequential(initial, trace));
  });

  it("rejoue des traces mixtes et des découpages de frames variés à l'identique", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    let seed = 271828;
    const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let trial = 0; trial < 50; trial++) {
      const trace: AgentEvent[] = [];
      for (let i = 0; i < 200; i++) {
        const meta = random(5) === 0 ? undefined : makeMeta({ eventId: `e${random(40)}`, turnId: `t${random(3)}`, itemId: `i${random(2)}` });
        const text = ["a", " 🧊", " code\n", "", "é"][random(5)];
        const kind = ["delta", "delta", "thinking_delta", "stream_set", "text", "thinking", "done", "tool_update"][random(8)];
        trace.push(kind === "done" ? { kind, ok: true, result: "", meta }
          : kind === "tool_update" ? { kind, id: "tool", name: "read", output: "", status: "running", meta }
          : { kind, text, meta } as AgentEvent);
      }
      let out: AgentEvent[] = [];
      for (let i = 0; i < trace.length;) {
        const size = 1 + random(20);
        out = reduceHarnessEvents(out, trace.slice(i, i + size));
        i += size;
      }
      expect(out).toEqual(sequential([], trace));
    }
  });
});
