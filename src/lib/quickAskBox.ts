// Géométrie du redimensionnement de la fenêtre Quick Ask.
//
// Elle ne se prenait que par le coin bas-droit ; une vraie fenêtre se prend
// par ses huit côtés. Tirer par la gauche ou par le haut déplace l'origine
// EN MÊME TEMPS que la taille — d'où le calcul isolé ici, avec son piège :
// une fois le minimum atteint, le bord opposé doit rester planté, sinon la
// fenêtre glisse sous le curseur au lieu de s'arrêter.
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Rect = { left: number; top: number; right: number; bottom: number };
type Box = { x: number; y: number; w: number; h: number };

export function resizeBox(
  start: Rect,
  edge: ResizeEdge,
  pointer: { x: number; y: number },
  min: { w: number; h: number },
): Box {
  let x = start.left;
  let y = start.top;
  let w = start.right - start.left;
  let h = start.bottom - start.top;

  if (edge.includes("e")) {
    w = Math.max(min.w, pointer.x - start.left);
  } else if (edge.includes("w")) {
    w = Math.max(min.w, start.right - pointer.x);
    x = start.right - w; // le bord droit ne bouge pas
  }

  if (edge.includes("s")) {
    h = Math.max(min.h, pointer.y - start.top);
  } else if (edge.includes("n")) {
    h = Math.max(min.h, start.bottom - pointer.y);
    y = start.bottom - h; // le bord bas ne bouge pas
  }

  return { x, y, w, h };
}
