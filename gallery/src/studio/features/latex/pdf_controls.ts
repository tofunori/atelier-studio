import type {StudioEditor} from "../../core/editor_contract";

export interface LatexPdfControlsOptions {
  path: string | null;
  isPdfMode: boolean;
  getPdfPath(): string | null;
  getEditor(): StudioEditor | null;
  reloadPdf(): void;
  handleResize(width: number): void;
  onVisibilityChange?(): void;
  postMessage(message: unknown): void;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface LatexPdfControls {
  getZoom(): number;
  setZoom(value: number): void;
  isVisible(): boolean;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export function normalizePdfZoom(value: string | number | null): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value || "");
  return Number.isFinite(numeric) ? Math.max(0.4, Math.min(3, numeric)) : 1;
}

export function createLatexPdfControls(options: LatexPdfControlsOptions): LatexPdfControls {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const right = doc.getElementById("right") as HTMLElement;
  const left = doc.getElementById("left") as HTMLElement;
  const toggle = doc.getElementById("togglePdf") as HTMLElement;
  let zoom = normalizePdfZoom(storage.getItem("texZoom"));
  let resizeTimer: number | null = null;

  const setVisible = (visible: boolean): void => {
    if (options.isPdfMode) return;
    doc.documentElement.classList.remove("tex-editor-only");
    right.style.display = visible ? "" : "none";
    left.style.width = visible ? "50%" : "100%";
    left.style.borderRight = visible ? "" : "none";
    toggle.classList.toggle("on", visible);
    storage.setItem("texPdfVisible", visible ? "1" : "0");
    options.getEditor()?.refresh();
    options.onVisibilityChange?.();
  };
  const setZoom = (value: number): void => {
    zoom = normalizePdfZoom(value);
    storage.setItem("texZoom", String(zoom));
    options.reloadPdf();
  };
  toggle.onclick = () => setVisible(right.style.display === "none");
  const zoomIn = doc.getElementById("zoomIn");
  const zoomOut = doc.getElementById("zoomOut");
  const zoomFit = doc.getElementById("zoomFit");
  if (zoomIn) zoomIn.onclick = () => setZoom(zoom * 1.2);
  if (zoomOut) zoomOut.onclick = () => setZoom(zoom / 1.2);
  if (zoomFit) zoomFit.onclick = () => setZoom(1);

  const popPdf = doc.getElementById("popPdf");
  if (popPdf) popPdf.onclick = () => {
    const pdfPath = options.getPdfPath();
    if (!options.path || !pdfPath) return;
    if (win.self !== win.top) {
      options.postMessage({
        type: "atelier-open-pdf",
        tex: options.path,
        pdf: pdfPath,
        title: `${options.path.split("/").pop() || "PDF"} — PDF`,
      });
    } else {
      win.open(`/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(options.path)}&mode=pdf`, "_blank");
    }
    setVisible(false);
  };

  let resizeObserver: ResizeObserver | null = null;
  const ResizeObserverConstructor = (win as Window & {ResizeObserver?: typeof ResizeObserver}).ResizeObserver;
  if (ResizeObserverConstructor) {
    const observer = new ResizeObserverConstructor(() => {
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(() => options.handleResize(right.clientWidth), 500);
    });
    observer.observe(right);
    resizeObserver = observer;
  }
  if (!options.isPdfMode) setVisible(storage.getItem("texPdfVisible") === "1");

  return {
    getZoom: () => zoom,
    setZoom,
    isVisible: () => right.style.display !== "none",
    setVisible,
    destroy: () => {
      resizeObserver?.disconnect();
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
    },
  };
}
