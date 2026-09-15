// Aperçu d'un texte collé (refonte 2026-09-14) : la boîte choisit sa lecture
// d'après le contenu — Source (mono, numéros) pour LaTeX / Markdown / code,
// Texte (paragraphes) pour la prose — et annonce une méta courte en tête.
import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import { classifyPaste, pasteMetaLabel } from "./pasteView";

const LATEX = [
  "e and become more concentrated during",
  "melt, before meltwater carries them away later in the season~\\citep{Sterle2013}.",
  "Measurements in Greenland likewise show that surface black carbon",
  "concentrations increased after modelled smoke deposition but subsequently",
  "declined~\\citep{Khan2023}. Observations from the Canadian",
  "Rockies show different patterns of albedo recovery. At Haig Glacier, ice",
  "albedo recovered after summers of low albedo~\\citep{Marshall2020}.",
  "At Athabasca Glacier, however, low albedo persisted in 2019 and 2020,",
  "after the major fire seasons of 2017 and 2018~\\citep{AubryWake2022}.",
  "Persist",
].join("\n");

beforeEach(() => setLanguage("fr"));

describe("classifyPaste", () => {
  it("LaTeX : source, lignes conservées telles quelles", () => {
    const view = classifyPaste(LATEX);
    expect(view.mode).toBe("source");
    if (view.mode !== "source") return;
    expect(view.kind).toBe("latex");
    expect(view.lines).toHaveLength(10);
    expect(view.lines[1]).toContain("\\citep{Sterle2013}");
  });

  it("Markdown (titres, listes, clôtures) : source", () => {
    const view = classifyPaste("# Plan\n\n- albédo\n- feux\n\n```py\nx = 1\n```");
    expect(view).toMatchObject({ mode: "source", kind: "markdown" });
  });

  it("code indenté : source", () => {
    const view = classifyPaste("def f(x):\n    if x:\n        return 1\n    return 0");
    expect(view).toMatchObject({ mode: "source", kind: "code" });
  });

  it("prose coupée à 80 colonnes : texte, lignes fusionnées par paragraphe", () => {
    const view = classifyPaste(
      "Two neighbouring glaciers, two opposite responses to the fires of\n2017 and 2018.\n\n  \nThat contrast opens the chapter.\r\nIt justifies persistence over intensity.",
    );
    expect(view.mode).toBe("text");
    if (view.mode !== "text") return;
    expect(view.paragraphs).toEqual([
      "Two neighbouring glaciers, two opposite responses to the fires of 2017 and 2018.",
      "That contrast opens the chapter. It justifies persistence over intensity.",
    ]);
    expect(view.words).toBe(23);
  });

  it("texte vide : texte, aucun paragraphe", () => {
    expect(classifyPaste("  \n\n")).toEqual({ mode: "text", paragraphs: [], words: 0 });
  });
});

describe("pasteMetaLabel", () => {
  it("source : nombre de lignes et nature", () => {
    expect(pasteMetaLabel(classifyPaste(LATEX))).toBe("10 lignes · LaTeX");
    expect(pasteMetaLabel(classifyPaste("    x = 1\n    y = 2"))).toBe("2 lignes · code");
  });

  it("texte : paragraphes et mots, singuliers compris", () => {
    expect(pasteMetaLabel(classifyPaste("Un mot"))).toBe("1 paragraphe · 2 mots");
    expect(pasteMetaLabel(classifyPaste("Seul"))).toBe("1 paragraphe · 1 mot");
  });

  it("suit la langue", () => {
    setLanguage("en");
    expect(pasteMetaLabel(classifyPaste(LATEX))).toBe("10 lines · LaTeX");
    expect(pasteMetaLabel(classifyPaste("One line.\n\nTwo."))).toBe("2 paragraphs · 3 words");
  });
});
