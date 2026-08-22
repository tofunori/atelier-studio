import { describe, expect, it } from "vitest";
import { buildAnnotationBlock, migrateMarks, type Mark } from "./annotations";

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
