/** Commentaires du relecteur, « un commentaire à la fois » (maquette
 *  « annotations épurées » v8, Thierry 2026-11-12) : RIEN n'est inséré dans
 *  le texte. Chaque commentaire a son numéro dans la marge, sur la ligne de
 *  son passage ; le commentaire ouvert flotte dans une bulle sous le passage,
 *  sans déplacer le texte.
 *
 *  Une couche posée sur l'éditeur (hors du contenu de CodeMirror : ses
 *  mutations ne touchent ni le document ni la sélection) suit les marques du
 *  texte (`[data-texc]`) : elle se replace au défilement, au redimensionnement
 *  et quand l'éditeur redessine ses lignes. Seuls les passages rendus à
 *  l'écran ont leur numéro.
 *
 *  La couche est le PREMIER enfant de l'éditeur et porte seule ses classes
 *  (`is-on`, `is-open`) : CodeMirror réécrit les classes de son élément
 *  racine, et le CSS atteint le texte par `~` (jamais de :has(), voir
 *  docs/PIEGES_CONNUS.md). */

export interface ReviewerOverlayItem {
  id: string;
  number: number;
  tone: string;
  done: boolean;
  unread: boolean;
  /** Nom de l'état et commentaire, au survol du numéro. */
  title: string;
  /** Ligne du passage (base 0) : les commentaires d'une même ligne se
   *  rangent côte à côte, la marge s'élargit pour eux. */
  line: number;
  /** Une de ses retouches (suivi des modifications) : un crayon, pas un numéro. */
  edit?: boolean;
}

export interface ReviewerOverlayHost {
  wrapper(): HTMLElement | null;
  items(): ReviewerOverlayItem[];
  activeId(): string | null;
  open(id: string | null): void;
  /** Bulle du commentaire ouvert ; `key` change quand elle doit se refaire. */
  bubble(id: string): {key: string; build(): HTMLElement} | null;
}

