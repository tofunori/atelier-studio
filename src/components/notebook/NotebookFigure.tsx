// Figure d'une sortie de cahier : légende avec ses actions (plus de barre
// flottante sur la figure, elle cachait le titre) et mode « Annoter ».
//
// Annoter reprend l'outil de la galerie : cadre, ellipse, flèche ou point,
// chaque marque numérotée, sa note dans la liste sous la figure. « Envoyer au
// chat » joint la figure avec ses marques et le texte des notes ; les marques
// envoyées quittent la figure (variante A de la galerie, Thierry 2026-11-16).
// La création d'une marque suit les règles de la galerie
// (gallery/src/browser/figure_annotation_geometry.ts) : 3 px au moins, bornée à
// l'image, cadre et ellipse rangés du coin haut gauche au coin bas droit.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  CheckIcon,
  CircleIcon,
  CrosshairIcon,
  DownloadIcon,
  Maximize2Icon,
  MessageSquarePlusIcon,
  MoveUpRightIcon,
  PencilIcon,
  Redo2Icon,
  SquareIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { t } from "../../lib/i18n";
import { Button, IconButton, RowButton, showError } from "../ui";

export type FigureFormat = "svg" | "png" | "jpeg";
export interface NotebookFigureData {
  format: FigureFormat;
  payload: string;
  safeSvg?: string;
}

type Tool = "rect" | "ellipse" | "arrow" | "point";
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

const TOOLS: { id: Tool; icon: typeof SquareIcon; label: "notebook.fig-tool-rect" | "notebook.fig-tool-ellipse" | "notebook.fig-tool-arrow" | "notebook.fig-tool-point" }[] = [
  { id: "rect", icon: SquareIcon, label: "notebook.fig-tool-rect" },
  { id: "ellipse", icon: CircleIcon, label: "notebook.fig-tool-ellipse" },
  { id: "arrow", icon: MoveUpRightIcon, label: "notebook.fig-tool-arrow" },
  { id: "point", icon: CrosshairIcon, label: "notebook.fig-tool-point" },
];

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

