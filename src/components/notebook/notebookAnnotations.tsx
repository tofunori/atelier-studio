/**
 * Surlignages et notes des cellules d'un cahier : la même bulle que les
 * fichiers Python (surligneur, couleurs, note), qui persiste.
 *
 * Les annotations vivent côté serveur dans le store partagé des éditeurs
 * (`notebookCommand` « annotations » / « saveAnnotations »), jamais dans le
 * .ipynb. Elles sont peintes par la CSS Custom Highlight API, comme les
 * marques du chat : aucune chirurgie du DOM, donc rien que React n'écrase en
 * réécrivant une cellule. Un passage est retrouvé par ses décalages dans la
 * partie (code ou sortie n) de sa cellule, puis par son texte s'il a bougé.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createNoteEditor } from "../../../gallery/src/studio/features/annotation_ui";
import { formatNotebookSelectionCitation, notebookCommand } from "../../lib/notebook";
import { t } from "../../lib/i18n";

export type NotebookPart = "code" | "output";

/** Passage choisi dans une cellule, tel que la bulle le reçoit. */
export type NotebookPassage = {
  cellId: string;
  cellIndex: number;
  part: NotebookPart;
  /** Rang de la partie parmi celles du même genre dans la cellule (sorties). */
  partIndex: number;
  /** Décalages dans le texte de la partie (code : la source de la cellule). */
  from: number;
  to: number;
  text: string;
  lines: [number, number];
};

export type NotebookAnnotation = NotebookPassage & {
  id: string;
  kind: "hl" | "comment";
  /** Nom de teinte d'`annotationColors` (amber, green, blue, red). */
  color?: string;
  comment?: string;
  created: number;
};

export const NOTEBOOK_HIGHLIGHT_COLORS = ["amber", "green", "blue", "red"] as const;
const NOTE_HIGHLIGHT = "nb-note";

function partElements(cell: Element, part: NotebookPart): HTMLElement[] {
  return Array.from(cell.querySelectorAll<HTMLElement>(`[data-part="${part}"]`));
}

/** Décalage, dans le texte de `root`, du point (node, offset). */
export function textOffset(root: Node, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(root);
  try {
    before.setEnd(node, offset);
  } catch {
    return 0;
  }
  return before.toString().length;
}

/** Plage DOM couvrant les caractères [from, to) du texte de `root`. */
export function rangeFromOffsets(root: Node, from: number, to: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = (node as Text).data.length;
    if (!started && from <= seen + len) {
      range.setStart(node, from - seen);
      started = true;
    }
    if (started && to <= seen + len) {
      range.setEnd(node, to - seen);
      return range;
    }
    seen += len;
  }
  return null;
}

/** Où se trouve le passage aujourd'hui : décalages s'ils lisent encore le
 *  même texte, sinon l'occurrence la plus proche du texte. */
export function relocate(text: string, wanted: string, from: number): number {
  if (!wanted) return -1;
  if (text.slice(from, from + wanted.length) === wanted) return from;
  let best = -1;
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    if (best < 0 || Math.abs(at - from) < Math.abs(best - from)) best = at;
  }
  return best;
}

export function annotationRange(scroller: Element, a: NotebookAnnotation): Range | null {
  const cell = scroller.querySelector(`.nb-cell[data-cell-id="${CSS.escape(a.cellId)}"]`);
  if (!cell) return null;
  const parts = partElements(cell, a.part);
  const ordered = [parts[a.partIndex], ...parts.filter((_, i) => i !== a.partIndex)].filter(Boolean);
  for (const el of ordered) {
    const at = relocate(el.textContent ?? "", a.text, el === parts[a.partIndex] ? a.from : 0);
    if (at >= 0) return rangeFromOffsets(el, at, at + a.text.length);
  }
  return null;
}

