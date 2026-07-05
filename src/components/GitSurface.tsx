import { useEffect, useMemo, useState } from "react";
import { eventLabel, t } from "../lib/i18n";
import { BranchIcon, LedgerIcon, RefreshIcon } from "./icons";

type GitFile = { path: string; status: string; originalPath?: string; add?: number; del?: number };
type GitStatus = { branch: string | null; ahead: number; behind: number; files: GitFile[] };
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
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function shortStatus(file: GitFile) {
  if (file.status === "?") return "??";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [generating, setGenerating] = useState(false);
  const [undoArmed, setUndoArmed] = useState(false);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [commitError, setCommitError] = useState<string | null>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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
      if (msg.projectRoot === projectRoot && msg.path === selected) setDiff(msg.diff ?? "");
    };
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) {
        setCommitMsg(msg.message ?? "");
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
      }
    };
    const onCommitError = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.projectRoot === projectRoot) setCommitError(msg.message ?? null);
    };
    const onChangedClear = () => setCommitError(null);
    window.addEventListener("git-commit-error", onCommitError);
    window.addEventListener("git-changed", onChangedClear);
    window.addEventListener("git-status", onStatus);
    window.addEventListener("git-diff", onDiff);
    window.addEventListener("commit-msg", onMsg);
    window.addEventListener("ledger", onLedger);
    window.addEventListener("git-changed", onChanged);
    return () => {
      window.removeEventListener("git-commit-error", onCommitError);
      window.removeEventListener("git-changed", onChangedClear);
      window.removeEventListener("git-status", onStatus);
      window.removeEventListener("git-diff", onDiff);
      window.removeEventListener("commit-msg", onMsg);
      window.removeEventListener("ledger", onLedger);
      window.removeEventListener("git-changed", onChanged);
    };
  }, [projectRoot, selected, ws, mode]);

  useEffect(() => {
    if (mode === "journal") refreshLedger();
  }, [mode, projectRoot, ws]);

  function selectFile(path: string) {
    setSelected((cur) => (cur === path ? null : path));
    setDiff("");
    if (selected !== path) send(ws, { type: "gitDiff", projectRoot, path });
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
  const CHECKED = files.filter((f) => !unchecked.has(f.path));

  return (
    <div className="git-surface">
      <div className="git-head">
        <div className="git-title">
          <BranchIcon size={14} />
          <span>{status?.branch ?? t("git.branch-fallback")}</span>
          <span className="git-muted">{t("git.files", { count: files.length, plural: files.length > 1 ? "s" : "" })}</span>
        </div>
        <div className="seg">
          <button className={mode === "git" ? "on" : ""} onClick={() => setMode("git")}>Git</button>
          <button className={mode === "journal" ? "on" : ""} onClick={() => setMode("journal")}>{t("git.journal")}</button>
        </div>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="git-muted git-sync">
            {status.ahead > 0 ? `↑${status.ahead}` : ""}{status.behind > 0 ? ` ↓${status.behind}` : ""}
          </span>
        )}
        <span className="git-headmenu-wrap" onClick={(e) => e.stopPropagation()}>
          <button className="ghost git-icon-btn" title="⋯" onClick={() => { setHeadMenu((v) => !v); setUndoArmed(false); }}>
            ⋯
          </button>
          {headMenu && (
            <div className="mp-menu git-headmenu">
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
          <div className="git-files">
            {files.length === 0 && <div className="git-empty">{t("git.empty")}</div>}
            {files.map((file) => (
              <div key={file.path} className={`git-file ${/\.bak|~$|\.log$|\.aux$/.test(file.path) ? "dim" : ""}`}>
                <div className="git-file-line">
                  <input
                    type="checkbox"
                    checked={!unchecked.has(file.path)}
                    onChange={() => setUnchecked((u) => {
                      const n = new Set(u);
                      if (n.has(file.path)) n.delete(file.path); else n.add(file.path);
                      return n;
                    })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button className="git-file-row" onClick={() => selectFile(file.path)}>
                    <span className={`git-status s-${shortStatus(file).replace("??", "untracked")}`}>
                      {shortStatus(file)}
                    </span>
                    <span className="git-path">{file.path}</span>
                    <span className="git-stats">
                      {file.status === "?" ? t("git.new-file") : (
                        <>
                          {file.add != null && <em className="plus">+{file.add}</em>}
                          {file.del != null && file.del > 0 && <em className="minus">−{file.del}</em>}
                        </>
                      )}
                    </span>
                  </button>
                  <span className="git-file-menu-wrap" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost git-icon-btn" onClick={() => { setMenuPath(menuPath === file.path ? null : file.path); setRestorePath(null); }}>
                      ⋯
                    </button>
                    {menuPath === file.path && (
                      <div className="mp-menu git-filemenu">
                        <div
                          className={`mp-item ${restorePath === file.path ? "danger" : ""}`}
                          onClick={() => {
                            if (restorePath !== file.path) { setRestorePath(file.path); return; }
                            setRestorePath(null);
                            setMenuPath(null);
                            send(ws, { type: "gitRevertFile", projectRoot, path: file.path });
                          }}
                        >
                          <span>{restorePath === file.path ? t("action.confirm") : t("action.restore")}</span>
                        </div>
                      </div>
                    )}
                  </span>
                </div>
                {selected === file.path && (
                  <pre className="git-diff">
                    {diff ? diff.split("\n").map((line, i) => (
                      <span key={`${i}-${line}`} className={diffClass(line)}>{line || " "}</span>
                    )) : <span className="git-muted">{t("git.diff-empty")}</span>}
                  </pre>
                )}
              </div>
            ))}
          </div>
          <div className="git-commit-zone">
            <div className="git-commit">
              <input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder={t("git.commit-placeholder")}
              />
              <button
                className="ghost git-icon-btn"
                title={t("action.generate-commit-message")}
                disabled={generating || files.length === 0}
                onClick={() => {
                  setGenerating(true);
                  setCommitError(null);
                  send(ws, { type: "generateCommitMsg", projectRoot });
                }}
              >
                {generating ? "…" : "✨"}
              </button>
              <button
                className="set-btn"
                disabled={!commitMsg.trim() || CHECKED.length === 0}
                onClick={() => {
                  setCommitError(null);
                  send(ws, {
                    type: "gitCommit", projectRoot, message: commitMsg.trim(),
                    files: CHECKED.map((f) => f.path),
                  });
                  setCommitMsg("");
                }}
              >
                {t("git.commit-n", { n: CHECKED.length, plural: CHECKED.length > 1 ? "s" : "" })}
              </button>
            </div>
            {commitError && <div className="git-commit-error">{commitError}</div>}
          </div>
        </>
      ) : (
        <div className="ledger-view">
          <div className="ledger-filter">
            <LedgerIcon />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("git.filter-placeholder")} />
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
                    <button className="ledger-row" onClick={() => setExpanded(isOpen ? null : rowId)}>
                      <span className="ledger-time">{timeKey(entry.ts)}</span>
                      <span>{entry.provider ?? t("common.agent")}</span>
                      <span className="ledger-prompt">{entry.promptExcerpt || entry.threadTitle || t("git.agent-turn")}</span>
                      <span>{formatCost(entry.usage?.cost)}</span>
                      <span>{t("git.files-count", { count: entry.filesChanged?.length ?? 0 })}</span>
                    </button>
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
                        <button
                          className="ghost"
                          onClick={() => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: entry.threadId } }))}
                        >
                          {t("action.open-chat")}
                        </button>
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
