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

type GitGroup = "staged" | "changes" | "untracked";
function fileGroups(f: GitFile): GitGroup[] {
  if (f.status === "?" || f.status === "!") return ["untracked"];
  const gs: GitGroup[] = [];
  if (f.status[0] && f.status[0] !== ".") gs.push("staged");
  if (f.status[1] && f.status[1] !== ".") gs.push("changes");
  return gs.length ? gs : ["changes"];
}

/** Diff unifié → rangées 2 colonnes (suppressions appariées aux ajouts). */
function splitRows(diff: string): { l: string; r: string; lc: string; rc: string }[] {
  const rows: { l: string; r: string; lc: string; rc: string }[] = [];
  const lines = diff.split("\n");
  let dels: string[] = [], adds: string[] = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) rows.push({
      l: dels[i] ?? "", lc: dels[i] != null ? "del" : "void",
      r: adds[i] ?? "", rc: adds[i] != null ? "add" : "void",
    });
    dels = []; adds = [];
  };
  for (const line of lines) {
    if (/^(diff |index |--- |\+\+\+ )/.test(line)) continue;
    if (line.startsWith("@@")) { flush(); rows.push({ l: line, r: line, lc: "hunk", rc: "hunk" }); continue; }
    if (line.startsWith("-")) { dels.push(line.slice(1)); continue; }
    if (line.startsWith("+")) { adds.push(line.slice(1)); continue; }
    flush();
    rows.push({ l: line.slice(1) || " ", r: line.slice(1) || " ", lc: "ctx", rc: "ctx" });
  }
  flush();
  return rows;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [splitView, setSplitView] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [syncBusy, setSyncBusy] = useState<"push" | "pull" | null>(null);
  const [syncNote, setSyncNote] = useState("");
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
        if (msg.type === "gitUndoLastTurnDone") {
          setSyncNote(t("git.undo-done"));
          window.setTimeout(() => setSyncNote(""), 6000);
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
      if (msg.projectRoot === projectRoot) setCommitError(msg.message ?? null);
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
        {status && (
          <span className="git-sync-ctl">
            <button className="ghost git-icon-btn" disabled={syncBusy != null || !status.ahead}
              title={t("git.push")} onClick={() => { setSyncBusy("push"); send(ws, { type: "gitPush", projectRoot }); }}>
              {syncBusy === "push" ? "…" : `↑${status.ahead || ""}`}
            </button>
            <button className="ghost git-icon-btn" disabled={syncBusy != null || !status.behind}
              title={t("git.pull")} onClick={() => { setSyncBusy("pull"); send(ws, { type: "gitPull", projectRoot }); }}>
              {syncBusy === "pull" ? "…" : `↓${status.behind || ""}`}
            </button>
          </span>
        )}
        <span className="git-headmenu-wrap" onClick={(e) => e.stopPropagation()}>
          <button className="ghost git-icon-btn" title={t("project.actions")} aria-label={t("project.actions")} onClick={() => { setHeadMenu((v) => !v); setUndoArmed(false); }}>
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
            {syncNote && <div className="git-syncnote">{syncNote}</div>}
            {files.length === 0 && <div className="git-empty">{t("git.empty")}</div>}
            {(["staged", "changes", "untracked"] as GitGroup[]).map((grp) => {
              const inGrp = files.filter((f) => fileGroups(f).includes(grp));
              if (!inGrp.length) return null;
              const closed = closedGroups.has(grp);
              return (
                <div key={grp} className="git-group">
                  <button className="git-group-h" onClick={() => setClosedGroups((s) => {
                    const n = new Set(s); if (n.has(grp)) n.delete(grp); else n.add(grp); return n;
                  })}>
                    <span className="chev">{closed ? "▸" : "▾"}</span>
                    <span>{t(`git.group-${grp}` as any)}</span>
                    <span className="git-group-n">{inGrp.length}</span>
                  </button>
                  {!closed && inGrp.map((file) => (
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
                    <span className={`git-status s-${shortStatus(file).replace("U", "untracked")}`}>
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
                        <div className="mp-item" onClick={() => {
                          setMenuPath(null);
                          send(ws, { type: "gitIgnore", projectRoot, pattern: file.path });
                        }}>
                          <span>{t("git.ignore-file")}</span>
                        </div>
                        {file.path.includes("/") && (
                          <div className="mp-item" onClick={() => {
                            setMenuPath(null);
                            send(ws, { type: "gitIgnore", projectRoot, pattern: file.path.split("/")[0] + "/" });
                          }}>
                            <span>{t("git.ignore-dir", { dir: file.path.split("/")[0] + "/" })}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </span>
                </div>
                {selected === file.path && (
                  <div className="git-diff-wrap">
                    <div className="git-diff-bar">
                      <span className="seg seg-mini">
                        <button className={!splitView ? "on" : ""} onClick={() => setSplitView(false)}>{t("git.unified")}</button>
                        <button className={splitView ? "on" : ""} onClick={() => setSplitView(true)}>{t("git.split")}</button>
                      </span>
                    </div>
                    {!diff ? <pre className="git-diff"><span className="git-muted">{t("git.diff-empty")}</span></pre>
                    : !splitView ? (
                      <pre className="git-diff">
                        {diff.split("\n").map((line, i) => (
                          <span key={`${i}-${line}`} className={diffClass(line)}>{line || " "}</span>
                        ))}
                      </pre>
                    ) : (
                      <div className="git-diff-split">
                        {splitRows(diff).map((r, i) => (
                          <div key={i} className="gds-row">
                            <span className={`gds-cell ${r.lc}`}>{r.l || " "}</span>
                            <span className={`gds-cell ${r.rc}`}>{r.r || " "}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
                  ))}
                </div>
              );
            })}
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
                {generating ? "…" : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2.2l1.2 3.4 3.4 1.2-3.4 1.2L8 11.4 6.8 8 3.4 6.8 6.8 5.6z" />
                    <path d="M12.8 10.6l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z" />
                  </svg>
                )}
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