/** Passage d'une sélection DOM dans une partie de cellule (texte rogné). */
export function passageFromRange(
  cellEl: HTMLElement,
  partEl: HTMLElement,
  range: Range,
  lines: [number, number],
): NotebookPassage | null {
  const raw = range.toString();
  const text = raw.trim();
  const cellId = cellEl.dataset.cellId;
  if (!text || !cellId) return null;
  const part: NotebookPart = partEl.dataset.part === "code" ? "code" : "output";
  const from = textOffset(partEl, range.startContainer, range.startOffset) + (raw.length - raw.trimStart().length);
  return {
    cellId,
    cellIndex: Number(cellEl.dataset.cellIndex) || 1,
    part,
    partIndex: Math.max(0, partElements(cellEl, part).indexOf(partEl)),
    from,
    to: from + text.length,
    text,
    lines,
  };
}

function newId(): string {
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type NoteDraft = { annotation: NotebookAnnotation; isNew: boolean; x: number; y: number };

/**
 * État des annotations d'un cahier ouvert : chargement, peinture, clic sur
 * une marque (ouvre sa note), et la fiche de note elle-même.
 */
export function useNotebookAnnotations({
  path,
  projectRoot,
  notebookName,
  scrollerRef,
  enabled,
}: {
  path: string;
  projectRoot?: string;
  notebookName: string;
  scrollerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  const [annots, setAnnots] = useState<NotebookAnnotation[]>([]);
  const knownRef = useRef<string[]>([]);
  const annotsRef = useRef(annots);
  annotsRef.current = annots;
  const [draft, setDraft] = useState<NoteDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnnots([]);
    knownRef.current = [];
    notebookCommand<{ annots: NotebookAnnotation[] }>("annotations", { path, projectRoot }, 15_000)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.annots) ? res.annots : [];
        knownRef.current = list.map((a) => a.id);
        setAnnots(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, projectRoot]);

  const persist = useCallback(
    async (next: NotebookAnnotation[]) => {
      const before = annotsRef.current;
      setAnnots(next);
      try {
        const res = await notebookCommand<{ annots: NotebookAnnotation[] }>(
          "saveAnnotations",
          { path, projectRoot, annots: next, known: knownRef.current },
          15_000,
        );
        const saved = Array.isArray(res.annots) ? res.annots : next;
        knownRef.current = saved.map((a) => a.id);
        setAnnots(saved);
        return true;
      } catch {
        setAnnots(before);
        return false;
      }
    },
    [path, projectRoot],
  );

  // Peinture : une Highlight par teinte, plus le soulignement des notes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const H = (window as unknown as { Highlight?: new () => { add(r: Range): void } }).Highlight;
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (!enabled || !scroller || !H || !reg) return;
    const paint = () => {
      const byColor = Object.fromEntries(NOTEBOOK_HIGHLIGHT_COLORS.map((c) => [c, new H()]));
      const notes = new H();
      for (const a of annotsRef.current) {
        const range = annotationRange(scroller, a);
        if (!range) continue;
        byColor[a.color && a.color in byColor ? a.color : "amber"].add(range);
        if (a.comment) notes.add(range);
      }
      for (const c of NOTEBOOK_HIGHLIGHT_COLORS) reg.set(`nb-hl-${c}`, byColor[c]);
      reg.set(NOTE_HIGHLIGHT, notes);
    };
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    });
    observer.observe(scroller, { childList: true, subtree: true, characterData: true });
    paint();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const c of NOTEBOOK_HIGHLIGHT_COLORS) reg.delete(`nb-hl-${c}`);
      reg.delete(NOTE_HIGHLIGHT);
    };
  }, [annots, enabled, scrollerRef]);

  // Un clic sur une marque ouvre sa note (avant que la cellule passe en
  // édition : écouté à la capture, au-dessus des gestionnaires de React).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!enabled || !scroller) return;
    const onClick = (ev: MouseEvent) => {
      if (window.getSelection()?.toString().trim()) return;
      for (const a of annotsRef.current) {
        const hit = Array.from(annotationRange(scroller, a)?.getClientRects() ?? []).find(
          (r) => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom,
        );
        if (!hit) continue;
        ev.preventDefault();
        ev.stopPropagation();
        setDraft({ annotation: a, isNew: false, x: hit.left + hit.width / 2, y: hit.bottom + 8 });
        return;
      }
    };
    scroller.addEventListener("click", onClick, true);
    return () => scroller.removeEventListener("click", onClick, true);
  }, [enabled, scrollerRef]);

  const highlight = useCallback(
    (passage: NotebookPassage, color: string) => {
      const others = annotsRef.current.filter(
        (a) => !(a.cellId === passage.cellId && a.part === passage.part && a.from === passage.from && a.to === passage.to),
      );
      const same = annotsRef.current.find((a) => !others.includes(a));
      void persist([...others, { ...(same ?? { id: newId(), kind: "hl", created: Date.now() }), ...passage, color }]);
    },
    [persist],
  );

  const annotate = useCallback((passage: NotebookPassage, at: { x: number; y: number }) => {
    const same = annotsRef.current.find(
      (a) => a.cellId === passage.cellId && a.part === passage.part && a.from === passage.from && a.to === passage.to,
    );
    setDraft({
      annotation: same ?? { ...passage, id: newId(), kind: "comment", created: Date.now() },
      isNew: !same,
      x: at.x,
      y: at.y,
    });
  }, []);

  const noteRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = noteRef.current;
    if (!draft || !host) return;
    const { annotation } = draft;
    const close = () => setDraft(null);
    const withComment = (value: string): NotebookAnnotation[] | null => {
      const comment = value.trim();
      const rest = annotsRef.current.filter((a) => a.id !== annotation.id);
      if (comment) return [...rest, { ...annotation, comment, kind: "comment" }];
      // Note vidée : il reste le surlignage s'il y en avait un.
      if (annotation.color) return [...rest, { ...annotation, comment: undefined, kind: "hl" }];
      return draft.isNew ? null : rest;
    };
    const commit = async (value: string) => {
      if ((value.trim() || "") === (annotation.comment ?? "") && !draft.isNew) return close();
      const next = withComment(value);
      if (next && (await persist(next))) close();
      else if (!next) close();
    };
    const ui = createNoteEditor(host, {
      value: annotation.comment ?? "",
      onSubmit: (value) => void commit(value),
      onDismiss: () => {
        const value = ui.input.value;
        if (value.trim() && value.trim() !== (annotation.comment ?? "")) void commit(value);
        else close();
      },
      onDelete: async () => {
        if (draft.isNew) return close();
        if (await persist(annotsRef.current.filter((a) => a.id !== annotation.id))) close();
      },
      onSendDirect: async (value) => {
        const next = withComment(value);
        if (next && !(await persist(next))) return;
        const citation = formatNotebookSelectionCitation(
          notebookName,
          annotation.cellIndex,
          annotation.part,
          annotation.text,
          annotation.lines,
        );
        const comment = value.trim();
        window.dispatchEvent(
          new CustomEvent("kernel-add-to-chat", {
            detail: { text: comment ? `${citation}\nCommentaire : ${comment}` : citation },
          }),
        );
        close();
      },
    });
    ui.focus();
    // Clic hors de la fiche : la note écrite est gardée, comme Échap.
    const onDown = (ev: MouseEvent) => {
      if (!host.contains(ev.target as Node)) {
        const value = ui.input.value;
        if (value.trim() && value.trim() !== (annotation.comment ?? "")) void commit(value);
        else close();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    const place = () => {
      const { width, height } = host.getBoundingClientRect();
      host.style.left = `${Math.max(width / 2 + 12, Math.min(window.innerWidth - width / 2 - 12, draft.x))}px`;
      host.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, draft.y))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(host);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      observer.disconnect();
    };
  }, [draft, notebookName, persist]);

  const noteEditor = draft ? (
    <div
      key={draft.annotation.id}
      ref={noteRef}
      className="atelier-chat-note nb-note-editor"
      role="dialog"
      aria-label={t("chat.annotate")}
      style={{ left: draft.x, top: draft.y }}
    />
  ) : null;

  return { annotations: annots, highlight, annotate, noteEditor };
}
