import { describe, expect, it } from "vitest";
import { resizeBox } from "./quickAskBox";

// fenêtre de départ : 640×400 posée à (100, 50)
const depart = { left: 100, top: 50, right: 740, bottom: 450 };
const min = { w: 380, h: 240 };

describe("resizeBox", () => {
  it("élargit par le bord droit sans bouger l'origine", () => {
    expect(resizeBox(depart, "e", { x: 900, y: 999 }, min))
      .toEqual({ x: 100, y: 50, w: 800, h: 400 });
  });

  it("élargit par le bord gauche en reculant l'origine", () => {
    expect(resizeBox(depart, "w", { x: 40, y: 999 }, min))
      .toEqual({ x: 40, y: 50, w: 700, h: 400 });
  });

  it("allonge par le bas", () => {
    expect(resizeBox(depart, "s", { x: 999, y: 600 }, min))
      .toEqual({ x: 100, y: 50, w: 640, h: 550 });
  });

  it("allonge par le haut en remontant l'origine", () => {
    expect(resizeBox(depart, "n", { x: 999, y: 10 }, min))
      .toEqual({ x: 100, y: 10, w: 640, h: 440 });
  });

  it("le coin bas-droit agit sur les deux axes", () => {
    expect(resizeBox(depart, "se", { x: 900, y: 600 }, min))
      .toEqual({ x: 100, y: 50, w: 800, h: 550 });
  });

  it("le coin haut-gauche agit sur les deux axes et l'origine", () => {
    expect(resizeBox(depart, "nw", { x: 40, y: 10 }, min))
      .toEqual({ x: 40, y: 10, w: 700, h: 440 });
  });

  // Le piège du redimensionnement par la gauche : une fois la largeur
  // minimale atteinte, le bord droit doit rester planté. Sinon la fenêtre
  // se met à glisser sous le curseur au lieu de s'arrêter.
  it("bloque au minimum sans laisser la fenêtre glisser vers la gauche", () => {
    const box = resizeBox(depart, "w", { x: 700, y: 999 }, min);
    expect(box.w).toBe(380);
    expect(box.x + box.w).toBe(740);
  });

  it("bloque au minimum sans laisser la fenêtre glisser vers le haut", () => {
    const box = resizeBox(depart, "n", { x: 999, y: 400 }, min);
    expect(box.h).toBe(240);
    expect(box.y + box.h).toBe(450);
  });

  it("un bord vertical ne touche jamais à l'horizontale", () => {
    const box = resizeBox(depart, "n", { x: 5, y: 10 }, min);
    expect(box.x).toBe(100);
    expect(box.w).toBe(640);
  });

  it("un bord horizontal ne touche jamais à la verticale", () => {
    const box = resizeBox(depart, "e", { x: 900, y: 5 }, min);
    expect(box.y).toBe(50);
    expect(box.h).toBe(400);
  });
});
