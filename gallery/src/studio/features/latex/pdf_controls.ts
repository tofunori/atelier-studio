import type {StudioEditor} from "../../core/editor_contract";
import {PDF_PAGE_GUTTER} from "./pdf_sync";

export interface LatexPdfControlsOptions {
  path: string | null;
  isPdfMode: boolean;
  getPdfPath(): string | null;
  getEditor(): StudioEditor | null;
  reloadPdf(): void | Promise<void>;
  handleResize(width: number): void;
  onVisibilityChange?(): void;
  /** In the three-mode studio this button selects Split instead of toggling. */
  onSelectSplit?(): void;
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
  let pill: ReturnType<typeof createPdfPill> | null = null;

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
    pill?.place();
  };
  // Zoom et redimensionnement : les pages déjà peintes sont d'abord étirées
  // à leur nouvelle taille (instantané, un peu flou), puis le rendu net
  // arrive une fois le geste fini. Plus de volet qui saute ni de page vide.
  let sharpTimer: number | null = null;
  const stretchPages = (): void => {
    const target = Math.max(1, right.clientWidth - PDF_PAGE_GUTTER) * zoom;
    const pages = [...right.querySelectorAll<HTMLElement>(".pdfpage")];
    const first = pages.find(page => parseFloat(page.style.width) > 0);
    if (!first) return;
    const ratio = target / parseFloat(first.style.width);
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.005) return;
    const center = right.scrollTop + right.clientHeight / 2;
    right.classList.add("pdf-stretching");
    for (const page of pages) {
      const width = parseFloat(page.style.width), height = parseFloat(page.style.height);
      if (width > 0) page.style.width = `${width * ratio}px`;
      if (height > 0) page.style.height = `${height * ratio}px`;
      const canvas = page.querySelector("canvas");
      if (canvas) {canvas.style.width = "100%"; canvas.style.height = "100%";}
    }
    right.scrollTop = Math.max(0, center * ratio - right.clientHeight / 2);
  };
  const renderSharp = (delay: number): void => {
    if (sharpTimer !== null) win.clearTimeout(sharpTimer);
    sharpTimer = win.setTimeout(() => {
      sharpTimer = null;
      void Promise.resolve(options.reloadPdf()).finally(() => right.classList.remove("pdf-stretching"));
    }, delay);
  };
  const setZoom = (value: number): void => {
    zoom = normalizePdfZoom(value);
    storage.setItem("texZoom", String(zoom));
    stretchPages();
    pill?.sync();
    renderSharp(180);
  };
  toggle.onclick = () => {
    if (options.onSelectSplit) {options.onSelectSplit(); setVisible(true);}
    else setVisible(right.style.display === "none");
  };
  const zoomIn = doc.getElementById("zoomIn");
  const zoomOut = doc.getElementById("zoomOut");
  const zoomFit = doc.getElementById("zoomFit");
  pill = createPdfPill({document: doc, window: win, right, zoomIn, zoomOut, zoomFit, getZoom: () => zoom});
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
      if (right.clientWidth > 0) stretchPages();
      pill?.place();
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(() => {
        right.classList.remove("pdf-stretching");
        options.handleResize(right.clientWidth);
      }, 300);
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
      if (sharpTimer !== null) win.clearTimeout(sharpTimer);
      pill?.destroy();
    },
  };
}

/** Libellé du zoom : « Largeur » à l'ajustement, sinon le pourcentage. */
export function pdfZoomLabel(value: number): string {
  return Math.abs(value - 1) < 0.001 ? "Largeur" : `${Math.round(value * 100)}\u202f%`;
}

interface PdfPillOptions {
  document: Document;
  window: Window;
  right: HTMLElement;
  zoomIn: HTMLElement | null;
  zoomOut: HTMLElement | null;
  zoomFit: HTMLElement | null;
  getZoom(): number;
}

const PILL_ICONS = {
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
};

/** Pilule flottante du volet PDF : page courante, pages voisines et zoom.
 *  Surface élevée (fond + ombre, sans bordure), visible quand on survole ou
 *  fait défiler le PDF, effacée en fondu sinon. Reprend les boutons de zoom
 *  de l'en-tête (mêmes id et mêmes gestionnaires) au lieu d'en créer d'autres. */
