interface AnnotationKitInstance {
  enabled: boolean;
  redraw(): void;
  toggle(): boolean;
}

interface AnnotationKitFactory {
  create(host: Record<string, unknown>): AnnotationKitInstance;
}

export interface MarkdownAnnotationsOptions {
  name: string;
  setPreviewMode(): void;
  document?: Document;
  window?: Window;
}

export interface MarkdownAnnotationsController {
  ensureOverlay(): HTMLCanvasElement;
  toggle(): Promise<boolean>;
}

export function createMarkdownAnnotationsController(
  options: MarkdownAnnotationsOptions,
): MarkdownAnnotationsController {
  const doc = options.document || document;
  const win = options.window || window;
  const button = doc.getElementById("annotBtn") as HTMLButtonElement;
  const previewPane = doc.getElementById("prevPane") as HTMLElement;
  const wrap = doc.getElementById("wrap") as HTMLElement;
  let overlay: HTMLCanvasElement | null = null;
  let kit: AnnotationKitInstance | null = null;

  const cssVariable = (name: string, fallback: string): string =>
    win.getComputedStyle(doc.documentElement).getPropertyValue(name).trim() || fallback;
  const ensureOverlay = (): HTMLCanvasElement => {
    if (!overlay) {
      overlay = doc.createElement("canvas");
      overlay.id = "annotOverlay";
      previewPane.appendChild(overlay);
    }
    const width = Math.max(previewPane.scrollWidth, previewPane.clientWidth);
    const height = Math.min(20_000, Math.max(previewPane.scrollHeight, previewPane.clientHeight));
    overlay.width = width;
    overlay.height = height;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    if (kit?.enabled) kit.redraw();
    return overlay;
  };
  const composedImage = (width: number, height: number): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      let styles = "";
      doc.querySelectorAll("style").forEach((style) => { styles += `${style.textContent || ""}\n`; });
      const background = cssVariable("--bg", "#202024");
      const text = cssVariable("--txt", "#dbdfe5");
      const inner = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;background:${background};color:${text}"><style>${styles}</style>${wrap.outerHTML}</div>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${inner}</foreignObject></svg>`;
      const image = doc.createElement("img");
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("svg compose failed"));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  const exportBase = async (): Promise<{src: HTMLCanvasElement; w: number; h: number}> => {
    const activeOverlay = ensureOverlay();
    const width = activeOverlay.width;
    const height = activeOverlay.height;
    const background = cssVariable("--bg", "#202024");
    const text = cssVariable("--txt", "#dbdfe5");
    const composition = doc.createElement("canvas");
    composition.width = width;
    composition.height = height;
    const context = composition.getContext("2d");
    if (!context) throw new Error("canvas context unavailable");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    try {
      const image = await composedImage(width, height);
      context.drawImage(image, 0, 0, width, height);
      composition.toDataURL();
      return {src: composition, w: width, h: height};
    } catch {
      const fallback = doc.createElement("canvas");
      fallback.width = width;
      fallback.height = height;
      const fallbackContext = fallback.getContext("2d");
      if (!fallbackContext) throw new Error("fallback canvas context unavailable");
      fallbackContext.fillStyle = background;
      fallbackContext.fillRect(0, 0, width, height);
      fallbackContext.fillStyle = text;
      fallbackContext.font = "600 16px -apple-system,system-ui,sans-serif";
      fallbackContext.fillText(`annotations sur ${options.name}`, 20, 30);
      return {src: fallback, w: width, h: height};
    }
  };
  const annotationKit = (): AnnotationKitFactory | undefined =>
    (win as Window & {AnnotKit?: AnnotationKitFactory}).AnnotKit;
  const loadKit = (): Promise<void> => new Promise((resolve, reject) => {
    if (annotationKit()) {
      resolve();
      return;
    }
    const script = doc.createElement("script");
    script.src = "/.fig_thumbs/annot_kit.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("annot_kit load failed"));
    doc.head.appendChild(script);
  });
  const toggle = async (): Promise<boolean> => {
    options.setPreviewMode();
    try {
      await loadKit();
      if (!kit) {
        const activeOverlay = ensureOverlay();
        const factory = annotationKit();
        if (!factory) throw new Error("annot_kit missing after load");
        kit = factory.create({overlay: activeOverlay, name: () => `${options.name}-annot`, exportBase});
      } else ensureOverlay();
      const enabled = kit.toggle();
      button.classList.toggle("on", enabled);
      return enabled;
    } catch {
      button.textContent = "✎ !";
      win.setTimeout(() => { button.textContent = "✎ Annoter"; }, 1600);
      return false;
    }
  };
  button.addEventListener("click", () => { void toggle(); });
  win.addEventListener("resize", () => { if (kit?.enabled) ensureOverlay(); });
  return {ensureOverlay, toggle};
}
