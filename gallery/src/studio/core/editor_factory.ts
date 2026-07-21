import type {
  StudioEditor,
  StudioEditorFactory,
  StudioEditorOptions,
  StudioPosition,
  StudioScrollInfo,
} from "./editor_contract";

type Engine = "cm5" | "cm6";
type Cm5Mode = string | {name: string; json: boolean} | null;

interface LegacyEditor extends StudioEditor {
  Pass?: unknown;
  hasNativeGhost: boolean;
  hasNativeSelectionHighlight: boolean;
  onInput?: (callback: (...args: unknown[]) => void) => void;
  lineAtHeight(height: number, mode: "local"): number;
  defaultCharWidth(): number;
}

interface CodeMirrorStatic {
  (parent: HTMLElement, options: Record<string, unknown>): LegacyEditor;
  Pass?: unknown;
  countColumn?: (text: string, end: number | null, tabSize: number) => number;
}

declare global {
  interface Window {
    AtelierStudioCM6?: {
      createStudioEditor(parent: HTMLElement, options: Record<string, unknown>): StudioEditor;
    };
    AtelierEditorFactory?: StudioEditorFactory;
    CodeMirror?: CodeMirrorStatic;
    __ENGINE?: Engine;
  }
}

const ENGINES = new Set<Engine>(["cm5", "cm6"]);
const CM5_MODES: Record<string, Cm5Mode> = {
  tex: "stex", sty: "stex", bib: "stex", py: "python", md: "markdown",
  r: "r", jl: "julia", sh: "shell", bash: "shell", js: "javascript",
  ts: "javascript", json: {name: "javascript", json: true},
  yaml: null, yml: null, toml: null,
};

function normalizedExt(ext?: string): string {
  return ext === "R" ? "r" : String(ext || "").replace(/^\./, "").toLowerCase();
}

export function resolveEngine(
  search: string,
  storage: Pick<Storage, "getItem"> | null,
  defaultEngine?: string,
): Engine {
  let query: string | null = null;
  try { query = new URLSearchParams(search || "").get("engine"); } catch { /* invalid search */ }
  if (ENGINES.has(query as Engine)) return query as Engine;
  let saved: string | null = null;
  try { saved = storage?.getItem("studioEngine") || null; } catch { /* blocked storage */ }
  if (ENGINES.has(saved as Engine)) return saved as Engine;
  return ENGINES.has(defaultEngine as Engine) ? defaultEngine as Engine : "cm6";
}

export function createEditor(options: StudioEditorOptions): StudioEditor {
  let engine = resolveEngine(location.search, window.localStorage, options.defaultEngine);
  if (engine === "cm6" && typeof window.AtelierStudioCM6?.createStudioEditor !== "function") {
    if (typeof window.CodeMirror !== "function") throw new Error("Atelier editor: neither CM6 nor CM5 is available");
    console.warn("[Atelier editor] CM6 unavailable; falling back to CM5");
    engine = "cm5";
  }
  window.__ENGINE = engine;
  document.documentElement.dataset.editorEngine = engine;
  console.info("[Atelier editor] active engine:", engine);

  if (engine === "cm6") {
    return window.AtelierStudioCM6!.createStudioEditor(options.parent, {
      value: options.value || "",
      ext: normalizedExt(options.ext),
      wrap: options.wrap !== false,
      readOnly: Boolean(options.readOnly),
      aiEnabled: options.aiEnabled,
      onGhostState: options.onGhostState,
    });
  }

  const codeMirror = window.CodeMirror;
  if (typeof codeMirror !== "function") throw new Error("Atelier editor: CM5 fallback unavailable");
  const ext = normalizedExt(options.ext);
  const cm5Options = Object.assign({
    value: options.value || "",
    mode: CM5_MODES[ext] || null,
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: options.wrap !== false,
    readOnly: Boolean(options.readOnly),
    viewportMargin: 50,
    styleSelectedText: true,
  }, options.cm5Options || {});
  const editor = codeMirror(options.parent, cm5Options);
  editor.Pass = codeMirror.Pass;
  editor.hasNativeGhost = false;
  editor.hasNativeSelectionHighlight = false;

  const replaceValue = editor.setValue.bind(editor);
  editor.setValue = (text: string): void => {
    const anchor = editor.getCursor("anchor");
    const head = editor.getCursor("head");
    const scroll = editor.getScrollInfo();
    const replace = (): void => {
      replaceValue(text);
      editor.setSelection(anchor, head);
    };
    if (typeof editor.operation === "function") editor.operation(replace);
    else replace();
    editor.scrollTo(scroll.left, scroll.top);
  };

  editor.getViewportAnchor = (): StudioPosition => {
    const info: StudioScrollInfo = editor.getScrollInfo();
    return {line: editor.lineAtHeight(info.top + info.clientHeight / 2, "local"), ch: 0};
  };
  const legacyOn = editor.on.bind(editor) as unknown as (
    event: string,
    callback: (...args: unknown[]) => void,
  ) => void;
  editor.onInput = (callback) => legacyOn("inputRead", callback);

  // CM5 alone needs the renderLine hanging-indent adjustment. Register it
  // through its legacy event name without leaking that event to HTML surfaces.
  legacyOn(
    "renderLine",
    (...args: unknown[]) => {
      const cm = args[0] as LegacyEditor;
      const line = args[1] as {text: string};
      const element = args[2] as HTMLElement;
      const countColumn = codeMirror.countColumn || ((text: string) => (/^\s*/.exec(text) || [""])[0].length);
      const tabSize = Number(cm.getOption("tabSize") || 4);
      const offset = countColumn(line.text, null, tabSize) * cm.defaultCharWidth();
      element.style.textIndent = `-${offset}px`;
      element.style.paddingLeft = `${4 + offset}px`;
    },
  );
  editor.refresh();
  return editor;
}

window.AtelierEditorFactory = {resolveEngine, createEditor};
