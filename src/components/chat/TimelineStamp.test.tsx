import { describe, expect, it } from "vitest";
import { formatStampRange } from "./TimelineStamp";

describe("formatStampRange", () => {
  it("formate début → fin, replié sur une heure si même minute", () => {
    const t0 = new Date(2026, 7, 21, 10, 47, 12).getTime();
    expect(formatStampRange(t0, t0 + 20_000, "24h")).toBe("10:47");
    expect(formatStampRange(t0, t0 + 3 * 60_000, "24h")).toBe("10:47 → 10:50");
    expect(formatStampRange(t0, null, "24h")).toBe("10:47");
  });
});
