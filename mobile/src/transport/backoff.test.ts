import { describe, expect, it } from "vitest";
import { bumpAttempt, nextBackoffMs, resetAttempt } from "./backoff.ts";

describe("backoff", () => {
  it("respects ceiling", () => {
    const ms = nextBackoffMs(20, { baseMs: 1000, capMs: 5000, random: () => 0.999 });
    expect(ms).toBeLessThanOrEqual(5000);
    expect(ms).toBeGreaterThan(0);
  });

  it("jitter is in range", () => {
    const ms = nextBackoffMs(0, { baseMs: 1000, capMs: 30_000, random: () => 0 });
    expect(ms).toBe(0);
    const ms2 = nextBackoffMs(1, { baseMs: 1000, capMs: 30_000, random: () => 1 - 1e-9 });
    expect(ms2).toBeLessThanOrEqual(2000);
  });

  it("bump/reset", () => {
    expect(resetAttempt()).toBe(0);
    expect(bumpAttempt(0)).toBe(1);
    expect(bumpAttempt(100, 20)).toBe(20);
  });
});
