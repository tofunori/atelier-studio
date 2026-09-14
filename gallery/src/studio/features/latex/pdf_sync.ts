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
  getTextContent?(): Promise<unknown>;
  getViewport(options: {scale: number}): PdfViewport;
  render(options: {canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; intent: string}): {promise: Promise<unknown>};
}

interface PdfDocument {
  numPages: number;
  destroy?(): Promise<void>;
  getPage(page: number): Promise<PdfPage>;
}

export interface PdfJs {
  /** pdf.js < 4 seulement — supprimé en 4.x au profit de la classe TextLayer. */
  renderTextLayer?(options: Record<string, unknown>): {promise: Promise<unknown>};
  /** pdf.js >= 4 : remplaçant de renderTextLayer(). */
  TextLayer?: new (options: Record<string, unknown>) => {render(): Promise<unknown>};
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
  getPdfCandidates?(): readonly string[];
  selectPdf?(path: string): void;
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
  const status = doc.createElement("div");
  status.className = "pdf-load-status";
  status.setAttribute("role", "status");
  options.right.appendChild(status);
  const pdfVariants = doc.createElement("section"); pdfVariants.className = "pdf-variants"; pdfVariants.hidden = true;
  doc.getElementById("morePop")?.appendChild(pdfVariants);
  const showStatus = (message: string, retry = false): void => {
    status.replaceChildren(); status.hidden = !message;
    status.appendChild(doc.createTextNode(message));
    if (retry) {
      const button = doc.createElement("button"); button.textContent = "Réessayer";
      button.onclick = () => { void loadPdf(); }; status.appendChild(button);
    }
  };
  let pdfDocument: PdfDocument | null = null;
  let pages: Array<HTMLElement | undefined> = [];
  let viewports: Array<{scale: number; height: number} | undefined> = [];
  let pageObserver: IntersectionObserver | null = null;
  let loadToken = 0;
  let loading = false;
  let watchedMtime: number | null = null;
  let watchedPath: string | null = null;
  let statInFlight = false;
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
    loading = false;
    const pdfPath = options.getPdfPath();
    const candidates = options.getPdfCandidates?.() || [];
    pdfVariants.replaceChildren(); pdfVariants.hidden = candidates.length < 2;
    if (candidates.length > 1) {
      for (const path of candidates) {
        const item = doc.createElement("div"); item.dataset.act = "pdfvariant"; item.dataset.pdfPath = path;
        item.setAttribute("role", "menuitemradio"); item.setAttribute("aria-checked", String(path === pdfPath)); item.tabIndex = 0;
        item.textContent = `${path === pdfPath ? "✓ " : ""}${path}`; item.title = "Afficher ce PDF compilé";
        item.onclick = () => {options.selectPdf?.(path); void loadPdf();};
        item.onkeydown = event => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); item.click();}};
        pdfVariants.appendChild(item);
      }
    }
    if (!pdfPath && candidates.length) {
      showStatus("Plusieurs PDF compilés existent. Choisis celui à afficher.");
      const select = doc.createElement("select"); select.setAttribute("aria-label", "PDF compilé à afficher");
      const placeholder = doc.createElement("option"); placeholder.value = ""; placeholder.textContent = "Choisir un PDF…"; select.appendChild(placeholder);
      for (const path of candidates) { const option = doc.createElement("option"); option.value = path; option.textContent = path; select.appendChild(option); }
      select.value = pdfPath || "";
      select.onchange = () => {if (select.value) {options.selectPdf?.(select.value); void loadPdf();}};
      status.appendChild(select);
      return;
    }
    if (!pdfPath) { showStatus("Compile le document pour afficher son PDF."); return; }
    // A refresh must not insert a status block into the existing page flow.
    if (!pdfDocument) showStatus("Chargement du PDF…");
    loading = true;
    let loaded: PdfDocument | null = null;
    let committed = false;
    let abandoned = false;
    let staging: HTMLElement | null = null;
    try {
      // Capture the revision before fetching bytes. A later file change must
      // remain detectable; sampling after rendering could swallow that change.
      const stat = typeof win.fetch !== "function" ? null : await win.fetch(`/statfile?path=${encodeURIComponent(pdfPath)}${options.tokenQuery || ""}`)
        .then(response => response.ok ? response.json() as Promise<{mtime?: number}> : null)
        .catch(() => null);
      if (token !== loadToken) return;
      const revision = typeof stat?.mtime === "number" ? stat.mtime : null;
      const nextDocument = await options.pdfjs.getDocument({
        url: `/raw?path=${encodeURIComponent(pdfPath)}${options.tokenQuery || ""}&t=${Date.now()}`,
        standardFontDataUrl: "/.fig_thumbs/pdfjs/standard_fonts/",
        // pdf.js >= 5 décode JPEG2000/ICC en WebAssembly : sans ces deux URL
        // il va chercher les modules à la racine du site et échoue.
        wasmUrl: "/.fig_thumbs/pdfjs/wasm/",
        iccUrl: "/.fig_thumbs/pdfjs/iccs/",
        cMapUrl: "/.fig_thumbs/pdfjs/cmaps/",
        cMapPacked: true,
      }).promise;
      loaded = nextDocument;
      if (token !== loadToken) return;
      const nextPages: Array<HTMLElement | undefined> = [];
      const nextViewports: Array<{scale: number; height: number} | undefined> = [];
      const liveCanvases = new Map<number, HTMLCanvasElement>();
      const pagesEnCours = new Set<number>();
      const pagesVisibles = new Set<number>();
      const current = (): boolean => !abandoned && (committed ? pdfDocument === nextDocument : token === loadToken);
      const paneWidth = options.right.clientWidth;
      const width = Math.max(1, paneWidth - 24) * options.getZoom();
      // Off-screen layout uses the same page CSS and scroll-container margin
      // rules. It never changes the live pane's height or scroll position.
      staging = doc.createElement("div");
      staging.setAttribute("aria-hidden", "true");
      Object.assign(staging.style, {
        position: "fixed", left: "-100000px", top: "0", width: `${paneWidth}px`,
        height: `${options.right.clientHeight}px`, overflow: "auto", visibility: "hidden",
        pointerEvents: "none",
      });
      doc.body.appendChild(staging);

      const evictFarthest = (anchor: number): void => {
        let victim = -1;
        let distance = -1;
        for (const pageNumber of liveCanvases.keys()) {
          // jamais une page encore intersectante : le callback IO ne se
          // redéclenche pas tant qu'elle le reste, donc l'évincer la
          // laisserait blanche sans espoir de re-rendu (dépasser
          // MAX_LIVE_PAGES ici est acceptable, borné par la bande IO).
          if (pagesVisibles.has(pageNumber)) continue;
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
        if (!current() || liveCanvases.has(pageNumber) || pagesEnCours.has(pageNumber)) return;
        // Marqueur synchrone posé AVANT le premier await : liveCanvases.has()
        // seul ne protège rien tant que l'entrée n'existe pas encore (elle
        // n'est écrite qu'après le rendu) — deux appels concurrents pour la
        // même page passeraient tous les deux la garde du dessus.
        pagesEnCours.add(pageNumber);
        try {
          const element = nextPages[pageNumber];
          const info = nextViewports[pageNumber];
          if (!element || !info) return;
          const page = await nextDocument.getPage(pageNumber);
          const viewport = page.getViewport({scale: info.scale});
          const canvas = doc.createElement("canvas");
          canvas.width = viewport.width * win.devicePixelRatio;
          canvas.height = viewport.height * win.devicePixelRatio;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("PDF canvas context unavailable");
          context.scale(win.devicePixelRatio, win.devicePixelRatio);
          await page.render({canvasContext: context, viewport, intent: "print"}).promise;
          if (!current()) return;
          // prepend, jamais replaceChildren : le gabarit peut déjà porter le
          // marqueur synctex partagé (options.marker) posé par showMarker()
          // avant que cette page n'ait fini de se rendre — ne pas l'effacer.
          element.prepend(canvas);
          liveCanvases.set(pageNumber, canvas);
          if (liveCanvases.size > MAX_LIVE_PAGES) evictFarthest(pageNumber);
          const TextLayerClass = options.pdfjs.TextLayer;
          if (!element.querySelector(".textLayer") && page.getTextContent
              && (TextLayerClass || options.pdfjs.renderTextLayer)) {
            const layer = doc.createElement("div"); layer.className = "textLayer";
            layer.style.setProperty("--scale-factor", String(info.scale));
            element.appendChild(layer);
            try {
              const text = await page.getTextContent();
              if (!current()) return;
              // pdf.js >= 4 : renderTextLayer() a disparu, TextLayer le remplace.
              if (TextLayerClass) {
                await new TextLayerClass({textContentSource: text, container: layer, viewport}).render();
              } else {
                await options.pdfjs.renderTextLayer!({textContentSource: text, container: layer, viewport}).promise;
              }
            } catch { layer.remove(); /* a text extraction failure never discards the page image */ }
          }
        } finally {
          // Toujours libérer — y compris sur l'abandon `!current()` —
          // sinon une page reste marquée "en cours" à vie après un rechargement
          // et ne sera plus jamais reproposée par renderPage().
          pagesEnCours.delete(pageNumber);
        }
      };

      for (let pageNumber = 1; pageNumber <= nextDocument.numPages; pageNumber += 1) {
        if (!current()) return;
        const page = await nextDocument.getPage(pageNumber);
        const base = page.getViewport({scale: 1});
        const scale = width / base.width;
        const viewport = page.getViewport({scale});
        const element = doc.createElement("div");
        element.className = "pdfpage";
        element.dataset.page = String(pageNumber);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        staging.appendChild(element);
        nextPages[pageNumber] = element;
        nextViewports[pageNumber] = {scale, height: base.height};
        // Coordonnées lues sur le gabarit (toujours présent), jamais sur le
        // canvas — la page peut ne pas encore être rendue au moment du clic.
        element.onclick = (event) => {
          if (win.getSelection && !win.getSelection()?.isCollapsed) return;
          const rect = element.getBoundingClientRect();
          const info = nextViewports[pageNumber];
          if (!info) return;
          void synctexEdit(pageNumber,
            (event.clientX - rect.left) / info.scale,
            (event.clientY - rect.top) / info.scale);
        };
      }

      // Follow any scrolling that occurs while rendering, including near the
      // end of a document that has become shorter. No await between the final
      // viewport check and the swap.
      let scroll = 0;
      while (current()) {
        scroll = Math.min(options.right.scrollTop,
          Math.max(0, staging.scrollHeight - options.right.clientHeight));
        const bottom = scroll + options.right.clientHeight;
        const visible = nextPages.filter((element): element is HTMLElement => Boolean(element)
          && element!.offsetTop + element!.offsetHeight >= scroll
          && element!.offsetTop <= bottom);
        if (!visible.length && nextPages[1]) visible.push(nextPages[1]);
        pagesVisibles.clear();
        for (const element of visible) pagesVisibles.add(Number(element.dataset.page));
        const missing = visible.filter(element => !liveCanvases.has(Number(element.dataset.page)));
        if (!missing.length) break;
        await Promise.all(missing.map(element => renderPage(Number(element.dataset.page))));
      }
      if (!current()) return;
      const previousDocument = pdfDocument;
      pageObserver?.disconnect();
      pageObserver = null;
      options.marker.style.display = "none";
      // Preserve the shared marker when its old page is removed.
      options.right.appendChild(options.marker);
      options.right.querySelectorAll(".pdfpage").forEach(element => element.remove());
      showStatus("");
      const fragment = doc.createDocumentFragment();
      for (const element of nextPages) if (element) fragment.appendChild(element);
      options.right.appendChild(fragment);
      pages = nextPages;
      viewports = nextViewports;
      pdfDocument = nextDocument;
      committed = true;
      watchedPath = pdfPath;
      watchedMtime = revision;
      lastWidth = paneWidth;
      options.right.scrollTop = scroll;
      void previousDocument?.destroy?.().catch(() => undefined);

      const IObserver = (win as unknown as {IntersectionObserver?: typeof IntersectionObserver}).IntersectionObserver;
      if (typeof IObserver === "function") {
        const observer = new IObserver((entries) => {
          if (!current()) return;
          for (const entry of entries) {
            const pageNumber = Number((entry.target as HTMLElement).dataset.page);
            if (!pageNumber) continue;
            if (!entry.isIntersecting) { pagesVisibles.delete(pageNumber); continue; }
            pagesVisibles.add(pageNumber);
            void renderPage(pageNumber).catch(error => console.warn("renderPage:", error));
          }
        }, {root: options.right, rootMargin: "150% 0%"});
        pageObserver = observer;
        for (const element of nextPages) if (element) observer.observe(element);
      } else {
        for (let pageNumber = 1; pageNumber <= nextDocument.numPages; pageNumber += 1) {
          if (!current()) return;
          await renderPage(pageNumber);
        }
      }
    } catch (error) {
      if (token === loadToken) {
        if (pdfDocument) options.setState("err", "Actualisation du PDF impossible — la dernière version reste affichée.");
        else showStatus("PDF indisponible. Compile le document, puis réessaie.", true);
      }
      console.warn("loadPdf:", error);
    } finally {
      staging?.remove();
      if (!committed) {
        abandoned = true;
        void loaded?.destroy?.().catch(() => undefined);
      }
      if (token === loadToken) loading = false;
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
  // Les harnais de test montent ce contrôleur avec un `window` minimal.
  if (typeof win.setInterval === "function") win.setInterval(() => {
    const pdfPath = options.getPdfPath();
    if (!pdfPath || !pdfDocument || doc.hidden || loading || statInFlight) return;
    statInFlight = true;
    const polledToken = loadToken;
    void win.fetch(`/statfile?path=${encodeURIComponent(pdfPath)}${options.tokenQuery || ""}`)
      .then((response) => response.ok ? response.json() as Promise<{mtime?: number}> : null)
      .then((stat) => {
        if (typeof stat?.mtime !== "number" || loading || polledToken !== loadToken || pdfPath !== options.getPdfPath()) return;
        if (watchedPath === pdfPath && watchedMtime !== null && stat.mtime > watchedMtime) {
          void loadPdf();
          return;
        }
        watchedPath = pdfPath;
        watchedMtime = stat.mtime;
      })
      .catch(() => undefined)
      .finally(() => { statInFlight = false; });
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
