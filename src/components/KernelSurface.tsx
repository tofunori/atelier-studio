// Surface « Noyau Python » (chantier 5) : le noyau persistant du fil actif,
// ouvert comme onglet du panneau droit. Cellules dans l'ordre, code coloré
// comme les blocs du chat, figures captées, variables en mémoire ; on y
// sélectionne du code ou une sortie pour l'envoyer au chat, comme dans le
// lecteur PDF et l'éditeur LaTeX.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createSelectionActions } from "../../gallery/src/studio/features/annotation_ui";
import { t } from "../lib/i18n";
import {
  baseName, kernelCommand, selectionContext, stopKernel, useKernelCells, variableSize,
  type KernelCell, type KernelEnv, type KernelStatus, type KernelVariable,
} from "../lib/kernel";
import { localImagePreviewUrl } from "../lib/localImage";
import { FigureGalleryBar } from "./FigureGalleryBar";
import { highlightCode } from "./chat/md";
import { Button, IconButton, RowButton } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";

const Icon = {
  chevron: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>,
  restart: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M11.8 1.9v2.8H9" /></svg>,
  stop: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" /></svg>,
  copy: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M3 10.5V3.5c0-.8.6-1.5 1.5-1.5h6" /></svg>,
  check: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>,
  read: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" /></svg>,
  written: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10.5v-8M4.8 5.5 8 2.3l3.2 3.2M3 13.5h10" /></svg>,
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

/** Figure captée : aperçu, et au survol « ouvrir » ou « enregistrer » dans la galerie. */
export function KernelFigure({ path, threadId, cell }: { path: string; threadId: string; cell?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
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
    <figure className="kernel-figure" data-testid="kernel-figure">
      <div className="kernel-figure-frame">
        {url ? <img src={url} alt={baseName(path)} draggable={false} /> : <span className="kernel-figure-loading" aria-hidden="true" />}
        <FigureGalleryBar path={path} threadId={threadId} cell={cell} onSaved={setSaved} />
      </div>
      <figcaption>{saved ? t("kernel.figure-in-project", { path: saved }) : t("kernel.figure-temp")}</figcaption>
    </figure>
  );
}

function Files({ kind, files, projectRoot }: { kind: "read" | "written"; files?: string[]; projectRoot?: string }) {
  if (!files?.length) return null;
  return <>
    {files.map((file) => {
      const rel = projectRel(file, projectRoot);
      const label = t(kind === "read" ? "kernel.read-one" : "kernel.written-one");
      const content = <>{Icon[kind]}<span className="kernel-file-kind">{label}</span><span className="kernel-file-name">{baseName(file)}</span></>;
      return rel
        ? <RowButton key={`${kind}:${file}`} className="kernel-file" title={file}
            onClick={() => window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel, line: null } }))}>{content}</RowButton>
        : <span key={`${kind}:${file}`} className="kernel-file" title={file}>{content}</span>;
    })}
  </>;
}

