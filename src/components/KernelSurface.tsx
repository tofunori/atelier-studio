// Surface « Noyau Python » (chantier 5) : le noyau persistant du fil actif,
// ouvert comme onglet du panneau droit. Cellules dans l'ordre, code coloré
// comme les blocs du chat, figures captées, variables en mémoire ; on y
// sélectionne du code ou une sortie pour l'envoyer au chat, comme dans le
// lecteur PDF et l'éditeur LaTeX.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createSelectionActions } from "../../gallery/src/studio/features/annotation_ui";
import { t } from "../lib/i18n";
import {
  baseName, kernelCommand, selectionContext, stopKernel, takePendingFocus, useKernelCells, variableSize,
  type ChainCheck, type KernelCell, type KernelEnv, type KernelStatus, type KernelVariable, type ReplayState,
} from "../lib/kernel";
import { localImagePreviewUrl } from "../lib/localImage";
import { FigureGalleryBar, savedFigure } from "./FigureGalleryBar";
import { highlightCode } from "./chat/md";
import { Button, IconButton, RowButton, showError, showSuccess } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { EXPAND_ICON, FIGURE_SAVED_EVENT, FigureViewer, figuresIn, type ShownFigure } from "./FigureViewer";

const Icon = {
  chevron: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>,
  restart: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M11.8 1.9v2.8H9" /></svg>,
  stop: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>,
  copy: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M3 10.5V3.5c0-.8.6-1.5 1.5-1.5h6" /></svg>,
  check: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>,
  read: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" /></svg>,
  written: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10.5v-8M4.8 5.5 8 2.3l3.2 3.2M3 13.5h10" /></svg>,
  replay: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6" /><path d="M4.2 1.9v2.8H7" /></svg>,
  export: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" /></svg>,
  edit: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.8l2.7 2.7L6 12.7l-3.3.6.6-3.3z" /></svg>,
  play: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" /></svg>,
  user: <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.5" /><path d="M3.5 13.5c.6-2.3 2.3-3.5 4.5-3.5s3.9 1.2 4.5 3.5" /></svg>,
  warn: <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.4M8 10.8v.1" /></svg>,
};

