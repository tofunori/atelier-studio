import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import {
  filterLedgerEntries,
  groupFiles,
  groupLedgerEntries,
} from "./gitSurfaceModel";
import type {
  GitDiffContents,
  GitCommitDetails,
  GitCommitFile,
  GitCommitSummary,
  GitGroup,
  GitMode,
  GitStatus,
  LedgerEntry,
  SelectedFile,
  SyncOperation,
} from "./types";

const EMPTY_FILES: GitStatus["files"] = [];

function send(ws: WebSocket | null, message: Record<string, unknown>) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

function nextSelection(status: GitStatus, selected: SelectedFile | null): SelectedFile | null {
  if (!selected) return null;
  const groups = groupFiles(status.files);
  if (groups[selected.group].some((file) => file.path === selected.path)) return selected;
  const fallback = (["staged", "changes", "untracked"] as GitGroup[])
    .find((group) => groups[group].some((file) => file.path === selected.path));
  return fallback ? { path: selected.path, group: fallback } : null;
}

export function useGitSurfaceController({
  ws,
  projectRoot,
}: {
  ws: WebSocket | null;
  projectRoot: string;
}) {
  const [mode, setMode] = useState<GitMode>("git");
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selected, setSelectedState] = useState<SelectedFile | null>(null);
  const [diff, setDiff] = useState("");
  const [diffContents, setDiffContents] = useState<GitDiffContents | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<GitGroup>>(new Set());
  const [syncBusy, setSyncBusy] = useState<SyncOperation | null>(null);
  const [syncNote, setSyncNote] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [commitDescription, setCommitDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitAndPush, setCommitAndPush] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [commits, setCommits] = useState<GitCommitSummary[]>([]);
  const [commitDetails, setCommitDetails] = useState<GitCommitDetails | null>(null);
  const [selectedCommitFile, setSelectedCommitFileState] = useState<GitCommitFile | null>(null);
  const [commitDiffContents, setCommitDiffContents] = useState<GitDiffContents | null>(null);
  const [commitDiffLoading, setCommitDiffLoading] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsHasMore, setCommitsHasMore] = useState(false);
  const [commitQuery, setCommitQuery] = useState("");
  const [allRefs, setAllRefs] = useState(false);
  const [historyBusy, setHistoryBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const generationTimeout = useRef<number | null>(null);
  const commitInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef<SelectedFile | null>(null);
  const modeRef = useRef<GitMode>(mode);
  const commitAndPushRef = useRef(commitAndPush);
  const commitsRef = useRef<GitCommitSummary[]>([]);
  const selectedCommitFileRef = useRef<GitCommitFile | null>(null);

  const setSelected = useCallback((nextSelection: SelectedFile | null) => {
    selectedRef.current = nextSelection;
    setSelectedState(nextSelection);
  }, []);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { commitAndPushRef.current = commitAndPush; }, [commitAndPush]);
  useEffect(() => { commitsRef.current = commits; }, [commits]);

  const refreshGit = useCallback(() => send(ws, { type: "gitStatus", projectRoot }), [projectRoot, ws]);
  const refreshLedger = useCallback(() => send(ws, { type: "getLedger", projectRoot, limit: 200 }), [projectRoot, ws]);
  const refreshCommits = useCallback((append = false) => {
    setCommitsLoading(true);
    send(ws, { type: "gitLog", projectRoot, all: allRefs, query: commitQuery, skip: append ? commitsRef.current.length : 0, limit: 50 });
  }, [allRefs, commitQuery, projectRoot, ws]);

  const requestCommitFile = useCallback((sha: string, file: GitCommitFile) => {
    selectedCommitFileRef.current = file;
    setSelectedCommitFileState(file);
    setCommitDiffContents(null);
    setCommitDiffLoading(true);
    if (!send(ws, {
      type: "gitCommitFileDiff",
      projectRoot,
      sha,
      path: file.path,
      previousPath: file.previousPath,
    })) {
      setCommitDiffLoading(false);
      setCommitError(t("git.connection-unavailable"));
    }
  }, [projectRoot, ws]);

  const requestDiff = useCallback((selection: SelectedFile) => {
    setDiff("");
    setDiffContents(null);
    setDiffLoading(true);
    if (!send(ws, { type: "gitDiff", projectRoot, path: selection.path, scope: selection.group })) {
      setDiffLoading(false);
      setCommitError(t("git.connection-unavailable"));
    }
  }, [projectRoot, ws]);

  useEffect(() => {
    refreshGit();

    const onStatus = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot !== projectRoot) return;
      const incoming = message.status as GitStatus;
      setStatus(incoming);
      const reconciled = nextSelection(incoming, selectedRef.current);
      if (reconciled?.group !== selectedRef.current?.group || reconciled?.path !== selectedRef.current?.path) {
        setSelected(reconciled);
        setDiff("");
        setDiffContents(null);
        if (reconciled) requestDiff(reconciled);
        else setDiffLoading(false);
      }
    };
    const onDiff = (event: Event) => {
      const message = (event as CustomEvent).detail;
      const active = selectedRef.current;
      if (
        message.projectRoot === projectRoot
        && message.path === active?.path
        && (!message.scope || message.scope === active?.group)
      ) {
        setDiff(message.diff ?? "");
        setDiffContents(typeof message.before === "string" && typeof message.after === "string"
          ? { before: message.before, after: message.after, binary: Boolean(message.binary) }
          : null);
        setDiffLoading(false);
      }
    };
    const onCommitMessage = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot !== projectRoot) return;
      if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
      generationTimeout.current = null;
      if (message.error) setCommitError(message.error);
      else if (message.message) {
        setCommitMsg(message.message);
        setCommitDescription(typeof message.description === "string" ? message.description : "");
        if (String(message.description ?? "").trim()) setShowDescription(true);
        setSyncNote(t("git.generated-ready"));
        window.setTimeout(() => setSyncNote(""), 6000);
        commitInputRef.current?.focus();
      }
      setGenerating(false);
    };
    const onLedger = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot === projectRoot) setEntries(message.entries ?? []);
    };
    const onLog = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot !== projectRoot) return;
      setCommits((current) => message.skip ? [...current, ...(message.commits ?? [])] : (message.commits ?? []));
      setCommitsHasMore(Boolean(message.hasMore)); setCommitsLoading(false);
      if (message.error) setCommitError(message.error);
    };
    const onDetails = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot !== projectRoot) return;
      const next = (message.details ?? null) as GitCommitDetails | null;
      setCommitDetails(next); setHistoryBusy(null);
      const first = next?.files?.[0] ?? null;
      if (first && next) requestCommitFile(next.sha, first);
      else {
        selectedCommitFileRef.current = null;
        setSelectedCommitFileState(null);
        setCommitDiffContents(null);
        setCommitDiffLoading(false);
      }
      if (message.error) setCommitError(message.error);
    };
    const onCommitFileDiff = (event: Event) => {
      const message = (event as CustomEvent).detail;
      const active = selectedCommitFileRef.current;
      if (message.projectRoot !== projectRoot || message.path !== active?.path) return;
      setCommitDiffLoading(false);
      if (message.error) {
        setCommitDiffContents(null);
        setCommitError(message.error);
        return;
      }
      setCommitDiffContents({
        before: String(message.before ?? ""),
        after: String(message.after ?? ""),
        binary: Boolean(message.binary),
      });
    };
    const onHistoryAction = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot !== projectRoot) return;
      setHistoryBusy(null); setCommitError(message.error ?? null);
      if (!message.error) {
        refreshGit(); refreshCommits(false);
        if (!["fetch", "restore-file"].includes(message.op)) {
          setCommitDetails(null);
          selectedCommitFileRef.current = null;
          setSelectedCommitFileState(null);
          setCommitDiffContents(null);
        }
      }
    };
    const onChanged = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot && message.projectRoot !== projectRoot) return;
      setCommitError(null);
      refreshGit();
      if (modeRef.current === "journal") refreshLedger();
      if (message.type === "gitUndoLastTurnDone") {
        setSyncNote(t("git.undo-done"));
        window.setTimeout(() => setSyncNote(""), 6000);
      }
      if (message.type === "gitCommitDone") {
        setCommitBusy(false);
        setCommitMsg("");
        setCommitDescription("");
        setShowDescription(false);
        setSyncNote(t("git.commit-done"));
        window.setTimeout(() => setSyncNote(""), 6000);
        if (commitAndPushRef.current) {
          commitAndPushRef.current = false;
          setCommitAndPush(false);
          setSyncBusy("push");
          send(ws, { type: "gitPush", projectRoot });
        }
      }
    };
    const onUndoError = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (!message.projectRoot || message.projectRoot === projectRoot) {
        setSyncNote(t("git.undo-refused", { message: message.message ?? "" }));
        window.setTimeout(() => setSyncNote(""), 12000);
      }
    };
    const onCommitError = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot === projectRoot) {
        setCommitBusy(false);
        setCommitAndPush(false);
        commitAndPushRef.current = false;
        setCommitError(message.message ?? null);
      }
    };
    const onSync = (event: Event) => {
      const message = (event as CustomEvent).detail;
      setSyncBusy(null);
      setSyncNote(message.error
        ? `${message.op}: ${message.error}`
        : message.op === "switch"
          ? t("git.branch-switched", { branch: message.out ?? "" })
          : message.op === "create-branch"
            ? t("git.branch-created", { branch: message.out ?? "" })
            : message.op === "delete-branch"
              ? t("git.branch-deleted", { branch: message.out ?? "" })
              : message.op === "merge-branch"
                ? t("git.branch-merged", { branch: message.out ?? "" })
              : (message.out || `${message.op} ✓`));
      window.setTimeout(() => setSyncNote(""), 6000);
    };

    window.addEventListener("git-status", onStatus);
    window.addEventListener("git-diff", onDiff);
    window.addEventListener("commit-msg", onCommitMessage);
    window.addEventListener("ledger", onLedger);
    window.addEventListener("git-log", onLog);
    window.addEventListener("git-commit-details", onDetails);
    window.addEventListener("git-commit-file-diff", onCommitFileDiff);
    window.addEventListener("git-history-action", onHistoryAction);
    window.addEventListener("git-changed", onChanged);
    window.addEventListener("git-undo-error", onUndoError);
    window.addEventListener("git-commit-error", onCommitError);
    window.addEventListener("git-sync-done", onSync);
    return () => {
      window.removeEventListener("git-status", onStatus);
      window.removeEventListener("git-diff", onDiff);
      window.removeEventListener("commit-msg", onCommitMessage);
      window.removeEventListener("ledger", onLedger);
      window.removeEventListener("git-log", onLog);
      window.removeEventListener("git-commit-details", onDetails);
      window.removeEventListener("git-commit-file-diff", onCommitFileDiff);
      window.removeEventListener("git-history-action", onHistoryAction);
      window.removeEventListener("git-changed", onChanged);
      window.removeEventListener("git-undo-error", onUndoError);
      window.removeEventListener("git-commit-error", onCommitError);
      window.removeEventListener("git-sync-done", onSync);
      if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
    };
  }, [projectRoot, refreshGit, refreshLedger, requestCommitFile, requestDiff, setSelected, ws]);

  useEffect(() => {
    if (mode === "journal") refreshLedger();
    if (mode === "commits") refreshCommits(false);
  }, [mode, refreshCommits, refreshLedger]);

  const files = status?.files ?? EMPTY_FILES;
  const filesByGroup = useMemo(() => groupFiles(files), [files]);
  const stagedCount = filesByGroup.staged.length;
  const generationScope = stagedCount > 0 ? "staged" : files.length > 0 ? "changes" : null;
  const groupedEntries = useMemo(
    () => groupLedgerEntries(filterLedgerEntries(entries, filter)),
    [entries, filter],
  );

  function selectFile(path: string, group: GitGroup) {
    const active = selectedRef.current;
    const isSame = active?.path === path && active.group === group;
    const next = isSame ? null : { path, group };
    setSelected(next);
    setDiff("");
    setDiffContents(null);
    setDiffLoading(Boolean(next));
    if (next) requestDiff(next);
  }

  function toggleGroup(group: GitGroup) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function updateStage(group: GitGroup, paths: string[]) {
    if (!paths.length) return;
    setCommitError(null);
    const type = group === "staged" ? "gitUnstage" : "gitStage";
    if (!send(ws, { type, projectRoot, paths })) setCommitError(t("git.connection-unavailable"));
  }

  function generateCommitMessage() {
    if (!generationScope || generating) return;
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
    }, 65_000);
  }

  function editCommitMessage(message: string) {
    setCommitMsg(message);
  }

  function createCommit(shouldPush: boolean) {
    if (!commitMsg.trim() || files.length === 0 || commitBusy || generating) return;
    if (stagedCount === 0) {
      setCommitError(t("git.stage-required"));
      return;
    }
    const description = commitDescription.trim();
    const message = description ? `${commitMsg.trim()}\n\n${description}` : commitMsg.trim();
    setCommitError(null);
    setCommitAndPush(shouldPush);
    commitAndPushRef.current = shouldPush;
    setCommitBusy(true);
    if (!send(ws, { type: "gitCommit", projectRoot, message, files: [] })) {
      setCommitBusy(false);
      setCommitAndPush(false);
      commitAndPushRef.current = false;
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function sync(nextOperation: SyncOperation) {
    setSyncBusy(nextOperation);
    setCommitError(null);
    if (!send(ws, { type: nextOperation === "pull" ? "gitPull" : "gitPush", projectRoot })) {
      setSyncBusy(null);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function switchBranch(branch: string) {
    if (!branch || branch === status?.branch || syncBusy != null) return;
    if (files.length > 0) {
      setCommitError(t("git.branch-clean-required"));
      return;
    }
    setSyncBusy("switch");
    setCommitError(null);
    if (!send(ws, { type: "gitSwitchBranch", projectRoot, branch })) {
      setSyncBusy(null);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function createBranch(branch: string) {
    const name = branch.trim();
    if (!name || syncBusy != null) return;
    setSyncBusy("create-branch");
    setCommitError(null);
    if (!send(ws, { type: "gitCreateBranch", projectRoot, branch: name })) {
      setSyncBusy(null);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function deleteBranch(branch: string) {
    if (!branch || branch === status?.branch || syncBusy != null) return;
    setSyncBusy("delete-branch");
    setCommitError(null);
    if (!send(ws, { type: "gitDeleteBranch", projectRoot, branch })) {
      setSyncBusy(null);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function mergeBranch(branch: string) {
    if (!branch || branch === status?.branch || syncBusy != null) return;
    if (files.length > 0) {
      setCommitError(t("git.branch-clean-required"));
      return;
    }
    setSyncBusy("merge-branch");
    setCommitError(null);
    if (!send(ws, { type: "gitMergeBranch", projectRoot, branch })) {
      setSyncBusy(null);
      setCommitError(t("git.connection-unavailable"));
    }
  }

  function selectCommit(sha: string) {
    setHistoryBusy("details"); setCommitError(null); setCommitDetails(null);
    selectedCommitFileRef.current = null; setSelectedCommitFileState(null); setCommitDiffContents(null);
    send(ws, { type: "gitCommitDetails", projectRoot, sha });
  }

  function selectCommitFile(file: GitCommitFile) {
    if (!commitDetails || (selectedCommitFile?.path === file.path && !commitDiffLoading)) return;
    requestCommitFile(commitDetails.sha, file);
  }

  function historyAction(type: string, payload: Record<string, unknown> = {}) {
    setHistoryBusy(type); setCommitError(null);
    if (!send(ws, { type, projectRoot, expectedHead: commitDetails?.head, ...payload })) {
      setHistoryBusy(null); setCommitError(t("git.connection-unavailable"));
    }
  }

  return {
    mode, setMode, status, files, filesByGroup, stagedCount,
    selected, selectFile, diff, diffContents, diffLoading,
    splitView, setSplitView, closedGroups, toggleGroup,
    syncBusy, syncNote, sync, switchBranch, createBranch, deleteBranch, mergeBranch, refreshGit, refreshLedger,
    commitMsg, editCommitMessage, commitDescription, setCommitDescription,
    showDescription, setShowDescription, generating, commitBusy, commitAndPush,
    commitError, generationScope, generateCommitMessage, createCommit, commitInputRef,
    updateStage, groupedEntries, filter, setFilter, expanded, setExpanded,
    commits, commitDetails, commitsLoading, commitsHasMore, commitQuery, setCommitQuery, allRefs, setAllRefs,
    refreshCommits, selectCommit, selectedCommitFile, selectCommitFile, commitDiffContents, commitDiffLoading,
    historyAction, historyBusy,
  };
}

export type GitSurfaceController = ReturnType<typeof useGitSurfaceController>;
