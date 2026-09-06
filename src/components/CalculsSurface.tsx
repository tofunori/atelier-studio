// Surface Calculs (plan 2026-09-06) : les calculs longs de Thierry, tous hôtes
// confondus (Mac local, NAS docker/systemd/atelier-run, Slurm Narval), dans une
// seule liste. L'ancienne surface Narval est conservée telle quelle et rendue
// ici comme « vue Slurm » (bascule par bouton) — aucune réécriture.
//
// Contrat WS gelé (docs/superpowers/plans/2026-09-06-surface-calculs.md) :
//   → computeSnapshot { requestId, hosts?, days? }  ← computeSnapshot { data:{ observedAt, runs, errors } }
//   → computeReadLog  { requestId, runId, tailLines } ← computeLog { runId, data:{ lines, truncated } } | error
// Les réponses arrivent par le pont `compute-message` d'App.tsx.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3Icon, RefreshCwIcon, ServerIcon, SquareTerminalIcon } from "lucide-react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import NarvalSurface from "./NarvalSurface";
import { Alert, AlertDescription, AlertTitle } from "./shadcn/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./shadcn/empty";
import { ScrollArea } from "./shadcn/scroll-area";
import { Skeleton } from "./shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./shadcn/tabs";
import { Button } from "./ui/Button";
import { StatusBadge, type BadgeStatus } from "./ui/StatusBadge";
import { IconButton, RowButton, SegmentedControl } from "./ui";

export type ComputeHost = "mac" | "nas" | "narval";
export type HostFilter = "all" | ComputeHost;
export type ComputeRunState = "running" | "queued" | "completed" | "failed" | "unknown";
export type ComputeRun = {
  id: string;
  source: string;
  host: ComputeHost | string;
  label: string;
  command: string;
  workDir: string;
  state: ComputeRunState | string;
  startedAt: string | number;
  endedAt?: string | number | null;
  lastActivityAt: string | number;
  progress?: { current: number; total: number; unit: string } | null;
  logPath?: string | null;
  /** Code de sortie si l’hôte le connaît (runs terminés). */
  exitCode?: number | null;
  logTail: string[];
  remoteTasks: unknown[];
  detail:
    | { kind: "local"; pid?: number | null }
    | { kind: "docker"; container: string }
    | { kind: "unit"; unit: string }
    | { kind: "slurm"; jobId: string; profile: string };
};
export type HostError = { host: string; code: string; message: string };
export type ComputeSnapshot = { observedAt: string | number; runs: ComputeRun[]; errors: HostError[] };
type LogChunk = { runId: string; lines: string[]; truncated: boolean };
type SurfaceError = { code: string; message: string };

const HOST_STORAGE_KEY = "atelier.calculs.host";
const HOSTS: HostFilter[] = ["all", "mac", "nas", "narval"];
/** Cadence de sondage (spec) : Mac local 30 s ; NAS et Slurm 60 s — donc 60 s
 *  dès que le filtre inclut un hôte distant (« Tous » compris). */
const POLL_LOCAL_MS = 30_000;
const POLL_REMOTE_MS = 60_000;
const CLOCK_MS = 10_000;
const STALE_MS = 60_000;
const SNAPSHOT_DAYS = 7;
const LOG_TAIL_LINES = 400;

/** Compteurs de rendus (rangées, conteneur de liste) — exposés pour le test
 *  « snapshot identique → aucun re-rendu » (garde-fou de performance n° 4). */
export const calculsDebug = { rowRenders: 0, listRenders: 0 };

export function pollIntervalMs(host: HostFilter) {
  return host === "mac" ? POLL_LOCAL_MS : POLL_REMOTE_MS;
}

function requestId() {
  return crypto.randomUUID();
}

function readStoredHost(): HostFilter {
  try {
    const stored = localStorage.getItem(HOST_STORAGE_KEY);
    return HOSTS.includes(stored as HostFilter) ? (stored as HostFilter) : "all";
  } catch {
    return "all";
  }
}

function storeHost(host: HostFilter) {
  try {
    localStorage.setItem(HOST_STORAGE_KEY, host);
  } catch {
    // stockage indisponible : le filtre vit en mémoire
  }
}

