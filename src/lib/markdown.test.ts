// Tests écrits AVANT l'extension de hardenPartialMarkdown (plan 066, lot L1)
// pour la réparation du bloc de queue en streaming : gras/italique non
// fermés, en plus des cas déjà couverts (fence, backtick, lien tronqué).
import { describe, expect, it } from "vitest";
import { hardenPartialMarkdown, normalizeMathDelimiters } from "./markdown";

describe("hardenPartialMarkdown — cas déjà en place (non-régression)", () => {
  it("fence de code non fermée : ajoute la fence de fermeture", () => {
    expect(hardenPartialMarkdown("texte\n```python\nprint(1)")).toBe("texte\n```python\nprint(1)\n```");
  });

  it("backtick inline non fermé : ajoute le backtick", () => {
    expect(hardenPartialMarkdown("du `code")).toBe("du `code`");
  });

  it("lien tronqué en fin de texte : retire la partie « ( » incomplète", () => {
    expect(hardenPartialMarkdown("voir [analysis/albedo](analysis/al")).toBe("voir analysis/albedo");
  });

  it("texte déjà complet : inchangé", () => {
    const text = "Du **gras** et du *italique*, un `code` et [lien](https://x.test).";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });
});

describe("hardenPartialMarkdown — gras/italique non fermés (nouveau, L1)", () => {
  it("** ouvert en fin de texte : ferme le gras", () => {
    expect(hardenPartialMarkdown("Un mot **en gras")).toBe("Un mot **en gras**");
  });

  it("* ouvert en fin de texte : ferme l'italique", () => {
    expect(hardenPartialMarkdown("Un mot *en italique")).toBe("Un mot *en italique*");
  });

  it("gras fermé puis italique ouvert : ne ferme que l'italique", () => {
    expect(hardenPartialMarkdown("**Gras complet** et *italique")).toBe("**Gras complet** et *italique*");
  });

  it("puce de liste (* item) : n'est jamais prise pour une emphase ouverte", () => {
    const text = "* item un\n* item deux";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("liste numérotée : inchangée (aucune emphase en jeu)", () => {
    const text = "1. premier\n2. second";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("astérisque de multiplication isolé (espaces des deux côtés) : jamais fermé", () => {
    const text = "Le facteur est 2 * 3 environ";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("tableau en cours (pipes) : les astérisques dans les cellules restent hors gras/italique non voulu", () => {
    const text = "| Saison | Albédo |\n| --- | ---: |\n| Hiver | 0.72 |";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("astérisque ouvert À L'INTÉRIEUR d'une fence : jamais touché (littéral)", () => {
    const text = "```python\nx = 2 * y\n```\nprint(**kwargs";
    // la fence est fermée ; le ** hors fence, en fin de texte, doit être fermé
    expect(hardenPartialMarkdown(text)).toBe("```python\nx = 2 * y\n```\nprint(**kwargs**");
  });

  it("fence encore ouverte : le contenu (y compris des *) n'est pas retouché, seule la fence se ferme", () => {
    const text = "```python\nx = 2 * y\nz = **kwargs";
    expect(hardenPartialMarkdown(text)).toBe("```python\nx = 2 * y\nz = **kwargs\n```");
  });

  it("code inline en cours (backtick simple ouvert) : le * à l'intérieur n'est pas fermé, seul le backtick l'est", () => {
    const text = "voir `2 * y";
    expect(hardenPartialMarkdown(text)).toBe("voir `2 * y`");
  });
});

describe("normalizeMathDelimiters — non-régression", () => {
  it("convertit \\(...\\) et \\[...\\] sans toucher au code", () => {
    expect(normalizeMathDelimiters("\\(x^2\\) puis \\[y = 2\\]")).toBe("$x^2$ puis $$y = 2$$");
    expect(normalizeMathDelimiters("`\\(reste littéral\\)`")).toBe("`\\(reste littéral\\)`");
  });
});
