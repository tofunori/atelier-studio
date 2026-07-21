import {
  createLatexAnnotationsController,
  createLatexCompileCoordinator,
  createLatexOutlineController,
  createLatexPdfControls,
  createLatexPdfSyncController,
  createLatexReadingController,
  createLatexSelectionPill,
  createRewrapController,
  createStudioStatusBar,
  isAutoRewrapEnabled,
  installLegacyLatexGhost,
  type KatexRenderer,
  type LatexAnnotationsController,
  type LatexCompileLog,
  type LatexOutlineController,
  type LatexPdfControls,
  type LatexPdfSyncController,
  type LatexReadingController,
  type LatexSelectionPillController,
  type PdfJs,
  type SelectionPillAdapter,
  type StudioStatusBarController,
} from "../features/latex";
import type {HtmlSanitizer, MarkdownParser} from "../features/markdown";
import {
  addRecentStudioFile,
  attachEditorSelection,
  createDocumentSession,
  createEditorWrapController,
  createStudioDiffController,
  createStudioFilePicker,
  installStudioCommands,
  revealLineRange,
  type StudioDiffController,
  type StudioDiffFactoryOptions,
  type StudioDiffJournal,
  type StudioEditor,
  type StudioEditorFactory,
  type StudioPosition,
} from "../core";

interface LatexSurfaceEditor extends StudioEditor {
  Pass: unknown;
  addKeyMap(map: Record<string, () => unknown>): void;
  onInput(callback: () => void): void;
  addLineClass(line: number, where: string, className: string): void;
  removeLineClass(line: number, where: string, className: string): void;
  charCoords(position: StudioPosition, mode: "window"): {left: number; top: number; bottom: number};
  somethingSelected(): boolean;
  getGutterElement(): HTMLElement;
  defaultCharWidth(): number;
  clearGutter(gutter: string): void;
}

interface LatexCodeResponse {
  text?: string;
  mtime?: number;
  error?: string;
}

interface TexRootResponse {
  pdf?: string;
}

interface QuoteResponse {
  message?: string;
}

interface LatexSurfaceWindow extends Window {
  path?: string | null;
  cm?: LatexSurfaceEditor;
  CodeMirrorPass?: unknown;
  latexGhostController?: unknown;
  latexSelectionBridge?: unknown;
  __rewrapAll?: () => number;
  texcOpen?: (selection: Parameters<LatexAnnotationsController["open"]>[0]) => void;
  texcAnchorAll?: () => void;
  toggleTexcPanel?: (force?: boolean) => void;
  toggleOutline?: (force?: boolean) => void;
  loadPdf?: () => Promise<void>;
  showMarker?: (page: number, y: number) => boolean;
  synctexView?: (silent?: boolean) => Promise<void>;
  autoForwardSync?: () => void;
  jumpToLine?: (line: number) => void;
  synctexEdit?: (page: number, x: number, y: number) => Promise<void>;
  requestView?: () => void;
  compile?: () => Promise<void>;
  save?: () => Promise<boolean>;
  load?: () => Promise<unknown>;
  selPillShow?: (from: StudioPosition, to: StudioPosition, text: string) => void;
  selHide?: () => void;
  selCancel?: () => void;
  __dv?: StudioDiffController;
  texcAll?: unknown;
  texcMarks?: unknown;
}

export interface LatexSurfaceDependencies {
  editorFactory: StudioEditorFactory;
  diffFactory(options: StudioDiffFactoryOptions): StudioDiffJournal;
  pdfjs: PdfJs & {GlobalWorkerOptions?: {workerSrc: string}};
  selectionPill: SelectionPillAdapter;
  parser: MarkdownParser;
  sanitizer: HtmlSanitizer;
  katex: KatexRenderer;
  postToHost(payload: Record<string, unknown>): void;
  document?: Document;
  window?: Window;
}

export interface LatexSurface {
  getEditor(): LatexSurfaceEditor | null;
  load(): Promise<unknown>;
  save(): Promise<boolean>;
  compile(): Promise<void>;
  diff: StudioDiffController;
}

