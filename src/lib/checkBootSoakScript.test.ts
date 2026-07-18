import { describe, expect, it } from "vitest";
// @ts-expect-error module JavaScript sans déclaration, volontairement testé ici
import { summarizeSoak } from "../../scripts/check-boot-soak.mjs";

const options = {
  since: "2026-07-18T00:00:00.000Z",
  timeZone: "America/Toronto",
  appVersion: "1.3.1",
  minDays: 3,
  minWarm: 2,
  minCold: 1,
  maxWarmFmpP95: 1_200,
  maxWarmWsP95: 2_500,
  maxColdFmpP95: 2_000,
  maxColdWsP95: 8_000,
};

function run(at: string, path: "lock-reuse" | "spawn", fmp = 900, ws = 1_000) {
  return {
    appVersion: "1.3.1",
    recordedAtUnixMs: Date.parse(at),
    marksMs: { firstMeaningfulPaint: fmp, wsReady: ws },
    flags: { sidecarPath: path },
  };
}

describe("check-boot-soak", () => {
  it("exige trois jours calendaires et les échantillons warm/cold sous budget", () => {
    const result = summarizeSoak([
      run("2026-07-18T16:00:00Z", "lock-reuse"),
      run("2026-07-19T16:00:00Z", "lock-reuse"),
      run("2026-07-20T16:00:00Z", "spawn", 1_100, 2_000),
    ], options);
    expect(result.calendarDays).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
    expect(result.pass).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it("ignore les anciens runs non datés et échoue si un budget est dépassé", () => {
    const result = summarizeSoak([
      { appVersion: "1.3.1", marksMs: { firstMeaningfulPaint: 1, wsReady: 1 }, flags: { sidecarPath: "lock-reuse" } },
      run("2026-07-18T16:00:00Z", "lock-reuse", 1_500, 1_600),
    ], options);
    expect(result.eligibleRuns).toBe(1);
    expect(result.checks.calendarDays).toBe(false);
    expect(result.checks.warmFmpBudget).toBe(false);
    expect(result.pass).toBe(false);
  });
});
