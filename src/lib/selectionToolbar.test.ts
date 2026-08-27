import { describe, expect, it } from "vitest";
import { clampToolbarLeft } from "./selectionToolbar";

// colonne de chat entre x=100 et x=900 ; barre de 340px ; gouttière de 8px
const bounds = { left: 100, right: 900 };
const W = 340;

describe("clampToolbarLeft", () => {
  it("laisse la barre centrée sur la sélection quand la place suffit", () => {
    expect(clampToolbarLeft(500, W, bounds)).toBe(500);
  });

  it("la repousse vers la droite près du bord gauche", () => {
    // sans bornage la barre déborderait jusqu'à 130 - 170 = -40
    expect(clampToolbarLeft(130, W, bounds)).toBe(278); // 100 + 8 + 170
  });

  it("la retient près du bord droit", () => {
    expect(clampToolbarLeft(880, W, bounds)).toBe(722); // 900 - 8 - 170
  });

  it("ne bouge pas une sélection déjà à la limite", () => {
    expect(clampToolbarLeft(278, W, bounds)).toBe(278);
  });

  it("centre dans la colonne quand la barre est plus large que la place", () => {
    expect(clampToolbarLeft(200, 900, bounds)).toBe(500);
  });

  it("respecte une gouttière donnée", () => {
    expect(clampToolbarLeft(130, W, bounds, 20)).toBe(290); // 100 + 20 + 170
  });

  it("sans largeur mesurée, garde la position de la sélection", () => {
    expect(clampToolbarLeft(130, 0, bounds)).toBe(130);
  });
});