function duration(ms?: number): string {
  if (ms == null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function clock(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Chemin relatif au projet quand il y est, pour ouvrir un fichier écrit. */
function projectRel(path: string, root?: string): string | null {
  if (!root) return null;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

function shortCwd(cwd: string): string {
  return cwd.replace(/^\/(?:Users|home)\/[^/]+/u, "~");
}

function stateOf(enabled: boolean, status: KernelStatus | null): { key: "off" | "idle" | "on" | "busy"; label: string } {
  if (!enabled) return { key: "off", label: t("kernel.state-off") };
  if (status?.busyCell != null) return { key: "busy", label: t("kernel.state-busy", { n: status.busyCell }) };
  if (status?.running) return { key: "on", label: t("kernel.state-on") };
  return { key: "idle", label: t("kernel.state-idle") };
}

/** Secondes écoulées depuis le début d'une cellule en cours, rafraîchies. */
function useElapsed(startedAt: string | undefined, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  return Number.isNaN(start) ? 0 : Math.max(0, Math.round((now - start) / 1000));
}

/** Figure captée : aperçu qui s'agrandit au clic, et au survol « agrandir »,
 *  « ouvrir » ou « enregistrer » dans la galerie. */
export function KernelFigure({ path, threadId, cell }: { path: string; threadId: string; cell?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(() => savedFigure(path));
  const [viewer, setViewer] = useState<{ figures: ShownFigure[]; start: number } | null>(null);
  const thumb = useRef<HTMLButtonElement | null>(null);
  // La visionneuse peut enregistrer cette figure pendant qu'on en regarde une autre.
  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; rel: string }>).detail;
      if (detail?.path === path) setSaved(detail.rel);
    };
    window.addEventListener(FIGURE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(FIGURE_SAVED_EVENT, onSaved);
  }, [path]);
  const openViewer = () => {
    const figures = figuresIn(thumb.current?.closest(".kernel-scroll") ?? document);
    const start = figures.findIndex((f) => f.path === path);
    setViewer(start < 0 ? { figures: [{ path, cell: cell ?? null, thumb: thumb.current?.querySelector("img") ?? null }], start: 0 } : { figures, start });
  };
  useEffect(() => {
    let disposed = false;
    let owned: string | undefined;
    // Chaque figure a sa clé (son chemin) : pas d'état à remettre à zéro ici.
    void localImagePreviewUrl(path).then((next) => {
      if (next.startsWith("blob:")) owned = next;
      if (disposed) { if (owned) URL.revokeObjectURL(owned); return; }
      setUrl(next);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (owned) URL.revokeObjectURL(owned); };
  }, [path]);

  if (failed) return <p className="kernel-figure-missing">{t("kernel.figure-missing", { name: baseName(path) })}</p>;
  return (
    <figure className="kernel-figure" data-testid="kernel-figure" data-path={path} data-cell={cell ?? undefined}>
      <div className="kernel-figure-frame">
        {url ? (
          <RowButton ref={thumb} className="kernel-figure-zoom" aria-label={t("kernel.figure-expand-name", { name: baseName(path) })} onClick={openViewer}>
            <img src={url} alt={baseName(path)} draggable={false} />
          </RowButton>
        ) : <span className="kernel-figure-loading" aria-hidden="true" />}
        {/* Remontée quand la figure entre au projet : la barre relit la copie faite. */}
        <FigureGalleryBar key={saved ?? ""} path={path} threadId={threadId} cell={cell} onSaved={setSaved}>
          {url ? <IconButton size="s" className="ghost" label={t("kernel.figure-expand")} title={t("kernel.figure-expand")}
            onClick={openViewer}>{EXPAND_ICON}</IconButton> : null}
        </FigureGalleryBar>
      </div>
      <figcaption>{saved ? t("kernel.figure-in-project", { path: saved }) : t("kernel.figure-temp")}</figcaption>
      {viewer ? <FigureViewer threadId={threadId} figures={viewer.figures} start={viewer.start}
        onClose={() => { setViewer(null); thumb.current?.focus(); }} /> : null}
    </figure>
  );
}

function shortSha(sha?: string): string {
  return sha ? sha.slice(0, 8) : "";
}

function firstLine(code: string): string {
  return code.split("\n").find((l) => l.trim() && !l.trim().startsWith("#"))?.trim() ?? code.trim();
}

function Files({ cell, projectRoot }: { cell: KernelCell; projectRoot?: string }) {
  const prints = new Map((cell.prints ?? []).map((p) => [p.path, p]));
  const stale = new Map((cell.stale ?? []).map((s) => [s.path, s]));
  const entries = [
    ...(cell.filesRead ?? []).map((file) => ({ kind: "read" as const, file })),
    ...(cell.filesWritten ?? []).map((file) => ({ kind: "written" as const, file })),
  ];
  if (!entries.length) return null;
  return (
    <div className="kernel-files">
      {entries.map(({ kind, file }) => {
        const rel = projectRel(file, projectRoot);
        const label = t(kind === "read" ? "kernel.read-one" : "kernel.written-one");
        const print = kind === "read" ? prints.get(file) : undefined;
        const change = kind === "read" ? stale.get(file) : undefined;
        const content = <>
          {Icon[kind]}<span className="kernel-file-kind">{label}</span><span className="kernel-file-name">{baseName(file)}</span>
          {print?.sha256 ? <span className="kernel-file-sha" title={print.sha256}>sha {shortSha(print.sha256)}</span> : null}
          {print ? (
            <span className="kernel-file-state" data-state={change?.state ?? "same"}>
              {change?.state === "missing" ? t("kernel.file-missing")
                : change?.state === "modified" ? t("kernel.file-modified", { time: clock(change.mtimeMs ? new Date(change.mtimeMs).toISOString() : undefined) })
                : t("kernel.file-same")}
            </span>
          ) : null}
        </>;
        const title = print?.sha256 ? `${file}\nsha256 ${print.sha256}` : file;
        return rel
          ? <RowButton key={`${kind}:${file}`} className="kernel-file" title={title}
              onClick={() => window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel, line: null } }))}>{content}</RowButton>
          : <span key={`${kind}:${file}`} className="kernel-file" title={title}>{content}</span>;
      })}
    </div>
  );
}

/** Pastille du dernier « Rejouer à neuf » qui a repassé la cellule. */
function ReplayBadge({ cell }: { cell: KernelCell }) {
  const mark = cell.replay;
  if (!mark || mark.status === "skipped") return null;
  const label = t(mark.status === "same" ? "kernel.replay-same"
    : mark.status === "files" ? "kernel.replay-files"
    : mark.status === "differs" ? "kernel.replay-differs" : "kernel.replay-error");
  return (
    <span className="kernel-badge" data-tone={mark.status === "same" ? "ok" : mark.status === "files" ? "muted" : "warn"}
      title={[t("kernel.replay-at", { time: clock(mark.at) }), mark.detail].filter(Boolean).join("\n")}>
      {mark.status === "same" ? Icon.check : Icon.warn}{label}
    </span>
  );
}

type CellActions = {
  onToggle: (id: number) => void;
  onEdit: (id: number | null) => void;
};

