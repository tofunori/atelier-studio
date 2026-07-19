import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import {
  filterLedgerEntries,
  groupFiles,
  groupLedgerEntries,
  immediateCommitSuggestion,
} from "./gitSurfaceModel";
import type {
  GitDiffContents,
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const generationTimeout = useRef<number | null>(null);
  const generationEdited = useRef(false);
  const commitInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef<SelectedFile | null>(null);
  const modeRef = useRef<GitMode>(mode);
  const commitAndPushRef = useRef(commitAndPush);

  const setSelected = useCallback((nextSelection: SelectedFile | null) => {
    selectedRef.current = nextSelection;
    setSelectedState(nextSelection);
  }, []);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { commitAndPushRef.current = commitAndPush; }, [commitAndPush]);

  const refreshGit = useCallback(() => send(ws, { type: "gitStatus", projectRoot }), [projectRoot, ws]);
  const refreshLedger = useCallback(() => send(ws, { type: "getLedger", projectRoot, limit: 200 }), [projectRoot, ws]);

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
        if (!generationEdited.current) setCommitMsg(message.message);
        setSyncNote(t("git.generated-ready"));
        window.setTimeout(() => setSyncNote(""), 6000);
        commitInputRef.current?.focus();
      }
      generationEdited.current = false;
      setGenerating(false);
    };
    const onLedger = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (message.projectRoot === projectRoot) setEntries(message.entries ?? []);
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
      setSyncNote(message.error ? `${message.op}: ${message.error}` : (message.out || `${message.op} ✓`));
      window.setTimeout(() => setSyncNote(""), 6000);
    };

    window.addEventListener("git-status", onStatus);
    window.addEventListener("git-diff", onDiff);
    window.addEventListener("commit-msg", onCommitMessage);
    window.addEventListener("ledger", onLedger);
    window.addEventListener("git-changed", onChanged);
    window.addEventListener("git-undo-error", onUndoError);
    window.addEventListener("git-commit-error", onCommitError);
    window.addEventListener("git-sync-done", onSync);
    return () => {
      window.removeEventListener("git-status", onStatus);
      window.removeEventListener("git-diff", onDiff);
      window.removeEventListener("commit-msg", onCommitMessage);
      window.removeEventListener("ledger", onLedger);
      window.removeEventListener("git-changed", onChanged);
      window.removeEventListener("git-undo-error", onUndoError);
      window.removeEventListener("git-commit-error", onCommitError);
      window.removeEventListener("git-sync-done", onSync);
      if (generationTimeout.current != null) window.clearTimeout(generationTimeout.current);
    };
  }, [projectRoot, refreshGit, refreshLedger, requestDiff, setSelected, ws]);

  useEffect(() => {
    if (mode === "journal") refreshLedger();
  }, [mode, refreshLedger]);

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

  function editCommitMessage(message: string) {
    if (generating) generationEdited.current = true;
    setCommitMsg(message);
  }

  function createCommit(shouldPush: boolean) {
    if (!commitMsg.trim() || files.length === 0 || commitBusy || generating) return;
    const description = commitDescription.trim();
    const message = description ? `${commitMsg.trim()}\n\n${description}` : commitMsg.trim();
    const commitFiles = stagedCount > 0 ? [] : null;
    setCommitError(null);
    setCommitAndPush(shouldPush);
    commitAndPushRef.current = shouldPush;
    setCommitBusy(true);
    if (!send(ws, { type: "gitCommit", projectRoot, message, files: commitFiles })) {
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

  return {
    mode, setMode, status, files, filesByGroup, stagedCount,
    selected, selectFile, diff, diffContents, diffLoading,
    splitView, setSplitView, closedGroups, toggleGroup,
    syncBusy, syncNote, sync, refreshGit, refreshLedger,
    commitMsg, editCommitMessage, commitDescription, setCommitDescription,
    showDescription, setShowDescription, generating, commitBusy, commitAndPush,
    commitError, generationScope, generateCommitMessage, createCommit, commitInputRef,
    updateStage, groupedEntries, filter, setFilter, expanded, setExpanded,
  };
}

export type GitSurfaceController = ReturnType<typeof useGitSurfaceController>;
