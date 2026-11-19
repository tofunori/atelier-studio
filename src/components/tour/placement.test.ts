import { describe, expect, it } from "vitest";
import { EDGE, GAP, placeCard } from "./placement";

const view = { w: 1280, h: 800 };
const card = { w: 272, h: 150 };

describe("placeCard", () => {
  it("sans cible, la carte se pose en bas à droite", () => {
    expect(placeCard(null, ["right"], view, card)).toEqual({ left: 1280 - EDGE - 272, top: 800 - EDGE - 150 });
  });

  it("à droite de la cible, alignée sur son haut", () => {
    const target = { left: 0, top: 40, width: 240, height: 48 };
    expect(placeCard(target, ["right"], view, card)).toEqual({ left: 240 + GAP, top: 40 });
  });

  it("au-dessus du composer quand il touche le bas", () => {
    const target = { left: 260, top: 690, width: 500, height: 90 };
    expect(placeCard(target, ["above", "right"], view, card)).toEqual({ left: 260, top: 690 - GAP - 150 });
  });

  it("dans un grand panneau, en bas à gauche", () => {
    const target = { left: 640, top: 44, width: 640, height: 756 };
    expect(placeCard(target, ["inside"], view, card)).toEqual({ left: 640 + EDGE, top: 800 - EDGE - 150 });
  });

  it("sous un bouton du coin haut droit, alignée sur sa droite", () => {
    const target = { left: 1150, top: 8, width: 28, height: 28 };
    expect(placeCard(target, ["below-end"], view, card)).toEqual({ left: 1178 - 272, top: 36 + GAP });
  });

  it("passe au côté suivant quand le premier déborde", () => {
    const target = { left: 1100, top: 300, width: 100, height: 40 };
    expect(placeCard(target, ["right", "left"], view, card)).toEqual({ left: 1100 - GAP - 272, top: 300 });
  });

  it("un panneau trop petit pour la carte n'est pas utilisé de l'intérieur", () => {
    const target = { left: 600, top: 300, width: 200, height: 120 };
    expect(placeCard(target, ["inside"], view, card)).toEqual({ left: 1280 - EDGE - 272, top: 800 - EDGE - 150 });
  });
});
