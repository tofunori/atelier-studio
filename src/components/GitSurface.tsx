import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { eventLabel, t } from "../lib/i18n";
import { BranchIcon, LedgerIcon, RefreshIcon } from "./icons";
import { ButtonGroup } from "./shadcn/button-group";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import { Input } from "./shadcn/input";
import { Spinner } from "./shadcn/spinner";
import { Textarea } from "./shadcn/textarea";
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ChevronRightIcon,
  FileTextIcon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";
import { Button, IconButton, RowButton, SegmentedControl } from "./ui";

type GitFile = { path: string; status: string; originalPath?: string; add?: number; del?: number };
type GitStatus = { branch: string | null; ahead: number; behind: number; files: GitFile[] };
type GitDiffContents = { before: string; after: string; binary: boolean };
const AtelierDiffView = lazy(() => import("./AtelierDiffView"));
type LedgerEntry = {
  ts: string;
  threadId: string;
  threadTitle?: string | null;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  promptExcerpt?: string;
  usage?: { cost?: number | null } | null;
  tools?: { name?: string; status?: string | null }[];
  filesChanged?: string[];
  snapshotSha?: string | null;
};

function send(ws: WebSocket | null, msg: Record<string, unknown>) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

type GitGroup = "staged" | "changes" | "untracked";
type SelectedFile = { path: string; group: GitGroup };
function fileGroups(f: GitFile): GitGroup[] {
  if (f.status === "?" || f.status === "!") return ["untracked"];
  const gs: GitGroup[] = [];
  if (f.status[0] && f.status[0] !== ".") gs.push("staged");
  if (f.status[1] && f.status[1] !== ".") gs.push("changes");
  return gs.length ? gs : ["changes"];
}

function immediateCommitSuggestion(files: GitFile[]) {
  const paths = files.map((file) => file.path.toLowerCase()).join("\n");
  const hasGit = ["gitsurface", "gitops", "/git.", "commit"].some((value) => paths.includes(value));
  const hasAnalysis = ["analysis", "diagnostic", "model", ".jl", ".py", ".r"].some((value) => paths.includes(value));
  const hasDocs = ["docs/", "manuscript", ".md", ".tex", ".bib"].some((value) => paths.includes(value));
  const hasUi = [".tsx", ".css", ".html", "components/"].some((value) => paths.includes(value));
  if (hasGit) return "Improve Git commit workflow";
  if (hasAnalysis && hasDocs) return "Update analysis scripts and documentation";
  if (hasAnalysis) return "Update analysis scripts and results";
  if (hasDocs && hasUi) return "Update interface and documentation";
  if (hasUi) return "Update application interface";
  if (hasDocs) return "Update project documentation";
  if (["test", "spec."].some((value) => paths.includes(value))) return "Update automated tests";
  return "Update project files";
}

function shortStatus(file: GitFile) {
  if (file.status === "?") return "U"; // untracked, façon VS Code — jamais « ?? » brut
  if (file.status.includes("R")) return "R";
  if (file.status.includes("A")) return "A";
  if (file.status.includes("D")) return "D";
  if (file.status.includes("M")) return "M";
  return file.status.trim() || "?";
}

