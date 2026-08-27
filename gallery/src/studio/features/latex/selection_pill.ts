import type {StudioEditor, StudioPosition} from "../../core/editor_contract";

interface SelectionPillEditor extends StudioEditor {
  charCoords(position: StudioPosition, mode: "window"): {left: number; top: number; bottom: number};
}

interface SelectionPillApi {
  hide(): void;
  cancel(): void;
}

export interface SelectionPillAdapter {
  attach(options: Record<string, unknown>): SelectionPillApi;
}

export interface LatexPillSelection {
  text: string;
  page: string;
  from: StudioPosition;
  to: StudioPosition;
}

export interface LatexSelectionPillOptions {
  path: string;
  getEditor(): SelectionPillEditor | null;
  adapter: SelectionPillAdapter;
  openComment(selection: LatexPillSelection): void;
  clearMarker(): void;
  /** Canal vers la fenêtre hôte — sert au Quick Ask. */
  postToHost?(payload: Record<string, unknown>): void;
  document?: Document;
  window?: Window;
}

/** Boîte et caret de substitution quand la sélection ne vient pas de l'éditeur
 *  (vue Lecture) : mêmes unités que `getBoundingClientRect` / `charCoords`. */
export interface PillAnchor {
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;
  caret: {left: number; top: number; bottom: number};
}

export interface LatexSelectionPillController {
  show(from: StudioPosition, to: StudioPosition, text: string, anchor?: PillAnchor): void;
  hide(): void;
  cancel(): void;
  current(): LatexPillSelection | null;
}

export function selectionPillPosition(
  editorBox: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">,
  caret: {left: number; top: number; bottom: number},
  pill: {width: number; height: number},
): {left: number; top: number} | null {
  if (editorBox.height < 40 || editorBox.width < 40) return null;
  const topLimit = editorBox.top + 6;
  const bottomLimit = editorBox.bottom - pill.height - 6;
  const left = Math.min(
    Math.max(editorBox.left + 6, caret.left - pill.width / 2),
    editorBox.right - pill.width - 6,
  );
  let top = caret.bottom + 10;
  if (top > bottomLimit) top = caret.top - pill.height - 10;
  top = Math.min(Math.max(topLimit, top), Math.max(topLimit, bottomLimit));
  return {left: Math.max(6, left), top};
}

/** Les lignes autour de la sélection, contexte minimum pour que le passage
 *  veuille dire quelque chose. Un mot arraché à un .tex est aussi muet qu'un
 *  mot arraché à un fil de conversation. */
export function surroundingLines(
  editor: Pick<SelectionPillEditor, "getLine" | "lineCount">,
  from: StudioPosition,
  to: StudioPosition,
  margin = 6,
): string {
  const first = Math.max(0, from.line - margin);
  const last = Math.min(editor.lineCount() - 1, to.line + margin);
  const out: string[] = [];
  for (let n = first; n <= last; n += 1) out.push(editor.getLine(n));
  return out.join("\n").trim();
}

export function createLatexSelectionPill(
  options: LatexSelectionPillOptions,
): LatexSelectionPillController {
  const doc = options.document || document;
  const win = options.window || window;
  const pill = doc.getElementById("selPill") as HTMLElement;
  const textarea = pill.querySelector("textarea") as HTMLTextAreaElement;
  let lastSelection: LatexPillSelection | null = null;
  const api = options.adapter.attach({
    pill,
    menu: doc.getElementById("tgMenu"),
    getQuote: () => lastSelection ? {
      rel: options.path,
      page: lastSelection.page,
      text: lastSelection.text,
    } : null,
    onSent: options.clearMarker,
    onCancel: () => {
      lastSelection = null;
      const editor = options.getEditor();
      if (editor) editor.setCursor(editor.getCursor());
      options.clearMarker();
      void win.fetch("/selinfo", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({lines: 0, words: 0}),
      }).catch(() => undefined);
    },
    embedExtras: (go: HTMLButtonElement) => {
      const comment = doc.createElement("button");
      comment.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" style="vertical-align:-2px"><path d="M3 2.5h10v8H8l-3 3v-3H3v-8z"/></svg>&nbsp; Commenter';
      comment.style.cssText = go.style.cssText;
      comment.onmousedown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (lastSelection) options.openComment(lastSelection);
        api.hide();
      };
      go.insertAdjacentElement("afterend", comment);

      // Quick Ask : même moule, en tête de pilule — le chat place déjà
      // l'éclair avant « Annoter » et « Ajouter au chat ».
      if (!options.postToHost) return;
      const ask = doc.createElement("button");
      ask.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M8.8 1.8L3.6 9h3.6l-.9 5.2L11.5 7H7.9l.9-5.2z"/></svg>&nbsp; Quick Ask';
      ask.style.cssText = go.style.cssText;
      ask.onmousedown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!lastSelection) return;
        const editor = options.getEditor();
        options.postToHost?.({
          type: "atelier-quick-ask",
          text: lastSelection.text,
          around: editor
            ? surroundingLines(editor, lastSelection.from, lastSelection.to)
            : undefined,
          path: options.path,
          page: lastSelection.page,
        });
        api.hide();
      };
      go.insertAdjacentElement("beforebegin", ask);
    },
  });
  const show = (from: StudioPosition, to: StudioPosition, text: string, anchor?: PillAnchor): void => {
    if (pill.style.display === "flex" && (doc.activeElement === textarea || textarea.value)) return;
    lastSelection = {
      text,
      page: `L${from.line + 1}-${to.line + 1}`,
      from: {...from},
      to: {...to},
    };
    // Un ancrage explicite permet d'afficher la pastille ailleurs que dans
    // l'éditeur — en vue Lecture, celui-ci est masqué et ses coordonnées
    // valent zéro, ce qui escamotait la pastille.
    const editor = anchor ? null : options.getEditor();
    if (!anchor && !editor) return;
    const box = anchor ? anchor.box : editor!.getWrapperElement().getBoundingClientRect();
    const caret = anchor ? anchor.caret : editor!.charCoords(to, "window");
    pill.style.display = "flex";
    const position = selectionPillPosition(box, caret, {
      width: pill.offsetWidth,
      height: pill.offsetHeight,
    });
    if (!position) {
      pill.style.display = "none";
      return;
    }
    pill.style.left = `${position.left}px`;
    pill.style.top = `${position.top}px`;
  };
  return {show, hide: api.hide, cancel: api.cancel, current: () => lastSelection};
}