function CellHead({ cell, threadId, canEdit, actions }: { cell: KernelCell; threadId: string; canEdit: boolean; actions: CellActions }) {
  const running = cell.status === "running";
  const elapsed = useElapsed(cell.startedAt, running);
  const [copied, setCopied] = useState(false);
  const copyLabel = copied ? t("kernel.copied") : t("kernel.copy");
  const stale = !!cell.stale?.length;
  return (
    <div className="kernel-cell-head">
      <RowButton className="kernel-cell-title" aria-expanded="true" disabled={running}
        title={t("kernel.fold")} onClick={() => actions.onToggle(cell.id)}>
        {Icon.chevron}<span>{cell.purpose || t("kernel.cell-n", { n: cell.id })}</span>
      </RowButton>
      {cell.author === "user" ? (
        <span className="kernel-badge" data-tone="muted">{Icon.user}{cell.fromCell != null
          ? t("kernel.user-from", { n: cell.fromCell }) : t("kernel.user-own")}</span>
      ) : null}
      {stale ? <span className="kernel-badge" data-tone="warn">{Icon.warn}{t("kernel.stale")}</span> : null}
      <ReplayBadge cell={cell} />
      {running ? <>
        <span className="kernel-cell-live"><span className="kernel-dot" />{t("kernel.running-for", { s: elapsed })}</span>
        <Button variant="ghost" size="xs" onClick={() => void kernelCommand(threadId, "interrupt").catch(() => {})}>
          {Icon.stop}{t("kernel.interrupt")}
        </Button>
      </> : <>
        {cell.status === "error" ? <span className="kernel-cell-error">{t("kernel.error")}</span> : null}
        <span className="kernel-cell-time">{clock(cell.startedAt)}</span>
        <span>{duration(cell.durationMs)}</span>
      </>}
      {canEdit && !running ? (
        <Button variant="ghost" size="xs" className="kernel-reveal" onClick={() => actions.onEdit(cell.id)}>{Icon.edit}{t("kernel.edit")}</Button>
      ) : null}
      <IconButton size="s" className="ghost kernel-copy kernel-reveal" label={copyLabel} title={copyLabel}
        onClick={() => { void navigator.clipboard?.writeText(cell.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }); }}>
        {copied ? Icon.check : Icon.copy}
      </IconButton>
    </div>
  );
}

/** Ce que la cellule a lu, créé et modifié parmi les variables du noyau. */
function LineageRow({ cell }: { cell: KernelCell }) {
  const l = cell.lineage;
  const uses = l?.uses ?? [];
  const created = l?.created ?? [];
  const modified = l?.modified ?? [];
  if (!uses.length && !created.length && !modified.length) return null;
  const chips = (names: string[]) => names.slice(0, 8).map((n) => <span key={n} className="kernel-chip">{n}</span>);
  return (
    <div className="kernel-lineage">
      {uses.length ? <><span>{t("kernel.uses")}</span>{uses.slice(0, 8).map((u) => (
        <span key={u.name} className="kernel-chip">{u.name}{u.cell != null ? <span className="kernel-chip-cell"> [{u.cell}]</span> : null}</span>
      ))}</> : null}
      {created.length ? <><span>{t("kernel.creates")}</span>{chips(created)}</> : null}
      {modified.length ? <><span>{t("kernel.modifies")}</span>{chips(modified)}</> : null}
    </div>
  );
}

/** Lignes changées d'une cellule modifiée à la main. */
function DiffRow({ cell }: { cell: KernelCell }) {
  const diff = cell.fromDiff;
  if (!diff || (!diff.removed.length && !diff.added.length)) return null;
  const lines = Math.max(diff.removed.length, diff.added.length);
  return (
    <div className="kernel-diff">
      {[...new Set([...diff.removed.slice(0, 3).map((l) => `− ${l.trim()}`), ...diff.added.slice(0, 3).map((l) => `+ ${l.trim()}`)])]
        .map((line) => <code key={line} data-kind={line.startsWith("+") ? "add" : "del"}>{line}</code>)}
      <span>{t("kernel.lines-changed", { n: lines })}</span>
    </div>
  );
}

/** Code d'une cellule rendu éditable : ⇧↵ relance comme nouvelle cellule. */
function CellEditor({ cell, threadId, nextId, onDone }: { cell: KernelCell; threadId: string; nextId: number; onDone: () => void }) {
  // Brouillon : part du code de la cellule, l'éditeur est remonté à chaque « Modifier ».
  const [code, setCode] = useState(cell.code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  const submit = () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    kernelCommand(threadId, "rerun", { code, fromCell: cell.id })
      .then(onDone)
      .catch((e: Error) => { setBusy(false); setError(e.message.replace(/^[a-z_]+ — /u, "")); });
  };
  return (
    <div className="kernel-editor">
      <textarea ref={area} className="kernel-code kernel-edit" value={code} spellCheck={false}
        aria-label={t("kernel.edit-label", { n: cell.id })}
        onChange={(e) => {
          setCode(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); submit(); }
          else if (e.key === "Escape") { e.preventDefault(); onDone(); }
        }} />
      <div className="kernel-editor-bar">
        <Button variant="primary" size="xs" loading={busy} disabled={code === cell.code} onClick={submit}>
          {Icon.play}{t("kernel.rerun-as", { n: nextId })}
        </Button>
        <Button variant="ghost" size="xs" onClick={onDone}>{t("action.cancel")}</Button>
        <span className="kernel-editor-note">{error ?? t("kernel.rerun-note", { n: cell.id })}</span>
      </div>
    </div>
  );
}

