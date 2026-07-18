import { describe, expect, it } from "vitest";
// Le script reste exécutable directement par Node et n'expose pas de types TS.
// @ts-expect-error module JavaScript sans déclaration, volontairement testé ici
import { nearestRank, summarizeRuns } from "../../scripts/summarize-boot-metrics.mjs";

describe("summarize-boot-metrics", () => {
  it("calcule les quantiles nearest-rank d'une fixture contrôlée", () => {
    const runs = [10, 20, 30, 40, 100].map((value) => ({
      marksMs: { firstMeaningfulPaint: value },
    }));
    expect(nearestRank([10, 20, 30, 40, 100], 0.5)).toBe(30);
    expect(nearestRank([10, 20, 30, 40, 100], 0.95)).toBe(100);
    expect(summarizeRuns(runs).firstMeaningfulPaint).toEqual({
      n: 5,
      min: 10,
      p50: 30,
      p95: 100,
      max: 100,
    });
  });
});
