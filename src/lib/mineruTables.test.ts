// Ce que MinerU laisse dans une page gbrain, et ce que le lecteur doit en
// faire. Les entrées viennent de pages réellement ingérées.
import { describe, expect, it } from "vitest";
import { cellText, mineruTablesToMarkdown, splitFrontMatter } from "./mineruTables";

describe("tableaux HTML de MinerU", () => {
  it("retranscrit un tableau réel en markdown GFM", () => {
    const html = "<table><tr><td>Study</td><td>RCP2.6</td><td>RCP8.5</td></tr>"
      + "<tr><td>This study</td><td>90±36</td><td>163±53</td></tr></table>";
    const out = mineruTablesToMarkdown(`avant\n${html}\naprès`);
    expect(out).toContain("| Study | RCP2.6 | RCP8.5 |");
    expect(out).toContain("| --- | --- | --- |");
    expect(out).toContain("| This study | 90±36 | 163±53 |");
    // le texte autour survit intact
    expect(out).toContain("avant");
    expect(out).toContain("après");
    expect(out).not.toContain("<td>");
  });

  it("décode les entités et neutralise les barres verticales", () => {
    expect(cellText("If latitude &gt; 50, then boreal")).toBe("If latitude > 50, then boreal");
    expect(cellText("a &amp; b")).toBe("a & b");
    // une barre dans une cellule couperait la colonne
    expect(cellText("gauche | droite")).toBe("gauche \\| droite");
  });

  it("garde les fragments LaTeX que MinerU met dans les cellules", () => {
    const html = "<table><tr><td>Region</td><td>1984–2010 (km²  $\\mathsf { a } ^ { - 1 } )$ </td></tr></table>";
    expect(mineruTablesToMarkdown(html)).toContain("$\\mathsf { a } ^ { - 1 } )$");
  });

  it("complète les lignes courtes plutôt que de perdre des cellules", () => {
    const html = "<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>1</td></tr></table>";
    expect(mineruTablesToMarkdown(html)).toContain("| 1 |  |  |");
  });

  it("laisse le document tranquille quand il n'y a pas de tableau", () => {
    const md = "## Titre\n\nUn paragraphe avec $\\alpha$ et rien d'autre.\n";
    expect(mineruTablesToMarkdown(md)).toBe(md);
  });
});

describe("front matter d'une page gbrain", () => {
  // tel qu'écrit par buildArticlePage, pris sur une page du corpus
  const page = `---
type: article
title: >-
  Narrowband-to-broadband albedo conversion for glacier ice and snow: equations
  based on modeling and ranges of validity of the equations
from: atelier
year: 2003
origin: >-
  /Users/tofunori/Downloads/Articles_scientifiques/1-s2.0-S003442570300275X-main.pdf
authors:
  - 'Wouter Greuell, Johannes Oerlemans'
captured: '2026-08-14T00:00:00.000Z'
converter: mineru
---

## 1. Introduction

The surface albedo is the fraction…
`;

  it("recompose les blocs pliés et les listes en une fiche", () => {
    const { meta, body } = splitFrontMatter(page);
    expect(meta.title).toBe(
      "Narrowband-to-broadband albedo conversion for glacier ice and snow: equations"
      + " based on modeling and ranges of validity of the equations",
    );
    expect(meta.authors).toBe("Wouter Greuell, Johannes Oerlemans");
    expect(meta.year).toBe(2003);
    expect(meta.converter).toBe("mineru");
    expect(meta.origin).toContain("1-s2.0-S003442570300275X-main.pdf");
    // le corps ne commence PAS par du YAML
    expect(body.trimStart().startsWith("## 1. Introduction")).toBe(true);
  });

  it("rend le document entier quand il n'y a pas d'en-tête", () => {
    const { meta, body } = splitFrontMatter("# Sans en-tête\n\ntexte");
    expect(meta.title).toBeUndefined();
    expect(body).toBe("# Sans en-tête\n\ntexte");
  });

  it("ne casse pas sur une année absente", () => {
    const { meta } = splitFrontMatter("---\ntitle: Sans année\n---\ncorps");
    expect(meta.title).toBe("Sans année");
    expect(meta.year).toBeNull();
  });
});
