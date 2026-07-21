import {createCsvViewController, type CsvToolkit} from "../features/code";
import {
  addRecentStudioFile,
  attachEditorSelection,
  createDocumentSession,
  createEditorWrapController,
  createStudioDiffController,
  createStudioFilePicker,
  installStudioCommands,
  type StudioDiffController,
  type StudioDiffFactoryOptions,
  type StudioDiffJournal,
  type StudioEditor,
  type StudioEditorFactory,
} from "../core";

export interface CodeSurfaceDependencies {
  editorFactory: StudioEditorFactory;
  diffFactory(options: StudioDiffFactoryOptions): StudioDiffJournal;
  csvToolkit: CsvToolkit;
  document?: Document;
  window?: Window;
}

export interface CodeSurface {
  getEditor(): StudioEditor | null;
  load(): Promise<unknown>;
  save(): Promise<boolean>;
  diff: StudioDiffController;
}

interface CodeResponse {
  text?: string;
  mtime?: number;
  error?: string;
}

export function bootstrapCodeSurface(dependencies: CodeSurfaceDependencies): CodeSurface {
  const doc = dependencies.document || document;
  const win = dependencies.window || window;
  const path = new URLSearchParams(win.location.search).get("path");
  const filename = path?.split("/").pop() || "(no file)";
  const extension = path?.split(".").pop() || "";
  const isCsv = extension.toLowerCase() === "csv";
  const state = doc.getElementById("state") as HTMLElement;
  (doc.getElementById("fname") as HTMLElement).textContent = filename;
  doc.title = path ? filename : "Editor";
  let editor: StudioEditor | null = null;
  let session: ReturnType<typeof createDocumentSession> | null = null;
  const setState = (kind: string, message: string): void => {
    state.className = kind;
    state.textContent = message;
  };
  const wrap = createEditorWrapController({
    getEditor: () => editor,
    select: doc.getElementById("wrapSel") as HTMLSelectElement,
    customInput: doc.getElementById("wrapCustom") as HTMLInputElement,
    document: doc,
    window: win,
    storage: win.localStorage,
  });
  const csv = createCsvViewController({
    enabled: isCsv,
    getEditor: () => editor,
    wrap,
    toolkit: dependencies.csvToolkit,
    document: doc,
    window: win,
    storage: win.localStorage,
  });
  const ensureSession = (): ReturnType<typeof createDocumentSession> => {
    if (session) return session;
    if (!path) throw new Error("No file path");
    session = createDocumentSession({
      read: async () => {
        const response = await win.fetch(`/code?path=${encodeURIComponent(path)}`);
        const result = await response.json() as CodeResponse;
        if (result.error || typeof result.text !== "string") throw new Error(result.error || "Invalid code response");
        return {text: result.text, mtime: Number(result.mtime)};
      },
      write: async (text, mtime) => {
        const response = await win.fetch("/codesave", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path, text, mtime}),
        });
        return response.json();
      },
      getText: () => editor?.getValue() || "",
      applyText: (text) => {
        if (editor) editor.setValue(text);
        else initializeEditor(text);
      },
      externalReload: "always",
      conflictPolicy: "reload",
      onEvent: (event) => {
        if (event.kind === "loaded") {
          addRecentStudioFile(path, win.localStorage);
          wrap.refresh();
          csv.activate();
          setState("saved", "saved");
        } else if (event.kind === "saved") {
          setState("saved", `saved ${new Date().toLocaleTimeString()}`);
          if (event.previousText !== null && event.previousText !== event.snapshot.text) {
            diff.push(event.previousText, event.snapshot.text, {source: "user-save", status: "applied"});
          }
        } else if (event.kind === "external-reload") {
          setState("saved", `version de l'agent rechargée ${new Date().toLocaleTimeString()}`);
          if (event.previousText !== event.snapshot.text) {
            diff.push(event.previousText, event.snapshot.text, {source: "external-reload", status: "applied"});
          }
          csv.onDocumentChanged();
        } else if (event.kind === "conflict" || event.kind === "error") setState("conflict", event.message);
      },
    });
    return session;
  };
  const initializeEditor = (text: string): StudioEditor => {
    if (editor) return editor;
    let resizeTimer: number | null = null;
    win.addEventListener("resize", () => {
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(() => editor?.refresh(), 120);
    });
    editor = dependencies.editorFactory.createEditor({
      parent: doc.getElementById("ed") as HTMLElement,
      value: text,
      ext: extension,
      wrap: true,
      readOnly: false,
      defaultEngine: "cm6",
    });
    (win as Window & {cm?: StudioEditor}).cm = editor;
    editor.on("change", (...args: unknown[]) => {
      const change = args[1] as {origin?: string} | undefined;
      if (change?.origin !== "setValue") {
        ensureSession().markDirty();
        setState("dirty", "modified");
      }
    });
    const selectionBridge = attachEditorSelection({
      editor,
      buildPayload: (selection) => ({
        lines: selection.lines,
        words: selection.words,
        text: selection.text,
        rel: path,
        name: filename,
        page: `L${selection.from.line + 1}-${selection.to.line + 1}`,
      }),
      hostWindow: win,
      fetchImpl: win.fetch.bind(win),
    });
    (win as Window & {codeSelectionBridge?: unknown}).codeSelectionBridge = selectionBridge;
    return editor;
  };
  const diff = createStudioDiffController({
    factory: dependencies.diffFactory,
    getEditor: () => editor,
    path,
    notify: (message) => setState("saved", message),
    restoreText: async (text) => {
      if (!path) return false;
      const currentSession = ensureSession();
      const response = await win.fetch("/codesave", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path, text, mtime: currentSession.state.mtime}),
      });
      const result = await response.json() as CodeResponse;
      if (result.error || !Number.isFinite(Number(result.mtime))) return false;
      currentSession.acceptSaved({text, mtime: Number(result.mtime)}, true);
      setState("saved", "version restaurée");
      return true;
    },
    document: doc,
    window: win,
  });
  (win as Window & {__dv?: StudioDiffController}).__dv = diff;
  const save = async (): Promise<boolean> => editor ? ensureSession().save() : false;
  installStudioCommands({
    getEditor: () => editor,
    document: doc,
    save,
    escape: () => {
      if (editor) editor.setCursor(editor.getCursor());
      win._clMark?.clear();
      win._clMark = null;
      void win.fetch("/selinfo", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({lines: 0, words: 0}),
      }).catch(() => undefined);
    },
  });
  createStudioFilePicker({
    currentPath: path,
    picker: doc.getElementById("picker") as HTMLElement,
    pathLabel: doc.getElementById("pickerPath") as HTMLElement,
    list: doc.getElementById("pickerList") as HTMLElement,
    openButton: doc.getElementById("openFile"),
    document: doc,
    window: win,
    storage: win.localStorage,
  });
  win.setInterval(() => {
    if (editor && !diff.isBusy()) void ensureSession().pollOnce();
  }, 2000);
  const load = (): Promise<unknown> => path ? ensureSession().load() : Promise.resolve(null);
  void load();
  return {getEditor: () => editor, load, save, diff};
}
