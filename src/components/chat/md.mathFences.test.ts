import { describe, expect, it } from "vitest";
import { normalizeMathFences } from "./md";

// Les modèles referment souvent une formule affichée en collant `$$` à la
// dernière ligne (« \end{pmatrix}$$ ») ou en collant l'ouverture à la
// première (« $$\begin{pmatrix} »). Pour remark-math, une clôture de bloc doit
// être seule sur sa ligne : collée, le `$$` et tout ce qui suit sont avalés
// dans la formule (KaTeX rend alors la source en rouge) ; côté ouverture, la
// première ligne est prise pour une méta de clôture et disparaît
// (capture Thierry 2026-09-10, matrice de covariance en rouge).
describe("normalizeMathFences", () => {
  it("détache une clôture $$ collée à la dernière ligne de la formule", () => {
    const src = "Valeurs :\n$$\n\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$\n\nSuite.";
    expect(normalizeMathFences(src)).toBe("Valeurs :\n$$\n\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\n$$\n\nSuite.");
  });

  it("détache une ouverture $$ collée à la première ligne", () => {
    const src = "$$\\begin{pmatrix}\na & b\n\\end{pmatrix}\n$$";
    expect(normalizeMathFences(src)).toBe("$$\n\\begin{pmatrix}\na & b\n\\end{pmatrix}\n$$");
  });

  it("détache les deux quand ouverture et clôture sont collées", () => {
    const src = "$$\\begin{pmatrix}\na & b\n\\end{pmatrix}$$";
    expect(normalizeMathFences(src)).toBe("$$\n\\begin{pmatrix}\na & b\n\\end{pmatrix}\n$$");
  });

  it("laisse intacte une formule déjà bien clôturée", () => {
    const src = "$$\n\\sigma^2\n$$\n\nSuite.";
    expect(normalizeMathFences(src)).toBe(src);
  });

  it("laisse intacte une formule $$…$$ sur une seule ligne", () => {
    const src = "Avec $$x = y$$ puis la suite.";
    expect(normalizeMathFences(src)).toBe(src);
  });

  it("ne prend pas une formule en ligne pour la clôture d'un bloc", () => {
    // Ouverture seule puis, avant toute clôture, une ligne qui contient une
    // formule en ligne complète : ce n'est pas la clôture attendue.
    const src = "$$\n\\alpha\navec $$x$$ ici\n\\beta$$";
    expect(normalizeMathFences(src)).toBe("$$\n\\alpha\navec $$x$$ ici\n\\beta\n$$");
  });

  it("ne touche à rien dans un bloc de code", () => {
    const src = "```latex\n$$\nx$$\n```\n\nTexte.";
    expect(normalizeMathFences(src)).toBe(src);
  });

  it("laisse une formule ouverte non close (streaming) telle quelle", () => {
    const src = "Valeurs :\n$$\n\\begin{pmatrix} a";
    expect(normalizeMathFences(src)).toBe(src);
  });

  it("préserve les fins de ligne Windows", () => {
    const src = "$$\r\n\\sigma^2$$\r\n";
    expect(normalizeMathFences(src)).toBe("$$\r\n\\sigma^2\r\n$$\r\n");
  });
});
