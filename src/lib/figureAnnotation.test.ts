// Figure annotée (galerie → chat) : l'enveloppe envoyée à l'agent devient une
// carte, la bulle ne garde que le texte tapé (2026-10-20).
import { describe, expect, it } from "vitest";
import { figureSourceLabel, parseFigureEnvelope } from "./figureAnnotation";
import { splitFigureEnvelopes } from "./figureEnvelope";

const splitFigureAnnotations = (text: string) => {
  const { prompt, figures } = splitFigureEnvelopes(text);
  return { prompt, figures: figures.map((f) => parseFigureEnvelope(f.text)!), names: figures.map((f) => f.name) };
};

const ENVELOPPE = `.fig_thumbs/annotation-previews/figS_snowpack_alaska_annot_1792458432712055000.png
Annotations (badges numerotes sur l'image) :
1. est-ce que 2012 est reconnu pour une année neigeuse?
2. ajouter la moyenne
Figure source : /Users/tofunori/Doctorat/figures/supp/figS_snowpack_alaska.png
Version affichée : v1 (SHA-256 db6186444a4a25b0c4f18d1b789e564aca1ee38cc8f2adc8fd904a0f29981c1e). La pièce jointe correspond à cette version ; le fichier source peut avoir changé.
Recette de la figure : /Users/tofunori/Doctorat/figures/supp/figS_snowpack_alaska.png.prov.json
Commande : python plot.py
Applique directement ces annotations : modifie ce script.`;

describe("splitFigureAnnotations", () => {
  it("tire la carte de l'enveloppe et ne laisse rien dans la bulle", () => {
    const { prompt, figures } = splitFigureAnnotations(ENVELOPPE);
    expect(prompt).toBe("");
    expect(figures).toEqual([{
      preview: ".fig_thumbs/annotation-previews/figS_snowpack_alaska_annot_1792458432712055000.png",
      notes: [
        { n: 1, text: "est-ce que 2012 est reconnu pour une année neigeuse?" },
        { n: 2, text: "ajouter la moyenne" },
      ],
      source: "/Users/tofunori/Doctorat/figures/supp/figS_snowpack_alaska.png",
      version: "v1",
      hash: "db6186444a4a25b0c4f18d1b789e564aca1ee38cc8f2adc8fd904a0f29981c1e",
    }]);
    expect(splitFigureAnnotations(ENVELOPPE).names).toEqual(["figS_snowpack_alaska.png"]);
  });

  it("garde le texte tapé, avant ou après l'enveloppe", () => {
    expect(splitFigureAnnotations(`Compare avec SNOTEL.\n\n${ENVELOPPE}`).prompt).toBe("Compare avec SNOTEL.");
    expect(splitFigureAnnotations(`${ENVELOPPE}\n\nCompare avec SNOTEL.`).prompt).toBe("Compare avec SNOTEL.");
  });

  it("lit l'ancien format annotations/ et plusieurs figures", () => {
    const ancienne = "annotations/demo_annot_20260711-180813.png\nAnnotations (badges numérotés sur l'image) :\n1. recadrer";
    const { figures, names } = splitFigureAnnotations(`${ancienne}\n\n${ENVELOPPE}`);
    expect(names).toEqual(["demo_annot_20260711-180813.png", "figS_snowpack_alaska.png"]);
    expect(figures[0].notes).toEqual([{ n: 1, text: "recadrer" }]);
  });

  it("laisse intact un texte ordinaire qui cite un chemin", () => {
    const texte = "Regarde annotations/x_annot_1.png\net dis-moi.";
    expect(splitFigureEnvelopes(texte)).toEqual({ prompt: texte, figures: [] });
  });

  it("rattache la suite d'une note sur plusieurs lignes", () => {
    const multi = "annotations/x_annot_1.png\nAnnotations (badges numerotes sur l'image) :\n1. première ligne\nsuite\nFigure source : /a/x.png";
    expect(splitFigureAnnotations(multi).figures[0].notes).toEqual([{ n: 1, text: "première ligne suite" }]);
  });
});

it("abrège le dossier personnel", () => {
  expect(figureSourceLabel("/Users/tofunori/Doctorat/x.png")).toBe("~/Doctorat/x.png");
});
