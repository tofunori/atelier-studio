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
  // beforeActiveTail (marge du tour actif, ex :has() App.css) vit sur la
  // RANGÉE, pas dans `item` : shallowEqual(ia, ib) ne le verrait donc jamais.
  // Un flip doit invalider le cache au même titre qu'un item changé, sinon
  // LegendList réutilise l'ancienne rangée et la classe avant/après le slot
  // actif reste figée.
  const fa = (a as { beforeActiveTail?: boolean }).beforeActiveTail;
  const fb = (b as { beforeActiveTail?: boolean }).beforeActiveTail;
  if (fa !== fb) return false;
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


// LegendList apprend une hauteur moyenne par type. Une commande compacte
// ne doit pas hériter de la moyenne des longues réponses Markdown.
export function virtualRowType(row: TimelineVirtualItem): string {
  if (row.type !== "rendered") return row.type;
  const item = row.item;
  if (item.type === "fold") return item.open ? "fold-open" : "fold";
  if (item.type !== "event") return item.type;
  const kind = item.event.kind;
  if (kind === "thinking_live" || kind === "thinking") return "thinking";
  if (kind === "streaming" || kind === "text") return "assistant-text";
  return kind;
}
