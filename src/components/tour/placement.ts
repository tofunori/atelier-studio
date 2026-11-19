// Où poser la carte de la visite guidée, à côté de sa cible. Pur, testé.

export type TourRect = { left: number; top: number; width: number; height: number };
export type Side = "right" | "left" | "below" | "below-end" | "above" | "inside";

/** distance carte-cible, et marge minimale au bord de la fenêtre */
export const GAP = 12;
export const EDGE = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fits(left: number, top: number, card: { w: number; h: number }, view: { w: number; h: number }): boolean {
  return left >= EDGE && top >= EDGE && left + card.w <= view.w - EDGE && top + card.h <= view.h - EDGE;
}

/** Coin bas droit : invitation, fin, et cible introuvable. */
export function cornerPosition(view: { w: number; h: number }, card: { w: number; h: number }) {
  return { left: Math.max(EDGE, view.w - EDGE - card.w), top: Math.max(EDGE, view.h - EDGE - card.h) };
}

export function placeCard(
  target: TourRect | null,
  sides: Side[],
  view: { w: number; h: number },
  card: { w: number; h: number },
): { left: number; top: number } {
  if (!target) return cornerPosition(view, card);
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const alignTop = clamp(target.top, EDGE, view.h - EDGE - card.h);
  const alignLeft = clamp(target.left, EDGE, view.w - EDGE - card.w);
  for (const side of sides) {
    let left: number;
    let top: number;
    switch (side) {
      case "right": left = right + GAP; top = alignTop; break;
      case "left": left = target.left - GAP - card.w; top = alignTop; break;
      case "below": left = alignLeft; top = bottom + GAP; break;
      case "below-end": left = clamp(right - card.w, EDGE, view.w - EDGE - card.w); top = bottom + GAP; break;
      case "above": left = alignLeft; top = target.top - GAP - card.h; break;
      case "inside":
        // grand panneau : en bas à gauche, dedans, pour ne rien masquer
        // d'autre que lui-même
        left = target.left + EDGE;
        top = bottom - EDGE - card.h;
        if (card.w + 2 * EDGE > target.width || card.h + 2 * EDGE > target.height) continue;
        break;
    }
    if (fits(left, top, card, view)) return { left, top };
  }
  return cornerPosition(view, card);
}