function figureSource(fig: NotebookFigureData): string {
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
async function renderAnnotated(
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

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function NotebookFigure({
  figure,
  label,
  outLabel,
  alt,
  saved,
  onExpand,
  onSave,
  onCite,
}: {
  figure: NotebookFigureData;
  /** « cahier.ipynb · Out[3] » : nom de la figure pour le chat. */
  label: string;
  outLabel: string;
  alt: string;
  saved: boolean;
  onExpand: () => void;
  onSave: () => void;
  onCite: () => void;
}) {
  const [annotating, setAnnotating] = useState(false);
  const [tool, setTool] = useState<Tool>("rect");
  const [marks, setMarks] = useState<FigureMark[]>([]);
  const [undo, setUndo] = useState<FigureMark[][]>([]);
  const [redo, setRedo] = useState<FigureMark[][]>([]);
  const [draft, setDraft] = useState<Omit<FigureMark, "id" | "n" | "note"> | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const figureRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const noteRefs = useRef(new Map<string, HTMLTextAreaElement>());

  // Taille affichée de l'image : les marques se dessinent en pixels.
  useLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [annotating]);

  // La note d'une marque qu'on vient de tracer prend la main.
  useEffect(() => {
    if (!focusId) return;
    const el = noteRefs.current.get(focusId);
    if (el && document.activeElement !== el) el.focus();
  }, [focusId, marks]);

  const commit = useCallback(
    (next: FigureMark[]) => {
      setUndo((u) => [...u, marks]);
      setRedo([]);
      setMarks(next);
    },
    [marks],
  );

  const stepBack = () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo(undo.slice(0, -1));
    setRedo([...redo, marks]);
    setMarks(prev);
  };
  const stepForward = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setRedo(redo.slice(0, -1));
    setUndo([...undo, marks]);
    setMarks(next);
  };

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const shape = (a: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    createMark(tool, a, b, b.w, b.h);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà relâché */
    }
    const p = local(e);
    start.current = { x: p.x, y: p.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current || tool === "point") return;
    setDraft(shape(start.current, local(e)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const a = start.current;
    start.current = null;
    setDraft(null);
    if (!a) return;
    const made = shape(a, local(e));
    if (!made) return;
    const id = newId();
    const n = marks.reduce((max, m) => Math.max(max, m.n), 0) + 1;
    commit([...marks, { ...made, id, n, note: "" }]);
    setFocusId(id);
  };

  const setNote = (id: string, note: string) => setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, note } : m)));
  const remove = (id: string) => commit(marks.filter((m) => m.id !== id));
  // Note vide quand on la quitte = marque retirée (comme dans la galerie).
  const leaveNote = (id: string) => {
    if (focusId === id) setFocusId(null);
    const m = marks.find((x) => x.id === id);
    if (m && !m.note.trim()) remove(id);
  };

  const finish = () => {
    setMarks((ms) => ms.filter((m) => m.note.trim()));
    setFocusId(null);
    setAnnotating(false);
  };

  const ready = marks.filter((m) => m.note.trim());
  const send = async () => {
    if (!ready.length || busy || !figureRef.current) return;
    setBusy(true);
    try {
      const numbered = ready.map((m, i) => ({ ...m, n: i + 1 }));
      const dataURL = await renderAnnotated(figure, numbered, figureRef.current, size);
      // L'hôte marque `accepted` s'il a pu confier l'image au serveur ; sinon
      // les notes restent sur la figure.
      const detail: Record<string, unknown> = {
        dataURL,
        name: t("notebook.fig-annotated-name", { label }),
        text: figureNotesText(label, numbered),
      };
      window.dispatchEvent(new CustomEvent(NOTEBOOK_FIGURE_TO_CHAT_EVENT, { detail }));
      if (!detail.accepted) throw new Error("hôte absent");
      setMarks([]);
      setUndo([]);
      setRedo([]);
      setFocusId(null);
      setSentCount(numbered.length);
      setAnnotating(false);
    } catch {
      showError(t("notebook.fig-send-failed"));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!annotating) return;
    const inNote = (e.target as HTMLElement).tagName === "TEXTAREA";
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inNote) (e.target as HTMLElement).blur();
      else finish();
      return;
    }
    if (!inNote && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) stepForward();
      else stepBack();
    }
  };

  const shown = draft ? [...marks, { ...draft, id: "draft", n: 0, note: "" }] : marks;
  const media =
    figure.format === "svg" && figure.safeSvg ? (
      <div dangerouslySetInnerHTML={{ __html: figure.safeSvg }} />
    ) : (
      <img src={figureSource(figure)} alt={alt} />
    );

  return (
    <figure
      ref={figureRef}
      className="nb-figure"
      data-annotating={annotating ? "true" : undefined}
      onKeyDown={onKeyDown}
    >
      {annotating ? (
        <div className="nb-fig-tools" role="toolbar" aria-label={t("notebook.fig-tools")}>
          {TOOLS.map(({ id, icon: Icon, label: key }) => (
            <IconButton
              key={id}
              label={t(key)}
              title={t(key)}
              aria-pressed={tool === id}
              className={tool === id ? "nb-fig-tool is-on" : "nb-fig-tool"}
              onClick={() => setTool(id)}
            >
              <Icon size={14} strokeWidth={1.4} aria-hidden />
            </IconButton>
          ))}
          <span className="nb-fig-sep" aria-hidden />
          <IconButton label={t("notebook.fig-undo")} title={t("notebook.fig-undo")} disabled={!undo.length} onClick={stepBack}>
            <Undo2Icon size={14} strokeWidth={1.4} aria-hidden />
          </IconButton>
          <IconButton label={t("notebook.fig-redo")} title={t("notebook.fig-redo")} disabled={!redo.length} onClick={stepForward}>
            <Redo2Icon size={14} strokeWidth={1.4} aria-hidden />
          </IconButton>
        </div>
      ) : null}

      {annotating ? (
        <div className="nb-figure-stage is-annotating">
          <div className="nb-figure-media">
            {media}
            <div
              ref={layerRef}
              className="nb-fig-layer"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                start.current = null;
                setDraft(null);
              }}
            >
              <svg className="nb-fig-marks" width={size.w} height={size.h} aria-hidden>
                {shown.map((m) => {
                  const x1 = m.x1 * size.w, y1 = m.y1 * size.h, x2 = m.x2 * size.w, y2 = m.y2 * size.h;
                  const on = m.id === focusId ? "is-on" : undefined;
                  if (m.tool === "rect") {
                    return <rect key={m.id} className={on} x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={2} />;
                  }
                  if (m.tool === "ellipse") {
                    return (
                      <ellipse key={m.id} className={on} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={(x2 - x1) / 2} ry={(y2 - y1) / 2} />
                    );
                  }
                  if (m.tool === "arrow") {
                    return (
                      <g key={m.id} className={on}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} />
                        <polygon points={arrowHead(x1, y1, x2, y2, 10).map((p) => p.join(",")).join(" ")} />
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
              {marks.map((m) => {
                const p = pinAt(m);
                return (
                  <RowButton
                    key={m.id}
                    className="nb-fig-pin"
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                    aria-label={t("notebook.fig-note-n", { n: m.n })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setFocusId(m.id)}
                  >
                    {m.n}
                  </RowButton>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <RowButton className="nb-figure-stage" onClick={onExpand} aria-label={t("notebook.expand-fig")}>
          <span className="nb-figure-media">{media}</span>
        </RowButton>
      )}

      <figcaption className="nb-figure-caption">
        <span className="nb-figure-out">{outLabel}</span>
        {sentCount && !annotating ? (
          <span className="nb-figure-sent">
            <CheckIcon size={12} strokeWidth={1.5} aria-hidden />
            {sentCount === 1 ? t("notebook.fig-sent-one") : t("notebook.fig-sent", { n: sentCount })}
          </span>
        ) : null}
        <span className="nb-figure-actions">
          <Button
            variant="ghost"
            size="xs"
            aria-pressed={annotating}
            onClick={() => {
              if (annotating) finish();
              else {
                setSentCount(0);
                setAnnotating(true);
              }
            }}
            title={t("notebook.annotate-fig")}
          >
            <PencilIcon size={12} />
            <span>{t("notebook.annotate-fig")}</span>
          </Button>
          <Button variant="ghost" size="xs" onClick={onExpand} title={t("notebook.expand-fig")}>
            <Maximize2Icon size={12} />
            <span>{t("notebook.expand-fig")}</span>
          </Button>
          <Button variant="ghost" size="xs" onClick={onSave} title={t("notebook.save-fig")}>
            {saved ? <CheckIcon size={12} /> : <DownloadIcon size={12} />}
            <span>{saved ? t("notebook.saved-fig") : t("notebook.save-fig")}</span>
          </Button>
          <Button variant="ghost" size="xs" onClick={onCite} title={t("notebook.cite")}>
            <MessageSquarePlusIcon size={12} />
            <span>{t("notebook.cite")}</span>
          </Button>
          <span className="nb-figure-format">{figure.format.toUpperCase()}</span>
        </span>
      </figcaption>

      {annotating ? (
        <div className="nb-fig-notes">
          <div className="nb-fig-notes-head">
            <span className="nb-fig-notes-title">
              {t("notebook.fig-notes")} <em>{marks.length}</em>
            </span>
            <span className="nb-fig-hint">{t("notebook.fig-hint")}</span>
            <Button variant="secondary" size="xs" disabled={!ready.length || busy} onClick={() => void send()}>
              <span>{t("notebook.fig-send")}</span>
              <kbd>⌘↵</kbd>
            </Button>
            <Button variant="ghost" size="xs" onClick={finish}>
              {t("notebook.fig-done")}
            </Button>
          </div>
          {marks.length ? (
            <ol>
              {marks.map((m) => (
                <li key={m.id} className={m.id === focusId ? "is-on" : undefined}>
                  <i aria-hidden>{m.n}</i>
                  <textarea
                    ref={(el) => {
                      if (el) noteRefs.current.set(m.id, el);
                      else noteRefs.current.delete(m.id);
                    }}
                    rows={1}
                    value={m.note}
                    placeholder={t("notebook.fig-note-placeholder")}
                    aria-label={t("notebook.fig-note-n", { n: m.n })}
                    onFocus={() => setFocusId(m.id)}
                    onChange={(e) => {
                      setNote(m.id, e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onBlur={() => leaveNote(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <IconButton
                    size="s"
                    label={t("notebook.fig-delete-note")}
                    title={t("notebook.fig-delete-note")}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => remove(m.id)}
                  >
                    <Trash2Icon size={12} strokeWidth={1.4} aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