function formatCost(cost?: number | null) {
  if (cost == null) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function dayKey(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return t("git.date-unknown");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeKey(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function diffClass(line: string) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  return "";
}

export default function GitSurface({
  ws,
  projectRoot,
  activeThreadId,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  activeThreadId: string | null;
}) {
  const [mode, setMode] = useState<"git" | "journal">("git");
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [diff, setDiff] = useState("");
  const [diffContents, setDiffContents] = useState<GitDiffContents | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [syncBusy, setSyncBusy] = useState<"push" | "pull" | null>(null);
  const [syncNote, setSyncNote] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [commitDescription, setCommitDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitAndPush, setCommitAndPush] = useState(false);
  const [undoArmed, setUndoArmed] = useState(false);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const generationTimeout = useRef<number | null>(null);
  const generationEdited = useRef(false);
  const commitInputRef = useRef<HTMLInputElement | null>(null);

  const refreshGit = () => send(ws, { type: "gitStatus", projectRoot });
  const refreshLedger = () => send(ws, { type: "getLedger", projectRoot, limit: 200 });

  useEffect(() => {
    refreshGit();
    const onStatus = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) setStatus(msg.status);
    };
    const onDiff = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (
        msg.projectRoot === projectRoot
        && msg.path === selected?.path
        && (!msg.scope || msg.scope === selected?.group)
      ) {
        setDiff(msg.diff ?? "");
        setDiffContents(typeof msg.before === "string" && typeof msg.after === "string"
          ? { before: msg.before, after: msg.after, binary: Boolean(msg.binary) }
          : null);
        setDiffLoading(false);
      }
    };
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) {
        if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
        generationTimeout.current = null;
        if (msg.error) setCommitError(msg.error);
        else if (msg.message) {
          if (!generationEdited.current) setCommitMsg(msg.message);
          setSyncNote(t("git.generated-ready"));
          window.setTimeout(() => setSyncNote(""), 6000);
          commitInputRef.current?.focus();
        }
        generationEdited.current = false;
        setGenerating(false);
      }
    };
    const onLedger = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) setEntries(msg.entries ?? []);
    };
    const onChanged = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg.projectRoot || msg.projectRoot === projectRoot) {
        refreshGit();
        if (mode === "journal") refreshLedger();
        if (msg.type === "gitUndoLastTurnDone") {
          setSyncNote(t("git.undo-done"));
          window.setTimeout(() => setSyncNote(""), 6000);
        }
        if (msg.type === "gitCommitDone") {
          setCommitBusy(false);
          setCommitMsg("");
          setCommitDescription("");
          setShowDescription(false);
          setSyncNote(t("git.commit-done"));
          window.setTimeout(() => setSyncNote(""), 6000);
          if (commitAndPush) {
            setCommitAndPush(false);
            setSyncBusy("push");
            send(ws, { type: "gitPush", projectRoot });
          }
        }
      }
    };
    const onUndoError = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg.projectRoot || msg.projectRoot === projectRoot) {
        setSyncNote(t("git.undo-refused", { message: msg.message ?? "" }));
        window.setTimeout(() => setSyncNote(""), 12000);
      }
    };
    const onCommitError = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) {
        setCommitBusy(false);
        setCommitAndPush(false);
        setCommitError(msg.message ?? null);
      }
    };
    const onChangedClear = () => setCommitError(null);
    window.addEventListener("git-commit-error", onCommitError);
    window.addEventListener("git-changed", onChangedClear);
    window.addEventListener("git-status", onStatus);
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setSyncBusy(null);
      setSyncNote(d.error ? `${d.op}: ${d.error}` : (d.out || `${d.op} ✓`));
      window.setTimeout(() => setSyncNote(""), 6000);
    };
    window.addEventListener("git-sync-done", onSync);
    window.addEventListener("git-diff", onDiff);
    window.addEventListener("commit-msg", onMsg);
    window.addEventListener("ledger", onLedger);
    window.addEventListener("git-changed", onChanged);
    window.addEventListener("git-undo-error", onUndoError);
    return () => {
      window.removeEventListener("git-commit-error", onCommitError);
      window.removeEventListener("git-changed", onChangedClear);
      window.removeEventListener("git-status", onStatus);
      window.removeEventListener("git-sync-done", onSync);
      window.removeEventListener("git-diff", onDiff);
      window.removeEventListener("commit-msg", onMsg);
      window.removeEventListener("ledger", onLedger);
      window.removeEventListener("git-changed", onChanged);
      window.removeEventListener("git-undo-error", onUndoError);
      if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
    };
  }, [projectRoot, selected, ws, mode, commitAndPush]);

  useEffect(() => {
    if (mode === "journal") refreshLedger();
  }, [mode, projectRoot, ws]);

  function selectFile(path: string, group: GitGroup) {
    const isSame = selected?.path === path && selected.group === group;
    setSelected(isSame ? null : { path, group });
    setDiff("");
    setDiffContents(null);
    setDiffLoading(!isSame);
    if (!isSame) send(ws, { type: "gitDiff", projectRoot, path, scope: group });
  }

  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      [
        entry.promptExcerpt,
        entry.provider,
        entry.threadTitle,
        ...(entry.filesChanged ?? []),
        ...(entry.tools ?? []).map((tool) => tool.name),
      ].some((value) => String(value ?? "").toLowerCase().includes(q)),
    );
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, LedgerEntry[]>();
    for (const entry of filteredEntries) {
      const key = dayKey(entry.ts);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [filteredEntries]);

  const files = status?.files ?? [];
  const filesByGroup = useMemo(() => ({
    staged: files.filter((file) => fileGroups(file).includes("staged")),
    changes: files.filter((file) => fileGroups(file).includes("changes")),
    untracked: files.filter((file) => fileGroups(file).includes("untracked")),
  }), [files]);
  const stagedCount = filesByGroup.staged.length;
  const generationScope = stagedCount > 0 ? "staged" : files.length > 0 ? "changes" : null;

  function updateStage(group: GitGroup, paths: string[]) {
    if (!paths.length) return;
    setCommitError(null);
    const type = group === "staged" ? "gitUnstage" : "gitStage";
    if (!send(ws, { type, projectRoot, paths })) {
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function generateCommitMessage() {
    if (!generationScope || generating) return;
    generationEdited.current = false;
    setCommitMsg(immediateCommitSuggestion(files));
    commitInputRef.current?.focus();
    setGenerating(true);
    setCommitError(null);
    if (!send(ws, { type: "generateCommitMsg", projectRoot, scope: generationScope })) {
      setGenerating(false);
      setCommitError(t("git.connection-unavailable"));
      return;
    }
    if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
    generationTimeout.current = window.setTimeout(() => {
      setGenerating(false);
      setCommitError(t("git.generation-timeout"));
      generationTimeout.current = null;
    }, 15_000);
  }

  function createCommit(pushAfter: boolean) {
    if (!commitMsg.trim() || files.length === 0 || commitBusy || generating) return;
    const description = commitDescription.trim();
    const message = description ? `${commitMsg.trim()}\n\n${description}` : commitMsg.trim();
    const commitFiles = stagedCount > 0 ? [] : null;
    setCommitError(null);
    setCommitAndPush(pushAfter);
    setCommitBusy(true);
    if (!send(ws, { type: "gitCommit", projectRoot, message, files: commitFiles })) {
      setCommitBusy(false);
      setCommitAndPush(false);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  return (
    <div className="git-surface">
      <div className="git-head">
        <div className="git-title">
          {mode === "git" ? <BranchIcon size={14} /> : <LedgerIcon />}
          <span>{mode === "git" ? (status?.branch ?? t("git.branch-fallback")) : t("git.journal")}</span>
          {mode === "git" && (
            <span className="git-muted">
              {t("git.staging-summary", {
                staged: stagedCount,
                stagedPlural: stagedCount > 1 ? "s" : "",
                untracked: filesByGroup.untracked.length,
                untrackedPlural: filesByGroup.untracked.length > 1 ? "s" : "",
              })}
            </span>
          )}
        </div>
        <span className="git-head-spacer" />
        {mode === "git" && status && (
          <span className="git-sync-ctl">
            <Button variant="ghost" className="git-sync-btn" loading={syncBusy === "pull"}
              disabled={syncBusy != null} onClick={() => { setSyncBusy("pull"); send(ws, { type: "gitPull", projectRoot }); }}>
              <ArrowDownToLineIcon data-icon="inline-start" /> {t("git.pull-short")}{status.behind ? ` ${status.behind}` : ""}
            </Button>
            <Button variant="ghost" className="git-sync-btn" loading={syncBusy === "push"}
              disabled={syncBusy != null || !status.ahead} onClick={() => { setSyncBusy("push"); send(ws, { type: "gitPush", projectRoot }); }}>
              <ArrowUpFromLineIcon data-icon="inline-start" /> {t("git.push-short")}{status.ahead ? ` ${status.ahead}` : ""}
            </Button>
          </span>
        )}
        <span className="git-headmenu-wrap" onClick={(e) => e.stopPropagation()}>
          <IconButton size="s" className="ghost git-icon-btn" title={t("project.actions")} label={t("project.actions")} onClick={() => { setHeadMenu((v) => !v); setUndoArmed(false); }}>
            ⋯
          </IconButton>
          {headMenu && (
            <div className="mp-menu git-headmenu">
              <div className="mp-item" onClick={() => { setMode(mode === "git" ? "journal" : "git"); setHeadMenu(false); }}>
                {mode === "git" ? <LedgerIcon /> : <BranchIcon size={14} />}
                <span>{mode === "git" ? t("git.open-journal") : t("git.open-changes")}</span>
              </div>
              <div className="mp-item" onClick={() => { (mode === "git" ? refreshGit : refreshLedger)(); setHeadMenu(false); }}>
                <RefreshIcon /> <span>{t("action.refresh")}</span>
              </div>
              <div
                className={`mp-item ${undoArmed ? "danger" : ""} ${!activeThreadId ? "disabled" : ""}`}
                onClick={() => {
                  if (!activeThreadId) return;
                  if (!undoArmed) { setUndoArmed(true); return; }
                  setUndoArmed(false);
                  setHeadMenu(false);
                  send(ws, { type: "gitUndoLastTurn", threadId: activeThreadId });
                }}
              >
                <span>{undoArmed ? t("action.confirm-undo") : t("action.undo-agent-turn")}</span>
              </div>
            </div>
          )}
        </span>
      </div>

      {mode === "git" ? (
        <>
          <div className="git-workspace">
            <div className="git-files">
              {files.length === 0 && <div className="git-empty">{t("git.empty")}</div>}
              {(["staged", "changes", "untracked"] as GitGroup[]).map((grp) => {
                const inGrp = filesByGroup[grp];
                if (!inGrp.length && grp !== "changes") return null;
                const closed = closedGroups.has(grp) || !inGrp.length;
                return (
                  <div key={grp} className="git-group">
                    <div className="git-group-head">
                      <RowButton className="git-group-h" disabled={!inGrp.length} onClick={() => setClosedGroups((s) => {
                        const n = new Set(s); if (n.has(grp)) n.delete(grp); else n.add(grp); return n;
                      })}>
                        <span className="chev">{closed ? "▸" : "▾"}</span>
                        <span>{t(`git.group-${grp}` as any)}</span>
                        <span className="git-group-n">{inGrp.length}</span>
                      </RowButton>
                      {!!inGrp.length && (
                        <Button variant="ghost" className="git-group-action" onClick={() => updateStage(grp, inGrp.map((file) => file.path))}>
                          {grp === "staged" ? <MinusIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                          {grp === "staged" ? t("git.unstage-all") : t("git.stage-all")}
                        </Button>
                      )}
                    </div>
                    {!closed && inGrp.map((file) => {
                      const rowSelected = selected?.path === file.path && selected.group === grp;
                      return (
                        <div key={file.path} className={`git-file ${rowSelected ? "selected" : ""} ${/\.bak|~$|\.log$|\.aux$/.test(file.path) ? "dim" : ""}`}>
                          <div className="git-file-line">
                            <RowButton className="git-file-row" onClick={() => selectFile(file.path, grp)}>
                              <span className={`git-status s-${shortStatus(file).replace("U", "untracked")}`}>{shortStatus(file)}</span>
                              <span className="git-path">{file.path}</span>
                              <span className="git-stats">
                                {file.status === "?" ? t("git.new-file") : (
                                  <>
                                    {file.add != null && <em className="plus">+{file.add}</em>}
                                    {file.del != null && file.del > 0 && <em className="minus">−{file.del}</em>}
                                  </>
                                )}
                              </span>
                            </RowButton>
                            <IconButton size="s" className="git-row-stage" label={grp === "staged" ? t("git.unstage-file", { path: file.path }) : t("git.stage-file", { path: file.path })}
                              onClick={() => updateStage(grp, [file.path])}>
                              {grp === "staged" ? <MinusIcon /> : <PlusIcon />}
                            </IconButton>
                            <span className="git-file-menu-wrap" onClick={(e) => e.stopPropagation()}>
                              <IconButton size="s" className="git-file-menu git-icon-btn" label={t("project.actions")} onClick={() => { setMenuPath(menuPath === file.path ? null : file.path); setRestorePath(null); }}>
                                ⋯
                              </IconButton>
                              {menuPath === file.path && (
                                <div className="mp-menu git-filemenu">
                                  <div className={`mp-item ${restorePath === file.path ? "danger" : ""}`} onClick={() => {
                                    if (restorePath !== file.path) { setRestorePath(file.path); return; }
                                    setRestorePath(null);
                                    setMenuPath(null);
                                    send(ws, { type: "gitRevertFile", projectRoot, path: file.path });
                                  }}>
                                    <span>{restorePath === file.path ? t("action.confirm") : t("action.restore")}</span>
                                  </div>
                                  <div className="mp-item" onClick={() => { setMenuPath(null); send(ws, { type: "gitIgnore", projectRoot, pattern: file.path }); }}>
                                    <span>{t("git.ignore-file")}</span>
                                  </div>
                                  {file.path.includes("/") && (
                                    <div className="mp-item" onClick={() => { setMenuPath(null); send(ws, { type: "gitIgnore", projectRoot, pattern: file.path.split("/")[0] + "/" }); }}>
                                      <span>{t("git.ignore-dir", { dir: file.path.split("/")[0] + "/" })}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <section className="git-diff-pane" aria-label={t("git.diff-pane")}>
              <div className="git-diff-pane-head">
                <span className="git-diff-path">{selected?.path ?? t("git.select-file")}</span>
                <SegmentedControl
                  label="Diff view"
                  value={splitView ? "split" : "unified"}
                  onChange={(value) => setSplitView(value === "split")}
                  options={[
                    { value: "unified", label: t("git.unified") },
                    { value: "split", label: t("git.split") },
                  ]}
                />
              </div>
              <div className="git-diff-pane-body">
                {!selected ? (
                  <div className="git-diff-empty"><FileTextIcon /><span>{t("git.select-file-help")}</span></div>
                ) : diffLoading ? (
                  <div className="git-diff-empty">{t("git.diff-loading")}</div>
                ) : !diff && !diffContents ? (
                  <div className="git-diff-empty">{t("git.diff-empty")}</div>
                ) : diffContents?.binary ? (
                  <div className="git-diff-empty">Binary file changed</div>
                ) : diffContents ? (
                  <Suspense fallback={<div className="git-diff-empty">{t("git.diff-loading")}</div>}>
                    <AtelierDiffView
                      before={diffContents.before}
                      after={diffContents.after}
                      path={selected.path}
                      layout={splitView ? "split" : "unified"}
                    />
                  </Suspense>
                ) : (
                  <pre className="git-diff git-diff-pane-content">
                    {diff.split("\n").map((line, i) => (
                      <span key={`${i}-${line}`} className={diffClass(line)}>{line || " "}</span>
                    ))}
                  </pre>
                )}
              </div>
            </section>
          </div>
          <form className="git-commit-zone" onSubmit={(event) => { event.preventDefault(); createCommit(false); }}>
            <div className="git-commit-ready"><FileTextIcon /> {
              stagedCount > 0
                ? t("git.ready-n", { n: stagedCount, plural: stagedCount > 1 ? "s" : "" })
                : files.length > 0
                  ? t("git.ready-auto", { n: files.length, plural: files.length > 1 ? "s" : "" })
                  : t("git.ready-n", { n: 0, plural: "" })
            }</div>
            <FieldGroup className="git-commit-fields">
              <Field>
                <FieldLabel className="tw:sr-only" htmlFor="git-commit-summary">{t("git.commit-placeholder")}</FieldLabel>
                <ButtonGroup className="git-summary-group">
                  <Input ref={commitInputRef} id="git-commit-summary" className="git-commit-input" value={commitMsg} onChange={(event) => {
                    if (generating) generationEdited.current = true;
                    setCommitMsg(event.target.value);
                  }} placeholder={t("git.commit-placeholder")} />
                  <Button variant="secondary" className="git-generate-btn" aria-busy={generating || undefined} disabled={!generationScope || generating || commitBusy} onClick={generateCommitMessage}>
                    {generating
                      ? <Spinner data-icon="inline-start" aria-hidden role={undefined} aria-label={undefined} />
                      : <SparklesIcon data-icon="inline-start" />}
                    {generating ? t("git.generating-ai") : t("git.generate-ai")}
                  </Button>
                </ButtonGroup>
              </Field>
              {showDescription && (
                <Field>
                  <FieldLabel className="tw:sr-only" htmlFor="git-commit-description">{t("git.description-placeholder")}</FieldLabel>
                  <Textarea id="git-commit-description" className="git-commit-description" value={commitDescription}
                    onChange={(event) => setCommitDescription(event.target.value)} placeholder={t("git.description-placeholder")} />
                </Field>
              )}
            </FieldGroup>
            {generating && (
              <div className="git-generation-note" role="status" aria-live="polite">
                {t("git.generation-note")}
              </div>
            )}
            <div className="git-commit-actions">
              <Button variant="ghost" className="git-description-toggle" onClick={() => setShowDescription((value) => !value)}>
                <ChevronRightIcon data-icon="inline-start" className={showDescription ? "git-chev-open" : ""} />
                {showDescription ? t("git.hide-description") : t("git.add-description")}
              </Button>
              <span className="git-commit-buttons">
                <Button variant="primary" type="submit" loading={commitBusy && !commitAndPush} disabled={!commitMsg.trim() || files.length === 0 || commitBusy || generating}>
                  {t("git.commit-branch", { branch: status?.branch ?? t("git.branch-fallback") })}
                </Button>
                <Button variant="secondary" loading={commitBusy && commitAndPush} disabled={!commitMsg.trim() || files.length === 0 || commitBusy || generating} onClick={() => createCommit(true)}>
                  {t("git.commit-push")}
                </Button>
              </span>
            </div>
            {syncNote && <div className="git-syncnote">{syncNote}</div>}
            {commitError && <div className="git-commit-error">{commitError}</div>}
          </form>
        </>
      ) : (
        <div className="ledger-view">
          <div className="ledger-filter">
            <LedgerIcon />
            <Input className="git-filter-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("git.filter-placeholder")} />
          </div>
          {grouped.length === 0 && <div className="git-empty">{t("git.entries-empty")}</div>}
          {grouped.map(([day, dayEntries]) => (
            <div key={day} className="ledger-day">
              <div className="ledger-day-title">{day}</div>
              {dayEntries.map((entry) => {
                const rowId = `${entry.ts}:${entry.threadId}`;
                const isOpen = expanded === rowId;
                return (
                  <div key={rowId} className="ledger-entry">
                    <RowButton className="ledger-row" onClick={() => setExpanded(isOpen ? null : rowId)}>
                      <span className="ledger-time">{timeKey(entry.ts)}</span>
                      <span>{entry.provider ?? t("common.agent")}</span>
                      <span className="ledger-prompt">{entry.promptExcerpt || entry.threadTitle || t("git.agent-turn")}</span>
                      <span>{formatCost(entry.usage?.cost)}</span>
                      <span>{t("git.files-count", { count: entry.filesChanged?.length ?? 0 })}</span>
                    </RowButton>
                    {isOpen && (
                      <div className="ledger-detail">
                        <div className="ledger-detail-row">
                          <span>{t("git.files-label")}</span>
                          <span>{entry.filesChanged?.join(", ") || "—"}</span>
                        </div>
                        <div className="ledger-detail-row">
                          <span>{t("git.tools")}</span>
                          <span>{entry.tools?.map((tool) => tool.name ? eventLabel(tool.name) : null).filter(Boolean).join(", ") || "—"}</span>
                        </div>
                        <Button
                          variant="ghost"
                          className="ghost"
                          onClick={() => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: entry.threadId } }))}
                        >
                          {t("action.open-chat")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
