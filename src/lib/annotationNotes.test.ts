// Notes d'une figure annotée (galerie → chat, 2026-09-04). Le message construit
// par le serveur d'annotation portait déjà les notes ; rien ne les affichait.
import { describe, expect, it } from "vitest";
import { parseAnnotationNotes } from "./annotationNotes";

const AVEC_ACCENTS = `annotations/demo_annot_20260711-180813.png
Annotations (badges numérotés sur l'image) :
1. déplacer la carte
2. l'axe des années déborde
Applique directement ces annotations : retrouve le script qui génère cette figure, fais les corrections demandées et régénère la figure.`;

describe("parseAnnotationNotes", () => {
  it("lit les notes numérotées et s'arrête à la consigne", () => {
    expect(parseAnnotationNotes(AVEC_ACCENTS)).toEqual([
      { n: 1, text: "déplacer la carte" },
      { n: 2, text: "l'axe des années déborde" },
    ]);
  });

  // Le serveur Rust écrit l'en-tête SANS accents (main.rs), les versions plus
  // anciennes AVEC : les deux doivent passer.
  it("accepte l'en-tête sans accents", () => {
    const sans = "annotations/x.png\nAnnotations (badges numerotes sur l'image) :\n1. recadrer";
    expect(parseAnnotationNotes(sans)).toEqual([{ n: 1, text: "recadrer" }]);
  });

  it("garde l'ordre des badges même si la numérotation saute", () => {
    const saute = "annotations/x.png\nAnnotations (badges numerotes sur l'image) :\n2. b\n5. e";
    expect(parseAnnotationNotes(saute)).toEqual([
      { n: 2, text: "b" },
      { n: 5, text: "e" },
    ]);
  });

  it("ne renvoie rien sans bloc d'annotations", () => {
    expect(parseAnnotationNotes("annotations/x.png")).toBeUndefined();
    expect(parseAnnotationNotes("1. pas d'en-tête")).toBeUndefined();
    expect(parseAnnotationNotes("")).toBeUndefined();
  });

  // Une note peut être longue : elle ne doit pas gonfler la carte sans fin.
  it("borne le texte d'une note", () => {
    const longue = `x.png\nAnnotations (badges numerotes sur l'image) :\n1. ${"a".repeat(400)}`;
    const notes = parseAnnotationNotes(longue);
    expect(notes?.[0].text.length).toBeLessThanOrEqual(240);
  });
});
