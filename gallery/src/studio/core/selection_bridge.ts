import type {
  StudioEditor,
  StudioPosition,
  StudioTextMarker,
} from "./editor_contract";
import {
  buildEditorLiveContext,
  createLiveContextPublisher,
  onTabActivated,
  type LiveContextComment,
  type LiveContextMessage,
  type LiveContextPublisher,
} from "./live_context";

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
  /** Contexte vivant pour le chat de l'hôte (`atelier-live-context`) : même
   *  `cursorActivity` que `/selinfo`, mais le curseur seul compte aussi. */
  liveContext?: EditorLiveContextOptions;
}

export interface EditorLiveContextOptions {
  /** Chemin absolu du fichier ouvert ; sans lui, rien n'est publié. */
  path: string | null | undefined;
  kind: "tex" | "code";
  postToHost(payload: LiveContextMessage): void;
  /** Commentaires ouverts déjà en mémoire (lus à chaque publication). */
  comments?(): readonly LiveContextComment[] | null | undefined;
  delayMs?: number;
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
  const live = options.liveContext ? attachLiveContext(editor, options.liveContext, hostWindow) : null;

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
    live?.publisher.schedule();
  }

  editor.on("cursorActivity", schedule);
  return {
    clear,
    publish,
    schedule,
    liveContext: live?.publisher ?? null,
    dispose(): void {
      clear();
      live?.dispose();
      editor.off("cursorActivity", schedule);
    },
  };
}

function attachLiveContext(editor: StudioEditor, options: EditorLiveContextOptions, hostWindow: Window): {
  publisher: LiveContextPublisher;
  dispose(): void;
} {
  const publisher = createLiveContextPublisher({
    build: () => buildEditorLiveContext({
      path: options.path,
      kind: options.kind,
      selection: editor.getSelection(),
      from: editor.getCursor("from"),
      to: editor.getCursor("to"),
      cursor: editor.getCursor("head"),
      comments: options.comments?.(),
    }),
    postToHost: options.postToHost,
    delayMs: options.delayMs,
    timers: typeof hostWindow.setTimeout === "function" ? hostWindow : undefined,
  });
  const stopActivation = typeof hostWindow.addEventListener === "function"
    ? onTabActivated(hostWindow, () => publisher.repost())
    : () => undefined;
  // Ouverture du fichier : l'hôte voit la ligne du curseur sans attendre un geste.
  publisher.schedule();
  return {
    publisher,
    dispose(): void {
      stopActivation();
      publisher.dispose();
    },
  };
}
