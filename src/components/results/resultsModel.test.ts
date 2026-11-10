import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../lib/i18n";
import {
  countByKind, detailMeta, formatSize, formatStamp, originLabel, reproduceDraft, staleSentence, visibleResults,
  type ResultSummary,
} from "./resultsModel";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 10, 9);

const result = (path: string, kind: ResultSummary["kind"], ts: number, extra: Partial<ResultSummary> = {}): ResultSummary => ({
  path, name: path.split("/").pop()!, kind, ext: path.split(".").pop()!, version: 1, ts, size: 1000,
  origin: { kind: "script", label: "fig.py", path: "analysis/fig.py" }, starred: false, stale: null, ...extra,
});

const results: ResultSummary[] = [
  result("out/main.pdf", "pdf", at(2026, 11, 9, 14, 10), { origin: { kind: "command", label: "tectonic main.tex" } }),
  result("figures/fig3_regional_years.png", "figure", at(2026, 11, 9, 11, 40), { version: 5 }),
  result("tables/tendances_regions.csv", "table", at(2026, 11, 8, 1, 25), { origin: { kind: "cell", label: "29", cell: 29 } }),
  result("figures/fig2_series.png", "figure", at(2026, 11, 7, 16, 22)),
];

describe("resultsModel", () => {
  beforeEach(() => setLanguage("fr"));

  it("compte par famille et filtre par famille, par texte et par date", () => {
    expect(countByKind(results)).toEqual({ all: 4, figure: 2, table: 1, pdf: 1 });
    expect(visibleResults(results, "figure", "", true).map((r) => r.name)).toEqual(["fig3_regional_years.png", "fig2_series.png"]);
    expect(visibleResults(results, "all", "", false).map((r) => r.name)[0]).toBe("fig2_series.png");
    // le texte cherche dans le chemin et dans l'origine, sans casse
    expect(visibleResults(results, "all", "TECTONIC", true).map((r) => r.name)).toEqual(["main.pdf"]);
    expect(visibleResults(results, "all", "cellule 29", true).map((r) => r.name)).toEqual(["tendances_regions.csv"]);
    expect(visibleResults(results, "pdf", "fig", true)).toEqual([]);
    // la liste reçue n'est jamais réordonnée sur place
    expect(results[0].name).toBe("main.pdf");
  });

  it("écrit les dates, les tailles et la ligne méta comme la maquette", () => {
    expect(formatStamp(at(2026, 11, 9, 14, 10), NOW)).toBe("9 nov. 14:10");
    expect(formatStamp(at(2025, 3, 2, 9, 5), NOW)).toBe("2 mars 2025 09:05");
    expect(formatStamp(null)).toBe("");
    expect(formatSize(212_000)).toBe("212 Ko");
    expect(formatSize(640)).toBe("640 octets");
    expect(formatSize(1_500_000)).toBe("1,5 Mo");
    expect(detailMeta({ ...results[1], size: 212_000, width: 2400, height: 1500 }))
      .toBe("v5 · 9 nov. 2026 à 11:40 · PNG 2400 × 1500 · 212 Ko");
    expect(detailMeta({ ...results[0], size: null })).toBe("v1 · 9 nov. 2026 à 14:10 · PDF");
    expect(originLabel(results[2].origin)).toBe("cellule 29");
    expect(originLabel(results[0].origin)).toBe("tectonic main.tex");
  });

  it("dit quelle entrée a changé, et quand", () => {
    const changedAt = at(new Date().getFullYear(), 11, 9, 13, 10);
    expect(staleSentence({ input: "data/panel.parquet", name: "panel.parquet", changedAt, count: 1 }))
      .toBe("panel.parquet a changé le 9 nov. à 13:10, après cette version.");
    expect(staleSentence({ input: "data/panel.parquet", name: "panel.parquet", changedAt, count: 3 }))
      .toBe("panel.parquet a changé le 9 nov. à 13:10, après cette version, ainsi que 2 autres entrées.");
    expect(staleSentence({ input: "a.csv", name: "a.csv", changedAt: null, count: 1 })).toBe("a.csv a changé depuis cette version.");
    setLanguage("en");
    expect(staleSentence({ input: "a.csv", name: "a.csv", changedAt: null, count: 1 })).toBe("a.csv changed since this version.");
  });

  it("prépare le même message de reproduction que la galerie", () => {
    const draft = reproduceDraft({
      abs: "/proj/these/figures/fig3.png",
      sidecar: "/proj/these/figures/fig3.png.prov.json",
      entry: {
        command: "python analysis/fig3.py --annees 2002-2023",
        scripts: ["analysis/fig3.py"],
        scriptVersions: [{ path: "analysis/fig3.py", sha256: "c81e44a0ffee" }],
        inputs: [{ path: "data/a.parquet" }, { path: "tables/b.csv" }],
        env: { conda: "atelier", python: "3.12.13" },
        head: "0123456789abcdef",
      },
    });
    expect(draft.split("\n")).toEqual([
      "Reproduis ce résultat : /proj/these/figures/fig3.png",
      "Recette : /proj/these/figures/fig3.png.prov.json",
      "Commande enregistrée : python analysis/fig3.py --annees 2002-2023",
      "Script : analysis/fig3.py (sha256 c81e44a…)",
      "Entrées : 2 fichiers, empreintes dans la recette",
      "Environnement : conda atelier · Python 3.12.13",
      "Commit au moment du tour : 0123456",
      expect.stringMatching(/^Avant de lancer quoi que ce soit : .*sans jamais écraser l’original\.$/),
    ]);
    // une cellule du noyau : son code reste dans la recette, jamais recopié
    const cell = reproduceDraft({ abs: "/p/t.csv", sidecar: "/p/t.csv.prov.json",
      entry: { cell: { id: 27, env: "atelier", codeSha256: "abcdef0123" }, inputs: [{ path: "x" }] } });
    expect(cell).toContain("Cellule 27 du noyau Python (atelier), code sha256 abcdef0… : son code est dans la recette");
    expect(cell).toContain("Entrées : 1 fichier, empreintes dans la recette");
    // une recette vide ne casse rien
    expect(reproduceDraft({ abs: "/p/a.png", sidecar: "/p/a.png.prov.json", entry: {} }).split("\n")).toHaveLength(3);
  });
});
