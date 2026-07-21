import type {StudioEditor} from "../../core/editor_contract";

interface SyncEditor extends StudioEditor {
  addLineClass(line: number, where: string, className: string): void;
  removeLineClass(line: number, where: string, className: string): void;
}

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfPage {
  getViewport(options: {scale: number}): PdfViewport;
  render(options: {canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; intent: string}): {promise: Promise<unknown>};
}

interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
}

export interface PdfJs {
  getDocument(options: Record<string, unknown>): {promise: Promise<PdfDocument>};
}

export interface SyncChannel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

interface SyncResponse {
  page?: number;
  y?: number;
  line?: number;
}

export interface LatexPdfSyncOptions {
  path: string;
  isPdfMode: boolean;
  getPdfPath(): string | null;
  getZoom(): number;
  getEditor(): SyncEditor | null;
  right: HTMLElement;
  marker: HTMLElement;
  pdfjs: PdfJs;
  channel: SyncChannel | null;
  tokenQuery?: string;
  setState(kind: "hint" | "err", message: string): void;
  revealLine(editor: SyncEditor, line: number): void;
  document?: Document;
  window?: Window;
  now?: () => number;
  wallNow?: () => number;
}

export interface LatexPdfSyncController {
  loadPdf(): Promise<void>;
  showMarker(page: number, y: number): boolean;
  synctexView(silent?: boolean): Promise<void>;
  synctexEdit(page: number, x: number, y: number): Promise<void>;
  autoForwardSync(): void;
  jumpToLine(line: number): void;
  requestView(): void;
  noteEdit(): void;
  handleResize(width: number): void;
  hasDocument(): boolean;
}

