/** Couche des annotations sur le PDF de la vue scindée (variante B,
 *  2026-11-09) : les notes posées sur le PDF compilé et celles du .tex,
 *  voile franc + trait de la couleur de la note, pastille numérotée dans la
 *  marge de la page. Les pages sont remplacées à chaque mise en page
 *  (pdf_sync.ts) : la couche se repose sur chaque nouveau gabarit. */
import {
  locateOnPage, noteColorName, pageTextItems, pinSide, spreadPins, textBounds,
  type StoredPdfAnnotation,
} from "../annotation_notes";
import type {LatexPdfLayerNote} from "./annotations";

type TextItems = Array<{str?: string; transform?: number[]; width?: number; height?: number}>;

export interface PdfNoteLayerOptions {
  right: HTMLElement;
  notes(): LatexPdfLayerNote[];
  marks(): StoredPdfAnnotation[];
  pageSize(page: number): Promise<{width: number; height: number} | null>;
  pageText(page: number): Promise<TextItems | null>;
  onPick(id: string): void;
  document?: Document;
  window?: Window;
}

export interface PdfNoteLayer {
  redraw(): void;
}

export function createPdfNoteLayer(options: PdfNoteLayerOptions): PdfNoteLayer {
  const doc = options.document || document;
  const win = options.window || window;
  // passage du .tex → rectangles sur sa page (null : introuvable)
  const located = new Map<string, number[][] | null>();
  const bounds = new Map<number, {min: number; max: number}>();
  const pending = new Set<string>();
  let timer: number | null = null;

  const pageBounds = (page: number): {min: number; max: number} => {
    const known = bounds.get(page);
    if (known) return known;
    const key = `bounds|${page}`;
    if (!pending.has(key)) {
      pending.add(key);
      void Promise.all([options.pageText(page), options.pageSize(page)]).then(([items, size]) => {
        if (!items || !size) return;
        const spans = pageTextItems(items, size.height).filter(item => item.str.trim().length > 2)
          .map(item => ({left: item.x, right: item.x + item.width}));
        bounds.set(page, textBounds(spans, size.width));
        schedule();
      }).finally(() => pending.delete(key));
    }
    return {min: 0.12, max: 0.88};
  };
  const rectsOf = (note: LatexPdfLayerNote): number[][] | null => {
    if (note.rects?.length) return note.rects;
    if (!note.page || !note.text) return null;
    const key = `${note.id}|${note.page}|${Math.round(note.top || 0)}|${note.text}`;
    if (located.has(key)) return located.get(key)!;
    if (!pending.has(key)) {
      pending.add(key);
      void Promise.all([options.pageText(note.page), options.pageSize(note.page)]).then(([items, size]) => {
        const rects = items && size ? locateOnPage(pageTextItems(items, size.height), note.text!, note.top ?? null, size) : null;
        located.set(key, rects);
        if (rects) schedule();
      }).finally(() => pending.delete(key));
    }
    return null;
  };

  const veil = (rect: number[], color: string, kind: string): HTMLElement => {
    const element = doc.createElement("div");
    element.className = `atelier-note-veil note-c-${color}${kind === "ul" ? " is-under" : kind === "st" ? " is-strike" : ""}`;
    element.style.left = `${(rect[0] || 0) * 100}%`;
    element.style.top = `${(rect[1] || 0) * 100}%`;
    element.style.width = `${(rect[2] || 0) * 100}%`;
    element.style.height = `${(rect[3] || 0) * 100}%`;
    return element;
  };

  const drawPage = (element: HTMLElement): void => {
    element.querySelector(":scope > .atelier-note-layer")?.remove();
    const page = Number(element.dataset.page);
    if (!page) return;
    const notes = options.notes().filter(note => note.page === page);
    const marks = options.marks().filter(mark => Number(mark.page) === page);
    if (!notes.length && !marks.length) return;
    const layer = doc.createElement("div");
    layer.className = "atelier-note-layer";
    for (const mark of marks) for (const rect of mark.rects || []) layer.appendChild(veil(rect, noteColorName(mark.color), mark.kind || "hl"));
    const pins: Array<{note: LatexPdfLayerNote; side: "left" | "right"; top: number}> = [];
    const height = element.clientHeight || parseFloat(element.style.height) || 1000;
    for (const note of notes) {
      const rects = rectsOf(note);
      if (!rects?.length) continue;
      for (const rect of rects) layer.appendChild(veil(rect, note.color, "hl"));
      const first = rects[0]!;
      pins.push({note, side: pinSide(first), top: ((first[1] || 0) + (first[3] || 0) / 2) * height});
    }
    const edge = pageBounds(page);
    for (const side of ["left", "right"] as const) {
      const group = pins.filter(pin => pin.side === side).sort((a, b) => a.top - b.top);
      const tops = spreadPins(group.map(pin => pin.top), height);
      group.forEach((pin, index) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = `atelier-note-pin note-c-${pin.note.color}${pin.note.agent ? " is-agent" : ""}`;
        button.dataset.note = pin.note.id;
        button.textContent = String(pin.note.number);
        button.title = pin.note.title;
        button.setAttribute("aria-label", `Annotation ${pin.note.number}${pin.note.title ? ` : ${pin.note.title}` : ""}`);
        // centre de la pastille à 18 px du bord du texte, dans la marge
        // (jamais hors de la feuille : marges étroites, page réduite)
        button.style.left = side === "left" ? `max(12px, calc(${edge.min * 100}% - 18px))` : `min(calc(100% - 12px), calc(${edge.max * 100}% + 18px))`;
        button.style.top = `${tops[index]}px`;
        button.addEventListener("click", event => { event.stopPropagation(); options.onPick(pin.note.id); });
        layer.appendChild(button);
      });
    }
    element.appendChild(layer);
  };

  const redraw = (): void => {
    timer = null;
    options.right.querySelectorAll<HTMLElement>(".pdfpage").forEach(drawPage);
  };
  function schedule(): void {
    if (timer !== null) return;
    timer = win.setTimeout(redraw, 40);
  }
  // nouvelles pages (mise en page, rechargement) : la couche s'y repose
  const Observer = (win as unknown as {MutationObserver?: typeof MutationObserver}).MutationObserver;
  if (typeof Observer === "function") {
    new Observer(records => {
      if (records.some(record => [...record.addedNodes].some(node => (node as Element).classList?.contains("pdfpage")))) {
        bounds.clear();
        schedule();
      }
    }).observe(options.right, {childList: true});
  }
  return {redraw: schedule};
}