/** Sorties d'une cellule : stdout, stderr, valeur rendue, erreur. */
function CellOutputs({ cell }: { cell: KernelCell }) {
  // React 19 réécrit innerHTML dès que l'objet __html change d'identité, même
  // à texte égal : objet mémoïsé, sinon un nouveau rendu effacerait la
  // sélection faite dans le résultat.
  const result = useMemo(() => (cell.result ? { __html: highlightCode(cell.result, "python") } : null), [cell.result]);
  const traceback = cell.error?.traceback?.trim() ?? "";
  const stderr = cell.status !== "error" && cell.stderr?.trim() ? cell.stderr : "";
  return <>
    {cell.stdout ? <pre className="kernel-out" data-part="output">{cell.stdout}</pre> : null}
    {stderr ? <pre className="kernel-out kernel-stderr" data-part="output">{stderr}</pre> : null}
    {result ? (
      <div className="kernel-result">
        <span className="kernel-result-label" aria-hidden="true">Out</span>
        <pre className="kernel-out hljs" data-part="output"><code dangerouslySetInnerHTML={result} /></pre>
      </div>
    ) : null}
    {cell.error ? (
      <pre className="kernel-out kernel-error" data-part="output">
        <span className="kernel-ename">{cell.error.ename}</span>{cell.error.evalue ? `: ${cell.error.evalue}` : ""}
        {traceback ? <span className="kernel-traceback">{`\n${traceback}`}</span> : null}
      </pre>
    ) : null}
  </>;
}

// Mémoïsée : un nouveau rendu de la surface (capsule de sélection) ne doit pas
// réécrire le code coloré, ce qui effacerait la sélection en cours.
export const KernelCellView = memo(function KernelCellView({ cell, threadId, projectRoot, folded, editing, nextId, canEdit, actions }: {
  cell: KernelCell; threadId: string; projectRoot?: string; folded?: boolean; editing?: boolean; nextId?: number; canEdit?: boolean;
  actions: CellActions;
}) {
  // Même raison que dans CellOutputs : le chrono d'une cellule en cours
  // rerend chaque seconde.
  const code = useMemo(() => ({ __html: highlightCode(cell.code, "python") }), [cell.code]);
  if (folded) {
    return (
      <article className="kernel-cell" data-status={cell.status} data-cell={cell.id} data-folded="true" data-testid="kernel-cell">
        <RowButton className="kernel-cell-fold" aria-expanded="false" title={t("kernel.unfold")} onClick={() => actions.onToggle(cell.id)}>
          {Icon.chevron}
          <span className="kernel-cell-num">[{cell.id}]</span>
          <span className="kernel-cell-fold-title">{cell.purpose || firstLine(cell.code)}</span>
          {cell.author === "user" ? <span className="kernel-badge" data-tone="muted">{Icon.user}</span> : null}
          <ReplayBadge cell={cell} />
          {cell.status === "error" ? <span className="kernel-cell-error">{t("kernel.error")}</span>
            : cell.replay && cell.replay.status !== "skipped" ? null : <span className="kernel-ok">{Icon.check}</span>}
          <span className="kernel-cell-time">{clock(cell.startedAt)}</span>
          <span>{duration(cell.durationMs)}</span>
        </RowButton>
      </article>
    );
  }
  return (
    <article className="kernel-cell" data-status={cell.status} data-cell={cell.id} data-testid="kernel-cell">
      <span className="kernel-cell-num" aria-hidden="true">[{cell.status === "running" ? "*" : cell.id}]</span>
      <div className="kernel-cell-body">
        {editing ? <span className="kernel-cell-head kernel-editing">{cell.purpose ? <span className="kernel-cell-title-text">{cell.purpose}</span> : null}<span className="kernel-meta-end">{t("kernel.editing")}</span></span>
          : <CellHead cell={cell} threadId={threadId} canEdit={!!canEdit} actions={actions} />}
        <DiffRow cell={cell} />
        <LineageRow cell={cell} />
        {editing
          ? <CellEditor cell={cell} threadId={threadId} nextId={nextId ?? cell.id + 1} onDone={() => actions.onEdit(null)} />
          : <pre className="kernel-code hljs" data-part="code"><code dangerouslySetInnerHTML={code} /></pre>}
        <CellOutputs cell={cell} />
        {cell.figures?.length ? (
          <div className="kernel-figures">
            {cell.figures.map((path) => <KernelFigure key={path} path={path} threadId={threadId} cell={cell.id} />)}
          </div>
        ) : null}
        <Files cell={cell} projectRoot={projectRoot} />
      </div>
    </article>
  );
});

