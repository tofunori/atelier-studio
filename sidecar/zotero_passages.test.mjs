import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { focusPassageQuote, passageLink, resolveZoteroPdf, searchCorpus, searchPassages, splitPdfPages } from "./zotero_passages.mjs";
import { runPassageSearch } from "./zotero_passage_cli.mjs";
import { stripZoteroPassageInstruction, withZoteroPassageInstruction } from "./zotero_passage_prompt.mjs";

function writeFixtureIndex(dir, name, { pdfFile, zoteroKey, pdfKey, pages }) {
  writeFileSync(join(dir, name), JSON.stringify({ version: 2, size: 1, mtimeMs: 1, pdfFile, zoteroKey, pdfKey, pages }));
}

describe("passages Zotero", () => {
  const pages = splitPdfPages([
    "Abstract\nWe quantify wildfire carbon deposition on glacier surfaces and its albedo response.",
    "Results\nOur results show that fire-carbon dose is associated with a measurable decrease in August albedo of 2.4 percent.",
    "Limitations\nThe energetic conversion is an upper bound, not a direct observation of melt.",
  ].join("\f"));

  it("classe les passages selon la question et conserve la page", () => {
    const found = searchPassages(pages, "Quel est le résultat sur la diminution de l'albédo?", { limit: 2 });
    expect(found[0]).toMatchObject({ page: 2 });
    expect(found[0].quote).toContain("2.4 percent");
  });

  it("comprend une demande française portant sur des résultats anglais", () => {
    const found = searchPassages(pages, "montre-moi les passages importants de leurs résultats", { limit: 2 });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((entry) => entry.page === 2)).toBe(true);
  });

  it("focalise le lien sur une phrase exacte plutôt que sur tout le paragraphe", () => {
    const paragraph = "Reference context before the result. These equations describe measurements with root-mean-square differences of 0.016. More discussion follows.";
    expect(focusPassageQuote(paragraph, "main results root mean square")).toBe(
      "These equations describe measurements with root-mean-square differences of 0.016.",
    );
  });

  it("une phrase sans aucun token de la requête ne l'emporte jamais sur ses seuls bonus structurels", () => {
    const text = "Fire aerosol deposition reduced summer albedo. We show root-mean-square differences of 0.016 for the calibration set.";
    expect(focusPassageQuote(text, "albedo")).toBe("Fire aerosol deposition reduced summer albedo.");
  });

  it("génère un lien profond local et réutilisable par le chat", () => {
    const href = passageLink({ zoteroKey: "ITEM1", pdfKey: "PDF1", pdfFile: "paper.pdf", page: 3, quote: "upper bound" });
    expect(href).toContain("#atelier-zotero-passage?");
    expect(href).toContain("page=3");
    expect(href).toContain("quote=upper+bound");
  });

  it("refuse un PDF hors du stockage Zotero", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-zotero-root-"));
    const storage = join(root, "storage");
    mkdirSync(join(storage, "AAAA"), { recursive: true });
    const inside = join(storage, "AAAA", "paper.pdf");
    const outside = join(root, "secret.pdf");
    writeFileSync(inside, "%PDF");
    writeFileSync(outside, "%PDF");
    expect(resolveZoteroPdf(inside, { storageRoot: storage })).toBe(realpathSync(inside));
    expect(() => resolveZoteroPdf(outside, { storageRoot: storage })).toThrow(/hors du stockage/);
  });

  it("renvoie le lien avec chaque résultat de l'outil", () => {
    const result = runPassageSearch([
      "search", "--pdf", "/fake/paper.pdf", "--zotero-key", "ITEM1", "--pdf-key", "PDF1",
      "--pdf-file", "paper.pdf", "--query", "albedo decrease", "--limit", "1",
    ], { resolvePdf: (path) => path, extractPages: () => ({ pages, cached: true }) });
    expect(result.passages[0].markdownLink).toMatch(/^\[Ouvrir le passage — p\. 2\]\(#atelier-zotero-passage\?/);
    const href = result.passages[0].markdownLink.match(/\]\((#[^)]+)\)$/)?.[1] ?? "";
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("quote")).toBe(result.passages[0].quote);
  });

  it("corpus : agrège les index du cache et garde les liens exacts", () => {
    const dir = mkdtempSync(join(tmpdir(), "zp-"));
    writeFixtureIndex(dir, "aaa.json", { pdfFile: "Williamson 2021.pdf", zoteroKey: "Z1", pdfKey: "P1",
      pages: [{ page: 7, text: "Fire aerosol deposition reduced summer albedo substantially." }] });
    writeFixtureIndex(dir, "bbb.json", { pdfFile: "Marshall 2022.pdf", zoteroKey: "Z2", pdfKey: "P2",
      pages: [{ page: 3, text: "Black carbon concentrations peaked in late July." }] });
    const out = searchCorpus({ cacheDir: dir, query: "albedo aerosol", limit: 5 });
    expect(out.results[0].pdfFile).toBe("Williamson 2021.pdf");
    expect(out.results[0].markdownLink).toContain("#atelier-zotero-passage?");
    expect(out.results.every((r) => r.quote.length > 0)).toBe(true);
  });

  it("corpus : exclut les index legacy sans méta zotero", () => {
    const dir = mkdtempSync(join(tmpdir(), "zp-legacy-"));
    writeFileSync(join(dir, "legacy.json"), JSON.stringify({
      version: 2, size: 1, mtimeMs: 1,
      pages: [{ page: 1, text: "Fire aerosol deposition reduced summer albedo substantially." }],
    }));
    const out = searchCorpus({ cacheDir: dir, query: "albedo aerosol", limit: 5 });
    expect(out.results).toEqual([]);
  });

  it("corpus : ignore un fragment hors sujet à fort bonus au profit du paragraphe pertinent", () => {
    const dir = mkdtempSync(join(tmpdir(), "zp-bonus-"));
    const relevant = "Fire aerosol deposition reduced summer albedo.";
    const offTopicBonus = "We show root-mean-square differences of 0.016 for the calibration set across all years.";
    writeFixtureIndex(dir, "ccc.json", { pdfFile: "Williamson 2021.pdf", zoteroKey: "Z1", pdfKey: "P1",
      pages: [{ page: 4, text: `${relevant}\n\n${offTopicBonus}` }] });
    const out = searchCorpus({ cacheDir: dir, query: "albedo", limit: 5 });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].quote).toBe(relevant);
  });

  it("corpus : le paramètre quote du markdownLink correspond exactement à la citation affichée", () => {
    const dir = mkdtempSync(join(tmpdir(), "zp-fidelity-"));
    writeFixtureIndex(dir, "ddd.json", { pdfFile: "Williamson 2021.pdf", zoteroKey: "Z1", pdfKey: "P1",
      pages: [{ page: 9, text: "Fire aerosol deposition reduced summer albedo substantially." }] });
    const out = searchCorpus({ cacheDir: dir, query: "albedo aerosol", limit: 5 });
    const href = out.results[0].markdownLink.match(/\]\((#[^)]+)\)$/)?.[1] ?? "";
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("quote")).toBe(out.results[0].quote);
  });

  it("CLI : --corpus sans --pdf appelle searchCorpus au lieu d'exiger les métadonnées PDF", () => {
    const result = runPassageSearch(
      ["search", "--corpus", "--query", "albedo aerosol", "--limit", "1"],
      { searchCorpus: () => ({ results: [{ page: 7, quote: "q", score: 10, pdfFile: "Williamson 2021.pdf", markdownLink: "[x](#atelier-zotero-passage?x)" }] }) },
    );
    expect(result.results[0].pdfFile).toBe("Williamson 2021.pdf");
    expect(result.count).toBe(1);
  });

  it("injecte l'instruction au provider mais sait la retirer de l'historique", () => {
    const enriched = withZoteroPassageInstruction("montre les passages", { toolPath: "/app/atelier-zotero-passages" });
    expect(enriched).toContain('"/app/atelier-zotero-passages" search');
    expect(stripZoteroPassageInstruction(enriched)).toBe("montre les passages");
  });
});
