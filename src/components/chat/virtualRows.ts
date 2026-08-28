// LegendList re-rend une rangée dès que l'IDENTITÉ de son item change
// (Object.is) — or virtualItems reconstruit des objets neufs à chaque render.
// Le réducteur réutilisant les objets event inchangés, un shallow-equal
// suffit à réutiliser l'objet rangée précédent, et les deltas du stream ne
// coûtent plus qu'UNE rangée re-rendue (la bulle en cours) au lieu de ≥12.
import type { TimelineVirtualItem } from "./ChatTimeline";

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export function sameVirtualRow(a: TimelineVirtualItem, b: TimelineVirtualItem): boolean {
  if (a.type !== b.type) return false;
  const ia = (a as { item?: Record<string, unknown> }).item;
  const ib = (b as { item?: Record<string, unknown> }).item;
  if (!ia || !ib) return ia === ib;
  return shallowEqual(ia, ib);
}

export function stabilizeVirtualRows(
  prev: Map<string, TimelineVirtualItem>,
  next: TimelineVirtualItem[],
): TimelineVirtualItem[] {
  return next.map((rowItem) => {
    const old = prev.get(rowItem.key);
    return old && sameVirtualRow(old, rowItem) ? old : rowItem;
  });
}
