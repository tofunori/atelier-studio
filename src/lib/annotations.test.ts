import { describe, expect, it } from "vitest";
import { buildAnnotationBlock, migrateMarks, parseAnnotationBlock, quoteEdges, snapSelectionToWords, type Mark } from "./annotations";

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

describe("snapSelectionToWords", () => {
  function select(html: string, from: [number, number], to: [number, number]) {
    document.body.innerHTML = `<p>${html}</p>`;
    const nodes = [...document.body.querySelector("p")!.childNodes].flatMap((n) => n.nodeType === Node.TEXT_NODE ? [n] : [...n.childNodes]);
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(nodes[from[0]]!, from[1]);
    range.setEnd(nodes[to[0]]!, to[1]);
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  it("étend un passage coupé en plein mot aux mots entiers, des deux côtés", () => {
    const text = "Ton commentaire rapporte que 1,42 ne découle pas si 19,9 est la hauteur.";
    const sel = select(text, [0, text.indexOf("orte que")], [0, text.indexOf("st la")]);
    snapSelectionToWords(sel);
    expect(sel.toString()).toBe("rapporte que 1,42 ne découle pas si 19,9 est");
  });

  it("ne touche pas une sélection déjà posée sur des frontières de mots", () => {
    const text = "la Q2 qui dit seulement « Bonne justification ».";
    const sel = select(text, [0, 3], [0, text.indexOf(" seulement")]);
    snapSelectionToWords(sel);
    expect(sel.toString()).toBe("Q2 qui dit");
  });

  it("garde l'apostrophe et le trait d'union dans le mot", () => {
    const text = "avec l'annexe du sous-bassin";
    const sel = select(text, [0, text.indexOf("nnexe")], [0, text.indexOf("-bassin") - 2]);
    snapSelectionToWords(sel);
    expect(sel.toString()).toBe("l'annexe du sous-bassin");
  });

  it("étend aussi un bout posé dans un nœud texte en gras", () => {
    const sel = select("le <b>coefficient</b> retenu", [1, 3], [2, 4]);
    snapSelectionToWords(sel);
    expect(sel.toString()).toBe("coefficient retenu");
  });
});

describe("quoteEdges", () => {
  it("ouvre un passage qui commence en cours de phrase et ferme celui qui s'arrête avant sa ponctuation", () => {
    expect(quoteEdges("rapporte que 1,42 si 19,9 est")).toEqual({ open: true, close: true });
  });
  it("laisse une phrase complète telle quelle", () => {
    expect(quoteEdges("Supprimer l'ancienne bulle « remontée du niveau ».")).toEqual({ open: false, close: false });
    expect(quoteEdges("0,5 ?")).toEqual({ open: false, close: false });
  });
});
