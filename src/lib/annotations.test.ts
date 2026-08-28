import { describe, expect, it } from "vitest";
import { buildAnnotationBlock, migrateMarks, parseAnnotationBlock, type Mark } from "./annotations";

describe("migrateMarks", () => {
  it("convertit les anciennes marques hl et ul en annotations sans commentaire", () => {
    expect(migrateMarks([{ text: "albédo", kind: "hl" }, { text: "glacier", kind: "ul" }]))
      .toEqual([{ text: "albédo", kind: "an" }, { text: "glacier", kind: "an" }]);
  });

  it("laisse les annotations et leur commentaire intacts", () => {
    const stored = [{ text: "albédo", kind: "an", note: "vérifier août" }];
    expect(migrateMarks(stored)).toEqual(stored);
  });

  it("ignore les entrées sans texte", () => {
    expect(migrateMarks([{ kind: "hl" }, { text: "", kind: "an" }, null, "bruit"])).toEqual([]);
  });

  it("renvoie une liste vide pour une valeur qui n'est pas un tableau", () => {
    expect(migrateMarks(null)).toEqual([]);
  });
});

describe("buildAnnotationBlock", () => {
  const marks: Mark[] = [
    { text: "tuiles MOD10A1", kind: "an", note: "vérifie plutôt août" },
    { text: "fraction glaciaire", kind: "an" },
  ];

  it("numérote les annotations et rend le commentaire", () => {
    expect(buildAnnotationBlock(marks)).toBe(
      "Annotations sur ma réponse :\n" +
      "[1] « tuiles MOD10A1 »\n" +
      "    → vérifie plutôt août\n" +
      "[2] « fraction glaciaire »\n" +
      "    → (sans commentaire)",
    );
  });

  it("renvoie une chaîne vide sans annotation", () => {
    expect(buildAnnotationBlock([])).toBe("");
  });

  it("aplatit un passage multiligne sur une seule ligne citée", () => {
    const block = buildAnnotationBlock([{ text: "seuil habituel\net la base", kind: "an" }]);
    expect(block).toContain("[1] « seuil habituel et la base »");
  });
});

// Le bloc est écrit pour l'agent et relu pour l'affichage (direction A,
// 2026-08-28). Les deux chemins doivent rester exactement inverses : dès
// qu'ils divergent, la bulle du fil montre autre chose que ce qui est parti.
describe("parseAnnotationBlock", () => {
  const an = (text: string, note?: string): Mark =>
    note ? { text, kind: "an", note } : { text, kind: "an" };

  it("relit ce que buildAnnotationBlock vient d'écrire", () => {
    const written = buildAnnotationBlock([an("tuiles MOD10A1", "vérifie plutôt août"), an("fraction glaciaire")]);
    expect(parseAnnotationBlock(written)).toEqual({
      items: [
        { text: "tuiles MOD10A1", note: "vérifie plutôt août" },
        { text: "fraction glaciaire", note: null },
      ],
      tail: "",
    });
  });

  it("sépare le bloc de ce que l'utilisateur a tapé dessous", () => {
    const block = buildAnnotationBlock([an("le seuil", "trop vague")]);
    const parsed = parseAnnotationBlock(`${block}\n\nReprends la méthode.`);
    expect(parsed?.items).toEqual([{ text: "le seuil", note: "trop vague" }]);
    expect(parsed?.tail).toBe("Reprends la méthode.");
  });

  it("garde un commentaire écrit sur plusieurs lignes", () => {
    const block = buildAnnotationBlock([an("le seuil", "trop vague\net mal placé")]);
    const parsed = parseAnnotationBlock(`${block}\n\nrefais-le`);
    expect(parsed?.items[0].note).toBe("trop vague\net mal placé");
    expect(parsed?.tail).toBe("refais-le");
  });

  it("garde le passage tel quel même s'il contient des guillemets", () => {
    const parsed = parseAnnotationBlock(buildAnnotationBlock([an("il dit « oui » ici", "ah bon")]));
    expect(parsed?.items[0].text).toBe("il dit « oui » ici");
  });

  it("rend null sur un message ordinaire", () => {
    expect(parseAnnotationBlock("Reprends la méthode.")).toBeNull();
    expect(parseAnnotationBlock("")).toBeNull();
  });

  it("rend null si la forme dérive — jamais un rendu partiel", () => {
    // en-tête seul, sans entrée
    expect(parseAnnotationBlock("Annotations sur ma réponse :")).toBeNull();
    // numérotation qui ne se suit pas
    expect(parseAnnotationBlock(
      "Annotations sur ma réponse :\n[2] « le seuil »\n    → trop vague",
    )).toBeNull();
    // entrée sans sa ligne de commentaire
    expect(parseAnnotationBlock("Annotations sur ma réponse :\n[1] « le seuil »")).toBeNull();
    // un message qui commence par la même phrase sans être le bloc
    expect(parseAnnotationBlock(
      "Annotations sur ma réponse :\nregarde le paragraphe 3",
    )).toBeNull();
  });

  it("l'en-tête doit être la PREMIÈRE ligne, pas une ligne quelconque", () => {
    expect(parseAnnotationBlock("salut\nAnnotations sur ma réponse :\n[1] « x »\n    → y")).toBeNull();
  });
});