export interface ReviewerOverlay {
  /** Reprend la liste, l'état des numéros et la bulle, puis replace. */
  sync(): void;
  /** Replace seulement (défilement, nouvelle mise en page). */
  schedule(): void;
  /** La bulle ouverte, s'il y en a une. */
  bubble(): HTMLElement | null;
}

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.4 6.6 11.4 12.5 4.8"/></svg>';
const PEN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12.6h3.4M9.6 3.6l2.8 2.8-6 6H3.6V9.6z"/></svg>';
const RING = 20;
const quote = (id: string): string => id.replace(/["\\]/g, "\\$&");
const STEP = 24;

export function createReviewerOverlay(doc: Document, win: Window, host: ReviewerOverlayHost): ReviewerOverlay {
  let layer: HTMLElement | null = null;
  let wrap: HTMLElement | null = null;
  let observed: Element | null = null;
  let pop: HTMLElement | null = null;
  let popKey = "";
  let popId: string | null = null;
  let frame = 0;
  const rings = new Map<string, HTMLButtonElement>();
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => schedule()) : null;
  const mutations = typeof MutationObserver === "function" ? new MutationObserver(() => schedule()) : null;
  const onScroll = (): void => schedule();

  function attach(): boolean {
    const next = host.wrapper();
    if (!next) return false;
    if (next === wrap && layer?.parentElement === next) return true;
    if (wrap) wrap.removeEventListener("scroll", onScroll, true);
    resize?.disconnect();
    mutations?.disconnect();
    layer?.remove();
    rings.clear();
    pop = null; popKey = ""; popId = null; observed = null;
    wrap = next;
    layer = doc.createElement("div");
    layer.className = "texv-layer";
    wrap.prepend(layer);
    wrap.addEventListener("scroll", onScroll, {capture: true, passive: true});
    resize?.observe(wrap);
    return true;
  }

  function schedule(): void {
    if (frame) return;
    if (typeof win.requestAnimationFrame !== "function") { layout(); return; }
    frame = win.requestAnimationFrame(() => { frame = 0; layout(); });
  }

  function sync(): void {
    const items = host.items();
    if (!items.length && !layer) return;
    if (!attach() || !layer || !wrap) return;
    layer.classList.toggle("is-on", items.length > 0);
    const perLine = new Map<number, number>();
    for (const item of items) perLine.set(item.line, (perLine.get(item.line) || 0) + 1);
    const widest = Math.min(3, Math.max(0, ...perLine.values()));
    layer.classList.toggle("is-w2", widest === 2);
    layer.classList.toggle("is-w3", widest === 3);
    const active = host.activeId();
    const known = new Set(items.map(item => item.id));
    for (const [id, ring] of rings) if (!known.has(id)) { ring.remove(); rings.delete(id); }
    for (const item of items) {
      let ring = rings.get(item.id);
      if (!ring) {
        ring = doc.createElement("button");
        ring.type = "button";
        ring.dataset.texa = item.id;
        ring.addEventListener("mousedown", event => event.preventDefault());
        ring.addEventListener("click", event => {
          event.stopPropagation();
          host.open(host.activeId() === item.id ? null : item.id);
        });
        layer.appendChild(ring);
        rings.set(item.id, ring);
      }
      ring.className = `atelier-annotation-number is-reviewer texv-mk tone-${item.tone}${item.done ? " is-done" : ""}${item.edit ? " is-edit" : ""}`
        + `${active === item.id ? " is-on" : ""}${item.unread ? " is-unread" : ""}`;
      ring.title = item.title;
      ring.setAttribute("aria-label", `${item.edit ? "Modification" : "Commentaire"} ${item.number}`);
      ring.setAttribute("aria-expanded", String(active === item.id));
      const content = item.done ? CHECK : item.edit ? PEN : String(item.number);
      if (ring.dataset.content !== content) { ring.innerHTML = content; ring.dataset.content = content; }
    }
    const bubble = active && known.has(active) ? host.bubble(active) : null;
    layer.classList.toggle("is-open", Boolean(bubble));
    if (!bubble) { pop?.remove(); pop = null; popKey = ""; popId = null; }
    else if (!pop || bubble.key !== popKey) {
      const fresh = popId !== active;
      const focused = pop?.contains(doc.activeElement) ? doc.activeElement : null;
      const next = bubble.build();
      if (!fresh) next.classList.add("is-kept");
      if (pop) pop.replaceWith(next); else layer.appendChild(next);
      pop = next; popKey = bubble.key; popId = active;
      const input = pop.querySelector<HTMLTextAreaElement>(".texv-cmp-t");
      if (input && (fresh || focused || !pop.dataset.focused)) {
        input.focus({preventScroll: true});
        input.setSelectionRange(input.value.length, input.value.length);
        pop.dataset.focused = "1";
      }
    }
    layout();
  }

  function visible(rect: DOMRect | undefined, bounds: DOMRect): rect is DOMRect {
    return Boolean(rect && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom);
  }

  function layout(): void {
    if (!wrap || !layer || !wrap.isConnected) return;
    const content = wrap.querySelector<HTMLElement>(".cm-content");
    if (content && content !== observed) {
      mutations?.disconnect();
      mutations?.observe(content, {childList: true, subtree: true});
      observed = content;
    }
    const wr = wrap.getBoundingClientRect();
    const scroller = wrap.querySelector<HTMLElement>(".cm-scroller") || wrap;
    const bounds = scroller.getBoundingClientRect();
    const textLeft = (content?.getBoundingClientRect().left ?? wr.left) - wr.left;
    const rows = new Map<number, Array<{ring: HTMLButtonElement; top: number; number: number}>>();
    const items = host.items();
    const numbers = new Map(items.map(item => [item.id, item.number]));
    for (const [id, ring] of rings) {
      const span = wrap.querySelector<HTMLElement>(`.cm-content [data-texc="${quote(id)}"]`);
      const rect = span?.getClientRects()[0];
      if (!visible(rect, bounds)) { ring.hidden = true; continue; }
      ring.hidden = false;
      const top = Math.round(rect.top - wr.top + (rect.height - RING) / 2);
      const key = Math.round(top / 8);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ring, top, number: numbers.get(id) || 0});
    }
    // Plusieurs commentaires sur une ligne : côte à côte, dans l'ordre.
    for (const row of rows.values()) {
      row.sort((a, b) => a.number - b.number);
      row.forEach(({ring, top}, index) => {
        ring.style.top = `${top}px`;
        ring.style.left = `${Math.round(textLeft + 4 + Math.min(index, 2) * STEP)}px`;
      });
    }
    if (!pop || !popId) return;
    const spans = wrap.querySelectorAll<HTMLElement>(`.cm-content [data-texc="${quote(popId)}"]`);
    const firstRects = spans[0]?.getClientRects();
    const lastRects = spans[spans.length - 1]?.getClientRects();
    const first = firstRects?.[0];
    const last = lastRects?.[lastRects.length - 1];
    if (!visible(first, bounds) && !visible(last, bounds)) { pop.style.visibility = "hidden"; return; }
    pop.style.visibility = "";
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const maxLeft = Math.max(8, wrap.clientWidth - width - 8);
    const anchor = last || first!;
    const left = Math.max(Math.min(textLeft, maxLeft), Math.min(anchor.left - wr.left - 16, maxLeft));
    let top = anchor.bottom - wr.top + 8;
    const roomBelow = bounds.bottom - wr.top - 8;
    if (top + height > roomBelow && first && first.top - wr.top - height - 8 >= bounds.top - wr.top) top = first.top - wr.top - height - 8;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  win.addEventListener("resize", schedule);
  return {sync, schedule, bubble: () => pop};
}