/** Horodatage du contrat (ISO ou epoch s/ms) → ms, ou null. */
function toMs(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? (value < 1e12 ? value * 1_000 : value) : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return t("calculs.duration-seconds", { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("calculs.duration-minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t("calculs.duration-hours", { count: hours });
  return t("calculs.duration-days", { count: Math.round(hours / 24) });
}

function runDuration(run: ComputeRun, now: number) {
  const started = toMs(run.startedAt);
  if (started == null) return "—";
  const ended = toMs(run.endedAt);
  return formatDuration((ended ?? now) - started);
}

function activityAgo(run: ComputeRun, now: number) {
  const last = toMs(run.lastActivityAt);
  return last == null ? "" : t("calculs.active-ago", { ago: formatDuration(now - last) });
}

function stateTone(state: string): BadgeStatus {
  if (state === "running") return "running";
  if (state === "completed") return "success";
  if (state === "queued") return "warning";
  if (state === "failed") return "error";
  return "neutral";
}

function stateLabel(state: string) {
  switch (state) {
    case "running": return t("calculs.state-running");
    case "queued": return t("calculs.state-queued");
    case "completed": return t("calculs.state-completed");
    case "failed": return t("calculs.state-failed");
    default: return t("calculs.state-unknown");
  }
}

function hostLabel(host: HostFilter | string) {
  switch (host) {
    case "all": return t("calculs.host-all");
    case "mac": return t("calculs.host-mac");
    case "nas": return t("calculs.host-nas");
    case "narval": return t("calculs.host-narval");
    default: return host;
  }
}

/** Commande terminal pour l'hôte filtré — même alias que la surface Narval. */
export function hostTerminalCommand(host: HostFilter): string | null {
  if (host === "nas") return "ssh nas";
  if (host === "narval") return "ssh nas -t ssh narval-vpn";
  return null;
}

/** Empreinte structurelle d'un snapshot — `observedAt` exclu, et pour les
 *  runs vivants (running/queued) `lastActivityAt` aussi : un run actif rapporte
 *  souvent une activité égale à l'instant d'observation, ce qui ferait re-rendre
 *  la liste à chaque sondage alors que rien n'a changé pour l'œil. */
function snapshotFingerprint(runs: ComputeRun[], errors: HostError[]) {
  const stable = runs.map((run) => {
    if (run.state !== "running" && run.state !== "queued") return run;
    const { lastActivityAt: _ignored, ...rest } = run;
    return rest;
  });
  return JSON.stringify([stable, errors]);
}

const STATE_RANK: Record<string, number> = { running: 0, queued: 1, completed: 2, failed: 2, unknown: 3 };

function sortRuns(runs: ComputeRun[]) {
  return runs
    .map((run, index) => ({ run, index }))
    .sort((a, b) => {
      const byState = (STATE_RANK[a.run.state] ?? 3) - (STATE_RANK[b.run.state] ?? 3);
      if (byState !== 0) return byState;
      const byActivity = (toMs(b.run.lastActivityAt) ?? 0) - (toMs(a.run.lastActivityAt) ?? 0);
      return byActivity !== 0 ? byActivity : a.index - b.index;
    })
    .map(({ run }) => run);
}

export default function CalculsSurface({ visible, onOpenTerminal, paneControls }: {
  visible: boolean;
  onOpenTerminal: (command: string) => void;
  /** Contrôles du pane (grip + fermeture) intégrés à la barre, comme Narval. */
  paneControls?: React.ReactNode;
}) {
  const [hostFilter, setHostFilter] = useState<HostFilter>(readStoredHost);
  const [snapshot, setSnapshot] = useState<ComputeSnapshot | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [error, setError] = useState<SurfaceError | null>(null);
  const [loading, setLoading] = useState(false);
  const [slurmView, setSlurmView] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const snapshotRequest = useRef<string | null>(null);
  const fingerprint = useRef<string | null>(null);
  // Instant d'observation du dernier snapshot reçu. Volontairement une ref et
  // non un état : « observé il y a N s » est recalculé par le tic d'horloge
  // (CLOCK_MS), si bien qu'une réponse identique au repos ne déclenche AUCUN
  // setState — le tic de 10 s est le seul setState périodique de la surface.
  const observedAt = useRef<number | null>(null);
  const manualLoading = useRef(false);
  const hasError = useRef(false);
  // Le parent peut passer un onOpenTerminal inline : on le stabilise pour que
  // les rangées mémoïsées ne se re-rendent pas à chaque rendu du pane.
  const onOpenTerminalRef = useRef(onOpenTerminal);
  onOpenTerminalRef.current = onOpenTerminal;
  const openTerminal = useCallback((command: string) => onOpenTerminalRef.current(command), []);
  const openSlurmView = useCallback(() => setSlurmView(true), []);

  const runs = useMemo(() => sortRuns(snapshot?.runs ?? []), [snapshot]);

  // `manual` = clic utilisateur : seul cas où l'icône tourne. Les sondages
  // périodiques restent silencieux (pas de setState au repos).
  const requestSnapshot = useCallback((manual = false) => {
    const id = requestId();
    snapshotRequest.current = id;
    if (manual) {
      manualLoading.current = true;
      setLoading(true);
    }
    const sent = wsSend({
      type: "computeSnapshot",
      requestId: id,
      hosts: hostFilter === "all" ? undefined : [hostFilter],
      days: SNAPSHOT_DAYS,
    });
    if (!sent) {
      if (manualLoading.current) {
        manualLoading.current = false;
        setLoading(false);
      }
      hasError.current = true;
      setError({ code: "offline", message: t("calculs.offline") });
    }
  }, [hostFilter]);

  useEffect(() => {
    const onMessage = (event: Event) => {
      const msg = (event as CustomEvent).detail ?? {};
      if (msg.type !== "computeSnapshot" || msg.requestId !== snapshotRequest.current) return;
      if (manualLoading.current) {
        manualLoading.current = false;
        setLoading(false);
      }
      if (msg.error) {
        hasError.current = true;
        setError({ code: String(msg.error.code ?? "error"), message: String(msg.error.message ?? "") });
        return;
      }
      const data = msg.data as ComputeSnapshot | undefined;
      if (!data || !Array.isArray(data.runs)) return;
      const errors = Array.isArray(data.errors) ? data.errors : [];
      observedAt.current = toMs(data.observedAt) ?? Date.now();
      if (hasError.current) {
        hasError.current = false;
        setError(null);
      }
      const next = snapshotFingerprint(data.runs, errors);
      // Réponse identique (cas nominal au repos) : aucun setState — le label
      // « observé il y a » se rafraîchira au prochain tic d'horloge.
      if (next === fingerprint.current) return;
      fingerprint.current = next;
      setNow(Date.now());
      setSnapshot({ observedAt: data.observedAt, runs: data.runs, errors });
    };
    window.addEventListener("compute-message", onMessage);
    return () => window.removeEventListener("compute-message", onMessage);
  }, []);

  // Sondage uniquement quand la surface est visible (même mécanisme que Narval) ;
  // cadence selon l'hôte filtré (30 s Mac, 60 s dès qu'un hôte distant est inclus).
  useEffect(() => {
    if (!visible || slurmView) return;
    requestSnapshot();
    const timer = window.setInterval(() => requestSnapshot(), pollIntervalMs(hostFilter));
    return () => window.clearInterval(timer);
  }, [hostFilter, requestSnapshot, slurmView, visible]);

  // Horloge grossière pour « observé il y a » / durées / péremption — SEUL
  // setState périodique au repos. Les rangées sont mémoïsées : le tic ne
  // re-rend que la barre et les rangées dont l'affichage change.
  useEffect(() => {
    if (!visible || slurmView) return;
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [slurmView, visible]);

  // Échap replie la rangée ouverte.
  useEffect(() => {
    if (!visible || slurmView || !openRunId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenRunId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRunId, slurmView, visible]);

  const changeHost = (next: HostFilter) => {
    if (next === hostFilter) return;
    setHostFilter(next);
    storeHost(next);
    setOpenRunId(null);
    fingerprint.current = null;
  };

  const toggleRun = useCallback((id: string) => {
    setOpenRunId((current) => (current === id ? null : id));
  }, []);

  const terminalCommand = hostTerminalCommand(hostFilter);
  const observedMs = observedAt.current;
  const stale = observedMs != null && now - observedMs > STALE_MS;
  const observedSeconds = observedMs == null ? null : Math.max(0, Math.round((now - observedMs) / 1_000));

  if (slurmView) {
    return (
      <div className="calculs-shell" data-visible={visible}>
        <div className="calculs-slurm-bar">
          <Button variant="ghost" onClick={() => setSlurmView(false)}>{t("calculs.back-to-runs")}</Button>
          <span className="calculs-muted">{t("atelier.narval")}</span>
        </div>
        <NarvalSurface visible={visible && slurmView} onOpenTerminal={onOpenTerminal} paneControls={paneControls} />
      </div>
    );
  }

  return (
    <div className="calculs-shell" data-visible={visible}>
      <main className="calculs-main">
        <header className="calculs-toolbar">
          <h1>{t("calculs.title")}</h1>
          <SegmentedControl
            className="calculs-host-filter"
            label={t("calculs.filter-host")}
            value={hostFilter}
            onChange={(value) => changeHost(value as HostFilter)}
            options={HOSTS.map((host) => ({ value: host, label: hostLabel(host) }))}
          />
          {observedSeconds != null && (
            <span className="calculs-observed" title={new Date(observedMs!).toLocaleTimeString()}>
              {t("calculs.observed-ago", { seconds: observedSeconds })}
            </span>
          )}
          {stale && <StatusBadge status="warning">{t("calculs.stale")}</StatusBadge>}
          <div className="calculs-toolbar-actions">
            {hostFilter === "narval" && (
              <Button variant="ghost" onClick={() => setSlurmView(true)}>{t("calculs.slurm-view")}</Button>
            )}
            <IconButton
              className={loading ? "calculs-refresh is-loading" : "calculs-refresh"}
              size="s"
              hit40
              label={t("calculs.refresh")}
              title={t("calculs.refresh")}
              onClick={() => requestSnapshot(true)}
            >
              <RefreshCwIcon />
            </IconButton>
            {terminalCommand && (
              <IconButton
                size="s"
                hit40
                label={t("calculs.terminal")}
                title={t("calculs.terminal")}
                onClick={() => onOpenTerminal(terminalCommand)}
              >
                <SquareTerminalIcon />
              </IconButton>
            )}
          </div>
          {paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
        </header>

        {snapshot && snapshot.errors.length > 0 && (
          <Alert variant="destructive" className="calculs-alert">
            <ServerIcon />
            <AlertTitle>{t("calculs.host-errors-title")}</AlertTitle>
            <AlertDescription>
              <ul className="calculs-host-errors">
                {snapshot.errors.map((hostError) => (
                  <li key={`${hostError.host}:${hostError.code}`}>
                    <strong>{hostLabel(hostError.host)}</strong> · {hostError.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {error && !snapshot ? (
          <div className="calculs-offline">
            <ServerIcon aria-hidden="true" />
            <strong>{t("calculs.host-errors-title")}</strong>
            <p>{error.message}</p>
            <Button variant="secondary" onClick={() => requestSnapshot(true)}>{t("calculs.refresh")}</Button>
          </div>
        ) : !snapshot ? (
          <div className="calculs-skeleton"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
        ) : runs.length === 0 ? (
          <Empty className="calculs-empty">
            <EmptyHeader>
              <EmptyMedia className="calculs-empty-icon"><Clock3Icon /></EmptyMedia>
              <EmptyTitle>{t("calculs.empty-title")}</EmptyTitle>
              <EmptyDescription>{t("calculs.empty-desc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="calculs-list-scroll">
            <RunList
              runs={runs}
              openRunId={openRunId}
              now={now}
              onToggle={toggleRun}
              onOpenTerminal={openTerminal}
              onSlurmView={openSlurmView}
            />
          </ScrollArea>
        )}
      </main>
    </div>
  );
}

function formatTimestamp(value: string | number | null | undefined) {
  const ms = toMs(value);
  if (ms == null) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (current / total) * 100));
  return (
    <span className="calculs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

type RowActions = {
  onToggle: (id: string) => void;
  onOpenTerminal: (command: string) => void;
  onSlurmView: () => void;
};

const RunList = memo(function RunList({ runs, openRunId, now, onToggle, onOpenTerminal, onSlurmView }: RowActions & {
  runs: ComputeRun[];
  openRunId: string | null;
  now: number;
}) {
  calculsDebug.listRenders += 1;
  return (
    <div className="calculs-list">
      {runs.map((run) => (
        <RunRow
          key={run.id}
          run={run}
          open={run.id === openRunId}
          now={now}
          onToggle={onToggle}
          onOpenTerminal={onOpenTerminal}
          onSlurmView={onSlurmView}
        />
      ))}
    </div>
  );
});

/** Rangée + repli accordéon. Le corps n'est monté que lorsque la rangée est
 *  ouverte (une seule à la fois) : 200 rangées = 200 en-têtes, un seul corps. */
const RunRow = memo(function RunRow({ run, open, now, onToggle, onOpenTerminal, onSlurmView }: RowActions & {
  run: ComputeRun;
  open: boolean;
  now: number;
}) {
  calculsDebug.rowRenders += 1;
  const hasProgress = Boolean(run.progress && run.progress.total > 0);
  const bodyId = `calculs-run-body-${run.id}`;
  return (
    <div className="calculs-run" data-run-state={run.state} data-open={open || undefined}>
      <RowButton
        className="calculs-run-head"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => onToggle(run.id)}
      >
        <StatusBadge status={stateTone(run.state)}>{stateLabel(run.state)}</StatusBadge>
        <span className="calculs-run-identity">
          <strong title={run.label}>{run.label}</strong>
          <span className="calculs-run-meta">
            <span>{hostLabel(run.host)} · {run.source}</span>
            <code title={run.command}>{run.command}</code>
          </span>
          {hasProgress && run.state === "running" && (
            <ProgressBar current={run.progress!.current} total={run.progress!.total} />
          )}
        </span>
        <span className="calculs-run-times">
          <b>{runDuration(run, now)}</b>
          <small>{activityAgo(run, now)}</small>
        </span>
        <span className="calculs-run-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </RowButton>
      <div className="calculs-run-fold">
        <div>
          {open && (
            <RunBody id={bodyId} run={run} onOpenTerminal={onOpenTerminal} onSlurmView={onSlurmView} />
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.run === next.run && prev.open === next.open
  && prev.onToggle === next.onToggle && prev.onOpenTerminal === next.onOpenTerminal && prev.onSlurmView === next.onSlurmView
  // le tic d'horloge (10 s) ne re-rend une rangée que si son affichage change
  && runDuration(prev.run, prev.now) === runDuration(next.run, next.now)
  && activityAgo(prev.run, prev.now) === activityAgo(next.run, next.now));

function detailFact(detail: ComputeRun["detail"]): [string, string] | null {
  switch (detail.kind) {
    case "local": return detail.pid == null ? null : [t("calculs.pid"), String(detail.pid)];
    case "docker": return [t("calculs.container"), detail.container];
    case "unit": return [t("calculs.unit"), detail.unit];
    case "slurm": return [t("calculs.job"), detail.jobId];
    default: return null;
  }
}

function progressStatus(run: ComputeRun, current: number, total: number) {
  if (run.state === "completed" || run.state === "failed") {
    return typeof run.exitCode === "number"
      ? t("calculs.finished-code", { code: run.exitCode })
      : t("calculs.finished");
  }
  return `${Math.round(Math.max(0, Math.min(100, (current / total) * 100)))} %`;
}

/** Corps déplié : onglets Aperçu / Log (+ Fichiers pour Slurm). L'état du
 *  journal vit ici — monté à l'ouverture, jeté à la fermeture — si bien qu'un
 *  changement d'onglet ne re-rend que cette rangée. */
function RunBody({ id, run, onOpenTerminal, onSlurmView }: {
  id: string;
  run: ComputeRun;
  onOpenTerminal: (command: string) => void;
  onSlurmView: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [log, setLog] = useState<LogChunk | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const logRequest = useRef<string | null>(null);

  const requestLog = useCallback(() => {
    const requestIdValue = requestId();
    logRequest.current = requestIdValue;
    setLogLoading(true);
    setLogError(null);
    if (!wsSend({ type: "computeReadLog", requestId: requestIdValue, runId: run.id, tailLines: LOG_TAIL_LINES })) {
      setLogLoading(false);
      setLogError(t("calculs.offline"));
    }
  }, [run.id]);

  useEffect(() => {
    const onMessage = (event: Event) => {
      const msg = (event as CustomEvent).detail ?? {};
      if (msg.type !== "computeLog" || msg.requestId !== logRequest.current) return;
      setLogLoading(false);
      if (msg.error) {
        setLogError(String(msg.error.message ?? msg.error.code ?? ""));
        return;
      }
      const data = msg.data as { lines?: unknown; truncated?: unknown } | undefined;
      setLog({
        runId: String(msg.runId ?? ""),
        lines: Array.isArray(data?.lines) ? data!.lines.map(String) : [],
        truncated: data?.truncated === true,
      });
    };
    window.addEventListener("compute-message", onMessage);
    return () => window.removeEventListener("compute-message", onMessage);
  }, []);

  const changeTab = (next: string) => {
    setTab(next);
    if (next === "log" && !log && !logLoading) requestLog();
  };

  const isSlurm = run.detail.kind === "slurm";
  const terminalCommand = hostTerminalCommand(run.host as HostFilter);
  const progress = run.progress && run.progress.total > 0 ? run.progress : null;
  const fact = detailFact(run.detail);
  const ended = toMs(run.endedAt) != null;

  return (
    <div id={id} className="calculs-run-body">
      <Tabs value={tab} onValueChange={changeTab} className="calculs-run-tabs">
        <TabsList className="calculs-run-tabs-list">
          <TabsTrigger value="overview">{t("calculs.tab-overview")}</TabsTrigger>
          <TabsTrigger value="log">{t("calculs.tab-log")}</TabsTrigger>
          {isSlurm && <TabsTrigger value="files">{t("calculs.tab-files")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="calculs-run-overview">
          {run.state === "unknown" && <p className="calculs-run-hint">{t("calculs.unknown-hint")}</p>}
          {progress && (
            <div className="calculs-run-prog">
              <div className="calculs-run-prog-line">
                <span>{progress.current} / {progress.total} {progress.unit}</span>
                <span>{progressStatus(run, progress.current, progress.total)}</span>
              </div>
              <ProgressBar current={progress.current} total={progress.total} />
            </div>
          )}
          <dl className="calculs-run-facts">
            <div className="calculs-fact"><dt>{t("calculs.started")}</dt><dd>{formatTimestamp(run.startedAt)}</dd></div>
            {ended
              ? <div className="calculs-fact"><dt>{t("calculs.ended")}</dt><dd>{formatTimestamp(run.endedAt)}</dd></div>
              : <div className="calculs-fact"><dt>{t("calculs.last-activity")}</dt><dd>{formatTimestamp(run.lastActivityAt)}</dd></div>}
            <div className="calculs-fact"><dt>{t("calculs.host")}</dt><dd>{hostLabel(run.host)} · {run.source}</dd></div>
            {fact && <div className="calculs-fact"><dt>{fact[0]}</dt><dd className="calculs-mono">{fact[1]}</dd></div>}
            <div className="calculs-fact is-full"><dt>{t("calculs.command")}</dt><dd className="calculs-mono">{run.command || "—"}</dd></div>
            <div className="calculs-fact is-full"><dt>{t("calculs.workdir")}</dt><dd className="calculs-mono">{run.workDir || "—"}</dd></div>
          </dl>
          <pre className="calculs-run-tail">{run.logTail.length ? run.logTail.join("\n") : t("calculs.log-empty")}</pre>
          <div className="calculs-run-actions">
            <Button variant="secondary" onClick={() => changeTab("log")}>{t("calculs.log-full")}</Button>
            {isSlurm && <Button variant="secondary" onClick={onSlurmView}>{t("calculs.slurm-view")}</Button>}
            {terminalCommand && (
              <Button variant="secondary" onClick={() => onOpenTerminal(terminalCommand)}>
                {t("calculs.terminal-on", { host: hostLabel(run.host) })}
              </Button>
            )}
          </div>
        </TabsContent>
        <TabsContent value="log" className="calculs-run-log">
          {logLoading ? (
            <p className="calculs-run-hint">{t("calculs.log-loading")}</p>
          ) : logError ? (
            <p className="calculs-run-hint">{logError}</p>
          ) : log ? (
            <>
              {log.truncated && <p className="calculs-run-hint">{t("calculs.log-truncated", { count: LOG_TAIL_LINES })}</p>}
              <pre className="calculs-run-tail is-tall">{log.lines.length ? log.lines.join("\n") : t("calculs.log-empty")}</pre>
            </>
          ) : (
            <p className="calculs-run-hint">{t("calculs.log-empty")}</p>
          )}
        </TabsContent>
        {isSlurm && (
          <TabsContent value="files" className="calculs-run-files">
            <p className="calculs-run-hint">{t("calculs.files-hint")}</p>
            <div className="calculs-run-actions">
              <Button variant="secondary" onClick={onSlurmView}>{t("calculs.slurm-view")}</Button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
