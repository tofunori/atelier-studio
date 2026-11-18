// Surface native de lecture, d'édition et d'exécution des cahiers Jupyter (.ipynb).
// Respecte le contrat Quiet Instrument (aucune barre latérale orange, retour à la
// ligne intégral, tables booktabs, mini-diff inline SURF-17, zéro bouton HTML nu).
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  Maximize2Icon,
  MessageSquarePlusIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
  SaveIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { createSelectionActions } from "../../gallery/src/studio/features/annotation_ui";
import { selectionPillPosition } from "../../gallery/src/studio/features/latex/selection_pill";
import { getResolvedLanguage, t } from "../lib/i18n";
import {
  applyNotebookEvent,
  formatBytes,
  formatNotebookSelectionCitation,
  kernelExitDetail,
  notebookCommand,
  notebookInterrupt,
  sanitizeNotebookHtml,
  sanitizeNotebookSvg,
  type CellDiffEntry,
  type CellKind,
  type CellProposal,
  type DiscoveredKernel,
  type InputRequest,
  type NotebookPushEvent,
  type NotebookSnapshot,
  type UiCell,
  type UiOutput,
} from "../lib/notebook";
import { setDocumentUnsaved } from "../lib/unsavedDocuments";
import { attachCellScrollAnchor } from "../lib/cellScrollAnchor";
import { MD_COMPONENTS, MdBody, highlightCode, useMdPlugins } from "./chat/md";
import {
  Button,
  EmptyState,
  IconButton,
  InlineNotice,
  RowButton,
  SegmentedControl,
  Spinner,
  showError,
  showInfo,
  showSuccess,
} from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import "./NotebookTab.css";

export const NOTEBOOK_DOC_LIVE_CONTEXT_EVENT = "atelier-doc-live-context";

export type NotebookMode = "live" | "read" | "diff";

export type NotebookTabProps = {
  tabId: string;
  url: string;
  title: string;
  path: string;
  projectRoot: string;
  visible: boolean;
  galleryDir?: string;
  paneControls?: ReactNode;
};

type LightboxFigure = {
  cellIndex: number;
  format: "svg" | "png" | "jpeg";
  payload: string;
  safeSvg?: string;
};

type CompletionState = {
  cellId: string;
  matches: string[];
  cursorStart: number;
  cursorEnd: number;
};

type PickedSelection = {
  /** Zone de lecture et fin de la sélection, pour placer la bulle comme les éditeurs. */
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;
  caret: { left: number; top: number; bottom: number };
  text: string;
  cellIndex: number;
  part: "code" | "output";
  lines: [number, number];
};

/** Lignes (à partir de 1) couvertes par la sélection dans le bloc de code ou de sortie. */
function selectedLines(part: HTMLElement, range: Range): [number, number] {
  const before = document.createRange();
  before.selectNodeContents(part);
  try {
    before.setEnd(range.startContainer, range.startOffset);
  } catch {
    return [1, 1];
  }
  const from = before.toString().split("\n").length;
  const span = range.toString().replace(/\n+$/, "").split("\n").length;
  return [from, from + span - 1];
}

function initialModeFromUrl(url: string): NotebookMode {
  try {
    return new URL(url).searchParams.get("diff") === "1" ? "diff" : "live";
  } catch {
    return "live";
  }
}

function firstLine(source: string): string {
  return source.split("\n").find((line) => line.trim())?.trim().slice(0, 80) ?? "";
}

function normalizeMathLatex(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) return trimmed;
  if (trimmed.startsWith("$") && trimmed.endsWith("$") && trimmed.length > 2) {
    return `$$\n${trimmed.slice(1, -1).trim()}\n$$`;
  }
  return `$$\n${trimmed}\n$$`;
}

/** Sorties d'une cellule. Relancée, elle efface ses sorties puis les
 *  réécrit : sans ancrage du défilement (WebKit, donc Atelier sur Mac), la
 *  page remontait de toute leur hauteur et la vue tombait sur une autre
 *  cellule. Pendant l'exécution, la zone garde la hauteur d'avant. */
function HeldOutputs({ running, children }: { running: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settled = useRef(0);
  useLayoutEffect(() => {
    if (!running && ref.current) settled.current = ref.current.offsetHeight;
  });
  return (
    <div
      ref={ref}
      className="nb-outputs"
      data-held={running ? "true" : undefined}
      style={running && settled.current ? { minHeight: settled.current } : undefined}
    >
      {children}
    </div>
  );
}

function NotebookSelectionBar({
  notebookName,
  picked,
  onDone,
}: {
  notebookName: string;
  picked: PickedSelection;
  onDone: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const citation = formatNotebookSelectionCitation(
      notebookName,
      picked.cellIndex,
      picked.part,
      picked.text,
      picked.lines,
    );
    const finish = () => {
      window.getSelection()?.removeAllRanges();
      onDone();
    };
    createSelectionActions(host, {
      onAdd: () => {
        window.dispatchEvent(new CustomEvent("kernel-add-to-chat", { detail: { text: citation } }));
        finish();
      },
      onAnnotate: () => {},
      onAsk: () => {
        window.dispatchEvent(
          new CustomEvent("quick-ask-open", {
            detail: {
              context: {
                selection: picked.text,
                source: { file: `${notebookName} [${picked.cellIndex}]` },
              },
            },
          }),
        );
        finish();
      },
    });
    // Placée comme dans les éditeurs LaTeX et code : centrée dans la colonne,
    // sous la fin de la sélection (au-dessus si la place manque).
    const at = selectionPillPosition(picked.box, picked.caret, {
      width: host.offsetWidth,
      height: host.offsetHeight,
    });
    if (at) {
      host.style.left = `${at.left}px`;
      host.style.top = `${at.top}px`;
    }
  }, [notebookName, picked, onDone]);

  return (
    <div
      ref={hostRef}
      className="sel-toolbar kernel-selection"
      // Position calculée comme les éditeurs (bord gauche), pas centrée par
      // le translateX(-50 %) de .sel-toolbar.
      style={{ left: picked.caret.left, top: picked.caret.bottom + 10, transform: "none" }}
    />
  );
}