function CellHead({ cell, threadId }: { cell: KernelCell; threadId: string }) {
  const running = cell.status === "running";
  const elapsed = useElapsed(cell.startedAt, running);
  const [copied, setCopied] = useState(false);
  const copyLabel = copied ? t("kernel.copied") : t("kernel.copy");
  return (
    <div className="kernel-cell-head">
      <span className="kernel-cell-time">{clock(cell.startedAt)}</span>
      {running ? <>
        <span className="kernel-cell-live"><span className="kernel-dot" />{t("kernel.running-for", { s: elapsed })}</span>
        <Button variant="ghost" size="xs" onClick={() => void kernelCommand(threadId, "interrupt").catch(() => {})}>
          {Icon.stop}{t("kernel.interrupt")}
        </Button>
      </> : <>
        {cell.status === "error" ? <span className="kernel-cell-error">{t("kernel.error")}</span> : null}
        <span>{duration(cell.durationMs)}</span>
      </>}
      <IconButton size="s" className="ghost kernel-copy" label={copyLabel} title={copyLabel}
        onClick={() => { void navigator.clipboard?.writeText(cell.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }); }}>
        {copied ? Icon.check : Icon.copy}
      </IconButton>
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
export const KernelCellView = memo(function KernelCellView({ cell, threadId, projectRoot }: { cell: KernelCell; threadId: string; projectRoot?: string }) {
  // Même raison que dans CellOutputs : le chrono d'une cellule en cours
  // rerend chaque seconde.
  const code = useMemo(() => ({ __html: highlightCode(cell.code, "python") }), [cell.code]);
  const hasFiles = !!(cell.filesRead?.length || cell.filesWritten?.length);
  return (
    <article className="kernel-cell" data-status={cell.status} data-cell={cell.id} data-testid="kernel-cell">
      <span className="kernel-cell-num" aria-hidden="true">[{cell.status === "running" ? "*" : cell.id}]</span>
      <div className="kernel-cell-body">
        <CellHead cell={cell} threadId={threadId} />
        <pre className="kernel-code hljs" data-part="code"><code dangerouslySetInnerHTML={code} /></pre>
        <CellOutputs cell={cell} />
        {cell.figures?.length ? (
          <div className="kernel-figures">
            {cell.figures.map((path) => <KernelFigure key={path} path={path} threadId={threadId} cell={cell.id} />)}
          </div>
        ) : null}
        {hasFiles ? (
          <div className="kernel-files">
            <Files kind="read" files={cell.filesRead} projectRoot={projectRoot} />
            <Files kind="written" files={cell.filesWritten} projectRoot={projectRoot} />
          </div>
        ) : null}
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

function KernelHeader({ threadId, threadTitle, enabled, status }: {
  threadId: string; threadTitle?: string; enabled: boolean; status: KernelStatus | null;
}) {
  const state = stateOf(enabled, status);
  return (
    <header className="kernel-head">
      <div className="kernel-titles">
        <h2>{t("kernel.panel-title")}</h2>
        {threadTitle ? <p>{t("kernel.thread", { title: threadTitle })}</p> : null}
      </div>
      <span className="kernel-state" data-state={state.key} role="status"><span className="kernel-dot" />{state.label}</span>
      {enabled && status?.running ? <>
        <Button variant="ghost" size="xs" onClick={() => void kernelCommand(threadId, "restart").catch(() => {})}>{Icon.restart}{t("kernel.restart")}</Button>
        <Button variant="ghost" size="xs" onClick={() => stopKernel(threadId)}>{Icon.stop}{t("kernel.stop-short")}</Button>
      </> : null}
    </header>
  );
}

function KernelMeta({ threadId, status, cellCount }: { threadId: string; status: KernelStatus | null; cellCount: number }) {
  const kernel = status?.running ? status.kernel : undefined;
  return (
    <div className="kernel-meta">
      <EnvMenu threadId={threadId} current={kernel?.env.name} disabled={status?.busyCell != null} />
      {kernel ? <>
        <span>Python {kernel.pythonVersion}</span>
        <span aria-hidden="true">·</span>
        <span className="kernel-cwd" title={kernel.cwd}>{shortCwd(kernel.cwd)}</span>
      </> : null}
      <span className="kernel-meta-end">
        {t("kernel.cells-count", { n: cellCount })}{kernel ? ` · ${t("kernel.started-at", { time: clock(kernel.startedAt) })}` : ""}
      </span>
    </div>
  );
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

/** Noyau d'un fil ; remonté (clé) quand on change de fil, la sélection et le
 *  défilement repartent donc à neuf. */
function KernelThread({ threadId, threadTitle, enabled, projectRoot, visible }: SurfaceProps & { threadId: string }) {
  const { cells, status } = useKernelCells(threadId, visible);
  const scroller = useRef<HTMLDivElement | null>(null);
  const { picked, setPicked } = useKernelSelection(scroller);
  const clearPicked = useCallback(() => setPicked(null), [setPicked]);
  const last = cells[cells.length - 1];
  const refreshKey = `${last?.id ?? 0}:${last?.status ?? ""}`;
  const running = enabled && !!status?.running;

  // Suivre la dernière cellule tant qu'on lit déjà le bas, comme le chat.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [cells.length, refreshKey]);

  return (
    <div className="kernel-surface" aria-label={t("kernel.panel-title")}>
      <KernelHeader threadId={threadId} threadTitle={threadTitle} enabled={enabled} status={status} />
      {enabled ? <KernelMeta threadId={threadId} status={status} cellCount={cells.length} /> : null}
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
            {cells.map((cell) => <KernelCellView key={cell.id} cell={cell} threadId={threadId} projectRoot={projectRoot} />)}
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
