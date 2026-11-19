// Figure d'une sortie de cahier : légende avec ses actions (plus de barre
// flottante sur la figure, elle cachait le titre) et mode « Annoter ».
//
// Annoter reprend l'outil de la galerie : cadre, ellipse, flèche ou point,
// chaque marque numérotée, sa note dans la liste sous la figure. « Envoyer au
// chat » joint la figure avec ses marques et le texte des notes ; les marques
// envoyées quittent la figure (variante A de la galerie, Thierry 2026-11-16).
// Géométrie et rendu : figureMarks.ts.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type PointerEvent } from "react";
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
import {
  NOTEBOOK_FIGURE_TO_CHAT_EVENT,
  arrowHead,
  createMark,
  figureNotesText,
  figureSource,
  pinAt,
  renderAnnotated,
  type FigureMark,
  type NotebookFigureData,
  type Tool,
} from "./figureMarks";

const TOOLS: { id: Tool; icon: typeof SquareIcon; label: "notebook.fig-tool-rect" | "notebook.fig-tool-ellipse" | "notebook.fig-tool-arrow" | "notebook.fig-tool-point" }[] = [
  { id: "rect", icon: SquareIcon, label: "notebook.fig-tool-rect" },
  { id: "ellipse", icon: CircleIcon, label: "notebook.fig-tool-ellipse" },
  { id: "arrow", icon: MoveUpRightIcon, label: "notebook.fig-tool-arrow" },
  { id: "point", icon: CrosshairIcon, label: "notebook.fig-tool-point" },
];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Position du pointeur dans le calque, et taille du calque. */
function local(e: PointerEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
}

type Draft = Omit<FigureMark, "id" | "n" | "note">;

/** Les marques et leur historique (annuler, rétablir). */
function useMarkHistory() {
  const [marks, setMarks] = useState<FigureMark[]>([]);
  const [undo, setUndo] = useState<FigureMark[][]>([]);
  const [redo, setRedo] = useState<FigureMark[][]>([]);
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
  const reset = () => {
    setMarks([]);
    setUndo([]);
    setRedo([]);
  };
  return { marks, setMarks, commit, stepBack, stepForward, reset, canUndo: undo.length > 0, canRedo: redo.length > 0 };
}

function FigureToolbar({
  tool,
  onTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="nb-fig-tools" role="toolbar" aria-label={t("notebook.fig-tools")}>
      {TOOLS.map(({ id, icon: Icon, label: key }) => (
        <IconButton
          key={id}
          label={t(key)}
          title={t(key)}
          aria-pressed={tool === id}
          className={tool === id ? "nb-fig-tool is-on" : "nb-fig-tool"}
          onClick={() => onTool(id)}
        >
          <Icon size={14} strokeWidth={1.4} aria-hidden />
        </IconButton>
      ))}
      <span className="nb-fig-sep" aria-hidden />
      <IconButton label={t("notebook.fig-undo")} title={t("notebook.fig-undo")} disabled={!canUndo} onClick={onUndo}>
        <Undo2Icon size={14} strokeWidth={1.4} aria-hidden />
      </IconButton>
      <IconButton label={t("notebook.fig-redo")} title={t("notebook.fig-redo")} disabled={!canRedo} onClick={onRedo}>
        <Redo2Icon size={14} strokeWidth={1.4} aria-hidden />
      </IconButton>
    </div>
  );
}

function MarkShape({ m, w, h, on }: { m: FigureMark; w: number; h: number; on: boolean }) {
  const x1 = m.x1 * w, y1 = m.y1 * h, x2 = m.x2 * w, y2 = m.y2 * h;
  const cls = on ? "is-on" : undefined;
  if (m.tool === "rect") return <rect className={cls} x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={2} />;
  if (m.tool === "ellipse") {
    return <ellipse className={cls} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={(x2 - x1) / 2} ry={(y2 - y1) / 2} />;
  }
  if (m.tool === "arrow") {
    return (
      <g className={cls}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <polygon points={arrowHead(x1, y1, x2, y2, 10).map((p) => p.join(",")).join(" ")} />
      </g>
    );
  }
  return null;
}

