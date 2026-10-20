// Figure annotée (galerie → chat) : l'enveloppe envoyée à l'agent devient une
// carte, la bulle ne garde que le texte tapé (2026-10-20).
import { describe, expect, it } from "vitest";
import { parseFigureNotes } from "./figureAnnotation";
import { splitFigureEnvelopes } from "./figureEnvelope";

const PREVIEW = ".fig_thumbs/annotation-previews/figS_snowpack_alaska_annot_1792458432712055000.png";
const ENVELOPPE = `${PREVIEW}
Annotations (badges numerotes sur l'image) :
1. est-ce que 2012 est reconnu pour une année neigeuse?
2. ajouter la moyenne
Figure source : /Users/tofunori/Doctorat/figures/supp/figS_snowpack_alaska.png
Version affichée : v1 (SHA-256 db6186444a4a25b0c4f18d1b789e564aca1ee38cc8f2adc8fd904a0f29981c1e). La pièce jointe correspond à cette version ; le fichier source peut avoir changé.
Recette de la figure : /Users/tofunori/Doctorat/figures/supp/figS_snowpack_alaska.png.prov.json
Commande : python plot.py
Applique directement ces annotations : modifie ce script.`;

describe("splitFigureEnvelopes", () => {
  it("tire la figure de l'enveloppe et ne laisse rien dans la bulle", () => {
    const { prompt, figures } = splitFigureEnvelopes(ENVELOPPE);
    expect(prompt).toBe("");
    expect(figures).toEqual([{ preview: PREVIEW, name: "figS_snowpack_alaska.png", text: ENVELOPPE }]);
    expect(parseFigureNotes(figures[0].text)).toEqual([
      { n: 1, text: "est-ce que 2012 est reconnu pour une année neigeuse?" },
      { n: 2, text: "ajouter la moyenne" },
    ]);
  });

  it("garde le texte tapé, avant ou après l'enveloppe", () => {
    expect(splitFigureEnvelopes(`Compare avec SNOTEL.\n\n${ENVELOPPE}`).prompt).toBe("Compare avec SNOTEL.");
    expect(splitFigureEnvelopes(`${ENVELOPPE}\n\nCompare avec SNOTEL.`).prompt).toBe("Compare avec SNOTEL.");
  });

  it("lit l'ancien format annotations/ et plusieurs figures", () => {
    const ancienne = "annotations/demo_annot_20260711-180813.png\nAnnotations (badges numérotés sur l'image) :\n1. recadrer";
    const { figures } = splitFigureEnvelopes(`${ancienne}\n\n${ENVELOPPE}`);
    expect(figures.map((f) => f.name)).toEqual(["demo_annot_20260711-180813.png", "figS_snowpack_alaska.png"]);
    expect(parseFigureNotes(figures[0].text)).toEqual([{ n: 1, text: "recadrer" }]);
  });

  it("laisse intact un texte ordinaire qui cite un chemin", () => {
    const texte = "Regarde annotations/x_annot_1.png\net dis-moi.";
    expect(splitFigureEnvelopes(texte)).toEqual({ prompt: texte, figures: [] });
  });
});

it("rattache la suite d'une note sur plusieurs lignes", () => {
  const multi = "annotations/x_annot_1.png\nAnnotations (badges numerotes sur l'image) :\n1. première ligne\nsuite\nFigure source : /a/x.png";
  expect(parseFigureNotes(multi)).toEqual([{ n: 1, text: "première ligne suite" }]);
});
