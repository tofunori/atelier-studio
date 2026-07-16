import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon,
  Clock3Icon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { Alert, AlertDescription, AlertTitle } from "./shadcn/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./shadcn/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./shadcn/empty";
import { Input } from "./shadcn/input";
import { ScrollArea } from "./shadcn/scroll-area";
import { Separator } from "./shadcn/separator";
import { Skeleton } from "./shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./shadcn/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./shadcn/table";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { RowButton } from "./ui";

const PROFILE = "narval";
const POLL_MS = 30_000;

type NarvalError = { code: string; message: string };
type NarvalStatus = {
  profile: string;
  host: string;
  gateway?: string | null;
  home: string;
  roots: string[];
  connected: boolean;
  slurmAvailable: boolean;
  observedAtMs: number;
};
type RemoteEntry = {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink";
  size: number;
  modifiedAt: number;
};
export type SlurmJob = {
  id: string;
  name: string;
  state: string;
  elapsed: string;
  cpus: number;
  partition: string;
  reason: string;
  workDir: string;
  startedAt: string;
  endedAt: string;
};
type Snapshot = { active: SlurmJob[]; recent: SlurmJob[]; observedAtMs: number };
type JobDetail = {
  job: SlurmJob;
  requestedMemory: string;
  submittedAt: string;
  stdoutPath: string;
  stderrPath: string;
};
type TextPreview = { path: string; content: string; truncated: boolean; observedAtMs: number };
type NarvalMessage = {
  type: string;
  requestId?: string;
  path?: string;
  data?: unknown;
  error?: NarvalError;
};

function requestId() {
  return crypto.randomUUID();
}

function statusTone(state: string): "neutral" | "running" | "success" | "warning" | "error" {
  const normalized = state.toUpperCase();
  if (["RUNNING", "COMPLETING", "CONFIGURING"].includes(normalized)) return "running";
  if (["COMPLETED"].includes(normalized)) return "success";
  if (["PENDING", "SUSPENDED", "REQUEUED"].includes(normalized)) return "warning";
  if (["FAILED", "TIMEOUT", "CANCELLED", "OUT_OF_MEMORY", "NODE_FAIL"].includes(normalized)) return "error";
  return "neutral";
}

function displayState(state: string) {
  return state.replace(/_/g, " ");
}

