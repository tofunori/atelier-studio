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
  document?: Document;
  window?: Window;
}

export interface LatexSelectionPillController {
  show(from: StudioPosition, to: StudioPosition, text: string): void;
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
    },
  });
  const show = (from: StudioPosition, to: StudioPosition, text: string): void => {
    if (pill.style.display === "flex" && (doc.activeElement === textarea || textarea.value)) return;
    lastSelection = {
      text,
      page: `L${from.line + 1}-${to.line + 1}`,
      from: {...from},
      to: {...to},
    };
    const editor = options.getEditor();
    if (!editor) return;
    const box = editor.getWrapperElement().getBoundingClientRect();
    const caret = editor.charCoords(to, "window");
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