/** Lignes du code (1-based) couvertes par la sélection dans le <pre>. */
function selectedLines(pre: HTMLElement, range: Range): [number, number] {
  const before = document.createRange();
  before.selectNodeContents(pre);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().split("\n").length;
  const end = start + range.toString().replace(/\n$/u, "").split("\n").length - 1;
  return [start, end];
}

type Picked = { x: number; y: number; text: string; cell: number; part: "code" | "output"; lines?: [number, number] };

function useKernelSelection(scroller: React.RefObject<HTMLElement | null>) {
  const [picked, setPicked] = useState<Picked | null>(null);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let timer = 0;
    const onMouseUp = () => {
      // Laisser le navigateur finir la sélection (double clic, triple clic).
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPicked(pickSelection(root)), 0);
    };
    root.addEventListener("mouseup", onMouseUp);
    return () => { window.clearTimeout(timer); root.removeEventListener("mouseup", onMouseUp); };
  }, [scroller]);
  return { picked, setPicked };
}

/** Sélection courante dans une cellule du noyau, ou rien. */
function pickSelection(root: HTMLElement): Picked | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";
  if (!selection || !text || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const anchor = range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const article = anchor?.closest<HTMLElement>(".kernel-cell");
  if (!article || !root.contains(article)) return null;
  const pre = anchor?.closest<HTMLElement>("pre[data-part]");
  const part = pre?.dataset.part === "code" ? "code" : "output";
  // La capsule est en position fixe (.sel-toolbar) : coordonnées de la fenêtre.
  const box = range.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top,
    text,
    cell: Number(article.dataset.cell),
    part,
    lines: part === "code" && pre ? selectedLines(pre, range) : undefined,
  };
}

function SelectionBar({ picked, onDone }: { picked: Picked; onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const context = selectionContext(picked.cell, picked.part, picked.text, picked.lines);
    const done = () => { window.getSelection()?.removeAllRanges(); onDone(); };
    createSelectionActions(host, {
      onAdd: () => { window.dispatchEvent(new CustomEvent("kernel-add-to-chat", { detail: { text: context } })); done(); },
      // Pas d'annotation persistante sur une cellule : le bouton est masqué (CSS).
      onAnnotate: () => {},
      onAsk: () => {
        window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { context: {
          selection: picked.text,
          source: { file: t("kernel.selection-source", { n: picked.cell }), lines: picked.lines ? `${picked.lines[0]}-${picked.lines[1]}` : undefined },
        } } }));
        done();
      },
    });
  }, [picked, onDone]);
  return <div ref={ref} className="sel-toolbar kernel-selection" style={{ left: picked.x, top: picked.y - 44 }} />;
}