const MODE_BY_EXTENSION: Record<string, string | Record<string, unknown> | null> = {
  tex: "stex", py: "python", r: "r", md: "markdown", jl: "julia",
  sh: "shell", bash: "shell", zsh: "shell", json: {name: "javascript", json: true},
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: {name: "javascript", typescript: true}, tsx: {name: "javascript", typescript: true},
  jsx: "javascript", csv: null, txt: null,
};

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>]/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[character] || character);
}

export function bootstrapLatexSurface(dependencies: LatexSurfaceDependencies): LatexSurface {
  const doc = dependencies.document || document;
  const win = (dependencies.window || window) as LatexSurfaceWindow;
  if (dependencies.pdfjs.GlobalWorkerOptions) {
    dependencies.pdfjs.GlobalWorkerOptions.workerSrc = "/.fig_thumbs/pdfjs/pdf.worker.min.js";
  }
  const parameters = new URLSearchParams(win.location.search);
  const path = parameters.get("path");
  win.path = path;
  const isPdfMode = parameters.get("mode") === "pdf";
  const extension = (path || "").split(".").pop()?.toLowerCase() || "";
  const isTex = extension === "tex";
  const cmMode = MODE_BY_EXTENSION[extension] ?? null;
  const filename = path?.split("/").pop() || "(no file)";
  const channel = "BroadcastChannel" in win && path
    ? new BroadcastChannel(`latexstudio:${path}`)
    : null;
  let pdfPath = path ? path.replace(/\.tex$/, ".pdf") : null;
  let editor: LatexSurfaceEditor | null = null;
  let session: ReturnType<typeof createDocumentSession> | null = null;
  let pdfSync: LatexPdfSyncController | null = null;
  let pdfControls: LatexPdfControls | null = null;
  let annotations: LatexAnnotationsController | null = null;
  let outline: LatexOutlineController | null = null;
  let reader: LatexReadingController | null = null;
  let selectionPill: LatexSelectionPillController | null = null;
  let statusBar: StudioStatusBarController | null = null;
  let lastCompile: {log: string; ok: boolean} | null = null;
  let stateTimer: number | null = null;
  const state = doc.getElementById("state") as HTMLElement;
  const dirtyDot = doc.getElementById("ddot") as HTMLElement;
  const setState = (kind: "hint" | "dirty" | "ok" | "err", message: string): void => {
    state.className = kind;
    state.textContent = message;
    state.title = message;
    if (stateTimer !== null) win.clearTimeout(stateTimer);
    if (kind === "ok") stateTimer = win.setTimeout(() => {
      if (state.className === "ok") state.textContent = "";
    }, 2500);
  };
  (doc.getElementById("fname") as HTMLElement).textContent = filename;
  doc.title = isPdfMode ? `${filename} — PDF` : filename;

  const wrap = createEditorWrapController({
    getEditor: () => editor,
    select: doc.getElementById("wrapSel") as HTMLSelectElement,
    document: doc,
    window: win,
    storage: win.localStorage,
  });
  const wrapValue = (): string => wrap.current();

  const ensureAnnotations = (): LatexAnnotationsController => {
    if (annotations) return annotations;
    annotations = createLatexAnnotationsController({
      path: path || "",
      getEditor: () => editor,
      popover: doc.getElementById("texcPop") as HTMLElement,
      panel: doc.getElementById("texcPanel") as HTMLElement,
      button: doc.getElementById("texcBtn") as HTMLElement,
      postToHost: dependencies.postToHost,
      document: doc,
      window: win,
    });
    return annotations;
  };
  const ensureOutline = (): LatexOutlineController => {
    if (outline) return outline;
    outline = createLatexOutlineController({
      getEditor: () => editor,
      element: doc.getElementById("outline") as HTMLElement,
      button: doc.getElementById("outlineBtn") as HTMLElement,
      document: doc,
      revealLine: (target, line) => revealLineRange(target, {fromLine: line, margin: 80, focus: true}),
    });
    return outline;
  };
  const ensurePdfControls = (): LatexPdfControls => {
    if (pdfControls) return pdfControls;
    pdfControls = createLatexPdfControls({
      path,
      isPdfMode,
      getPdfPath: () => pdfPath,
      getEditor: () => editor,
      reloadPdf: () => { void loadPdf(); },
      handleResize: (width) => ensurePdfSync().handleResize(width),
      onVisibilityChange: () => reader?.syncMode(),
      postMessage: dependencies.postToHost,
      document: doc,
      window: win,
      storage: win.localStorage,
    });
    return pdfControls;
  };
  const ensurePdfSync = (): LatexPdfSyncController => {
    if (pdfSync) return pdfSync;
    pdfSync = createLatexPdfSyncController({
      path: path || "",
      isPdfMode,
      getPdfPath: () => pdfPath,
      getZoom: () => ensurePdfControls().getZoom(),
      getEditor: () => editor,
      right: doc.getElementById("right") as HTMLElement,
      marker: doc.getElementById("marker") as HTMLElement,
      pdfjs: dependencies.pdfjs,
      channel,
      tokenQuery: win.__tokq || "",
      setState,
      document: doc,
      window: win,
      revealLine: (target, line) => revealLineRange(target, {fromLine: line, margin: 120, focus: true}),
    });
    return pdfSync;
  };
  const loadPdf = (): Promise<void> => ensurePdfSync().loadPdf();
  const ensureReader = (): LatexReadingController | null => {
    if (!isTex) return null;
    if (reader) return reader;
    reader = createLatexReadingController({
      getEditor: () => editor,
      right: doc.getElementById("right") as HTMLElement,
      splitButton: doc.getElementById("togglePdf") as HTMLElement,
      popPdfButton: doc.getElementById("popPdf"),
      setPdfVisible: (visible) => ensurePdfControls().setVisible(visible),
      revealLine: (target, line) => revealLineRange(target, {fromLine: line, margin: 100, focus: true}),
      katex: dependencies.katex,
      document: doc,
      window: win,
      storage: win.localStorage,
    });
    return reader;
  };
  const ensureSelectionPill = (): LatexSelectionPillController => {
    if (selectionPill) return selectionPill;
    selectionPill = createLatexSelectionPill({
      path: path || "",
      getEditor: () => editor,
      adapter: dependencies.selectionPill,
      openComment: (selection) => ensureAnnotations().open(selection),
      clearMarker: () => {
        win._clMark?.clear();
        win._clMark = null;
      },
      document: doc,
      window: win,
    });
    return selectionPill;
  };

  let diff!: StudioDiffController;
  const applyAgentRewrap = (): void => {
    if (!isAutoRewrapEnabled(win.localStorage) || typeof win.__rewrapAll !== "function") return;
    try {
      if (win.__rewrapAll()) {
        ensureSession().markClean(editor?.getValue() || "");
        dirtyDot.style.display = "none";
        setState("ok", "rechargé + rewrap (baseline à jour)");
      }
    } catch { /* preserve the external disk version even if formatting fails */ }
  };
  const ensureSession = (): ReturnType<typeof createDocumentSession> => {
    if (session) return session;
    if (!path) throw new Error("No file path");
    session = createDocumentSession({
      read: async () => {
        const response = await win.fetch(`/code?path=${encodeURIComponent(path)}`);
        const result = await response.json() as LatexCodeResponse;
        if (result.error || typeof result.text !== "string") throw new Error(result.error || `HTTP ${response.status}`);
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
      applyText: (text) => { if (editor) editor.setValue(text); else initializeEditor(text); },
      externalReload: "always",
      conflictPolicy: "reload",
      onEvent: (event) => {
        if (event.kind === "loaded") {
          addRecentStudioFile(path, win.localStorage);
          dirtyDot.style.display = "none";
          setState("ok", "loaded");
        } else if (event.kind === "saved") {
          dirtyDot.style.display = "none";
          setState("ok", "saved");
          if (event.previousText !== null && event.previousText !== event.snapshot.text) {
            diff.push(event.previousText, event.snapshot.text, {source: "user-save", status: "applied"});
          }
          statusBar?.notifySaved();
        } else if (event.kind === "external-reload") {
          dirtyDot.style.display = "none";
          setState("ok", "version de l'agent rechargée");
          if (event.previousText !== event.snapshot.text) {
            diff.push(event.previousText, event.snapshot.text, {source: "external-reload", status: "applied"});
          }
          applyAgentRewrap();
        } else if (event.kind === "conflict" || event.kind === "error") setState("err", event.message);
      },
    });
    return session;
  };

  const initializeEditor = (text: string): LatexSurfaceEditor => {
    if (editor) {
      editor.setValue(text);
      return editor;
    }
    let resizeTimer: number | null = null;
    win.addEventListener("resize", () => {
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(() => editor?.refresh(), 120);
    });
    editor = dependencies.editorFactory.createEditor({
      parent: doc.getElementById("left") as HTMLElement,
      value: text,
      ext: extension,
      wrap: win.localStorage.getItem("cmWrap") !== "off",
      readOnly: false,
      defaultEngine: "cm6",
      aiEnabled: () => win.localStorage.getItem("atelier.latex.cm6.ai") !== "0",
      onGhostState: (message) => setState("ok", String(message)),
      cm5Options: {
        mode: cmMode, theme: "material-darker", lineNumbers: true,
        lineWrapping: true, viewportMargin: 50, styleSelectedText: true,
        matchBrackets: true, autoCloseBrackets: true, foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        highlightSelectionMatches: {annotateScrollbar: true, minChars: 3},
      },
    }) as LatexSurfaceEditor;
    win.cm = editor;
    if (win.__ENGINE === "cm6") win.CodeMirrorPass = editor.Pass;
    editor.on("cursorActivity", () => {
      const cursor = editor!.getCursor();
      const position = doc.getElementById("sbPos");
      if (position) position.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    });
    if (win.__ENGINE !== "cm6") {
      let activeLine: number | null = null;
      editor.on("cursorActivity", () => {
        const line = editor!.getCursor().line;
        if (line === activeLine) return;
        if (activeLine !== null) {
          editor!.removeLineClass(activeLine, "background", "cm-activeline");
          editor!.removeLineClass(activeLine, "gutter", "cm-activeline-gutter");
        }
        editor!.addLineClass(line, "background", "cm-activeline");
        editor!.addLineClass(line, "gutter", "cm-activeline-gutter");
        activeLine = line;
      });
    }
    editor.on("change", (...args: unknown[]) => {
      const change = args[1] as {origin?: string} | undefined;
      if (change?.origin !== "setValue") {
        ensureSession().markDirty();
        ensurePdfSync().noteEdit();
        dirtyDot.style.display = "inline";
        setState("dirty", "modified");
      }
    });
    editor.on("cursorActivity", () => ensurePdfSync().autoForwardSync());
    if (!editor.hasNativeGhost) win.latexGhostController = installLegacyLatexGhost(editor);
    const lineParameter = parameters.get("line");
    const match = lineParameter ? /^(\d+)(?:-(\d+))?$/.exec(lineParameter) : null;
    if (match) {
      const fromLine = Math.max(0, Number.parseInt(match[1] || "1", 10) - 1);
      const toLine = match[2] ? Number.parseInt(match[2], 10) - 1 : fromLine;
      win.setTimeout(() => {
        if (!editor) return;
        revealLineRange(editor, {fromLine, toLine, contextAfter: 3, margin: 120});
        for (let line = fromLine; line <= Math.min(toLine, editor.lineCount() - 1); line += 1) {
          editor.addLineClass(line, "background", "cm-line-flash");
        }
        win.setTimeout(() => {
          if (!editor) return;
          for (let line = fromLine; line <= Math.min(toLine, editor.lineCount() - 1); line += 1) {
            editor.removeLineClass(line, "background", "cm-line-flash");
          }
        }, 2600);
      }, 60);
    }
    win.latexSelectionBridge = attachEditorSelection({
      editor,
      canPublish: () => !diff.isShown(),
      onSkipped: () => ensureSelectionPill().hide(),
      onEmpty: () => ensureSelectionPill().hide(),
      buildPayload: (selection) => ({
        lines: selection.lines,
        words: selection.words,
        text: selection.text,
        rel: path,
        name: filename,
        page: `L${selection.from.line + 1}-${selection.to.line + 1}`,
      }),
      onSelection: (selection) => ensureSelectionPill().show(selection.from, selection.to, selection.text),
      hostWindow: win,
      fetchImpl: win.fetch.bind(win),
    });
    wrap.refresh();
    const rewrap = createRewrapController({
      editor,
      isTex,
      extension,
      getWrapValue: wrapValue,
      setState,
      document: doc,
      button: doc.getElementById("rewrapBtn"),
    });
    win.__rewrapAll = rewrap.all;
    ensureAnnotations().bind();
    ensureReader()?.bind();
    const ResizeObserverConstructor = (win as Window & {ResizeObserver?: typeof ResizeObserver}).ResizeObserver;
    const left = doc.getElementById("left");
    if (ResizeObserverConstructor && left) {
      let frame = 0;
      const observer = new ResizeObserverConstructor(() => {
        if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; editor?.refresh(); });
      });
      observer.observe(left);
    }
    return editor;
  };

  const showLoadError = (message: string): void => {
    (doc.getElementById("left") as HTMLElement).innerHTML = `<div style="padding:24px;color:var(--muted,#9aa3af);font:13px/1.6 -apple-system,sans-serif">Impossible de charger <b>${escapeHtml(path || "(aucun chemin)")}</b><br>${escapeHtml(message)}</div>`;
    setState("err", message);
  };
  const load = async (): Promise<unknown> => {
    try { return await ensureSession().load(); }
    catch (error) {
      showLoadError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  const save = async (): Promise<boolean> => {
    if (isAutoRewrapEnabled(win.localStorage)) {
      try { win.__rewrapAll?.(); } catch { /* save the current buffer */ }
    }
    return ensureSession().save();
  };

  const compileChip = (kind: string, message: string): void => {
    const chip = doc.getElementById("sbCompile") as HTMLElement;
    if (!chip) return;
    chip.style.display = "inline-flex";
    chip.className = kind;
    (doc.getElementById("sbCompileTxt") as HTMLElement).textContent = message;
  };
  const consoleToggle = (force?: boolean): void => {
    const log = doc.getElementById("texlog") as HTMLElement;
    log.classList.toggle("open", force ?? !log.classList.contains("open"));
  };
  const renderCompileLog = (log: LatexCompileLog): void => {
    const panel = doc.getElementById("texlog") as HTMLElement;
    const body = doc.getElementById("tlBody") as HTMLElement;
    lastCompile = {log: log.log, ok: log.ok};
    (doc.getElementById("tlStatus") as HTMLElement).textContent = log.ok ? "· réussie" : "· échec";
    body.innerHTML = log.html;
    panel.classList.toggle("open", !log.ok);
    if (!log.ok) body.querySelector<HTMLElement>(".tl-err")?.scrollIntoView({block: "start"});
  };
  const compileCoordinator = createLatexCompileCoordinator({
    isTex,
    getText: () => editor?.getValue() || "",
    isDirty: () => ensureSession().state.dirty,
    save,
    requestCompile: async () => {
      const response = await win.fetch("/compile", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path}),
      });
      return response.json();
    },
    revealIssue: (issue) => {
      if (!editor) return;
      revealLineRange(editor, {fromLine: issue.line - 1, margin: 120});
      editor.focus();
    },
    setState,
    setChip: compileChip,
    renderLog: renderCompileLog,
    onCompiled: (response) => {
      if (response.pdf) pdfPath = response.pdf;
      void loadPdf();
      channel?.postMessage({t: "compiled"});
    },
  });
  const compile = (): Promise<void> => compileCoordinator.compile();

  const picker = createStudioFilePicker({
    currentPath: path,
    picker: doc.getElementById("picker") as HTMLElement,
    pathLabel: doc.getElementById("pickerPath") as HTMLElement,
    list: doc.getElementById("pickerList") as HTMLElement,
    openButton: doc.getElementById("openFile"),
    document: doc,
    window: win,
    storage: win.localStorage,
  });
  diff = createStudioDiffController({
    factory: dependencies.diffFactory,
    getEditor: () => editor,
    path,
    notify: (message) => setState("ok", message),
    restoreText: async (text) => {
      if (!path) return false;
      const currentSession = ensureSession();
      const response = await win.fetch("/codesave", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path, text, mtime: currentSession.state.mtime}),
      });
      const result = await response.json() as LatexCodeResponse;
      if (result.error || !Number.isFinite(Number(result.mtime))) return false;
      currentSession.acceptSaved({text, mtime: Number(result.mtime)}, true);
      dirtyDot.style.display = "none";
      setState("ok", "version restaurée");
      return true;
    },
    enableSelectionQuote: true,
    hideEmbeddedIdentity: true,
    postToHost: dependencies.postToHost,
    document: doc,
    window: win,
  });
  win.__dv = diff;
  Object.defineProperty(win, "texcAll", {
    configurable: true,
    get: () => ensureAnnotations().annotations(),
  });
  Object.defineProperty(win, "texcMarks", {
    configurable: true,
    get: () => ensureAnnotations().marks(),
  });

  ensureOutline();
  ensureReader();
  ensurePdfControls();
  const compileChipElement = doc.getElementById("sbCompile") as HTMLElement;
  const consoleChip = doc.getElementById("sbConsole") as HTMLElement;
  compileChipElement.onclick = () => consoleToggle();
  if (isTex && consoleChip) {
    consoleChip.style.display = "";
    consoleChip.onclick = () => consoleToggle();
  }
  (doc.getElementById("tlClose") as HTMLElement).onclick = () => (doc.getElementById("texlog") as HTMLElement).classList.remove("open");
  (doc.getElementById("tlChat") as HTMLElement).onclick = () => {
    if (!lastCompile) return;
    const selected = String(win.getSelection() || "").trim();
    let excerpt = selected;
    if (!excerpt) {
      excerpt = lastCompile.log.split("\n").slice(-120).join("\n");
      if (excerpt.length > 6000) excerpt = excerpt.slice(-6000);
    }
    dependencies.postToHost({
      type: "atelier-add-to-chat",
      text: `Log de compilation LaTeX (${lastCompile.ok ? "réussie" : "ÉCHEC"}) — ${filename || "document.tex"} :\n\`\`\`\n${excerpt}\n\`\`\``,
    });
    const button = doc.getElementById("tlChat") as HTMLElement;
    const previous = button.innerHTML;
    button.textContent = "✓ envoyé";
    win.setTimeout(() => { button.innerHTML = previous; }, 1400);
  };
  (doc.getElementById("tlBody") as HTMLElement).addEventListener("click", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(".tl-jump");
    if (!target || !editor) return;
    revealLineRange(editor, {fromLine: Number.parseInt(target.dataset.l || "1", 10) - 1, margin: 120, focus: true});
  });
  state.style.cursor = "pointer";
  state.addEventListener("click", () => {
    const panel = doc.getElementById("texlog") as HTMLElement;
    if ((doc.getElementById("tlBody") as HTMLElement).textContent) panel.classList.toggle("open");
  });
  (doc.getElementById("build") as HTMLElement).onclick = () => { void compile(); };
  (doc.getElementById("saveBtn") as HTMLElement).onclick = () => { void save(); };
  (doc.getElementById("reloadPdf") as HTMLElement).onclick = () => { void loadPdf(); };
  const help = doc.getElementById("helpPop") as HTMLElement;
  (doc.getElementById("helpBtn") as HTMLElement).onclick = (event) => {
    event.stopPropagation();
    help.style.display = help.style.display === "flex" ? "none" : "flex";
  };
  doc.addEventListener("click", () => { help.style.display = "none"; });

  installStudioCommands({
    getEditor: () => editor,
    document: doc,
    selectAll: true,
    escape: () => { if (editor) ensureSelectionPill().cancel(); },
    save,
    canSave: (target) => !target.getOption("readOnly"),
    compile: isTex ? compile : undefined,
    sync: () => ensurePdfSync().synctexView(),
  });
  statusBar = createStudioStatusBar({
    extension,
    mode: cmMode,
    path: path || "",
    getEditor: () => editor,
    applyWrap: (value) => wrap.apply(value),
    rewrapAll: () => win.__rewrapAll?.() || 0,
    revealLine: (target, line) => revealLineRange(target, {fromLine: line, margin: 100, focus: true}),
    document: doc,
    window: win,
    storage: win.localStorage,
  });

  if (!isTex) configureNonTexCompatibility();
  win.setInterval(() => {
    if (editor && !diff.isBusy()) void ensureSession().pollOnce();
  }, 2000);
  if (path && isPdfMode) {
    doc.body.classList.add("pdfmode");
    setState("hint", "clic dans le PDF → ligne source dans l'éditeur");
  } else if (path) void load();
  else {
    setState("ok", "choose a .tex file");
    void picker.show("");
  }
  if (path) {
    void win.fetch(`/texroot?path=${encodeURIComponent(path)}`)
      .then((response) => response.json() as Promise<TexRootResponse>)
      .then((result) => {
        if (result.pdf) pdfPath = result.pdf;
        if (isTex) return loadPdf().then(() => { if (isPdfMode) ensurePdfSync().requestView(); });
        return undefined;
      })
      .catch(() => { if (isTex) void loadPdf(); });
  }

  win.texcOpen = (selection) => ensureAnnotations().open(selection);
  win.texcAnchorAll = () => ensureAnnotations().anchorAll();
  win.toggleTexcPanel = (force) => ensureAnnotations().togglePanel(force);
  win.toggleOutline = (force) => ensureOutline().toggle(force);
  win.loadPdf = loadPdf;
  win.showMarker = (page, y) => ensurePdfSync().showMarker(page, y);
  win.synctexView = (silent) => ensurePdfSync().synctexView(silent);
  win.autoForwardSync = () => ensurePdfSync().autoForwardSync();
  win.jumpToLine = (line) => ensurePdfSync().jumpToLine(line);
  win.synctexEdit = (page, x, y) => ensurePdfSync().synctexEdit(page, x, y);
  win.requestView = () => ensurePdfSync().requestView();
  win.compile = compile;
  win.save = save;
  win.load = load;
  win.selPillShow = (from, to, text) => ensureSelectionPill().show(from, to, text);
  win.selHide = () => ensureSelectionPill().hide();
  win.selCancel = () => ensureSelectionPill().cancel();

  return {getEditor: () => editor, load, save, compile, diff};

  function configureNonTexCompatibility(): void {
    ["build", "togglePdf", "popPdf", "reloadPdf"].forEach((id) => {
      const element = doc.getElementById(id) as HTMLElement | null;
      if (element) element.style.display = "none";
    });
    const right = doc.getElementById("right") as HTMLElement;
    const left = doc.getElementById("left") as HTMLElement;
    if (extension !== "md") {
      right.style.display = "none";
      left.style.width = "100%";
      left.style.borderRight = "none";
      return;
    }
    right.insertAdjacentHTML("beforeend", '<div id="mdprev" style="max-width:820px;margin:0 auto;padding:28px 32px;font-family:var(--ui-font,-apple-system,sans-serif);font-size:15px;line-height:1.65;color:#d6dae0"></div>');
    const preview = doc.getElementById("mdprev") as HTMLElement;
    const render = (): void => {
      try { preview.innerHTML = dependencies.sanitizer.sanitize(dependencies.parser.parse(editor?.getValue() || "")); }
      catch { /* keep the last valid preview */ }
    };
    const applyMode = (mode: string): void => {
      win.localStorage.setItem("mdViewMode", mode);
      if (mode === "edit") {
        right.style.display = "none"; left.style.display = "flex"; left.style.width = "100%"; left.style.borderRight = "none";
      } else if (mode === "preview") {
        right.style.display = "block"; left.style.display = "none";
      } else {
        right.style.display = "block"; left.style.display = "flex"; left.style.width = "50%"; left.style.borderRight = "1px solid var(--border)";
      }
      doc.querySelectorAll<HTMLElement>("#mdModeSeg button").forEach((button) => button.classList.toggle("mdon", button.dataset.m === mode));
      if (editor) win.setTimeout(() => editor?.refresh(), 60);
    };
    const wrapGroup = doc.getElementById("wrapSel")?.closest(".grp");
    if (wrapGroup) {
      wrapGroup.insertAdjacentHTML("afterend", '<span class="sep editonly"></span><span class="grp editonly" id="mdModeSeg"><button data-m="edit" title="Édition seule">Édition</button><button data-m="split" title="Éditeur + aperçu">Split</button><button data-m="preview" title="Aperçu seul">Aperçu</button></span>');
      doc.querySelectorAll<HTMLElement>("#mdModeSeg button").forEach((button) => {
        button.onclick = () => applyMode(button.dataset.m || "edit");
      });
    }
    const initializeMarkdown = (): void => {
      if (!editor) { win.setTimeout(initializeMarkdown, 100); return; }
      let timer: number | null = null;
      editor.on("change", () => {
        if (timer !== null) win.clearTimeout(timer);
        timer = win.setTimeout(render, 300);
      });
      render();
      applyMode(win.localStorage.getItem("mdViewMode") || "edit");
    };
    win.setTimeout(initializeMarkdown, 0);
    if (win.self === win.top) return;
    const button = doc.createElement("button");
    button.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" style="vertical-align:-2px"><path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z"/></svg>&nbsp; Add to chat';
    button.style.cssText = "position:fixed;z-index:9999;display:none;background:#2c313a;color:#dbdfe5;border:1px solid #3a414d;border-radius:999px;padding:7px 14px;font-size:13px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.5);font-family:var(--ui-font)";
    doc.body.appendChild(button);
    let selectedText = "";
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedText || !path) return;
      const words = selectedText.split(/\s+/).filter(Boolean);
      const flatten = (value: string): string => value.replace(/[#*_`>\[\]()!-]/g, "").replace(/\s+/g, " ");
      const source = editor?.getValue() || "";
      const sourceFlat = flatten(source);
      const first = sourceFlat.indexOf(flatten(words.slice(0, 4).join(" ")));
      const last = sourceFlat.indexOf(flatten(words.slice(-4).join(" ")), Math.max(0, first));
      const lineOf = (index: number): number => {
        let seen = 0;
        let line = 1;
        for (const sourceLine of source.split("\n")) {
          seen += flatten(sourceLine).length + 1;
          if (seen > index) return line;
          line += 1;
        }
        return line;
      };
      const fromLine = first >= 0 ? lineOf(first) : 0;
      const toLine = last >= 0 ? lineOf(last) : fromLine;
      const page = fromLine ? `L${fromLine}${toLine > fromLine ? `-${toLine}` : ""}` : "";
      void win.fetch("/quote", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rel: path, page, text: selectedText, comment: "", direct: true, embed: true}),
      }).then((response) => response.json() as Promise<QuoteResponse>)
        .then((result) => { if (result.message) dependencies.postToHost({type: "atelier-add-to-chat", text: result.message}); })
        .catch(() => undefined);
      button.style.display = "none";
      win.getSelection()?.removeAllRanges();
    });
    right.addEventListener("mouseup", () => win.setTimeout(() => {
      const selection = win.getSelection();
      const text = selection ? String(selection).trim() : "";
      if (!text || !selection?.rangeCount) {
        button.style.display = "none";
        selectedText = "";
        return;
      }
      selectedText = text;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      button.style.left = `${Math.max(8, rect.left + rect.width / 2 - 55)}px`;
      button.style.top = `${Math.max(8, rect.top - 42)}px`;
      button.style.display = "block";
    }, 0));
  }
}
