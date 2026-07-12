import { describe, expect, it, vi } from "vitest";
import { StreamFrameBuffer } from "./frameBuffer.ts";
import type { WireLikeEvent } from "../store/types.ts";

describe("StreamFrameBuffer", () => {
  it("coalesces deltas into one frame", () => {
    const applied: WireLikeEvent[][] = [];
    const scheduled: Array<() => void> = [];
    const buf = new StreamFrameBuffer({
      apply: (evs) => applied.push(evs),
      schedule: (cb) => {
        scheduled.push(cb);
        return scheduled.length;
      },
      cancel: () => {
        scheduled.length = 0;
      },
    });
    buf.push({ kind: "delta", text: "a" });
    buf.push({ kind: "delta", text: "b" });
    buf.push({ kind: "delta", text: "c" });
    expect(applied).toHaveLength(0);
    expect(buf.pending).toBe(3);
    scheduled[0]?.();
    expect(applied).toHaveLength(1);
    expect(applied[0]).toHaveLength(3);
  });

  it("flushes immediately on done", () => {
    const applied: WireLikeEvent[][] = [];
    const buf = new StreamFrameBuffer({
      apply: (evs) => applied.push(evs),
      schedule: (cb) => {
        // never auto-run
        void cb;
        return 1;
      },
      cancel: vi.fn(),
    });
    buf.push({ kind: "delta", text: "a" });
    buf.push({ kind: "done", ok: true, result: "ok" });
    // pending deltas flushed then done
    expect(applied.length).toBeGreaterThanOrEqual(2);
    expect(applied.flat().some((e) => e.kind === "done")).toBe(true);
    expect(buf.pending).toBe(0);
  });
});