function EnvMenu({ threadId, current, disabled }: { threadId: string; current?: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [envs, setEnvs] = useState<KernelEnv[] | null>(null);
  useEffect(() => {
    if (!open || envs) return;
    void kernelCommand<{ envs: KernelEnv[] }>(threadId, "envs").then((r) => setEnvs(r.envs)).catch(() => setEnvs([]));
  }, [open, envs, threadId]);
  return (
    <LazyDropdownMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      sideOffset={6}
      className="kernel-env-menu"
      label={t("kernel.env")}
      header={t("kernel.env")}
      footer={<span className="kernel-env-note">{t("kernel.env-note")}</span>}
      items={(envs ?? []).map((env) => ({
        key: env.name,
        label: <span className="kernel-env-row"><span>{env.name}</span><span className="kernel-env-source">{env.source}</span></span>,
        checked: env.name === current,
        onSelect: () => { if (env.name !== current) void kernelCommand(threadId, "restart", { env: env.name }).catch(() => {}); },
      }))}
      trigger={(
        <Button variant="ghost" size="xs" className="kernel-env" disabled={disabled}>
          <span>{current ?? t("kernel.env-default")}</span>{Icon.chevron}
        </Button>
      )}
    />
  );
}

/** Monté seulement noyau en marche, avec une clé par démarrage : la liste
 *  repart de zéro à chaque redémarrage sans effet de remise à zéro. */
function Variables({ threadId, live, refreshKey }: { threadId: string; live: boolean; refreshKey: string }) {
  const [open, setOpen] = useState(true);
  const [vars, setVars] = useState<KernelVariable[] | null>(null);
  useEffect(() => {
    if (!open || !live) return;
    let cancelled = false;
    void kernelCommand<{ variables: KernelVariable[] }>(threadId, "variables")
      .then((r) => { if (!cancelled) setVars(r.variables); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, live, threadId, refreshKey]);
  return (
    <section className="kernel-vars" data-open={open}>
      <RowButton className="kernel-vars-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {Icon.chevron}<span>{t("kernel.variables")}</span>{vars ? <span className="kernel-vars-count">{vars.length}</span> : null}
      </RowButton>
      {open && vars?.length ? (
        <div className="kernel-vars-list">
          <table aria-label={t("kernel.variables")}>
            <tbody>
              {vars.map((v) => (
                <tr key={v.name} title={v.repr}>
                  <td className="kernel-var-name">{v.name}</td>
                  <td className="kernel-var-type">{v.type.split(".").pop()}</td>
                  <td className="kernel-var-size">{variableSize(v)}</td>
                  <td className="kernel-var-origin">{v.origin?.created != null ? t("kernel.created-in", { n: v.origin.created }) : ""}
                    {v.origin?.modified != null ? <span className="kernel-var-modified"> · {t("kernel.modified-in", { n: v.origin.modified })}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {open && vars && !vars.length ? <p className="kernel-vars-empty">{t("kernel.variables-empty")}</p> : null}
    </section>
  );
}

function ExportMenu({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(false);
  const run = (format: "py" | "ipynb") => {
    kernelCommand<{ rel: string }>(threadId, "export", { format })
      .then((r) => {
        void showSuccess(t("kernel.exported", { path: r.rel }));
        window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel: r.rel, line: null } }));
      })
      .catch((e: Error) => void showError(e.message.replace(/^[a-z_]+ — /u, "")));
  };
  return (
    <LazyDropdownMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      sideOffset={6}
      label={t("kernel.export")}
      header={t("kernel.export-header")}
      items={[
        { key: "py", label: t("kernel.export-py"), onSelect: () => run("py") },
        { key: "ipynb", label: t("kernel.export-ipynb"), onSelect: () => run("ipynb") },
      ]}
      trigger={<Button variant="ghost" size="xs">{Icon.export}{t("kernel.export")}</Button>}
    />
  );
}

function KernelHeader({ threadId, threadTitle, enabled, status, hasCells, replay }: {
  threadId: string; threadTitle?: string; enabled: boolean; status: KernelStatus | null; hasCells: boolean; replay: ReplayState | null;
}) {
  const state = stateOf(enabled, status);
  const replaying = replay?.state === "running";
  return (
    <header className="kernel-head">
      <div className="kernel-titles">
        <h2>{t("kernel.panel-title")}</h2>
        {threadTitle ? <p>{t("kernel.thread", { title: threadTitle })}</p> : null}
      </div>
      <span className="kernel-state" data-state={replaying ? "busy" : state.key} role="status"><span className="kernel-dot" />
        {replay?.state === "running" ? t("kernel.replaying", { done: replay.done, total: replay.total }) : state.label}</span>
      {enabled && hasCells ? (replaying
        ? <Button variant="ghost" size="xs" onClick={() => void kernelCommand(threadId, "cancelReplay").catch(() => {})}>{Icon.stop}{t("kernel.replay-stop")}</Button>
        : <Button variant="ghost" size="xs" disabled={status?.busyCell != null} title={t("kernel.replay-hint")}
            onClick={() => void kernelCommand(threadId, "replay").catch((e: Error) => void showError(e.message.replace(/^[a-z_]+ — /u, "")))}>
            {Icon.replay}{t("kernel.replay")}
          </Button>) : null}
      {hasCells ? <ExportMenu threadId={threadId} /> : null}
      {enabled && status?.running && !replaying ? <>
        <Button variant="ghost" size="xs" onClick={() => void kernelCommand(threadId, "restart").catch(() => {})}>{Icon.restart}{t("kernel.restart")}</Button>
        <Button variant="ghost" size="xs" onClick={() => stopKernel(threadId)}>{Icon.stop}{t("kernel.stop-short")}</Button>
      </> : null}
    </header>
  );
}

/** Versions des paquets chargés : les premiers, puis « +N paquets ». */
const PACKAGES_SHOWN = 3;

function KernelMeta({ threadId, status, cellCount }: { threadId: string; status: KernelStatus | null; cellCount: number }) {
  const kernel = status?.running ? status.kernel : undefined;
  const packages = status?.packages ?? [];
  const shown = packages.slice(0, PACKAGES_SHOWN);
  const more = Math.max(0, (status?.packagesTotal ?? packages.length) - shown.length);
  const all = packages.map((p) => `${p.name} ${p.version}`).join("\n");
  return (
    <div className="kernel-meta">
      <EnvMenu threadId={threadId} current={kernel?.env.name} disabled={status?.busyCell != null} />
      {kernel ? <>
        <span>Python {kernel.pythonVersion}</span>
        {shown.map((p) => <span key={p.name} className="kernel-pkg">· {p.name} {p.version}</span>)}
        {more ? <span className="kernel-pkg-more" title={[all, status?.envSha256 ? `env sha256 ${status.envSha256}` : ""].filter(Boolean).join("\n")}>
          {t("kernel.packages-more", { n: more })}</span> : null}
        <span aria-hidden="true">·</span>
        <span className="kernel-cwd" title={kernel.cwd}>{shortCwd(kernel.cwd)}</span>
      </> : null}
      <span className="kernel-meta-end">
        {t("kernel.cells-count", { n: cellCount })}{kernel ? ` · ${t("kernel.started-at", { time: clock(kernel.startedAt) })}` : ""}
      </span>
    </div>
  );
}

/** Résumé du dernier rejeu, et alerte si le journal a été retouché. */
function KernelNotices({ replay, chain }: { replay: ReplayState | null; chain: ChainCheck | null }) {
  const lines: { tone: "ok" | "warn"; text: string }[] = [];
  if (chain?.brokenAt != null) lines.push({ tone: "warn", text: t("kernel.chain-broken", { n: chain.brokenAt }) });
  if (replay?.state === "done") {
    if (replay.error) lines.push({ tone: "warn", text: replay.error.replace(/^[a-z_]+ — /u, "") });
    else if (replay.summary) {
      const s = replay.summary;
      const off = s.differs + s.error;
      const parts = [t("kernel.replay-summary", { same: s.same + s.files, total: s.total })];
      if (s.differs) parts.push(t("kernel.replay-summary-differs", { n: s.differs }));
      if (s.error) parts.push(t("kernel.replay-summary-error", { n: s.error }));
      if (s.cancelled) parts.push(t("kernel.replay-summary-cancelled"));
      if (s.adopted) parts.push(t("kernel.replay-summary-adopted"));
      lines.push({ tone: off || s.cancelled ? "warn" : "ok", text: parts.join(" · ") });
    }
  }
  if (!lines.length) return null;
  return <>{lines.map((l) => (
    <p key={l.text} className="kernel-notice" data-tone={l.tone} role="status">{l.tone === "ok" ? Icon.check : Icon.warn}{l.text}</p>
  ))}</>;
}

function KernelEmpty({ enabled }: { enabled: boolean }) {
  return (
    <div className="kernel-empty">
      <p>{t(enabled ? "kernel.empty" : "kernel.empty-off")}</p>
      {!enabled ? <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("kernel-toggle"))}>{t("kernel.turn-on")}</Button> : null}
    </div>
  );
}

type SurfaceProps = { threadTitle?: string; enabled: boolean; projectRoot?: string; visible: boolean };

type CellGroup = { key: string; turnId?: string | null; prompt?: string | null; user: boolean; cells: KernelCell[] };

/** Cellules regroupées par tour de l'agent (cellules voisines du même tour) ;
 *  celles relancées à la main forment leur propre groupe. */
function groupCells(cells: KernelCell[]): CellGroup[] {
  const groups: CellGroup[] = [];
  for (const cell of cells) {
    const user = cell.author === "user";
    const key = user ? "user" : cell.turnId ? `turn:${cell.turnId}` : "none";
    const last = groups[groups.length - 1];
    if (last && last.key === key) { last.cells.push(cell); continue; }
    groups.push({ key, turnId: cell.turnId, prompt: cell.turnPrompt, user, cells: [cell] });
  }
  return groups;
}

/** Repliée par défaut : une cellule finie hors du dernier groupe, sans erreur
 *  ni données modifiées depuis. */
function foldedByDefault(cell: KernelCell, lastGroup: boolean): boolean {
  return !lastGroup && cell.status === "ok" && !cell.stale?.length;
}

function GroupHead({ group, folded, onToggleAll }: { group: CellGroup; folded: boolean; onToggleAll: () => void }) {
  if (group.key === "none") return null;
  const first = group.cells[0];
  return (
    <div className="kernel-group-head">
      <span className="kernel-group-title">
        {group.user ? t("kernel.group-user") : t("kernel.group-turn", { time: clock(first.startedAt) })}
        {!group.user && group.prompt ? <span className="kernel-group-prompt"> « {group.prompt} »</span> : null}
      </span>
      {group.cells.length > 1 || folded ? (
        <Button variant="ghost" size="xs" onClick={onToggleAll}>{folded ? t("kernel.unfold-all") : t("kernel.fold-all")}</Button>
      ) : null}
    </div>
  );
}

/** Noyau d'un fil ; remonté (clé) quand on change de fil, la sélection et le
 *  défilement repartent donc à neuf. */
function KernelThread({ threadId, threadTitle, enabled, projectRoot, visible }: SurfaceProps & { threadId: string }) {
  const { cells, status, chain, replay } = useKernelCells(threadId, visible);
  const scroller = useRef<HTMLDivElement | null>(null);
  const { picked, setPicked } = useKernelSelection(scroller);
  const clearPicked = useCallback(() => setPicked(null), [setPicked]);
  const last = cells[cells.length - 1];
  const refreshKey = `${last?.id ?? 0}:${last?.status ?? ""}`;
  const running = enabled && !!status?.running;
  const groups = useMemo(() => groupCells(cells), [cells]);
  const nextId = (last?.id ?? 0) + 1;

  const pinned = useRef(true);
  // Choix explicites de l'utilisateur, par cellule ; le reste suit la règle.
  const [overrides, setOverrides] = useState<Map<number, boolean>>(() => new Map());
  const [editing, setEditing] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(() => takePendingFocus());
  const actions = useMemo<CellActions>(() => ({
    onToggle: (id) => setOverrides((m) => {
      const next = new Map(m);
      const el = scroller.current?.querySelector<HTMLElement>(`[data-cell="${id}"]`);
      next.set(id, el?.dataset.folded !== "true");
      return next;
    }),
    onEdit: setEditing,
  }), []);
  const isFolded = (cell: KernelCell, lastGroup: boolean) =>
    cell.status !== "running" && editing !== cell.id && (overrides.get(cell.id) ?? foldedByDefault(cell, lastGroup));

  // Citation du chat : déplier la cellule et l'amener à l'écran.
  useEffect(() => {
    const onFocus = (e: Event) => { takePendingFocus(); setFocus(Number((e as CustomEvent).detail?.cell) || null); };
    window.addEventListener("kernel-cell-focus", onFocus);
    return () => window.removeEventListener("kernel-cell-focus", onFocus);
  }, []);
  const focusReady = focus != null && cells.some((c) => c.id === focus);
  useEffect(() => {
    if (!focusReady || focus == null) return;
    setOverrides((m) => new Map(m).set(focus, false));
    const timer = window.setTimeout(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-cell="${focus}"]`);
      if (!el) return;
      pinned.current = false;
      el.scrollIntoView({ block: "start" });
      el.dataset.flash = "true";
      window.setTimeout(() => { delete el.dataset.flash; }, 1200);
      setFocus(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusReady, focus]);

  // Suivre la dernière cellule tant qu'on lit déjà le bas, comme le chat.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [cells.length, refreshKey]);

  return (
    <div className="kernel-surface" aria-label={t("kernel.panel-title")}>
      <KernelHeader threadId={threadId} threadTitle={threadTitle} enabled={enabled} status={status}
        hasCells={cells.length > 0} replay={replay} />
      {enabled ? <KernelMeta threadId={threadId} status={status} cellCount={cells.length} /> : null}
      <KernelNotices replay={replay} chain={chain} />
      {running ? <Variables key={status?.kernel?.startedAt ?? "on"} threadId={threadId}
        live={status?.busyCell == null} refreshKey={refreshKey} /> : null}
      <div className="kernel-scroll" ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (picked) setPicked(null);
        }}>
        {cells.length ? (
          <div className="kernel-cells">
            {groups.map((group, gi) => {
              const lastGroup = gi === groups.length - 1;
              const anyFolded = group.cells.some((c) => isFolded(c, lastGroup));
              return (
                <section key={`${group.key}:${group.cells[0].id}`} className="kernel-group">
                  <GroupHead group={group} folded={anyFolded} onToggleAll={() => setOverrides((m) => {
                    const next = new Map(m);
                    for (const c of group.cells) next.set(c.id, !anyFolded);
                    return next;
                  })} />
                  {group.cells.map((cell) => (
                    <KernelCellView key={cell.id} cell={cell} threadId={threadId} projectRoot={projectRoot}
                      folded={isFolded(cell, lastGroup)} editing={editing === cell.id}
                      nextId={editing === cell.id ? nextId : undefined}
                      canEdit={enabled && status?.busyCell == null && replay?.state !== "running"} actions={actions} />
                  ))}
                </section>
              );
            })}
          </div>
        ) : <KernelEmpty enabled={enabled} />}
        {picked ? <SelectionBar picked={picked} onDone={clearPicked} /> : null}
      </div>
    </div>
  );
}

export default function KernelSurface({ threadId, ...rest }: SurfaceProps & { threadId: string | null }) {
  if (!threadId) {
    return <div className="kernel-surface"><p className="kernel-empty">{t("kernel.no-thread")}</p></div>;
  }
  return <KernelThread key={threadId} threadId={threadId} {...rest} />;
}