export function createLatexPdfSyncController(options: LatexPdfSyncOptions): LatexPdfSyncController {
  const doc = options.document || document;
  const win = options.window || window;
  const now = options.now || (() => win.performance ? win.performance.now() : Date.now());
  const wallNow = options.wallNow || Date.now;
  let pdfDocument: PdfDocument | null = null;
  let pages: Array<HTMLElement | undefined> = [];
  let viewports: Array<{scale: number; height: number} | undefined> = [];
  let loadToken = 0;
  let lastWidth = 0;
  let lastEditAt = 0;
  let forwardTimer: number | null = null;
  let forwardLine = -1;
  let lastSyncLine: number | null = null;
  let lastRequestView = 0;

  const jumpToLine = (line: number): void => {
    const editor = options.getEditor();
    if (!editor) return;
    const target = line - 1;
    options.revealLine(editor, target);
    if (lastSyncLine !== null) editor.removeLineClass(lastSyncLine, "background", "cm-syncline");
    editor.addLineClass(target, "background", "cm-syncline");
    lastSyncLine = target;
  };

  const showMarker = (page: number, y0: number): boolean => {
    const element = pages[page];
    const viewport = viewports[page];
    if (!element || !viewport) return false;
    const y = y0 * viewport.scale;
    element.appendChild(options.marker);
    options.marker.style.top = `${y - 14}px`;
    options.marker.style.display = "block";
    element.scrollIntoView({block: "nearest"});
    options.right.scrollTop = element.offsetTop + y - options.right.clientHeight / 2;
    win.setTimeout(() => { options.marker.style.display = "none"; }, 2500);
    return true;
  };

  const synctexView = async (silent = false): Promise<void> => {
    const editor = options.getEditor();
    if (!editor) return;
    const response = await win.fetch("/synctex", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        dir: "view", tex: options.path, pdf: options.getPdfPath(),
        line: editor.getCursor().line + 1,
      }),
    });
    const result = await response.json() as SyncResponse;
    if (!result.page) {
      if (!silent) options.setState("hint", "synctex : pas de correspondance ici");
      return;
    }
    options.channel?.postMessage({t: "view", page: result.page, y: result.y});
    if (pdfDocument && !showMarker(result.page, result.y || 0) && !silent) {
      options.setState("err", "synctex: page not rendered");
    }
  };

  const synctexEdit = async (page: number, x: number, y: number): Promise<void> => {
    const response = await win.fetch("/synctex", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({dir: "edit", tex: options.path, pdf: options.getPdfPath(), page, x, y}),
    });
    const result = await response.json() as SyncResponse;
    if (!result.line) {
      options.setState("hint", "synctex : pas de correspondance ici");
      return;
    }
    jumpToLine(result.line);
    options.channel?.postMessage({t: "jump", line: result.line});
  };

  const loadPdf = async (): Promise<void> => {
    const token = ++loadToken;
    const pdfPath = options.getPdfPath();
    if (!pdfPath) return;
    try {
      const loaded = await options.pdfjs.getDocument({
        url: `/raw?path=${encodeURIComponent(pdfPath)}${options.tokenQuery || ""}&t=${Date.now()}`,
        standardFontDataUrl: "/.fig_thumbs/pdfjs/standard_fonts/",
        cMapUrl: "/.fig_thumbs/pdfjs/cmaps/",
        cMapPacked: true,
      }).promise;
      if (token !== loadToken) return;
      pdfDocument = loaded;
      const scroll = options.right.scrollTop;
      options.right.querySelectorAll(".pdfpage").forEach((element) => element.remove());
      pages = [];
      viewports = [];
      lastWidth = options.right.clientWidth;
      const width = (options.right.clientWidth - 24) * options.getZoom();
      for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
        if (token !== loadToken) return;
        const page = await loaded.getPage(pageNumber);
        const base = page.getViewport({scale: 1});
        const scale = width / base.width;
        const viewport = page.getViewport({scale});
        const element = doc.createElement("div");
        element.className = "pdfpage";
        element.dataset.page = String(pageNumber);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        const canvas = doc.createElement("canvas");
        canvas.width = viewport.width * win.devicePixelRatio;
        canvas.height = viewport.height * win.devicePixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        element.appendChild(canvas);
        options.right.appendChild(element);
        pages[pageNumber] = element;
        viewports[pageNumber] = {scale, height: base.height};
        const context = canvas.getContext("2d");
        if (context) {
          context.scale(win.devicePixelRatio, win.devicePixelRatio);
          await page.render({canvasContext: context, viewport, intent: "print"}).promise;
        }
        element.onclick = (event) => {
          const rect = element.getBoundingClientRect();
          void synctexEdit(pageNumber,
            (event.clientX - rect.left) / scale,
            (event.clientY - rect.top) / scale);
        };
      }
      options.right.scrollTop = scroll;
    } catch (error) {
      console.warn("loadPdf:", error);
    }
  };

  const requestView = (): void => {
    if (!options.isPdfMode || !options.channel || !pdfDocument) return;
    const requestedAt = now();
    if (requestedAt - lastRequestView < 250) return;
    lastRequestView = requestedAt;
    options.channel.postMessage({t: "want-view"});
  };
  const pdfPaneVisible = (): boolean => Boolean(pdfDocument)
    && options.right.style.display !== "none"
    && !options.right.classList.contains("reading");
  const autoForwardSync = (): void => {
    const editor = options.getEditor();
    if (!editor || options.isPdfMode || !pdfPaneVisible()) return;
    const line = editor.getCursor().line;
    if (line === forwardLine || wallNow() - lastEditAt < 300) return;
    forwardLine = line;
    if (forwardTimer !== null) win.clearTimeout(forwardTimer);
    forwardTimer = win.setTimeout(() => { void synctexView(true); }, 350);
  };

  doc.addEventListener("visibilitychange", () => {
    if (options.isPdfMode && !doc.hidden) requestView();
  });
  win.addEventListener("message", (event) => {
    const message = event.data as {type?: string} | null;
    if (event.source === win.parent && message?.type === "atelier-tab-activated" && options.isPdfMode) requestView();
  });
  if (options.channel) options.channel.onmessage = (event: MessageEvent) => {
    const message = (event.data || {}) as {t?: string; page?: number; y?: number; line?: number};
    if (options.isPdfMode) {
      if (message.t === "compiled") void loadPdf();
      else if (message.t === "view" && message.page) showMarker(message.page, message.y || 0);
    } else if (message.t === "jump" && message.line) jumpToLine(message.line);
    else if (message.t === "want-view") void synctexView();
  };

  return {
    loadPdf,
    showMarker,
    synctexView,
    synctexEdit,
    autoForwardSync,
    jumpToLine,
    requestView,
    noteEdit: () => { lastEditAt = wallNow(); },
    handleResize: (width: number) => {
      if (pdfDocument && Math.abs(width - lastWidth) > 8) {
        lastWidth = width;
        void loadPdf();
      }
    },
    hasDocument: () => Boolean(pdfDocument),
  };
}
