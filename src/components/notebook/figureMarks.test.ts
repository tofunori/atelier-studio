import { describe, expect, it } from "vitest";
import { arrowHead, createMark, figureNotesText, pinAt } from "./figureMarks";

describe("createMark", () => {
  it("range un cadre du coin haut gauche au coin bas droit, en fractions", () => {
    expect(createMark("rect", { x: 80, y: 60 }, { x: 20, y: 10 }, 100, 200)).toEqual({
      tool: "rect",
      x1: 0.2,
      y1: 0.05,
      x2: 0.8,
      y2: 0.3,
    });
  });

  it("borne la marque à l'image", () => {
    const m = createMark("ellipse", { x: -10, y: 50 }, { x: 140, y: 250 }, 100, 200);
    expect(m).toMatchObject({ x1: 0, y1: 0.25, x2: 1, y2: 1 });
  });

  it("refuse une marque de moins de 3 px, garde le sens d'une flèche", () => {
    expect(createMark("rect", { x: 10, y: 10 }, { x: 12, y: 40 }, 100, 100)).toBeNull();
    expect(createMark("arrow", { x: 10, y: 10 }, { x: 11, y: 11 }, 100, 100)).toBeNull();
    expect(createMark("arrow", { x: 90, y: 90 }, { x: 10, y: 10 }, 100, 100)).toMatchObject({ x1: 0.9, x2: 0.1 });
  });

  it("un point ne dépend que du premier appui", () => {
    expect(createMark("point", { x: 25, y: 50 }, { x: 99, y: 99 }, 100, 100)).toEqual({
      tool: "point",
      x1: 0.25,
      y1: 0.5,
      x2: 0.25,
      y2: 0.5,
    });
  });
});

describe("pinAt et arrowHead", () => {
  it("pose le numéro au coin d'un cadre, au départ d'une flèche", () => {
    expect(pinAt({ tool: "rect", x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.7 })).toEqual({ x: 0.2, y: 0.3 });
    expect(pinAt({ tool: "arrow", x1: 0.9, y1: 0.1, x2: 0.2, y2: 0.8 })).toEqual({ x: 0.9, y: 0.1 });
  });

  it("la pointe part du bout de la flèche", () => {
    const [tip, left, right] = arrowHead(0, 0, 100, 0, 10);
    expect(tip).toEqual([100, 0]);
    expect(left[0]).toBeLessThan(100);
    expect(right[0]).toBeLessThan(100);
    expect(Math.sign(left[1])).toBe(-Math.sign(right[1]));
  });
});

describe("figureNotesText", () => {
  it("donne la figure puis les notes dans l'ordre des numéros", () => {
    const text = figureNotesText("essai.ipynb · Out[6]", [
      { n: 1, note: " pente trop forte " },
      { n: 2, note: "ici" },
    ]);
    expect(text.split("\n")).toEqual([
      expect.stringContaining("essai.ipynb · Out[6]"),
      "1. pente trop forte",
      "2. ici",
    ]);
  });
});
