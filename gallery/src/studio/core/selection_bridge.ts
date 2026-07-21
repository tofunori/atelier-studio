import type {
  StudioEditor,
  StudioPosition,
  StudioTextMarker,
} from "./editor_contract";

export interface EditorSelectionContext {
  text: string;
  from: StudioPosition;
  to: StudioPosition;
  words: number;
  lines: number;
}

export interface EditorSelectionBridgeOptions {
  editor: StudioEditor;
  buildPayload(context: EditorSelectionContext): Record<string, unknown>;
  delayMs?: number;
  endpoint?: string;
  markerClass?: string;
  canPublish?(): boolean;
  onSelection?(context: EditorSelectionContext): void;
  onEmpty?(): void;
  onSkipped?(): void;
  fetchImpl?: typeof fetch;
  hostWindow?: Window;
}

declare global {
  interface Window {
    _clMark?: StudioTextMarker | null;
  }
}

export function attachEditorSelection(options: EditorSelectionBridgeOptions) {
  const editor = options.editor;
  const delay = options.delayMs ?? 200;
  const endpoint = options.endpoint || "/selinfo";
  const markerClass = options.markerClass || "cm-clsel";
  const fetchImpl = options.fetchImpl || fetch;
  const hostWindow = options.hostWindow || window;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearMarker(): void {
    hostWindow._clMark?.clear();
    hostWindow._clMark = null;
  }

  function clear(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    clearMarker();
    options.onEmpty?.();
  }

  function publish(): void {
    timer = null;
    if (options.canPublish && !options.canPublish()) {
      options.onSkipped?.();
      return;
    }
    const text = editor.getSelection();
    if (!text || !text.trim()) {
      clear();
      return;
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const context: EditorSelectionContext = {
      text,
      from,
      to,
      words: text.trim().split(/\s+/).length,
      lines: to.line - from.line + 1,
    };
    clearMarker();
    if (!editor.hasNativeSelectionHighlight) {
      hostWindow._clMark = editor.markText(from, to, {className: markerClass});
    }
    void fetchImpl(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(options.buildPayload(context)),
    }).catch(() => undefined);
    options.onSelection?.(context);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(publish, delay);
  }

  editor.on("cursorActivity", schedule);
  return {
    clear,
    publish,
    schedule,
    dispose(): void {
      clear();
      editor.off("cursorActivity", schedule);
    },
  };
}