const ProposalDiffCard = memo(function ProposalDiffCard({
  proposal,
  busy,
  onAccept,
  onDiscard,
}: {
  proposal: CellProposal;
  busy: boolean;
  onAccept: (proposalId: string, runAfter: boolean) => void;
  onDiscard: (proposalId: string) => void;
}) {
  const canRun = proposal.cellType === "code" && proposal.kind !== "delete";
  const hasDiagnostics =
    proposal.diagnostics.redundantImports.length > 0 ||
    proposal.diagnostics.brokenDownstreamSymbols.length > 0;

  return (
    <div className="nb-proposal-box" data-proposal-id={proposal.id}>
      <div className="nb-proposal-bar">
        <span className="nb-proposal-title">
          {proposal.author} · {proposal.purpose}
        </span>
        <span>
          +{proposal.addedLines} / −{proposal.removedLines}
        </span>
        <div className="nb-proposal-btns">
          {canRun ? (
            <Button
              variant="primary"
              size="xs"
              disabled={busy}
              onClick={() => onAccept(proposal.id, true)}
            >
              {t("notebook.accept-run")}
            </Button>
          ) : null}
          <Button
            variant={canRun ? "secondary" : "primary"}
            size="xs"
            disabled={busy}
            onClick={() => onAccept(proposal.id, false)}
          >
            {t("notebook.accept")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => onDiscard(proposal.id)}
          >
            {t("notebook.discard")}
          </Button>
        </div>
      </div>

      <div className="nb-diff-well" role="region" aria-label={proposal.purpose}>
        {proposal.diffLines.map((line, idx) => (
          <div key={idx} className="nb-diff-line" data-kind={line.kind}>
            <span className="nb-diff-sign" aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
            </span>
            <span>{line.text || " "}</span>
          </div>
        ))}
      </div>

      <div className="nb-proposal-foot">
        <span>
          {proposal.upstreamSummary}
          {proposal.downstreamSummary ? ` · ${proposal.downstreamSummary}` : ""}
        </span>
        {hasDiagnostics ? (
          <span className="nb-proposal-warn">
            {proposal.diagnostics.redundantImports.length > 0
              ? t("notebook.redundant-imports", { list: proposal.diagnostics.redundantImports.join(", ") })
              : ""}
            {proposal.diagnostics.brokenDownstreamSymbols.length > 0
              ? ` · ${t("notebook.downstream-symbols", {
                  list: proposal.diagnostics.brokenDownstreamSymbols
                    .map((s) => `${s.symbol} ([${s.usedInCells.join(", ")}])`)
                    .join(", "),
                })}`
              : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
});

/** Bandeaux d'état du cahier : fichier modifié ailleurs, copie de secours,
 *  noyau arrêté tout seul. Chacun propose l'action qui le résout. */
function NotebookBanners({
  snapshot,
  onReload,
  onKeepMine,
  onRestore,
  onDiscardRecovery,
  onRestart,
}: {
  snapshot: NotebookSnapshot;
  onReload: () => void;
  onKeepMine: () => void;
  onRestore: () => void;
  onDiscardRecovery: () => void;
  onRestart: () => void;
}) {
  const { status } = snapshot;
  const exit = status.state === "dead" ? kernelExitDetail(status) : null;
  return (
    <>
      {snapshot.diskChanged ? (
        <InlineNotice tone="warning" className="nb-banner">
          <span className="nb-banner-text">{t("notebook.disk-changed")}</span>
          <span className="nb-banner-actions">
            <Button variant="secondary" size="xs" onClick={onReload}>
              {t("notebook.disk-reload")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onKeepMine}>
              {t("notebook.disk-keep-mine")}
            </Button>
          </span>
        </InlineNotice>
      ) : null}

      {snapshot.recovery ? (
        <InlineNotice tone="info" className="nb-banner">
          <span className="nb-banner-text">
            {t("notebook.recovery-found", {
              time: new Date(snapshot.recovery.savedAtMs).toLocaleString(getResolvedLanguage(), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </span>
          <span className="nb-banner-actions">
            <Button variant="secondary" size="xs" onClick={onRestore}>
              {t("notebook.recovery-restore")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onDiscardRecovery}>
              {t("notebook.recovery-discard")}
            </Button>
          </span>
        </InlineNotice>
      ) : null}

      {exit ? (
        <InlineNotice tone="error" className="nb-banner">
          <span className="nb-banner-text">
            {exit.code
              ? t("notebook.kernel-dead-code", { code: exit.code })
              : t("notebook.kernel-dead")}
            {exit.likelyOom ? ` ${t("notebook.kernel-dead-oom")}` : ""}
          </span>
          <span className="nb-banner-actions">
            <Button variant="secondary" size="xs" onClick={onRestart}>
              <RotateCwIcon size={12} />
              <span>{t("notebook.restart")}</span>
            </Button>
          </span>
        </InlineNotice>
      ) : null}
    </>
  );
}

/** Case de saisie pour `input()` / `getpass()` : Entrée envoie la réponse. */
function InputPrompt({
  request,
  onSubmit,
}: {
  request: InputRequest;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  // Le code attend : la case prend le focus dès qu'elle apparaît.
  const fieldRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);
  const submit = () => {
    if (sent) return;
    setSent(true);
    onSubmit(value);
  };
  return (
    <form
      className="nb-input-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="nb-input-label">
        <span className="nb-input-prompt-text">{request.prompt || t("notebook.input-default")}</span>
        <input
          className="nb-input-field"
          type={request.password ? "password" : "text"}
          value={value}
          disabled={sent}
          ref={fieldRef}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button variant="secondary" size="xs" type="submit" disabled={sent}>
        {t("notebook.input-send")}
      </Button>
    </form>
  );
}

const OutputBlock = memo(function OutputBlock({
  output,
  cellIndex,
  notebookName,
  mdRemark,
  mdRehype,
  onOpenLightbox,
  onSaveFigure,
  savedKeySet,
}: {
  output: UiOutput;
  cellIndex: number;
  notebookName: string;
  mdRemark: any[];
  mdRehype: any[];
  onOpenLightbox: (fig: LightboxFigure) => void;
  onSaveFigure: (fig: LightboxFigure, figKey: string) => void;
  savedKeySet: ReadonlySet<string>;
}) {
  // Hooks avant tout retour anticipé (règles des hooks).
  const rawHtml = output.kind === "data" ? output.textHtml : undefined;
  const rawSvg = output.kind === "data" ? output.imageSvg : undefined;
  const safeHtml = useMemo(() => (rawHtml ? sanitizeNotebookHtml(rawHtml) : ""), [rawHtml]);
  const safeSvg = useMemo(() => (rawSvg ? sanitizeNotebookSvg(rawSvg) : ""), [rawSvg]);

  if (output.kind === "stream") {
    if (!output.text) return null;
    return (
      <>
        {output.omittedLines ? (
          <p className="nb-output-note">
            {t("notebook.output-lines-hidden", { n: output.omittedLines.toLocaleString() })}
          </p>
        ) : null}
        <pre className="nb-stream" data-stream={output.name} data-part="output">
          {output.text}
        </pre>
      </>
    );
  }

  if (output.kind === "error") {
    return (
      <pre className="nb-error-out" data-part="output">
        {/* La trace se termine déjà par « ename: evalue » : ne pas la doubler. */}
        {output.traceback ? (
          output.traceback
        ) : (
          <span className="nb-error-name">
            {output.ename}: {output.evalue}
          </span>
        )}
      </pre>
    );
  }

  const hasFigure = Boolean(safeSvg || output.imagePng || output.imageJpeg);
  const figure: LightboxFigure | null = safeSvg
    ? { cellIndex, format: "svg", payload: output.imageSvg ?? safeSvg, safeSvg }
    : output.imagePng
      ? { cellIndex, format: "png", payload: output.imagePng }
      : output.imageJpeg
        ? { cellIndex, format: "jpeg", payload: output.imageJpeg }
        : null;
  const figKey = figure ? `${cellIndex}:${figure.format}:${figure.payload.slice(0, 32)}` : "";
  const isSaved = figKey ? savedKeySet.has(figKey) : false;

  const citeFigure = () => {
    const label = `${notebookName} · Out[${cellIndex}]`;
    window.dispatchEvent(
      new CustomEvent("kernel-add-to-chat", {
        detail: { text: `${t("notebook.figure-cite", { label })}\n` },
      }),
    );
  };

  return (
    <>
      {output.omitted?.map((om) => (
        <p key={om.mime} className="nb-output-note">
          {t("notebook.output-format-hidden", {
            mime: om.mime,
            size: formatBytes(om.bytes, getResolvedLanguage()),
          })}
        </p>
      ))}
      {safeHtml ? (
        <div
          className="nb-html-out"
          data-part="output"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : null}

      {output.textMarkdown ? (
        <div className="nb-prose" data-part="output">
          <MdBody
            text={output.textMarkdown}
            streaming={false}
            components={MD_COMPONENTS}
            remarkPlugins={mdRemark}
            rehypePlugins={mdRehype}
          />
        </div>
      ) : null}

      {output.textLatex ? (
        <div className="nb-prose" data-part="output">
          <MdBody
            text={normalizeMathLatex(output.textLatex)}
            streaming={false}
            components={MD_COMPONENTS}
            remarkPlugins={mdRemark}
            rehypePlugins={mdRehype}
          />
        </div>
      ) : null}

      {hasFigure && figure ? (
        <figure className="nb-figure">
          <div className="nb-figure-bar">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenLightbox(figure)}
              title={t("notebook.expand-fig")}
            >
              <Maximize2Icon size={12} />
              <span>{t("notebook.expand-fig")}</span>
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onSaveFigure(figure, figKey)}
              title={t("notebook.save-fig")}
            >
              {isSaved ? <CheckIcon size={12} /> : <DownloadIcon size={12} />}
              <span>{isSaved ? t("notebook.saved-fig") : t("notebook.save-fig")}</span>
            </Button>
            <Button variant="ghost" size="xs" onClick={citeFigure} title={t("notebook.cite")}>
              <MessageSquarePlusIcon size={12} />
              <span>{t("notebook.cite")}</span>
            </Button>
          </div>

          <RowButton
            className="nb-figure-stage"
            onClick={() => onOpenLightbox(figure)}
            aria-label={t("notebook.expand-fig")}
          >
            {figure.format === "svg" && figure.safeSvg ? (
              <div dangerouslySetInnerHTML={{ __html: figure.safeSvg }} />
            ) : (
              <img
                src={`data:image/${figure.format};base64,${figure.payload}`}
                alt={t("notebook.figure-alt", { n: cellIndex })}
              />
            )}
          </RowButton>

          <figcaption className="nb-figure-caption">
            <span>Out[{output.executionCount ?? cellIndex}]</span>
            <span>{figure.format.toUpperCase()}</span>
          </figcaption>
        </figure>
      ) : null}

      {!safeHtml && !output.textMarkdown && !output.textLatex && !hasFigure && output.textPlain ? (
        <pre className="nb-plain-out" data-part="output">
          {output.textPlain}
        </pre>
      ) : null}
    </>
  );
});

export default function NotebookTab({
  tabId,
  url,
  title,
  path,
  projectRoot,
  visible,
  galleryDir,
  paneControls,
}: NotebookTabProps) {
  const mdPlugins = useMdPlugins();
  const [mode, setMode] = useState<NotebookMode>(() => initialModeFromUrl(url));
  const [snapshot, setSnapshot] = useState<NotebookSnapshot | null>(null);
  const [kernels, setKernels] = useState<DiscoveredKernel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const [foldedIds, setFoldedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState("");
  const [completions, setCompletions] = useState<CompletionState | null>(null);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  const [kernelMenuOpen, setKernelMenuOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);

  const [diffEntries, setDiffEntries] = useState<CellDiffEntry[] | null>(null);
  const [diffUntracked, setDiffUntracked] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);

  const [lightbox, setLightbox] = useState<LightboxFigure | null>(null);
  const [savedFigures, setSavedFigures] = useState<ReadonlySet<string>>(() => new Set());
  const [picked, setPicked] = useState<PickedSelection | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const snapshotRef = useRef<NotebookSnapshot | null>(null);
  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  // Synchronise l'url si un lien du chat demande explicitement diff=1.
  useEffect(() => {
    if (initialModeFromUrl(url) === "diff") {
      setMode("diff");
    }
  }, [url]);

  // Ouverture initiale du cahier et découverte des noyaux ZMQ / Python.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    notebookCommand<{ snapshot: NotebookSnapshot; kernels: DiscoveredKernel[] }>("open", {
      path,
      projectRoot,
    })
      .then((res) => {
        if (cancelled) return;
        setSnapshot(res.snapshot);
        setKernels(res.kernels ?? []);
        if (res.snapshot.cells.length > 0) {
          setFocusedCellId((prev) =>
            prev && res.snapshot.cells.some((c) => c.id === prev)
              ? prev
              : res.snapshot.cells[0].id,
          );
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, projectRoot]);

  // Abonnement temps réel aux événements poussés par le moteur ZeroMQ / MCP.
  useEffect(() => {
    const onPush = (ev: Event) => {
      const raw = (ev as CustomEvent).detail;
      const payload = (raw?.data ?? raw) as NotebookPushEvent | undefined;
      if (!payload || typeof payload.event !== "string") return;
      const currentPath = snapshotRef.current?.path;
      if (payload.path !== path && (!currentPath || payload.path !== currentPath)) return;

      if (payload.event === "runFailed") {
        void showError(payload.message);
        return;
      }
      if (payload.event === "snapshotReplaced") {
        void showInfo(t("notebook.reloaded-from-disk"));
      }
      setSnapshot((prev) => (prev ? applyNotebookEvent(prev, payload) : prev));
    };
    window.addEventListener("notebook-event", onPush);
    return () => window.removeEventListener("notebook-event", onPush);
  }, [path]);

  // Synchronisation de l'indicateur « non enregistré » avec la garde globale d'Atelier.
  useEffect(() => {
    setDocumentUnsaved(
      { tabId, title, path, url },
      Boolean(snapshot?.unsaved) || editingCellId !== null,
    );
  }, [tabId, title, path, url, snapshot?.unsaved, editingCellId]);

  // Publication du contexte vivant (cellule focalisée + taille du cahier) vers AtelierPane.
  const focusedIndex = useMemo(() => {
    if (!snapshot || !snapshot.cells.length) return 1;
    const found = snapshot.cells.find((c) => c.id === focusedCellId);
    return found ? found.index : snapshot.cells[0].index;
  }, [snapshot, focusedCellId]);

  useEffect(() => {
    if (!snapshot) return;
    window.dispatchEvent(
      new CustomEvent(NOTEBOOK_DOC_LIVE_CONTEXT_EVENT, {
        detail: {
          tabId,
          context: {
            kind: "notebook",
            path: snapshot.path,
            name: title,
            cell: focusedIndex,
            cellCount: snapshot.cells.length,
          },
        },
      }),
    );
  }, [tabId, title, snapshot?.path, snapshot?.cells.length, focusedIndex]);

  // Chargement du diff Git cellule par cellule en mode Diff.
  useEffect(() => {
    if (mode !== "diff") return;
    let cancelled = false;
    setDiffLoading(true);
    notebookCommand<{ entries: CellDiffEntry[]; untracked: boolean }>("gitDiff", {
      path,
      projectRoot,
    })
      .then((res) => {
        if (cancelled) return;
        setDiffEntries(res.entries ?? []);
        setDiffUntracked(Boolean(res.untracked));
      })
      .catch((err: Error) => {
        if (!cancelled) void showError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, path, projectRoot, snapshot?.revision]);

  // La première cellule visible reste à sa place quand les sorties changent
  // de taille (WebKit n'ancre pas le défilement : la vue sautait sur Mac).
  const sheetReady = Boolean(snapshot) && !loading && mode !== "diff";
  useEffect(() => {
    const scroller = scrollerRef.current;
    const sheet = scroller?.querySelector<HTMLElement>(".nb-sheet");
    if (!scroller || !sheet || !sheetReady) return;
    return attachCellScrollAnchor(scroller, sheet, ".nb-cell[data-cell-id]");
  }, [sheetReady]);

  // Sélection de texte pour « Ajouter au chat » et « Question rapide ».
  // Écoutée sur tout le document : un geste qui finit hors de la cellule
  // (bord de la fenêtre, gouttière) ou une sélection au clavier comptent aussi.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    let timer = 0;
    const pick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || !text || sel.rangeCount === 0) {
          setPicked(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const start =
          range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const cellEl = start?.closest<HTMLElement>(".nb-cell[data-cell-index]");
        const partEl = start?.closest<HTMLElement>("[data-part]");
        if (!start || start.closest("textarea") || !cellEl || !partEl || !root.contains(cellEl)) {
          setPicked(null);
          return;
        }
        const rects = Array.from(range.getClientRects()).filter((r) => r.width || r.height);
        const end = rects[rects.length - 1] ?? range.getBoundingClientRect();
        const part: "code" | "output" = partEl.dataset.part === "code" ? "code" : "output";
        // Colonne de la cellule en largeur, zone de défilement en hauteur.
        const view = root.getBoundingClientRect();
        const column = (cellEl.querySelector<HTMLElement>(".nb-cell-body") ?? cellEl).getBoundingClientRect();
        setPicked({
          box: { left: column.left, right: column.right, width: column.width, top: view.top, bottom: view.bottom, height: view.height },
          caret: { left: end.right, top: end.top, bottom: end.bottom },
          text,
          cellIndex: Number(cellEl.dataset.cellIndex) || 1,
          part,
          lines: selectedLines(partEl, range),
        });
      }, 0);
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.shiftKey || ev.key === "Shift") pick();
    };
    document.addEventListener("mouseup", pick);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseup", pick);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Fermeture de la table lumineuse par Échap.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const commitActiveEdit = useCallback(async (): Promise<NotebookSnapshot | null> => {
    if (!editingCellId) return snapshotRef.current;
    const cellId = editingCellId;
    const source = draftSource;
    setEditingCellId(null);
    setCompletions(null);
    try {
      const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("updateCell", {
        path,
        projectRoot,
        cellId,
        source,
      });
      setSnapshot(res.snapshot);
      return res.snapshot;
    } catch (err) {
      void showError((err as Error).message);
      return snapshotRef.current;
    }
  }, [editingCellId, draftSource, path, projectRoot]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await commitActiveEdit();
      const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("save", {
        path,
        projectRoot,
      });
      setSnapshot(res.snapshot);
      // Fichier modifié ailleurs : rien n'est écrit, le bandeau propose le choix.
      if (res.snapshot.diskChanged) void showError(t("notebook.save-conflict"));
      else void showSuccess(t("notebook.saved"));
    } catch (err) {
      void showError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [commitActiveEdit, path, projectRoot]);

  /** Commandes sans argument qui renvoient l'état complet (bandeaux). */
  const runSnapshotOp = useCallback(
    async (op: "reload" | "restoreRecovery" | "discardRecovery" | "save", extra?: Record<string, unknown>) => {
      try {
        const res = await notebookCommand<{ snapshot: NotebookSnapshot }>(op, {
          path,
          projectRoot,
          ...extra,
        });
        setSnapshot(res.snapshot);
        if (op === "save") void showSuccess(t("notebook.saved"));
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [path, projectRoot],
  );

  const handleSendInput = useCallback(
    async (value: string) => {
      try {
        await notebookCommand("sendInput", { path, projectRoot, value });
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [path, projectRoot],
  );

  // Raccourci clavier ⌘S / Ctrl+S lorsque l'onglet est visible.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, handleSave]);

  const startEditing = useCallback((cell: UiCell) => {
    setFocusedCellId(cell.id);
    setEditingCellId(cell.id);
    setDraftSource(cell.source);
    setCompletions(null);
  }, []);

  const handleRunCell = useCallback(
    async (cell: UiCell, overrideSource?: string) => {
      setFocusedCellId(cell.id);
      if (editingCellId === cell.id) {
        setEditingCellId(null);
        setCompletions(null);
      }
      try {
        // Réponse immédiate ({ started }) : la suite arrive par les événements.
        await notebookCommand<{ started: boolean }>("runCell", {
          path,
          projectRoot,
          cellId: cell.id,
          ...(overrideSource !== undefined ? { source: overrideSource } : {}),
        });
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [editingCellId, path, projectRoot],
  );

  const handleRunAll = useCallback(async () => {
    try {
      await commitActiveEdit();
      await notebookCommand<{ started: boolean }>("runAll", { path, projectRoot });
    } catch (err) {
      void showError((err as Error).message);
    }
  }, [commitActiveEdit, path, projectRoot]);

  const handleInterrupt = useCallback(() => {
    void notebookInterrupt(path, projectRoot).catch((err: Error) => void showError(err.message));
  }, [path, projectRoot]);

  const handleRestart = useCallback(
    async (kernelId?: string) => {
      try {
        await notebookCommand<{ started: boolean }>("restart", {
          path,
          projectRoot,
          ...(kernelId ? { kernelId } : {}),
        });
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [path, projectRoot],
  );

  const handleStopKernel = useCallback(async () => {
    try {
      const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("stopKernel", {
        path,
        projectRoot,
      });
      setSnapshot(res.snapshot);
    } catch (err) {
      void showError((err as Error).message);
    }
  }, [path, projectRoot]);

  const handleInsertCell = useCallback(
    async (cellType: CellKind, afterCellId?: string | null) => {
      try {
        await commitActiveEdit();
        const res = await notebookCommand<{ cellId: string; snapshot: NotebookSnapshot }>(
          "insertCell",
          {
            path,
            projectRoot,
            afterCellId: afterCellId ?? null,
            cellType,
            source: "",
          },
        );
        setSnapshot(res.snapshot);
        setFocusedCellId(res.cellId);
        setEditingCellId(res.cellId);
        setDraftSource("");
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [commitActiveEdit, path, projectRoot],
  );

  const handleDeleteCell = useCallback(
    async (cellId: string) => {
      if (editingCellId === cellId) {
        setEditingCellId(null);
        setCompletions(null);
      }
      try {
        const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("deleteCell", {
          path,
          projectRoot,
          cellId,
        });
        setSnapshot(res.snapshot);
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [editingCellId, path, projectRoot],
  );

  const handleAcceptProposal = useCallback(
    async (proposalId: string, runAfter: boolean) => {
      setProposalBusy(true);
      try {
        const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("acceptProposal", {
          path,
          projectRoot,
          proposalId,
          runAfter,
        });
        setSnapshot(res.snapshot);
      } catch (err) {
        void showError((err as Error).message);
      } finally {
        setProposalBusy(false);
      }
    },
    [path, projectRoot],
  );

  const handleDiscardProposal = useCallback(
    async (proposalId: string) => {
      setProposalBusy(true);
      try {
        const res = await notebookCommand<{ snapshot: NotebookSnapshot }>("discardProposal", {
          path,
          projectRoot,
          proposalId,
        });
        setSnapshot(res.snapshot);
      } catch (err) {
        void showError((err as Error).message);
      } finally {
        setProposalBusy(false);
      }
    },
    [path, projectRoot],
  );

  const handleSaveFigure = useCallback(
    async (fig: LightboxFigure, figKey: string) => {
      try {
        const res = await notebookCommand<{ savedRel: string }>("saveFigure", {
          path,
          projectRoot,
          galleryDir,
          cellIndex: fig.cellIndex,
          format: fig.format,
          payload: fig.payload,
        });
        setSavedFigures((prev) => new Set(prev).add(figKey));
        void showSuccess(`${t("notebook.saved-fig")} · ${res.savedRel}`);
      } catch (err) {
        void showError((err as Error).message);
      }
    },
    [path, projectRoot, galleryDir],
  );

  const applyCompletion = useCallback(
    (match: string, comp: CompletionState) => {
      const next =
        draftSource.slice(0, comp.cursorStart) + match + draftSource.slice(comp.cursorEnd);
      setDraftSource(next);
      setCompletions(null);
      const nextPos = comp.cursorStart + match.length;
      window.requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(nextPos, nextPos);
        }
      });
    },
    [draftSource],
  );

  const handleEditorKeyDown = useCallback(
    (ev: ReactKeyboardEvent<HTMLTextAreaElement>, cell: UiCell) => {
      if (ev.key === "Enter" && ev.shiftKey) {
        ev.preventDefault();
        if (cell.cellType === "code") {
          void handleRunCell(cell, draftSource);
        } else {
          void commitActiveEdit();
        }
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        void commitActiveEdit();
        return;
      }
      if (ev.key === "Tab" && !ev.shiftKey && cell.cellType === "code") {
        ev.preventDefault();
        const cursorPos = ev.currentTarget.selectionStart ?? draftSource.length;
        notebookCommand<{ matches: string[]; cursorStart: number; cursorEnd: number }>("complete", {
          path,
          projectRoot,
          code: draftSource,
          cursorPos,
        })
          .then((res) => {
            const matches = res.matches ?? [];
            if (matches.length === 1) {
              applyCompletion(matches[0], {
                cellId: cell.id,
                matches,
                cursorStart: res.cursorStart,
                cursorEnd: res.cursorEnd,
              });
            } else if (matches.length > 1) {
              setCompletions({
                cellId: cell.id,
                matches: matches.slice(0, 12),
                cursorStart: res.cursorStart,
                cursorEnd: res.cursorEnd,
              });
            } else {
              // Indentation 4 espaces lorsque le noyau est arrêté ou sans complétion.
              const next =
                draftSource.slice(0, cursorPos) + "    " + draftSource.slice(cursorPos);
              setDraftSource(next);
              window.requestAnimationFrame(() => {
                editorRef.current?.setSelectionRange(cursorPos + 4, cursorPos + 4);
              });
            }
          })
          .catch(() => {});
      }
    },
    [applyCompletion, commitActiveEdit, draftSource, handleRunCell, path, projectRoot],
  );

  const toggleFold = useCallback((cellId: string) => {
    setFoldedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  }, []);

  const scrollToCell = useCallback((cellId: string) => {
    setFocusedCellId(cellId);
    const cells = scrollerRef.current?.querySelectorAll<HTMLElement>(".nb-cell[data-cell-id]") ?? [];
    for (const el of cells) {
      if (el.dataset.cellId === cellId) {
        el.scrollIntoView?.({ behavior: "smooth", block: "start" });
        break;
      }
    }
  }, []);

  const copyCellSource = useCallback((cell: UiCell) => {
    void navigator.clipboard?.writeText(cell.source);
    setCopiedCellId(cell.id);
    window.setTimeout(() => {
      setCopiedCellId((prev) => (prev === cell.id ? null : prev));
    }, 1200);
  }, []);

  // Nom donné au chat : chemin dans le projet (comme les autres éditeurs).
  const chatName = useMemo(() => {
    const root = projectRoot?.replace(/\/+$/, "");
    return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : title;
  }, [path, projectRoot, title]);

  const citeCell = useCallback(
    (cell: UiCell) => {
      const citation = formatNotebookSelectionCitation(chatName, cell.index, "code", cell.source);
      window.dispatchEvent(new CustomEvent("kernel-add-to-chat", { detail: { text: citation } }));
    },
    [chatName],
  );

  const status = snapshot?.status ?? { state: "off" as const };
  const isBusy = status.state === "busy" || status.state === "starting";
  const rssLabel = formatBytes(status.rssBytes, getResolvedLanguage());
  const kernelLabel =
    status.state === "starting"
      ? t("notebook.kernel-starting")
      : status.displayName || snapshot?.preferredKernelspec || t("notebook.kernel-off");

  const modeOptions = useMemo(
    () => [
      { value: "live", label: t("notebook.mode-live") },
      { value: "read", label: t("notebook.mode-read") },
      { value: "diff", label: t("notebook.mode-diff") },
    ],
    [],
  );

  const kernelMenuItems = useMemo(() => {
    const items = kernels.map((k) => ({
      key: k.id,
      checked: status.kernelId === k.id,
      label: (
        <span className="nb-kernel-menu-row">
          <span className="nb-kernel-menu-name">{k.displayName}</span>
          <span className="nb-kernel-menu-sub">
            {k.source} · {k.backend === "zmq_kernelspec" ? "ZeroMQ" : "Python"}
          </span>
        </span>
      ),
      onSelect: () => {
        void handleRestart(k.id);
      },
    }));
    if (status.state !== "off") {
      items.push({
        key: "__stop__",
        checked: false,
        label: (
          <span className="nb-kernel-menu-row">
            <span className="nb-kernel-menu-name">{t("notebook.kernel-off")}</span>
          </span>
        ),
        onSelect: () => {
          void handleStopKernel();
        },
      });
    }
    return items;
  }, [kernels, status.kernelId, status.state, handleRestart, handleStopKernel]);

  const proposalsByTarget = useMemo(() => {
    const map = new Map<string, CellProposal[]>();
    for (const prop of snapshot?.proposals ?? []) {
      const key = prop.targetCellId || "";
      const list = map.get(key);
      if (list) list.push(prop);
      else map.set(key, [prop]);
    }
    return map;
  }, [snapshot?.proposals]);

  const lastCellId = snapshot?.cells[snapshot.cells.length - 1]?.id ?? null;

  return (
    <div className="nb-surface" data-notebook-mode={mode}>
      <header className="nb-toolbar">
        <SegmentedControl
          label={t("notebook.mode-live")}
          options={modeOptions}
          value={mode}
          onChange={(next) => {
            if (next === "live" || next === "read" || next === "diff") {
              if (next !== "live" && editingCellId) void commitActiveEdit();
              setMode(next);
            }
          }}
        />

        <span className="nb-toolbar-sep" aria-hidden="true" />

        {mode === "live" ? (
          <>
            <div className="nb-toolbar-group">
              <IconButton
                size="s"
                label={t("notebook.run-all")}
                title={t("notebook.run-all")}
                disabled={isBusy || !snapshot?.cells.length}
                onClick={() => void handleRunAll()}
              >
                <PlayIcon size={14} />
              </IconButton>
              <IconButton
                size="s"
                label={t("notebook.interrupt")}
                title={t("notebook.interrupt")}
                disabled={!isBusy}
                onClick={handleInterrupt}
              >
                <SquareIcon size={14} />
              </IconButton>
              <IconButton
                size="s"
                label={t("notebook.restart")}
                title={t("notebook.restart")}
                disabled={status.state === "starting"}
                onClick={() => void handleRestart()}
              >
                <RotateCwIcon size={14} />
              </IconButton>
            </div>

            <span className="nb-toolbar-sep" aria-hidden="true" />

            <LazyDropdownMenu
              open={kernelMenuOpen}
              onOpenChange={(open) => {
                setKernelMenuOpen(open);
                if (open && !kernels.length) {
                  void notebookCommand<{ kernels: DiscoveredKernel[] }>("kernels", { projectRoot })
                    .then((res) => setKernels(res.kernels ?? []))
                    .catch(() => {});
                }
              }}
              label={t("notebook.kernels-header")}
              header={t("notebook.kernels-header")}
              align="start"
              items={kernelMenuItems}
              trigger={
                <Button variant="ghost" size="xs" className="nb-kernel-trigger">
                  <span className="nb-status-dot" data-state={status.state} aria-hidden="true" />
                  <span>{kernelLabel}</span>
                  {rssLabel ? <span className="nb-vars-count">· {rssLabel}</span> : null}
                  <ChevronDownIcon size={12} />
                </Button>
              }
            />

            <Button
              variant="ghost"
              size="xs"
              aria-expanded={varsOpen}
              onClick={() => setVarsOpen((o) => !o)}
            >
              <span>{t("notebook.variables")}</span>
              <span className="nb-vars-count">{snapshot?.variables.length ?? 0}</span>
            </Button>

            {snapshot?.unsaved || editingCellId !== null ? (
              <Button
                variant="secondary"
                size="xs"
                loading={saving}
                onClick={() => void handleSave()}
                title={t("notebook.save")}
              >
                <SaveIcon size={12} />
                <span>{t("notebook.unsaved")}</span>
              </Button>
            ) : null}
          </>
        ) : mode === "read" ? (
          <span className="nb-kernel-trigger">
            <span className="nb-status-dot" data-state="off" aria-hidden="true" />
            <span>{t("notebook.read-only")}</span>
          </span>
        ) : null}

        <span className="nb-toolbar-spacer" />
        {paneControls}
      </header>

      {mode === "live" && varsOpen ? (
        <section className="nb-vars-drawer" aria-label={t("notebook.variables")}>
          <div className="nb-vars-inner">
            <div className="nb-vars-meta">
              <span>
                {rssLabel
                  ? t("notebook.memory", { size: rssLabel })
                  : status.displayName ?? t("notebook.kernel-off")}
              </span>
              {status.backend ? (
                <span>
                  {status.backend === "zmq_kernelspec" ? "ZeroMQ ZMTP 3.x (5 canaux)" : "Python Atelier"}
                </span>
              ) : null}
            </div>
            {snapshot?.variables.length ? (
              <table className="nb-booktabs">
                <thead>
                  <tr>
                    <th>{t("notebook.var-name")}</th>
                    <th>{t("notebook.var-type")}</th>
                    <th>{t("notebook.var-shape")}</th>
                    <th>{t("notebook.var-size")}</th>
                    <th>{t("notebook.var-preview")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.variables.map((v) => (
                    <tr key={v.name}>
                      <td>{v.name}</td>
                      <td>{v.type}</td>
                      <td>{v.shape || "—"}</td>
                      <td>{formatBytes(v.sizeBytes, getResolvedLanguage()) || "—"}</td>
                      <td>{v.preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="nb-vars-empty">{t("notebook.variables-empty")}</p>
            )}
          </div>
        </section>
      ) : null}

      <div
        className="nb-scroll"
        ref={scrollerRef}
        onScroll={() => {
          if (picked) setPicked(null);
        }}
      >
        {loading ? (
          <div className="nb-sheet">
            <Spinner size={16} />
          </div>
        ) : loadError ? (
          <div className="nb-sheet">
            <InlineNotice tone="error">{loadError}</InlineNotice>
          </div>
        ) : mode === "diff" ? (
          <div className="nb-sheet">
            <div className="nb-diff-header">
              <h2>{t("notebook.diff-title")}</h2>
              <span>{title}</span>
            </div>
            {diffLoading ? (
              <Spinner size={16} />
            ) : diffUntracked ? (
              <EmptyState title={t("notebook.diff-untracked")} />
            ) : !diffEntries || diffEntries.length === 0 ? (
              <EmptyState title={t("notebook.diff-clean")} />
            ) : (
              diffEntries.map((entry) => (
                <article key={entry.cellId} className="nb-diff-card">
                  <div className="nb-diff-card-meta">
                    <span>
                      [{entry.index ?? entry.baseIndex ?? "—"}]{" "}
                      {entry.title || entry.cellType.toUpperCase()}
                    </span>
                    <span>
                      +{entry.addedLines} / −{entry.removedLines}
                      {entry.outputsChanged ? ` · ${t("notebook.outputs-changed")}` : ""}
                    </span>
                  </div>
                  <div className="nb-diff-well">
                    {entry.lines.map((line, idx) => (
                      <div key={idx} className="nb-diff-line" data-kind={line.kind}>
                        <span className="nb-diff-sign" aria-hidden="true">
                          {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                        </span>
                        <span>{line.text || " "}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        ) : snapshot ? (
          <>
            {snapshot.cells.length > 1 ? (
              <nav className="nb-outline-rail" aria-label={title}>
                {snapshot.cells.map((cell) => (
                  <RowButton
                    key={cell.id}
                    className="nb-outline-btn"
                    data-current={focusedCellId === cell.id ? "true" : "false"}
                    title={`[${cell.index}] ${cell.title || cell.cellType}`}
                    aria-label={t("notebook.cell", { n: cell.index })}
                    onClick={() => scrollToCell(cell.id)}
                  >
                    <span className="nb-outline-tick" data-kind={cell.cellType} />
                  </RowButton>
                ))}
              </nav>
            ) : null}

            <div className="nb-sheet">
              {status.state === "error" && status.message ? (
                <InlineNotice tone="error">{status.message}</InlineNotice>
              ) : null}

              <NotebookBanners
                snapshot={snapshot}
                onReload={() => void runSnapshotOp("reload")}
                onKeepMine={() => void runSnapshotOp("save", { force: true })}
                onRestore={() => void runSnapshotOp("restoreRecovery")}
                onDiscardRecovery={() => void runSnapshotOp("discardRecovery")}
                onRestart={() => void handleRestart()}
              />

              {(proposalsByTarget.get("") ?? []).map((prop) => (
                <ProposalDiffCard
                  key={prop.id}
                  proposal={prop}
                  busy={proposalBusy}
                  onAccept={(id, run) => void handleAcceptProposal(id, run)}
                  onDiscard={(id) => void handleDiscardProposal(id)}
                />
              ))}

              {snapshot.cells.map((cell) => {
                const isFocused = focusedCellId === cell.id;
                const isFolded = foldedIds.has(cell.id);
                const isEditing = mode === "live" && editingCellId === cell.id;
                const isRunningCell = status.busyCellId === cell.id;
                const cellProposals = proposalsByTarget.get(cell.id) ?? [];
                const editProposals = cellProposals.filter((p) => p.kind !== "insertAfter");
                const insertProposals = cellProposals.filter((p) => p.kind === "insertAfter");

                if (cell.cellType === "markdown") {
                  return (
                    <div key={cell.id}>
                      <article
                        className="nb-cell"
                        data-cell-id={cell.id}
                        data-cell-index={cell.index}
                        data-focused={isFocused ? "true" : "false"}
                        onClick={() => setFocusedCellId(cell.id)}
                      >
                        <div className="nb-cell-gutter" aria-hidden="true" />
                        <div className="nb-cell-body">
                          {mode === "live" ? (
                            <div className="nb-prose-head">
                              <div className="nb-cell-actions">
                                {isEditing ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => void commitActiveEdit()}
                                  >
                                    <CheckIcon size={12} />
                                    <span>{t("notebook.done-edit")}</span>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => startEditing(cell)}
                                  >
                                    <PencilIcon size={12} />
                                    <span>{t("notebook.edit-cell")}</span>
                                  </Button>
                                )}
                                <Button variant="ghost" size="xs" onClick={() => citeCell(cell)}>
                                  <span>{t("notebook.cite")}</span>
                                </Button>
                                <IconButton
                                  size="s"
                                  label={t("notebook.delete-cell")}
                                  title={t("notebook.delete-cell")}
                                  onClick={() => void handleDeleteCell(cell.id)}
                                >
                                  <Trash2Icon size={12} />
                                </IconButton>
                              </div>
                            </div>
                          ) : null}

                          {editProposals.map((prop) => (
                            <ProposalDiffCard
                              key={prop.id}
                              proposal={prop}
                              busy={proposalBusy}
                              onAccept={(id, run) => void handleAcceptProposal(id, run)}
                              onDiscard={(id) => void handleDiscardProposal(id)}
                            />
                          ))}

                          {isEditing ? (
                            <textarea
                              ref={editorRef}
                              className="nb-editor-area"
                              value={draftSource}
                              rows={Math.max(4, draftSource.split("\n").length + 1)}
                              aria-label={t("notebook.cell-markdown", { n: cell.index })}
                              onChange={(e) => setDraftSource(e.target.value)}
                              onKeyDown={(e) => handleEditorKeyDown(e, cell)}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="nb-prose"
                              onDoubleClick={() => {
                                if (mode === "live") startEditing(cell);
                              }}
                            >
                              <MdBody
                                text={cell.source || t("notebook.empty-prose")}
                                streaming={false}
                                components={MD_COMPONENTS}
                                remarkPlugins={mdPlugins.remark}
                                rehypePlugins={mdPlugins.rehype}
                              />
                            </div>
                          )}
                        </div>
                      </article>

                      {insertProposals.map((prop) => (
                        <ProposalDiffCard
                          key={prop.id}
                          proposal={prop}
                          busy={proposalBusy}
                          onAccept={(id, run) => void handleAcceptProposal(id, run)}
                          onDiscard={(id) => void handleDiscardProposal(id)}
                        />
                      ))}
                    </div>
                  );
                }

                // Cellule de code ou brute : puits tonal sans bordure latérale orange.
                const highlighted = highlightCode(cell.source, snapshot.language || "python");
                return (
                  <div key={cell.id}>
                    <article
                      className="nb-cell"
                      data-cell-id={cell.id}
                      data-cell-index={cell.index}
                      data-focused={isFocused ? "true" : "false"}
                      data-folded={isFolded ? "true" : "false"}
                      onClick={() => setFocusedCellId(cell.id)}
                    >
                      <div className="nb-cell-gutter">
                        {isRunningCell ? (
                          <Spinner size={12} />
                        ) : (
                          <span className="nb-cell-num">{cell.executionCount ?? ""}</span>
                        )}
                      </div>

                      <div className="nb-cell-body">
                        <div className="nb-cell-head">
                          <RowButton
                            className="nb-cell-fold-btn"
                            aria-expanded={!isFolded}
                            onClick={() => toggleFold(cell.id)}
                          >
                            <ChevronDownIcon size={12} className="nb-chevron" />
                            {/* Un seul numéro par cellule (celui d'exécution, en
                                gouttière) : le titre ne s'affiche que s'il existe,
                                ou repliée, pour savoir ce qui est caché. */}
                            {cell.title || isFolded ? (
                              <span className="nb-cell-fold-title">
                                {cell.title || firstLine(cell.source)}
                              </span>
                            ) : null}
                          </RowButton>

                          <div className="nb-cell-actions">
                            {mode === "live" && cell.cellType === "code" ? (
                              <IconButton
                                size="s"
                                label={t("notebook.run-cell")}
                                title={`${t("notebook.run-cell")} (⇧↵)`}
                                disabled={isBusy}
                                onClick={() =>
                                  void handleRunCell(
                                    cell,
                                    isEditing ? draftSource : undefined,
                                  )
                                }
                              >
                                <PlayIcon size={12} />
                              </IconButton>
                            ) : null}

                            {mode === "live" ? (
                              isEditing ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => void commitActiveEdit()}
                                >
                                  <CheckIcon size={12} />
                                  <span>{t("notebook.done-edit")}</span>
                                </Button>
                              ) : (
                                <IconButton
                                  size="s"
                                  label={t("notebook.edit-cell")}
                                  title={t("notebook.edit-cell")}
                                  onClick={() => startEditing(cell)}
                                >
                                  <PencilIcon size={12} />
                                </IconButton>
                              )
                            ) : null}

                            <IconButton
                              size="s"
                              label={t("notebook.copy")}
                              title={
                                copiedCellId === cell.id
                                  ? t("notebook.copied")
                                  : t("notebook.copy")
                              }
                              onClick={() => copyCellSource(cell)}
                            >
                              {copiedCellId === cell.id ? (
                                <CheckIcon size={12} />
                              ) : (
                                <CopyIcon size={12} />
                              )}
                            </IconButton>

                            <Button variant="ghost" size="xs" onClick={() => citeCell(cell)}>
                              <span>{t("notebook.cite")}</span>
                            </Button>

                            {mode === "live" ? (
                              <IconButton
                                size="s"
                                label={t("notebook.delete-cell")}
                                title={t("notebook.delete-cell")}
                                onClick={() => void handleDeleteCell(cell.id)}
                              >
                                <Trash2Icon size={12} />
                              </IconButton>
                            ) : null}
                          </div>
                        </div>

                        {editProposals.map((prop) => (
                          <ProposalDiffCard
                            key={prop.id}
                            proposal={prop}
                            busy={proposalBusy}
                            onAccept={(id, run) => void handleAcceptProposal(id, run)}
                            onDiscard={(id) => void handleDiscardProposal(id)}
                          />
                        ))}

                        {!isFolded ? (
                          <>
                            {editProposals.length > 0 ? null : isEditing ? (
                              <>
                                <textarea
                                  ref={editorRef}
                                  className="nb-editor-area"
                                  value={draftSource}
                                  rows={Math.max(3, draftSource.split("\n").length + 1)}
                                  aria-label={`Code cellule ${cell.index}`}
                                  spellCheck={false}
                                  onChange={(e) => {
                                    setDraftSource(e.target.value);
                                    if (completions) setCompletions(null);
                                  }}
                                  onKeyDown={(e) => handleEditorKeyDown(e, cell)}
                                  autoFocus
                                />
                                {completions && completions.cellId === cell.id ? (
                                  <div className="nb-completions" role="listbox">
                                    {completions.matches.map((m) => (
                                      <RowButton
                                        key={m}
                                        className="nb-completion-chip"
                                        onClick={() => applyCompletion(m, completions)}
                                      >
                                        {m}
                                      </RowButton>
                                    ))}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <pre
                                className="nb-well"
                                data-part="code"
                                onDoubleClick={() => {
                                  if (mode === "live") startEditing(cell);
                                }}
                              >
                                <code
                                  className="hljs"
                                  dangerouslySetInnerHTML={{ __html: highlighted }}
                                />
                              </pre>
                            )}

                            {cell.outputs.length > 0 || isRunningCell ? (
                              <HeldOutputs running={isRunningCell}>
                                {cell.outputs.map((out, oi) => (
                                  <OutputBlock
                                    key={oi}
                                    output={out}
                                    cellIndex={cell.index}
                                    notebookName={title}
                                    mdRemark={mdPlugins.remark}
                                    mdRehype={mdPlugins.rehype}
                                    onOpenLightbox={setLightbox}
                                    onSaveFigure={(fig, key) => void handleSaveFigure(fig, key)}
                                    savedKeySet={savedFigures}
                                  />
                                ))}
                              </HeldOutputs>
                            ) : null}
                          </>
                        ) : null}

                        {snapshot.pendingInput?.cellId === cell.id ? (
                          <InputPrompt
                            key={`${cell.id}:${snapshot.pendingInput.prompt}`}
                            request={snapshot.pendingInput}
                            onSubmit={(value) => void handleSendInput(value)}
                          />
                        ) : null}
                      </div>
                    </article>

                    {insertProposals.map((prop) => (
                      <ProposalDiffCard
                        key={prop.id}
                        proposal={prop}
                        busy={proposalBusy}
                        onAccept={(id, run) => void handleAcceptProposal(id, run)}
                        onDiscard={(id) => void handleDiscardProposal(id)}
                      />
                    ))}
                  </div>
                );
              })}

              {mode === "live" ? (
                <div className="nb-add-bar">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void handleInsertCell("code", focusedCellId ?? lastCellId)}
                  >
                    <PlusIcon size={12} />
                    <span>{t("notebook.add-code")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void handleInsertCell("markdown", focusedCellId ?? lastCellId)}
                  >
                    <PlusIcon size={12} />
                    <span>{t("notebook.add-prose")}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {picked ? (
          <NotebookSelectionBar
            notebookName={chatName}
            picked={picked}
            onDone={() => setPicked(null)}
          />
        ) : null}
      </div>

      {lightbox ? (
        <div
          className="nb-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Figure cellule ${lightbox.cellIndex}`}
          onClick={() => setLightbox(null)}
        >
          <div className="nb-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="nb-lightbox-head">
              <span>
                {title} · Out[{lightbox.cellIndex}]
              </span>
              <div className="nb-toolbar-group">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    void handleSaveFigure(
                      lightbox,
                      `${lightbox.cellIndex}:${lightbox.format}:${lightbox.payload.slice(0, 32)}`,
                    )
                  }
                >
                  <DownloadIcon size={12} />
                  <span>{t("notebook.save-fig")}</span>
                </Button>
                <IconButton
                  size="s"
                  label={t("notebook.close-viewer")}
                  title={t("notebook.close-viewer")}
                  onClick={() => setLightbox(null)}
                >
                  <XIcon size={14} />
                </IconButton>
              </div>
            </div>
            <div className="nb-lightbox-body">
              {lightbox.format === "svg" && lightbox.safeSvg ? (
                <div dangerouslySetInnerHTML={{ __html: lightbox.safeSvg }} />
              ) : (
                <img
                  src={`data:image/${lightbox.format};base64,${lightbox.payload}`}
                  alt={`Figure cellule ${lightbox.cellIndex}`}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
