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
  // Gabarits d'abord : un div dimensionné par page (viewport connu sans
  // rendu), le canvas n'existe que pour les pages proches du viewport et est
  // évincé au-delà de MAX_LIVE_PAGES — un article de 40 pages ne garde plus
  // des centaines de Mo de canvas résidents (audit perf 2026-08-28).
  const MAX_LIVE_PAGES = 6;
  let pdfDocument: PdfDocument | null = null;
  let pages: Array<HTMLElement | undefined> = [];
  let viewports: Array<{scale: number; height: number} | undefined> = [];
  const liveCanvases = new Map<number, HTMLCanvasElement>();
  // Garde de course : `liveCanvases.has()` seul ne protège rien avant le
  // premier `await` de renderPage() — deux appels concurrents pour la même
  // page passeraient tous les deux la garde et prépendraient chacun un
  // canvas, le perdant n'étant jamais suivi dans liveCanvases (canvas
  // orphelin, jamais évincé). Scénario réel : le clic §4 (disconnect() +
  // re-observe() de tous les gabarits à la réactivation d'onglet) met en
  // file une entrée IO fraîche pour toute cible déjà intersectante — y
  // compris une page dont le rendu était déjà en vol quand l'onglet a été
  // masqué — plus un défilement rapide qui redéclenche la même page.
  const pagesEnCours = new Set<number>();
  let pageObserver: IntersectionObserver | null = null;
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
      // Rechargement (compilation) : plus d'observer résident sur les gabarits
      // détruits, plus de canvas vivant pointant vers du DOM disparu.
      pageObserver?.disconnect();
      pageObserver = null;
      options.right.querySelectorAll(".pdfpage").forEach((element) => element.remove());
      pages = [];
      viewports = [];
      liveCanvases.clear();
      pagesEnCours.clear();
      lastWidth = options.right.clientWidth;
      const width = (options.right.clientWidth - 24) * options.getZoom();

      const evictFarthest = (anchor: number): void => {
        let victim = -1;
        let distance = -1;
        for (const pageNumber of liveCanvases.keys()) {
          const d = Math.abs(pageNumber - anchor);
          if (d > distance) { distance = d; victim = pageNumber; }
        }
        if (victim < 0) return;
        const victimCanvas = liveCanvases.get(victim);
        liveCanvases.delete(victim);
        // Retire seulement le canvas (le gabarit garde sa taille) — pas
        // replaceChildren() : le marqueur synctex partagé peut être un autre
        // enfant du même gabarit et ne doit pas disparaître avec le canvas.
        victimCanvas?.remove();
      };

      const renderPage = async (pageNumber: number): Promise<void> => {
        if (token !== loadToken || liveCanvases.has(pageNumber) || pagesEnCours.has(pageNumber)) return;
        // Marqueur synchrone posé AVANT le premier await : liveCanvases.has()
        // seul ne protège rien tant que l'entrée n'existe pas encore (elle
        // n'est écrite qu'après le rendu) — deux appels concurrents pour la
        // même page passeraient tous les deux la garde du dessus.
        pagesEnCours.add(pageNumber);
        try {
          const element = pages[pageNumber];
          const info = viewports[pageNumber];
          if (!element || !info) return;
          const page = await loaded.getPage(pageNumber);
          const viewport = page.getViewport({scale: info.scale});
          const canvas = doc.createElement("canvas");
          canvas.width = viewport.width * win.devicePixelRatio;
          canvas.height = viewport.height * win.devicePixelRatio;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.scale(win.devicePixelRatio, win.devicePixelRatio);
          await page.render({canvasContext: context, viewport, intent: "print"}).promise;
          if (token !== loadToken) return;
          // prepend, jamais replaceChildren : le gabarit peut déjà porter le
          // marqueur synctex partagé (options.marker) posé par showMarker()
          // avant que cette page n'ait fini de se rendre — ne pas l'effacer.
          element.prepend(canvas);
          liveCanvases.set(pageNumber, canvas);
          if (liveCanvases.size > MAX_LIVE_PAGES) evictFarthest(pageNumber);
        } finally {
          // Toujours libérer — y compris sur l'abandon `token !== loadToken` —
          // sinon une page reste marquée "en cours" à vie après un rechargement
          // et ne sera plus jamais reproposée par renderPage().
          pagesEnCours.delete(pageNumber);
        }
      };

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
        options.right.appendChild(element);
        pages[pageNumber] = element;
        viewports[pageNumber] = {scale, height: base.height};
        // Coordonnées lues sur le gabarit (toujours présent), jamais sur le
        // canvas — la page peut ne pas encore être rendue au moment du clic.
        element.onclick = (event) => {
          const rect = element.getBoundingClientRect();
          const info = viewports[pageNumber];
          if (!info) return;
          void synctexEdit(pageNumber,
            (event.clientX - rect.left) / info.scale,
            (event.clientY - rect.top) / info.scale);
        };
      }

      // `IntersectionObserver` vit sur le global, pas sur l'interface DOM
      // `Window` des types TS — lu via `win` (jamais le global nu) pour
      // respecter la fenêtre injectée par les harnais de test.
      const IObserver = (win as unknown as {IntersectionObserver?: typeof IntersectionObserver}).IntersectionObserver;
      if (typeof IObserver === "function") {
        const observer = new IObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const pageNumber = Number((entry.target as HTMLElement).dataset.page);
            if (pageNumber) void renderPage(pageNumber);
          }
        }, {root: options.right, rootMargin: "150% 0%"});
        pageObserver = observer;
        for (const element of pages) {
          if (element) observer.observe(element);
        }
      } else {
        // Repli (environnement sans IntersectionObserver, ex. harnais de
        // test) : rendu immédiat de toutes les pages ; l'éviction au-delà de
        // MAX_LIVE_PAGES reste active.
        for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
          if (token !== loadToken) return;
          await renderPage(pageNumber);
        }
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

  // Recompilation EXTERNE (agent au terminal) : le canal « compiled » ne sonne
  // que pour la compilation interne. Sans cette veille du mtime, le pane
  // affiche une image périmée pendant que synctex répond pour le PDF neuf sur
  // disque — les sauts tombent « à côté ».
  let watchedMtime: number | null = null;
  // Les harnais de test montent ce contrôleur avec un `window` minimal.
  if (typeof win.setInterval === "function") win.setInterval(() => {
    const pdfPath = options.getPdfPath();
    if (!pdfPath || !pdfDocument || doc.hidden) return;
    void win.fetch(`/statfile?path=${encodeURIComponent(pdfPath)}${options.tokenQuery || ""}`)
      .then((response) => response.ok ? response.json() as Promise<{mtime?: number}> : null)
      .then((stat) => {
        if (typeof stat?.mtime !== "number") return;
        if (watchedMtime !== null && stat.mtime > watchedMtime) void loadPdf();
        watchedMtime = stat.mtime;
      })
      .catch(() => undefined);
  }, 2500);

  doc.addEventListener("visibilitychange", () => {
    if (options.isPdfMode && !doc.hidden) requestView();
  });
  win.addEventListener("message", (event) => {
    const message = event.data as {type?: string} | null;
    if (event.source !== win.parent || message?.type !== "atelier-tab-activated" || !options.isPdfMode) return;
    requestView();
    // PIEGES_CONNUS.md §4 : un iframe display:none→block ne redéclenche NI
    // visibilitychange NI IntersectionObserver dans ce WebView — si loadPdf()
    // a tourné pendant que l'onglet PDF était masqué, les entrées de l'IO
    // peuvent être figées à "non visible" même une fois l'onglet affiché.
    // Ré-observer chaque gabarit force une intersection fraîche.
    if (pageObserver) {
      const observer = pageObserver;
      observer.disconnect();
      for (const element of pages) { if (element) observer.observe(element); }
    }
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
