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

  it("place xhigh au bout intelligent sur le vrai catalogue Grok", () => {
    // ordre réellement annoncé par l'ACP Grok, repris du fixture de
    // rust/crates/atelier-providers/src/grok.rs : ["xhigh","high","medium","low"],
    // précédé de "" (Auto) par levelsFor
    expect(sortEffortLevels(["", "xhigh", "high", "medium", "low"])).toEqual([
      "", "low", "medium", "high", "xhigh",
    ]);
  });

  it("laisse une liste déjà croissante inchangée", () => {
    const levels = ["", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
    expect(sortEffortLevels(levels)).toEqual(levels);
  });

  it("range ultracode après max, au bout intelligent de l'échelle Claude", () => {
    // catalogue réel de rust/crates/atelier-providers/src/claude.rs, précédé
    // de "" (Auto) par levelsFor. Sans rang explicite, ultracode tombait dans
    // les inconnus (rang 90) : la place était bonne par accident, pas par
    // contrat — et un second palier inconnu l'aurait doublé.
    expect(sortEffortLevels(["", "low", "medium", "high", "xhigh", "max", "ultracode"])).toEqual([
      "", "low", "medium", "high", "xhigh", "max", "ultracode",
    ]);
    expect(sortEffortLevels(["ultracode", "max", "low"])).toEqual(["low", "max", "ultracode"]);
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
