// Position du curseur sous un point de la fenêtre, comptée en caractères
// dans le texte d'un bloc : sert à ouvrir l'édition d'une cellule de cahier
// là où l'on a cliqué.
/** Position (en caractères) du point cliqué dans le texte d'un bloc. */
export function caretOffsetAt(block: HTMLElement, x: number, y: number): number | null {
  const doc = block.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    node = pos?.offsetNode ?? null;
    offset = pos?.offset ?? 0;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  }
  if (!node || !block.contains(node)) return null;
  const before = doc.createRange();
  before.selectNodeContents(block);
  try {
    before.setEnd(node, offset);
  } catch {
    return null;
  }
  return before.toString().length;
}
