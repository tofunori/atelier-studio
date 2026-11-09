import { describe, expect, it } from "vitest";
import { citeKeyLabel, diffWords, parseRevision, revisionStats, texPieces, tokenize } from "./revisionDiff";

describe("parseRevision", () => {
  it("sépare l'ancienne et la nouvelle version", () => {
    expect(parseRevision("--- avant\nold text\n+++ après\nnew text\n")).toEqual({ before: "old text", after: "new text", complete: true });
    expect(parseRevision("--- before:\nA\n+++ after:\nB").complete).toBe(true);
  });
  it("sans marqueur « après » (stream en cours), rend le texte brut", () => {
    expect(parseRevision("--- avant\nold").complete).toBe(false);
  });
});

describe("diffWords", () => {
  it("garde une commande LaTeX à arguments en un seul mot", () => {
    expect(tokenize("as in \\citep{a, b}. Done")).toContain("\\citep{a, b}. ");
  });
  it("met tout le retiré puis tout l'ajouté, sans espace dans le barré", () => {
    const s = diffWords("Our data are not complete; they omit", "Our data are nevertheless not complete; they omit");
    expect(s).toEqual([
      { kind: "same", text: "Our data are " },
      { kind: "add", text: "nevertheless" },
      { kind: "same", text: " not complete; they omit" },
    ]);
  });
  it("un petit mot commun entre deux changements passe dans la zone", () => {
    expect(diffWords("x of the old words here", "x of a new set here")).toEqual([
      { kind: "same", text: "x of " },
      { kind: "del", text: "the old words" },
      { kind: "add", text: "a new set" },
      { kind: "same", text: " here" },
    ]);
  });
  it("une réécriture reste un bloc barré puis un bloc souligné, pas hachée", () => {
    const s = diffWords(
      "the MERRA-2 reanalysis and MODIS aerosol optical depth (Methods). Our data are not complete; they omit dust \\citep{Kaspari2015}. These omissions likely bias the fire slope low.",
      "the MERRA-2 reanalysis and the share of MODIS observations flagged as high aerosol (Methods). Our data are nevertheless not complete; they omit dust \\citep{Kaspari2015}. Where these components follow the carbon in our data, the fire slope includes their darkening.",
    );
    expect(s.filter(x => x.kind !== "same")).toEqual([
      { kind: "del", text: "MODIS aerosol optical depth" },
      { kind: "add", text: "the share of MODIS observations flagged as high aerosol" },
      { kind: "add", text: "nevertheless" },
      { kind: "del", text: "These omissions likely bias the fire slope low." },
      { kind: "add", text: "Where these components follow the carbon in our data, the fire slope includes their darkening." },
    ]);
    expect(revisionStats(s)).toEqual({ changes: 3, removals: 2 });
  });
  it("aucun changement", () => {
    expect(revisionStats(diffWords("same text", "same text"))).toEqual({ changes: 0, removals: 0 });
  });
});

describe("texPieces", () => {
  it("rend les citations lisibles et le ~ insécable", () => {
    expect(citeKeyLabel("Menounos2025")).toBe("Menounos, 2025");
    expect(citeKeyLabel("smithEtAl2019a")).toBe("smith et al., 2019a");
    expect(texPieces("in 2023 \\citep{Menounos2025}. Figs.~\\SFsmoke{} \\citet{Kaspari2015} \\emph{x} 5\\%")).toEqual([
      { kind: "text", text: "in 2023 " },
      { kind: "cite", text: "(Menounos, 2025)" },
      { kind: "text", text: ". Figs. " },
      { kind: "cite", text: "SFsmoke" },
      { kind: "text", text: " " },
      { kind: "cite", text: "Kaspari (2015)" },
      { kind: "text", text: " " },
      { kind: "em", text: "x" },
      { kind: "text", text: " 5%" },
    ]);
  });
});
