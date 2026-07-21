import type {StudioEditor} from "../../core/editor_contract";

export type MarkdownViewMode = "prev" | "split" | "edit";

export interface MarkdownParser {
  parse(source: string): string;
}

export interface HtmlSanitizer {
  sanitize(source: string): string;
}

export interface MarkdownPreviewOptions {
  path: string | null;
  file: string;
  name: string;
  getEditor(): StudioEditor | null;
  ensureEditor(source: string): void;
  parser: MarkdownParser;
  sanitizer: HtmlSanitizer;
  clearEditorSelection?(): void;
  publishSelection?(payload: Record<string, unknown>): Promise<unknown>;
  document?: Document;
  window?: Window;
}

export interface MarkdownPreviewController {
  source(): string;
  render(source: string): void;
  setMode(mode: MarkdownViewMode): void;
  mode(): MarkdownViewMode;
  clearSelection(): void;
  selectionActive(words: number): void;
  showError(message: string): void;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  } as Record<string, string>)[character] || character);
}

export function createMarkdownPreviewController(options: MarkdownPreviewOptions): MarkdownPreviewController {
  const doc = options.document || document;
  const win = options.window || window;
  const wrap = doc.getElementById("wrap") as HTMLElement;
  const editorPane = doc.getElementById("edPane") as HTMLElement;
  const previewPane = doc.getElementById("prevPane") as HTMLElement;
  const hint = doc.getElementById("hint") as HTMLElement;
  const clearButton = doc.getElementById("clearSel") as HTMLButtonElement;
  const buttons: Record<MarkdownViewMode, HTMLButtonElement> = {
    prev: doc.getElementById("mPrev") as HTMLButtonElement,
    split: doc.getElementById("mSplit") as HTMLButtonElement,
    edit: doc.getElementById("mEdit") as HTMLButtonElement,
  };
  const initialHint = hint.textContent || "";
  let sourceText = "";
  let currentMode: MarkdownViewMode = "prev";
  let selectionTimer: number | null = null;

  const render = (source: string): void => {
    sourceText = source || "";
    wrap.innerHTML = options.sanitizer.sanitize(options.parser.parse(sourceText));
  };
  const setMode = (mode: MarkdownViewMode): void => {
    if ((mode === "split" || mode === "edit") && !options.path) return;
    currentMode = mode;
    Object.values(buttons).forEach((button) => button.classList.remove("on"));
    buttons[mode].classList.add("on");
    editorPane.classList.toggle("show", mode === "split" || mode === "edit");
    previewPane.classList.toggle("show", mode === "prev" || mode === "split");
    if (mode === "split" || mode === "edit") {
      if (!options.getEditor()) options.ensureEditor(sourceText);
      win.setTimeout(() => options.getEditor()?.refresh(), 0);
    }
    hint.style.display = "";
  };
  buttons.prev.onclick = () => setMode("prev");
  buttons.split.onclick = () => setMode("split");
  buttons.edit.onclick = () => setMode("edit");

  const selectionActive = (words: number): void => {
    hint.textContent = `✓ ${words} ${words > 1 ? "words" : "word"} selected → Claude`;
    hint.style.color = "var(--accent)";
    clearButton.classList.add("show");
  };
  const publishSelection = options.publishSelection || (async (payload: Record<string, unknown>): Promise<unknown> => {
    return win.fetch("/selinfo", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
  });
  const clearSelection = (): void => {
    win.getSelection()?.removeAllRanges();
    options.clearEditorSelection?.();
    void publishSelection({lines: 0, words: 0});
    hint.textContent = initialHint;
    hint.style.color = "";
    clearButton.classList.remove("show");
  };
  clearButton.onclick = clearSelection;

  const pushPreviewSelection = (): void => {
    if (selectionTimer !== null) win.clearTimeout(selectionTimer);
    selectionTimer = win.setTimeout(() => {
      const selection = win.getSelection();
      if (!selection?.anchorNode || !wrap.contains(selection.anchorNode)) return;
      const text = selection.toString();
      if (!text.trim()) return;
      const words = text.trim().split(/\s+/).length;
      void publishSelection({
        lines: text.split("\n").length,
        words,
        text,
        rel: options.file || options.path,
        name: options.name,
        page: "preview",
      });
      selectionActive(words);
    }, 200);
  };
  previewPane.addEventListener("mouseup", pushPreviewSelection);
  previewPane.addEventListener("keyup", pushPreviewSelection);
  doc.addEventListener("selectionchange", pushPreviewSelection);

  return {
    source: () => sourceText,
    render,
    setMode,
    mode: () => currentMode,
    clearSelection,
    selectionActive,
    showError: (message: string) => {
      wrap.innerHTML = `<div id="err">${escapeHtml(message)}</div>`;
    },
  };
}
