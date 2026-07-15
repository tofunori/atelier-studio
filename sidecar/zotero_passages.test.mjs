import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { focusPassageQuote, passageLink, resolveZoteroPdf, searchPassages, splitPdfPages } from "./zotero_passages.mjs";
import { runPassageSearch } from "./zotero_passage_cli.mjs";
import { stripZoteroPassageInstruction, withZoteroPassageInstruction } from "./zotero_passage_prompt.mjs";

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

  it("injecte l'instruction au provider mais sait la retirer de l'historique", () => {
    const enriched = withZoteroPassageInstruction("montre les passages", { toolPath: "/app/atelier-zotero-passages" });
    expect(enriched).toContain('"/app/atelier-zotero-passages" search');
    expect(stripZoteroPassageInstruction(enriched)).toBe("montre les passages");
  });
});