function createPdfPill(options: PdfPillOptions): {sync(): void; place(): void; destroy(): void} {
  const {document: doc, window: win, right} = options;
  const host = right.parentElement;
  if (!host) return {sync() {}, place() {}, destroy() {}};
  const pill = doc.createElement("div");
  pill.className = "pdf-pill";
  pill.setAttribute("role", "toolbar");
  pill.setAttribute("aria-label", "Navigation du PDF");
  const icon = (d: string): string => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const button = (id: string, label: string, d: string): HTMLButtonElement => {
    const element = doc.createElement("button");
    element.type = "button"; element.id = id; element.className = "pp-b";
    element.setAttribute("aria-label", label); element.title = label;
    element.innerHTML = icon(d);
    return element;
  };
  const separator = (): HTMLElement => { const element = doc.createElement("span"); element.className = "pp-sep"; return element; };
  const prev = button("pdfPrevPage", "Page précédente", PILL_ICONS.prev);
  const next = button("pdfNextPage", "Page suivante", PILL_ICONS.next);
  const pageLabel = doc.createElement("span"); pageLabel.className = "pp-n"; pageLabel.setAttribute("aria-live", "polite");
  const zoomLabel = doc.createElement("span"); zoomLabel.className = "pp-n pp-zoom";
  pill.append(prev, pageLabel, next, separator());
  for (const element of [options.zoomOut, zoomLabel, options.zoomIn]) if (element) {
    if (element !== zoomLabel) element.classList.add("pp-b");
    pill.appendChild(element);
  }
  if (options.zoomFit) { options.zoomFit.classList.add("pp-b"); pill.append(separator(), options.zoomFit); }
  host.appendChild(pill);

  let current = 1;
  const pages = (): HTMLElement[] => [...right.querySelectorAll<HTMLElement>(".pdfpage")];
  const sync = (): void => {
    const list = pages();
    const probe = right.scrollTop + right.clientHeight * 0.4;
    let found = list.length ? 1 : 0;
    for (const page of list) {
      if (page.offsetTop <= probe) found = Number(page.dataset.page) || found;
      else break;
    }
    current = found;
    pageLabel.innerHTML = list.length ? `${found} <i>/ ${list.length}</i>` : "";
    prev.disabled = found <= 1;
    next.disabled = !list.length || found >= list.length;
    zoomLabel.textContent = pdfZoomLabel(options.getZoom());
  };
  const place = (): void => {
    const shown = right.style.display !== "none" && !right.classList.contains("reading") && right.clientWidth > 0 && pages().length > 0;
    pill.hidden = !shown;
    if (!shown) return;
    pill.style.left = `${right.offsetLeft + right.clientWidth / 2}px`;
  };
  let idleTimer: number | null = null;
  let hovered = false;
  const wake = (): void => {
    place(); sync();
    pill.classList.add("on");
    if (idleTimer !== null) win.clearTimeout(idleTimer);
    idleTimer = win.setTimeout(() => { if (!hovered) pill.classList.remove("on"); }, 1600);
  };
  const goTo = (number: number): void => {
    const target = right.querySelector<HTMLElement>(`.pdfpage[data-page="${number}"]`);
    if (target) right.scrollTop = Math.max(0, target.offsetTop - 24);
    wake();
  };
  prev.onclick = () => goTo(current - 1);
  next.onclick = () => goTo(current + 1);
  let frame = 0;
  const onScroll = (): void => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; wake(); });
  };
  right.addEventListener("scroll", onScroll, {passive: true});
  right.addEventListener("pointermove", wake);
  pill.addEventListener("pointerenter", () => { hovered = true; pill.classList.add("on"); });
  pill.addEventListener("pointerleave", () => { hovered = false; wake(); });
  pill.addEventListener("focusin", () => { hovered = true; pill.classList.add("on"); });
  pill.addEventListener("focusout", () => { hovered = false; wake(); });
  // Les pages arrivent après chaque compilation : suivre leur nombre.
  const MutationObserverConstructor = (win as Window & {MutationObserver?: typeof MutationObserver}).MutationObserver;
  const observer = MutationObserverConstructor ? new MutationObserverConstructor(() => { place(); sync(); }) : null;
  observer?.observe(right, {childList: true, attributes: true, attributeFilter: ["class", "style"]});
  place(); sync();
  return {
    sync,
    place,
    destroy: () => {
      observer?.disconnect();
      right.removeEventListener("scroll", onScroll);
      right.removeEventListener("pointermove", wake);
      if (idleTimer !== null) win.clearTimeout(idleTimer);
      pill.remove();
    },
  };
}
