// src/lib/streamCoalesce.test.ts
import { describe, expect, it, vi } from "vitest";
import { createStreamCoalescer, STREAM_COALESCE_KINDS } from "./streamCoalesce";

describe("streamCoalesce", () => {
  it("connaît les kinds à lisser", () => {
    expect(STREAM_COALESCE_KINDS.has("delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("thinking_delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("streaming")).toBe(false);
  });

  it("applique tous les deltas d'une frame, dans l'ordre, en un seul flush", () => {
    const applied: Array<[string, any]> = [];
    let frameCb: (() => void) | null = null;
    const raf = vi.fn((cb: () => void) => { frameCb = cb; return 1; });
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]), raf, vi.fn());
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t1", { kind: "delta", text: "b" });
    expect(applied).toEqual([]);           // rien avant la frame
    expect(raf).toHaveBeenCalledTimes(1);  // un seul rAF par fil
    frameCb!();
    expect(applied.map(([, e]) => e.text)).toEqual(["a", "b"]); // ordre préservé
  });

  it("flush synchrone vide la file et annule le rAF", () => {
    const applied: any[] = [];
    const caf = vi.fn();
    const c = createStreamCoalescer((_id, ev) => applied.push(ev), () => 7, caf);
    c.push("t1", { kind: "delta", text: "a" });
    c.flush("t1");
    expect(applied).toHaveLength(1);
    expect(caf).toHaveBeenCalledWith(7);
    c.flush("t1"); // idempotent
    expect(applied).toHaveLength(1);
  });

  it("les fils sont indépendants", () => {
    const applied: Array<[string, any]> = [];
    const frames: Array<() => void> = [];
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]),
      (cb) => { frames.push(cb); return frames.length; }, () => {});
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t2", { kind: "delta", text: "x" });
    frames[0]!();
    expect(applied).toEqual([["t1", { kind: "delta", text: "a" }]]);
  });
});
