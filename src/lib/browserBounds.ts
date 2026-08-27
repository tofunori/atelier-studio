// Bounds de la webview NATIVE du navigateur (voir browserBounds.test.ts pour
// le contrat et l'historique du double comptage corrigé le 2026-08-27).
type RectLike = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

export function composeBrowserBounds(input: {
  area: RectLike;
  pane?: RectLike | null;
  surfaces?: RectLike | null;
  chromeBottom?: number | null;
  viewport: RectLike;
}): { x: number; y: number; w: number; h: number } | null {
  const bounds = [input.area, input.pane, input.surfaces, input.viewport]
    .filter(Boolean) as RectLike[];
  const left = Math.max(...bounds.map((b) => b.left));
  const top = Math.max(...bounds.map((b) => b.top), input.chromeBottom ?? 0);
  const right = Math.min(...bounds.map((b) => b.right));
  const bottom = Math.min(...bounds.map((b) => b.bottom));
  if (right - left < 10 || bottom - top < 10) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
