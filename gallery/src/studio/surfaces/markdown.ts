import {
  createMarkdownAnnotationsController,
  createMarkdownPreviewController,
  type HtmlSanitizer,
  type MarkdownParser,
} from "../features/markdown";
import {
  attachEditorSelection,
  createDocumentSession,
  createDraftKeeper,
  formatDraftTime,
  installStudioCommands,
  type StudioEditor,
  type StudioEditorFactory,
} from "../core";

export interface MarkdownSurfaceDependencies {
  editorFactory: StudioEditorFactory;
  parser: MarkdownParser;
  sanitizer: HtmlSanitizer;
  document?: Document;
  window?: Window;
}

export interface MarkdownSurface {
  getEditor(): StudioEditor | null;
  load(): Promise<void>;
  save(): Promise<boolean>;
}

interface MarkdownCodeResponse {
  text?: string;
  mtime?: number;
  error?: string;
}

export function bootstrapMarkdownSurface(dependencies: MarkdownSurfaceDependencies): MarkdownSurface {
  const doc = dependencies.document || document;
  const win = dependencies.window || window;
  const parameters = new URLSearchParams(win.location.search);
  const path = parameters.get("path");
  const file = parameters.get("file") || "";
  const name = path?.split("/").pop() || file.split("/").pop() || "(markdown)";
  const state = doc.getElementById("state") as HTMLElement;
  (doc.getElementById("fname") as HTMLElement).textContent = name;
  doc.title = name;
  if (file) {
    const directory = file.split("/").slice(0, -1).join("/");
    const base = doc.createElement("base");
    base.href = `/${directory ? `${directory.split("/").map(encodeURIComponent).join("/")}/` : ""}`;
    doc.head.appendChild(base);
  }
  let editor: StudioEditor | null = null;
  let session: ReturnType<typeof createDocumentSession> | null = null;
  const setState = (kind: string, message: string): void => {
    state.className = kind;
    state.textContent = message;
  };
  const preview = createMarkdownPreviewController({
    path,
    file,
    name,
    getEditor: () => editor,
    ensureEditor: (source) => { initializeEditor(source); },
    parser: dependencies.parser,
    sanitizer: dependencies.sanitizer,
    clearEditorSelection: () => {
      win._clMark?.clear();
      win._clMark = null;
    },
    document: doc,
    window: win,
  });
  createMarkdownAnnotationsController({
    name,
    setPreviewMode: () => preview.setMode("prev"),
    document: doc,
    window: win,
  });
  // Brouillon de secours (audit 2026-10-18, problème 1).
  const drafts = createDraftKeeper({
    path,
    getText: () => editor?.getValue() || preview.source(),
    getBase: () => ({text: session?.state.baseline ?? null, mtime: session?.state.mtime ?? 0}),
    isDirty: () => Boolean(session?.state.dirty),
    postToHost: (payload) => (win as Window & {__atelierPost?(p: Record<string, unknown>): void}).__atelierPost?.(payload),
    window: win,
  });
  const ensureSession = (): ReturnType<typeof createDocumentSession> => {
    if (session) return session;
    if (!path) throw new Error("No editable Markdown path");
    session = createDocumentSession({
      read: async () => {
        const response = await win.fetch(`/code?path=${encodeURIComponent(path)}`);
        const result = await response.json() as MarkdownCodeResponse;
        if (result.error || typeof result.text !== "string") throw new Error(result.error || "Invalid Markdown response");
        return {text: result.text, mtime: Number(result.mtime)};
      },
      stat: async () => {
        const response = await win.fetch(`/statfile?path=${encodeURIComponent(path)}`);
        const result = await response.json() as {mtime?: number};
        const mtime = Number(result.mtime);
        return Number.isFinite(mtime) ? mtime : null;
      },
      write: async (text, mtime) => {
        const response = await win.fetch("/codesave", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path, text, mtime}),
        });
        return response.json();
      },
      getText: () => editor?.getValue() || preview.source(),
      applyText: (text) => {
        preview.render(text);
        editor?.setValue(text);
      },
      externalReload: "when-clean",
      onDirtyChange: (dirty) => drafts.setDirty(dirty),
      onEvent: (event) => {
        // GAL-27 : au repos rien ne s'affiche ; l'heure d'enregistrement reste discrète
        const at = () => new Date().toLocaleTimeString("fr-CA", {hour: "2-digit", minute: "2-digit"});
        if (event.kind === "loaded") setState("saved", "");
        else if (event.kind === "saved") setState("saved", `Enregistré à ${at()}`);
        else if (event.kind === "external-reload") setState("saved", `Rechargé depuis le disque à ${at()}`);
        else if (event.kind === "conflict") setState("conflict", "Conflit : le fichier a changé sur le disque — recharger, ou réenregistrer pour l’écraser");
        else if (event.kind === "error") setState("conflict", event.message);
      },
    });
    return session;
  };
  const initializeEditor = (source: string): StudioEditor => {
    if (editor) return editor;
    editor = dependencies.editorFactory.createEditor({
      parent: doc.getElementById("edPane") as HTMLElement,
      value: source,
      ext: "md",
      wrap: true,
      readOnly: false,
      defaultEngine: "cm6",
    });
    (win as Window & {cm?: StudioEditor}).cm = editor;
    editor.on("change", (...args: unknown[]) => {
      const change = args[1] as {origin?: string} | undefined;
      preview.render(editor!.getValue());
      if (change?.origin !== "setValue") {
        ensureSession().markDirty();
        drafts.noteChange();
        setState("dirty", "Modifié");
      }
    });
    const selectionBridge = attachEditorSelection({
      editor,
      canPublish: () => Boolean(path),
      buildPayload: (selection) => ({
        lines: selection.lines,
        words: selection.words,
        text: selection.text,
        rel: file || path,
        name,
        page: `L${selection.from.line + 1}-${selection.to.line + 1}`,
      }),
      onSelection: (selection) => preview.selectionActive(selection.words),
      hostWindow: win,
      fetchImpl: win.fetch.bind(win),
    });
    (win as Window & {markdownSelectionBridge?: unknown}).markdownSelectionBridge = selectionBridge;
    return editor;
  };
  const save = async (): Promise<boolean> => editor && path ? ensureSession().save() : false;
  installStudioCommands({
    getEditor: () => editor,
    document: doc,
    save,
    toggleMode: () => preview.setMode(preview.mode() === "prev" ? "split" : "prev"),
    escape: () => preview.clearSelection(),
  });
  win.setInterval(() => {
    if (win.document.hidden) return; // onglet masqué : aucune sonde
    if (path) void ensureSession().pollOnce();
  }, 2000);
  const load = async (): Promise<void> => {
    if (!path) {
      try {
        const response = await win.fetch(`/${file.split("/").map(encodeURIComponent).join("/")}`);
        if (!response.ok) throw new Error(String(response.status));
        preview.render(await response.text());
      } catch (error) {
        preview.showError(`Impossible de charger ${file} (${error instanceof Error ? error.message : String(error)})`);
      }
      return;
    }
    try {
      await ensureSession().load();
    } catch (error) {
      preview.showError(`Serveur injoignable — ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const restored = await drafts.restore((draft) => ensureSession().adoptDraft(draft));
    if (restored.outcome !== "none") {
      const when = formatDraftTime(restored.savedAt);
      setState(restored.outcome === "conflict" ? "conflict" : "dirty",
        `brouillon non enregistré${when ? ` du ${when}` : ""} restauré${restored.outcome === "conflict" ? " — le fichier a changé depuis, ⌘S signalera le conflit" : " — ⌘S pour l'enregistrer"}`);
    }
  };
  void load();
  return {getEditor: () => editor, load, save};
}