function resolvePath(workDir: string, path: string) {
  if (!path) return "";
  if (path.startsWith("/")) return path;
  return `${workDir.replace(/\/$/, "")}/${path}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function remoteName(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function sshTerminalCommand(status: NarvalStatus | null) {
  const host = status?.host ?? "narval-vpn";
  const gateway = status ? status.gateway : "nas";
  return gateway ? `ssh ${gateway} -t ssh ${host}` : `ssh ${host}`;
}

export default function NarvalSurface({ visible, onOpenTerminal }: {
  visible: boolean;
  onOpenTerminal: (command: string) => void;
}) {
  const [status, setStatus] = useState<NarvalStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [directories, setDirectories] = useState<Record<string, RemoteEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [preview, setPreview] = useState<TextPreview | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<NarvalError | null>(null);
  const [tab, setTab] = useState("overview");
  const statusRequest = useRef<string | null>(null);
  const snapshotRequest = useRef<string | null>(null);
  const detailRequest = useRef<string | null>(null);
  const textRequest = useRef<string | null>(null);
  const directoryRequests = useRef(new Map<string, string>());

  const selectedJob = useMemo(
    () => [...(snapshot?.active ?? []), ...(snapshot?.recent ?? [])].find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId, snapshot],
  );

  const requestDirectory = useCallback((path: string) => {
    if (!path || directoryRequests.current.has(path)) return;
    const id = requestId();
    directoryRequests.current.set(path, id);
    setLoadingDirectories((current) => new Set(current).add(path));
    wsSend({ type: "narvalListDirectory", profile: PROFILE, path, requestId: id });
  }, []);

  const requestStatus = useCallback(() => {
    const id = requestId();
    statusRequest.current = id;
    setLoading(true);
    setError(null);
    if (!wsSend({ type: "narvalStatus", profile: PROFILE, requestId: id })) {
      setLoading(false);
      setError({ code: "sidecar", message: t("narval.sidecar-offline") });
    }
  }, []);

  const requestSnapshot = useCallback(() => {
    const id = requestId();
    snapshotRequest.current = id;
    setLoading(true);
    wsSend({ type: "narvalSnapshot", profile: PROFILE, requestId: id });
  }, []);

  const refresh = () => {
    requestStatus();
    requestSnapshot();
  };

  const inspectJob = useCallback((job: SlurmJob) => {
    setSelectedJobId(job.id);
    setDetail(null);
    setPreview(null);
    setSelectedPath(null);
    setDetailLoading(true);
    setTab("overview");
    const id = requestId();
    detailRequest.current = id;
    wsSend({ type: "narvalInspectJob", profile: PROFILE, jobId: job.id, requestId: id });
  }, []);

  const readText = useCallback((path: string) => {
    if (!path) return;
    setSelectedPath(path);
    setPreview(null);
    setPreviewLoading(true);
    setTab("logs");
    const id = requestId();
    textRequest.current = id;
    wsSend({ type: "narvalReadText", profile: PROFILE, path, tailLines: 600, requestId: id });
  }, []);

  useEffect(() => {
    const onMessage = (event: Event) => {
      const msg = (event as CustomEvent<NarvalMessage>).detail;
      if (msg.type === "narvalStatus" && msg.requestId === statusRequest.current) {
        setLoading(false);
        if (msg.error) { setError(msg.error); return; }
        const next = msg.data as NarvalStatus;
        setStatus(next);
        const root = next.home || next.roots[0];
        if (root) {
          setExpanded((current) => new Set(current).add(root));
          requestDirectory(root);
        }
      }
      if (msg.type === "narvalSnapshot" && msg.requestId === snapshotRequest.current) {
        setLoading(false);
        if (msg.error) { setError(msg.error); return; }
        const next = msg.data as Snapshot;
        setSnapshot(next);
        setSelectedJobId((current) => current ?? next.active[0]?.id ?? next.recent[0]?.id ?? null);
        const first = next.active[0] ?? next.recent[0];
        if (!selectedJobId && first) inspectJob(first);
      }
      if (msg.type === "narvalDirectory" && msg.path) {
        const expected = directoryRequests.current.get(msg.path);
        if (!expected || expected !== msg.requestId) return;
        directoryRequests.current.delete(msg.path);
        setLoadingDirectories((current) => {
          const next = new Set(current);
          next.delete(msg.path!);
          return next;
        });
        if (msg.error) { setError(msg.error); return; }
        setDirectories((current) => ({ ...current, [msg.path!]: msg.data as RemoteEntry[] }));
      }
      if (msg.type === "narvalJobDetail" && msg.requestId === detailRequest.current) {
        setDetailLoading(false);
        if (msg.error) { setError(msg.error); return; }
        const next = msg.data as JobDetail;
        setDetail(next);
        if (next.job.workDir) requestDirectory(next.job.workDir);
        const stdout = resolvePath(next.job.workDir, next.stdoutPath);
        if (stdout) readText(stdout);
      }
      if (msg.type === "narvalText" && msg.requestId === textRequest.current) {
        setPreviewLoading(false);
        if (msg.error) { setError(msg.error); return; }
        setPreview(msg.data as TextPreview);
      }
    };
    window.addEventListener("narval-message", onMessage);
    return () => window.removeEventListener("narval-message", onMessage);
  }, [inspectJob, readText, requestDirectory, selectedJobId]);

  useEffect(() => {
    if (!visible) return;
    requestStatus();
    requestSnapshot();
    const timer = window.setInterval(() => requestSnapshot(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [requestSnapshot, requestStatus, visible]);

  const toggleDirectory = (path: string, open: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      open ? next.add(path) : next.delete(path);
      return next;
    });
    if (open && !directories[path]) requestDirectory(path);
  };

  const renderEntry = (entry: RemoteEntry, depth: number): React.ReactNode => {
    if (entry.kind === "directory") {
      const open = expanded.has(entry.path);
      const children = directories[entry.path];
      return (
        <Collapsible key={entry.path} open={open} onOpenChange={(next) => toggleDirectory(entry.path, next)}>
          <CollapsibleTrigger render={<RowButton className="narval-tree-row" style={{ paddingLeft: depth * 14 + 8 }} title={entry.path} />}>
            <ChevronRightIcon className={open ? "narval-tree-chevron open" : "narval-tree-chevron"} />
            {open ? <FolderOpenIcon /> : <FolderIcon />}
            <span>{entry.name}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {loadingDirectories.has(entry.path) && <TreeSkeleton depth={depth + 1} />}
            {children?.map((child) => renderEntry(child, depth + 1))}
          </CollapsibleContent>
        </Collapsible>
      );
    }
    return (
      <RowButton
        key={entry.path}
        className={selectedPath === entry.path ? "narval-tree-row selected" : "narval-tree-row"}
        style={{ paddingLeft: depth * 14 + 28 }}
        title={entry.path}
        onClick={() => readText(entry.path)}
      >
        <FileIcon />
        <span>{entry.name}</span>
        <small>{formatBytes(entry.size)}</small>
      </RowButton>
    );
  };

  const roots = status
    ? [status.home, ...status.roots].filter((path, index, all) => path && all.indexOf(path) === index)
    : [];
  const loadedEntries = Object.values(directories).flat();
  const matches = query.trim()
    ? loadedEntries.filter((entry) => entry.path.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 200)
    : null;
  const outputEntries = detail?.job.workDir ? directories[detail.job.workDir] ?? [] : [];

  return (
    <div className="narval-surface" data-visible={visible}>
      <aside className="narval-files" aria-label={t("narval.remote-files")}>
        <header className="narval-files-head">
          <div>
            <strong>{t("narval.title-short")}</strong>
            <span className={status?.connected ? "narval-connection connected" : "narval-connection"}>
              <i /> {status?.gateway ? `${status.gateway} → ` : ""}{status?.host ?? "narval-vpn"}
            </span>
          </div>
          <label className="narval-search">
            <SearchIcon />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("narval.search-files")} />
          </label>
        </header>
        <ScrollArea className="narval-tree-scroll">
          <div className="narval-tree">
            {loading && roots.length === 0 && <TreeSkeleton depth={0} />}
            {matches ? matches.map((entry) => renderEntry(entry, 0)) : roots.map((root) => {
              const open = expanded.has(root);
              return (
                <Collapsible key={root} open={open} onOpenChange={(next) => toggleDirectory(root, next)}>
                  <CollapsibleTrigger render={<RowButton className="narval-tree-row narval-root" title={root} />}>
                    <ChevronRightIcon className={open ? "narval-tree-chevron open" : "narval-tree-chevron"} />
                    {open ? <FolderOpenIcon /> : <FolderIcon />}
                    <span>{root === status?.home ? `~  ${remoteName(root)}` : root}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {loadingDirectories.has(root) && <TreeSkeleton depth={1} />}
                    {directories[root]?.map((entry) => renderEntry(entry, 1))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <main className="narval-main">
        <header className="narval-toolbar">
          <div>
            <h1>{t("narval.monitor-title")}</h1>
            <p>{status?.connected ? t("narval.connected-now") : t("narval.not-connected")}</p>
          </div>
          <div className="narval-toolbar-actions">
            <Button variant="secondary" onClick={refresh} loading={loading}>
              <RefreshCwIcon data-icon="inline-start" /> {t("narval.refresh")}
            </Button>
            <Button variant="secondary" onClick={() => onOpenTerminal(sshTerminalCommand(status))}>
              <SquareTerminalIcon data-icon="inline-start" /> {t("narval.terminal")}
            </Button>
          </div>
        </header>
        {error && (
          <Alert variant="destructive" className="narval-alert">
            <ServerIcon />
            <AlertTitle>{t("narval.error-title")}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <ScrollArea className="narval-main-scroll">
          <section className="narval-section" aria-labelledby="narval-jobs-title">
            <div className="narval-section-title">
              <h2 id="narval-jobs-title">{t("narval.jobs")}</h2>
              <StatusBadge>{snapshot?.active.length ?? 0} {t("narval.jobs-count")}</StatusBadge>
            </div>
            {!snapshot && loading ? <JobsSkeleton /> : (snapshot?.active.length ?? 0) === 0 ? (
              <Empty className="narval-empty">
                <EmptyHeader>
                  <EmptyMedia className="narval-empty-icon"><Clock3Icon /></EmptyMedia>
                  <EmptyTitle>{t("narval.no-active-jobs")}</EmptyTitle>
                  <EmptyDescription>{t("narval.no-active-jobs-desc")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table className="narval-jobs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("narval.job-id")}</TableHead>
                    <TableHead>{t("narval.name")}</TableHead>
                    <TableHead>{t("narval.state")}</TableHead>
                    <TableHead>{t("narval.time")}</TableHead>
                    <TableHead>{t("narval.cpus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot?.active.map((job) => (
                    <TableRow
                      key={job.id}
                      data-state={selectedJobId === job.id ? "selected" : undefined}
                      tabIndex={0}
                      aria-selected={selectedJobId === job.id}
                      onClick={() => inspectJob(job)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        inspectJob(job);
                      }}
                    >
                      <TableCell className="narval-mono">{job.id}</TableCell>
                      <TableCell>{job.name}</TableCell>
                      <TableCell><StatusBadge status={statusTone(job.state)}>{displayState(job.state)}</StatusBadge></TableCell>
                      <TableCell className="narval-mono">{job.elapsed || "—"}</TableCell>
                      <TableCell>{job.cpus || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          <Separator />
          <section className="narval-section" aria-labelledby="narval-runs-title">
            <div className="narval-section-title"><h2 id="narval-runs-title">{t("narval.recent-runs")}</h2></div>
            <div className="narval-runs">
              {(snapshot?.recent ?? []).slice(0, 12).map((job) => (
                <RowButton key={job.id} className="narval-run" onClick={() => inspectJob(job)}>
                  <StatusBadge status={statusTone(job.state)}>{displayState(job.state)}</StatusBadge>
                  <strong>{job.name}</strong>
                  <code>{job.id}</code>
                  <span>{job.endedAt || job.startedAt || job.elapsed}</span>
                </RowButton>
              ))}
              {snapshot && snapshot.recent.length === 0 && <p className="narval-muted">{t("narval.no-recent-runs")}</p>}
            </div>
          </section>
        </ScrollArea>
      </main>

      <aside className="narval-inspector" aria-label={t("narval.job-inspector")}>
        {!selectedJob ? (
          <Empty className="narval-inspector-empty">
            <EmptyHeader>
              <EmptyMedia className="narval-empty-icon"><ServerIcon /></EmptyMedia>
              <EmptyTitle>{t("narval.select-job")}</EmptyTitle>
              <EmptyDescription>{t("narval.select-job-desc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <header className="narval-inspector-head">
              <div><code>{selectedJob.id}</code><span> · </span><strong>{selectedJob.name}</strong></div>
              <StatusBadge status={statusTone(selectedJob.state)}>{displayState(selectedJob.state)}</StatusBadge>
              {selectedJob.reason && <span className="narval-reason">{selectedJob.reason}</span>}
            </header>
            <Tabs value={tab} onValueChange={setTab} className="narval-tabs">
              <TabsList className="narval-tabs-list">
                <TabsTrigger value="overview">{t("narval.overview")}</TabsTrigger>
                <TabsTrigger value="logs">{t("narval.logs")}</TabsTrigger>
                <TabsTrigger value="outputs">{t("narval.outputs")}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <ScrollArea className="narval-inspector-scroll">
                  {detailLoading ? <DetailSkeleton /> : (
                    <dl className="narval-detail-list">
                      <dt>{t("narval.job-id")}</dt><dd><code>{selectedJob.id}</code></dd>
                      <dt>{t("narval.state")}</dt><dd>{displayState(selectedJob.state)}</dd>
                      <dt>{t("narval.reason")}</dt><dd>{selectedJob.reason || "—"}</dd>
                      <dt>{t("narval.work-dir")}</dt><dd><code>{detail?.job.workDir || selectedJob.workDir || "—"}</code></dd>
                      <dt>{t("narval.submitted")}</dt><dd>{detail?.submittedAt || "—"}</dd>
                      <dt>{t("narval.partition")}</dt><dd>{detail?.job.partition || selectedJob.partition || "—"}</dd>
                      <dt>{t("narval.resources")}</dt><dd>{selectedJob.cpus || "—"} CPU · {detail?.requestedMemory || "—"}</dd>
                      <dt>{t("narval.elapsed")}</dt><dd>{selectedJob.elapsed || "—"}</dd>
                    </dl>
                  )}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="logs">
                <div className="narval-log-toolbar">
                  {detail?.stdoutPath && <Button variant="ghost" onClick={() => readText(resolvePath(detail.job.workDir, detail.stdoutPath))}>stdout</Button>}
                  {detail?.stderrPath && <Button variant="ghost" onClick={() => readText(resolvePath(detail.job.workDir, detail.stderrPath))}>stderr</Button>}
                  {selectedPath && <code>{remoteName(selectedPath)}</code>}
                </div>
                <ScrollArea className="narval-log-scroll">
                  {previewLoading ? <DetailSkeleton /> : preview ? <pre>{preview.content || t("narval.empty-log")}</pre> : (
                    <p className="narval-muted">{t("narval.no-log")}</p>
                  )}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="outputs">
                <ScrollArea className="narval-inspector-scroll">
                  <div className="narval-output-list">
                    {outputEntries.map((entry) => (
                      <RowButton key={entry.path} onClick={() => entry.kind === "directory" ? toggleDirectory(entry.path, true) : readText(entry.path)}>
                        {entry.kind === "directory" ? <FolderIcon /> : <FileIcon />}
                        <span>{entry.name}</span><small>{formatBytes(entry.size)}</small>
                      </RowButton>
                    ))}
                    {detail && outputEntries.length === 0 && <p className="narval-muted">{t("narval.no-outputs")}</p>}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            <footer className="narval-inspector-foot">
              <Button variant="secondary" onClick={() => onOpenTerminal(sshTerminalCommand(status))}>
                <SquareTerminalIcon data-icon="inline-start" /> {t("narval.open-terminal")}
              </Button>
              <StatusBadge status="neutral">{t("narval.read-only")}</StatusBadge>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function TreeSkeleton({ depth }: { depth: number }) {
  return <div className="narval-tree-skeleton" style={{ paddingLeft: depth * 14 + 12 }}><Skeleton /><Skeleton /><Skeleton /></div>;
}

function JobsSkeleton() {
  return <div className="narval-jobs-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>;
}

function DetailSkeleton() {
  return <div className="narval-detail-skeleton"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>;
}