/** Les marques tracées sur l'image et leurs numéros. */
function MarksOverlay({
  marks,
  draft,
  size,
  focusId,
  onPin,
}: {
  marks: FigureMark[];
  draft: Draft | null;
  size: { w: number; h: number };
  focusId: string | null;
  onPin: (id: string) => void;
}) {
  const shown = draft ? [...marks, { ...draft, id: "draft", n: 0, note: "" }] : marks;
  return (
    <>
      <svg className="nb-fig-marks" width={size.w} height={size.h} aria-hidden>
        {shown.map((m) => (
          <MarkShape key={m.id} m={m} w={size.w} h={size.h} on={m.id === focusId} />
        ))}
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
            onClick={() => onPin(m.id)}
          >
            {m.n}
          </RowButton>
        );
      })}
    </>
  );
}

function FigureCaption({
  outLabel,
  format,
  sentCount,
  annotating,
  saved,
  onAnnotate,
  onExpand,
  onSave,
  onCite,
}: {
  outLabel: string;
  format: string;
  sentCount: number;
  annotating: boolean;
  saved: boolean;
  onAnnotate: () => void;
  onExpand: () => void;
  onSave: () => void;
  onCite: () => void;
}) {
  return (
    <figcaption className="nb-figure-caption">
      <span className="nb-figure-out">{outLabel}</span>
      {sentCount && !annotating ? (
        <span className="nb-figure-sent">
          <CheckIcon size={12} strokeWidth={1.5} aria-hidden />
          {sentCount === 1 ? t("notebook.fig-sent-one") : t("notebook.fig-sent", { n: sentCount })}
        </span>
      ) : null}
      <span className="nb-figure-actions">
        <Button variant="ghost" size="xs" aria-pressed={annotating} onClick={onAnnotate} title={t("notebook.annotate-fig")}>
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
        <span className="nb-figure-format">{format.toUpperCase()}</span>
      </span>
    </figcaption>
  );
}

function NoteRow({
  m,
  on,
  noteRefs,
  onFocus,
  onNote,
  onLeave,
  onRemove,
}: {
  m: FigureMark;
  on: boolean;
  noteRefs: MutableRefObject<Map<string, HTMLTextAreaElement>>;
  onFocus: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onLeave: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className={on ? "is-on" : undefined}>
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
        onFocus={() => onFocus(m.id)}
        onChange={(e) => {
          onNote(m.id, e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={() => onLeave(m.id)}
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
        onClick={() => onRemove(m.id)}
      >
        <Trash2Icon size={12} strokeWidth={1.4} aria-hidden />
      </IconButton>
    </li>
  );
}

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
  const history = useMarkHistory();
  const { marks, setMarks, commit } = history;
  const [draft, setDraft] = useState<Draft | null>(null);
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
  const onPointerCancel = () => {
    start.current = null;
    setDraft(null);
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
  const toggleAnnotate = () => {
    if (annotating) return finish();
    setSentCount(0);
    setAnnotating(true);
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
      history.reset();
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
    const target = e.target as HTMLElement;
    const inNote = target.tagName === "TEXTAREA";
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (inNote) target.blur();
      else finish();
    } else if (!inNote && mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) history.stepForward();
      else history.stepBack();
    }
  };

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
        <>
          <FigureToolbar
            tool={tool}
            onTool={setTool}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.stepBack}
            onRedo={history.stepForward}
          />
          <div className="nb-figure-stage is-annotating">
            <div className="nb-figure-media">
              {media}
              <div
                ref={layerRef}
                className="nb-fig-layer"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                <MarksOverlay marks={marks} draft={draft} size={size} focusId={focusId} onPin={setFocusId} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <RowButton className="nb-figure-stage" onClick={onExpand} aria-label={t("notebook.expand-fig")}>
          <span className="nb-figure-media">{media}</span>
        </RowButton>
      )}

      <FigureCaption
        outLabel={outLabel}
        format={figure.format}
        sentCount={sentCount}
        annotating={annotating}
        saved={saved}
        onAnnotate={toggleAnnotate}
        onExpand={onExpand}
        onSave={onSave}
        onCite={onCite}
      />

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
                <NoteRow
                  key={m.id}
                  m={m}
                  on={m.id === focusId}
                  noteRefs={noteRefs}
                  onFocus={setFocusId}
                  onNote={setNote}
                  onLeave={leaveNote}
                  onRemove={remove}
                />
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
