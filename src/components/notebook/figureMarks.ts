// Marques d'annotation d'une figure de cahier : géométrie, texte joint au chat
// et rendu PNG de la figure annotée. Séparé du composant (NotebookFigure.tsx)
// pour que le rechargement à chaud de React garde l'état du composant.
// La création d'une marque suit les règles de la galerie
// (gallery/src/browser/figure_annotation_geometry.ts) : 3 px au moins, bornée à
// l'image, cadre et ellipse rangés du coin haut gauche au coin bas droit.
import { t } from "../../lib/i18n";

export type FigureFormat = "svg" | "png" | "jpeg";
export interface NotebookFigureData {
  format: FigureFormat;
  payload: string;
  safeSvg?: string;
}

export type Tool = "rect" | "ellipse" | "arrow" | "point";
/** Une marque, en fractions de l'image (indépendante de la taille affichée). */
export interface FigureMark {
  id: string;
  tool: Tool;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  n: number;
  note: string;
}

export const NOTEBOOK_FIGURE_TO_CHAT_EVENT = "notebook-figure-to-chat";

const MIN_SIZE = 3;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Marque tracée de `a` à `b` dans une image de `w` × `h` px, en fractions ;
 *  null si elle est trop petite. */
export function createMark(
  tool: Tool,
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: number,
  h: number,
): Omit<FigureMark, "id" | "n" | "note"> | null {
  if (!w || !h) return null;
  const x1 = clamp(a.x, 0, w), y1 = clamp(a.y, 0, h);
  if (tool === "point") return { tool, x1: x1 / w, y1: y1 / h, x2: x1 / w, y2: y1 / h };
  const x2 = clamp(b.x, 0, w), y2 = clamp(b.y, 0, h);
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  if (tool === "arrow" ? Math.hypot(dx, dy) < MIN_SIZE : dx < MIN_SIZE || dy < MIN_SIZE) return null;
  if (tool === "arrow") return { tool, x1: x1 / w, y1: y1 / h, x2: x2 / w, y2: y2 / h };
  return {
    tool,
    x1: Math.min(x1, x2) / w,
    y1: Math.min(y1, y2) / h,
    x2: Math.max(x1, x2) / w,
    y2: Math.max(y1, y2) / h,
  };
}

/** Pointe de flèche (triangle) au bout de (x2, y2), en pixels. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number][] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - size * Math.cos(a - spread), y2 - size * Math.sin(a - spread)],
    [x2 - size * Math.cos(a + spread), y2 - size * Math.sin(a + spread)],
  ];
}

/** Où se pose le numéro d'une marque (fractions). */
export function pinAt(m: Pick<FigureMark, "tool" | "x1" | "y1" | "x2" | "y2">): { x: number; y: number } {
  if (m.tool === "rect" || m.tool === "ellipse") return { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2) };
  return { x: m.x1, y: m.y1 };
}

/** Texte joint au chat : la figure et ses notes, dans l'ordre des numéros. */
export function figureNotesText(label: string, marks: Pick<FigureMark, "n" | "note">[]): string {
  return [t("notebook.fig-notes-text", { label }), ...marks.map((m) => `${m.n}. ${m.note.trim()}`)].join("\n");
}

export function figureSource(fig: NotebookFigureData): string {
  if (fig.format === "svg") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fig.safeSvg ?? fig.payload)}`;
  return `data:image/${fig.format};base64,${fig.payload}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Couleur calculée d'une variable du thème (le canvas ne lit pas var()). */
function themeColor(host: HTMLElement, token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** La figure et ses marques, en PNG, à une taille que l'agent lit bien. */
export async function renderAnnotated(
  fig: NotebookFigureData,
  marks: FigureMark[],
  host: HTMLElement,
  shown: { w: number; h: number },
): Promise<string> {
  const img = await loadImage(figureSource(fig));
  const w0 = img.naturalWidth || shown.w;
  const h0 = img.naturalHeight || shown.h;
  // Un SVG n'a souvent que sa taille d'écran : on l'agrandit pour la lecture.
  const target = fig.format === "svg" ? Math.max(1600, w0) : w0;
  const scale = Math.min(2200, target) / w0;
  const W = Math.max(1, Math.round(w0 * scale));
  const H = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, W, H);
  const accent = themeColor(host, "--accent");
  const onAccent = themeColor(host, "--text-on-accent");
  const lw = Math.max(2, W / 500);
  const r = Math.max(11, W / 90);
  ctx.lineWidth = lw;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  for (const m of marks) {
    const x1 = m.x1 * W, y1 = m.y1 * H, x2 = m.x2 * W, y2 = m.y2 * H;
    ctx.beginPath();
    if (m.tool === "rect") ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (m.tool === "ellipse") {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    }
    if (m.tool === "arrow") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    if (m.tool !== "point") ctx.stroke();
    if (m.tool === "arrow") {
      const head = arrowHead(x1, y1, x2, y2, lw * 6);
      ctx.beginPath();
      head.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.font = `600 ${Math.round(r * 1.1)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const m of marks) {
    const p = pinAt(m);
    const x = Math.min(W - r, Math.max(r, p.x * W));
    const y = Math.min(H - r, Math.max(r, p.y * H));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = onAccent;
    ctx.fillText(String(m.n), x, y + 1);
  }
  return canvas.toDataURL("image/png");
}
