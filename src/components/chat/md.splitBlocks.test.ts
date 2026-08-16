// Tests écrits AVANT l'implémentation de splitMarkdownBlocks (plan 066, L1) :
// découpage du markdown en blocs sur `\n\n+`, jamais à l'intérieur d'une
// fence ``` ouverte — condition du memo par bloc (MdBlock).
import { describe, expect, it } from "vitest";
import { splitMarkdownBlocks } from "./md";

describe("splitMarkdownBlocks", () => {
  it("texte vide : aucun bloc", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
  });

  it("un seul paragraphe : un seul bloc", () => {
    expect(splitMarkdownBlocks("Un paragraphe simple.")).toEqual(["Un paragraphe simple."]);
  });

  it("deux paragraphes séparés par une ligne vide : deux blocs", () => {
    expect(splitMarkdownBlocks("Premier.\n\nSecond.")).toEqual(["Premier.", "Second."]);
  });

  it("plusieurs lignes vides consécutives : toujours deux blocs (le séparateur n'est pas dupliqué)", () => {
    expect(splitMarkdownBlocks("Premier.\n\n\n\nSecond.")).toEqual(["Premier.", "Second."]);
  });

  it("trois paragraphes : trois blocs, dans l'ordre", () => {
    expect(splitMarkdownBlocks("A.\n\nB.\n\nC.")).toEqual(["A.", "B.", "C."]);
  });

  it("un \\n\\n À L'INTÉRIEUR d'une fence fermée : ne coupe pas le bloc de code", () => {
    const text = "Avant.\n\n```python\nligne1\n\nligne2\n```\n\nAprès.";
    expect(splitMarkdownBlocks(text)).toEqual([
      "Avant.",
      "```python\nligne1\n\nligne2\n```",
      "Après.",
    ]);
  });

  it("fence jamais refermée (streaming) : tout le reste du texte, y compris les \\n\\n, reste dans le dernier bloc", () => {
    const text = "Avant.\n\n```python\nligne1\n\nligne2 pas fini";
    expect(splitMarkdownBlocks(text)).toEqual([
      "Avant.",
      "```python\nligne1\n\nligne2 pas fini",
    ]);
  });

  it("liste lâche (items séparés par une ligne vide) : reste un seul bloc pour ne pas casser la numérotation/le rendu", () => {
    const text = "- item un\n\n- item deux\n\n- item trois";
    expect(splitMarkdownBlocks(text)).toEqual([text]);
  });

  it("liste numérotée lâche : reste un seul bloc", () => {
    const text = "1. premier\n\n2. second";
    expect(splitMarkdownBlocks(text)).toEqual([text]);
  });

  it("liste puis paragraphe normal (pas de continuité de marqueur) : coupe normalement", () => {
    const text = "- item un\n\nParagraphe normal.";
    expect(splitMarkdownBlocks(text)).toEqual(["- item un", "Paragraphe normal."]);
  });

  it("tableau GFM (une seule ligne vide avant/après, aucune à l'intérieur) : jamais coupé en interne", () => {
    const text = "Titre\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nSuite.";
    expect(splitMarkdownBlocks(text)).toEqual([
      "Titre",
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
      "Suite.",
    ]);
  });

  it("recomposition : rejoindre les blocs avec \\n\\n redonne un texte markdown équivalent", () => {
    const text = "A.\n\nB.\n\nC.";
    expect(splitMarkdownBlocks(text).join("\n\n")).toBe(text);
  });
});
