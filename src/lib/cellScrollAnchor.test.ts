import { describe, expect, it } from "vitest";
import { anchorDrift, attachCellScrollAnchor, pickAnchor } from "./cellScrollAnchor";

// jsdom n'a pas de mise en page : chaque cellule porte sa position à l'écran.
function scene(tops: number[], height = 100) {
  const scroller = document.createElement("div");
  const content = document.createElement("div");
  scroller.append(content);
  const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON() {} }) as DOMRect;
  scroller.getBoundingClientRect = () => rect(0, 400);
  const cells = tops.map((top, i) => {
    const el = document.createElement("article");
    el.className = "nb-cell";
    el.dataset.cellId = `c${i + 1}`;
    let current = top;
    el.getBoundingClientRect = () => rect(current, height);
    content.append(el);
    return { el, move: (dy: number) => { current += dy; } };
  });
  return { scroller, content, cells };
}

describe("ancrage du défilement des cellules", () => {
  it("prend la première cellule qui commence dans la vue, pas celle coupée par le haut", () => {
    const { scroller } = scene([-60, 50, 160]);
    expect(pickAnchor(scroller, ".nb-cell")).toEqual({ id: "c2", top: 50 });
  });

  it("à défaut, garde la cellule qui chevauche le haut de la vue", () => {
    const { scroller } = scene([-60], 600);
    expect(pickAnchor(scroller, ".nb-cell")).toEqual({ id: "c1", top: -60 });
  });

  it("mesure le glissement de l'ancre quand une sortie au-dessus grandit", () => {
    const { scroller, cells } = scene([-60, 50, 160]);
    const anchor = pickAnchor(scroller, ".nb-cell");
    cells[1].move(180);
    cells[2].move(180);
    expect(anchorDrift(scroller, ".nb-cell", anchor)).toBe(180);
  });

  it("rattrape le glissement au redimensionnement du contenu", () => {
    const { scroller, content, cells } = scene([-60, 50, 160]);
    let observed: ResizeObserverCallback | null = null;
    const Original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) { observed = cb; }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    try {
      const detach = attachCellScrollAnchor(scroller, content, ".nb-cell");
      cells[1].move(-240);
      cells[2].move(-240);
      // scrollTop ne descend pas sous 0 dans jsdom : on part d'une vue défilée.
      scroller.scrollTop = 1000;
      observed!([], {} as ResizeObserver);
      expect(scroller.scrollTop).toBe(760);
      detach();
    } finally {
      globalThis.ResizeObserver = Original;
    }
  });
});
