import { describe, expect, it } from "vitest";
import { harvestWebSources } from "./webSources";

describe("harvestWebSources", () => {
  it("liens markdown : url, label, domaine sans www", () => {
    const { sources } = harvestWebSources("Voir [Grammalecte](https://www.grammalecte.net/doc) et fin.");
    expect(sources).toEqual([{ url: "https://www.grammalecte.net/doc", label: "Grammalecte", domain: "grammalecte.net" }]);
  });
  it("URLs nues acceptées, ponctuation finale détachée, non-http ignoré", () => {
    const { sources } = harvestWebSources("Docs: https://a.org/x. Et file:///tmp/x, localhost aussi http://localhost:3000/y");
    expect(sources.map((s) => s.url)).toEqual(["https://a.org/x", "http://localhost:3000/y"]);
    expect(sources[0].label).toBeNull();
  });
  it("dédoublonne fragment et slash final compris", () => {
    const { sources } = harvestWebSources("[a](https://a.org/x/) puis https://a.org/x#frag");
    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe("a");
  });
  it("plafond : cap sources, le reste compté", () => {
    const md = Array.from({ length: 9 }, (_, i) => `[s${i}](https://s${i}.org)`).join(" ");
    const { sources, more } = harvestWebSources(md, 6);
    expect(sources).toHaveLength(6);
    expect(more).toBe(3);
  });
  it("URL invalide pour new URL() : ignorée sans lancer", () => {
    expect(harvestWebSources("https://").sources).toEqual([]);
  });
});
