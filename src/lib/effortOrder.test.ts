import { describe, it, expect } from "vitest";
import { sortEffortLevels } from "./effortOrder";

describe("sortEffortLevels", () => {
  it("redresse une liste annoncée du plus fort au plus faible (cas Grok)", () => {
    // le CLI Grok annonce ses efforts décroissants ; le slider plaçait donc
    // « Extra High » en deuxième position alors que le libellé disait vrai
    expect(sortEffortLevels(["max", "xhigh", "high", "medium", "low"])).toEqual([
      "low", "medium", "high", "xhigh", "max",
    ]);
  });

  it("laisse une liste déjà croissante inchangée", () => {
    const levels = ["", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
    expect(sortEffortLevels(levels)).toEqual(levels);
  });

  it("garde Auto en tête quel que soit l'ordre annoncé", () => {
    expect(sortEffortLevels(["high", "", "low"])).toEqual(["", "low", "high"]);
  });

  it("garde l'échelle off/on monotone (Kimi)", () => {
    expect(sortEffortLevels(["on", "off"])).toEqual(["off", "on"]);
  });

  it("range les niveaux inconnus après les connus, dans leur ordre d'origine", () => {
    expect(sortEffortLevels(["turbo", "max", "ludicrous", "low"])).toEqual([
      "low", "max", "turbo", "ludicrous",
    ]);
  });

  it("ne perd ni ne duplique aucun niveau", () => {
    const levels = ["max", "xhigh", "high", "medium", "low", "minimal", ""];
    const sorted = sortEffortLevels(levels);
    expect(sorted).toHaveLength(levels.length);
    expect([...sorted].sort()).toEqual([...levels].sort());
  });
});
