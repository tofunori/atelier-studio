// Ancrage du défilement d'une liste de cellules, fait à la main.
//
// WebKit (donc Atelier sur Mac) n'a pas d'ancrage natif (`overflow-anchor`) :
// quand une sortie au-dessus de la vue grandit ou rétrécit (Tout exécuter,
// figure qui se charge), la page glissait et l'on se retrouvait sur une autre
// cellule. Ici, la première cellule visible garde sa place à l'écran, sur
// tous les moteurs (le natif est coupé en CSS pour ne pas compenser deux fois).

export type ScrollAnchor = { id: string; top: number };

/** Première cellule qui commence dans la vue (sinon celle qui la chevauche) :
 *  une cellule coupée par le haut peut grandir sous son titre, et c'est ce
 *  qui la suit qu'on regarde. */
export function pickAnchor(scroller: HTMLElement, selector: string): ScrollAnchor | null {
  const box = scroller.getBoundingClientRect();
  let straddling: ScrollAnchor | null = null;
  for (const el of scroller.querySelectorAll<HTMLElement>(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= box.top || !el.dataset.cellId) continue;
    const anchor = { id: el.dataset.cellId, top: rect.top - box.top };
    if (rect.top >= box.top && rect.top < box.bottom) return anchor;
    straddling ??= anchor;
    if (rect.top >= box.bottom) break;
  }
  return straddling;
}

/** Décalage à rattraper pour que l'ancre retrouve sa place (0 : rien à faire). */
export function anchorDrift(scroller: HTMLElement, selector: string, anchor: ScrollAnchor | null): number {
  if (!anchor) return 0;
  const el = Array.from(scroller.querySelectorAll<HTMLElement>(selector)).find((c) => c.dataset.cellId === anchor.id);
  if (!el) return 0;
  const drift = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.top;
  return Math.abs(drift) >= 1 ? drift : 0;
}

/** Garde la première cellule visible immobile quand le contenu change de taille. */
export function attachCellScrollAnchor(scroller: HTMLElement, content: HTMLElement, selector: string): () => void {
  let anchor = pickAnchor(scroller, selector);
  const record = () => {
    anchor = pickAnchor(scroller, selector);
  };
  const restore = () => {
    const drift = anchorDrift(scroller, selector, anchor);
    if (drift) scroller.scrollTop += drift;
    record();
  };
  scroller.addEventListener("scroll", record, { passive: true });
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
  observer?.observe(content);
  return () => {
    scroller.removeEventListener("scroll", record);
    observer?.disconnect();
  };
}
