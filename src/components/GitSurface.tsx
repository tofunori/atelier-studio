import { useEffect, useMemo, useState } from "react";
import { BranchIcon, LedgerIcon, RefreshIcon } from "./icons";

type GitFile = { path: string; status: string; originalPath?: string };
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

function isStaged(file: GitFile) {
  return file.status !== "?" && file.status[0] !== ".";
}

function formatCost(cost?: number | null) {
  if (cost == null) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function dayKey(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Date inconnue";
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
    window.addEventListener("git-status", onStatus);
    window.addEventListener("git-diff", onDiff);
    window.addEventListener("commit-msg", onMsg);
    window.addEventListener("ledger", onLedger);
    window.addEventListener("git-changed", onChanged);
    return () => {
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

  return (
    <div className="git-surface">
      <div className="git-head">
        <div className="git-title">
          <BranchIcon size={14} />
          <span>{status?.branch ?? "repo"}</span>
          <span className="git-muted">{files.length} fichier{files.length > 1 ? "s" : ""}</span>
        </div>
        <div className="seg">
          <button className={mode === "git" ? "on" : ""} onClick={() => setMode("git")}>Git</button>
          <button className={mode === "journal" ? "on" : ""} onClick={() => setMode("journal")}>Journal</button>
        </div>
        <button className="ghost git-icon-btn" title="Rafraîchir" onClick={mode === "git" ? refreshGit : refreshLedger}>
          <RefreshIcon />
        </button>
        <button
          className={`ghost git-undo ${undoArmed ? "danger" : ""}`}
          disabled={!activeThreadId}
          onClick={() => {
            if (!activeThreadId) return;
            if (!undoArmed) {
              setUndoArmed(true);
              return;
            }
            setUndoArmed(false);
            send(ws, { type: "gitUndoLastTurn", threadId: activeThreadId });
          }}
        >
          {undoArmed ? "Confirmer l'annulation" : "Annuler le dernier tour d'agent"}
        </button>
      </div>

      {mode === "git" ? (
        <>
          <div className="git-files">
            {files.length === 0 && <div className="git-empty">Aucune modification.</div>}
            {files.map((file) => (
              <div key={file.path} className="git-file">
                <button className="git-file-row" onClick={() => selectFile(file.path)}>
                  <span className={`git-status s-${shortStatus(file).replace("??", "untracked")}`}>
                    {shortStatus(file)}
                  </span>
                  <span className="git-path">{file.path}</span>
                </button>
                <div className="git-file-actions">
                  <button className="ghost" onClick={() => send(ws, { type: "gitStage", projectRoot, path: file.path })}>
                    Stage
                  </button>
                  <button className="ghost" disabled={!isStaged(file)} onClick={() => send(ws, { type: "gitUnstage", projectRoot, path: file.path })}>
                    Unstage
                  </button>
                  <button
                    className={`ghost ${restorePath === file.path ? "danger" : ""}`}
                    onClick={() => {
                      if (restorePath !== file.path) {
                        setRestorePath(file.path);
                        return;
                      }
                      setRestorePath(null);
                      send(ws, { type: "gitRevertFile", projectRoot, path: file.path });
                    }}
                  >
                    {restorePath === file.path ? "Confirmer" : "Restaurer"}
                  </button>
                </div>
                {selected === file.path && (
                  <pre className="git-diff">
                    {diff ? diff.split("\n").map((line, i) => (
                      <span key={`${i}-${line}`} className={diffClass(line)}>{line || " "}</span>
                    )) : <span className="git-muted">Diff vide.</span>}
                  </pre>
                )}
              </div>
            ))}
          </div>
          <div className="git-commit">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Message de commit"
            />
            <button
              className="ghost"
              disabled={generating || files.length === 0}
              onClick={() => {
                setGenerating(true);
                send(ws, { type: "generateCommitMsg", projectRoot });
              }}
            >
              {generating ? "..." : "Message par l'agent"}
            </button>
            <button
              className="set-btn"
              disabled={!commitMsg.trim()}
              onClick={() => send(ws, { type: "gitCommit", projectRoot, message: commitMsg.trim() })}
            >
              Commit
            </button>
          </div>
        </>
      ) : (
        <div className="ledger-view">
          <div className="ledger-filter">
            <LedgerIcon />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer le journal" />
          </div>
          {grouped.length === 0 && <div className="git-empty">Aucune entrée.</div>}
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
                      <span>{entry.provider ?? "agent"}</span>
                      <span className="ledger-prompt">{entry.promptExcerpt || entry.threadTitle || "Tour agent"}</span>
                      <span>{formatCost(entry.usage?.cost)}</span>
                      <span>{entry.filesChanged?.length ?? 0} fichiers</span>
                    </button>
                    {isOpen && (
                      <div className="ledger-detail">
                        <div className="ledger-detail-row">
                          <span>Fichiers</span>
                          <span>{entry.filesChanged?.join(", ") || "—"}</span>
                        </div>
                        <div className="ledger-detail-row">
                          <span>Outils</span>
                          <span>{entry.tools?.map((tool) => tool.name).filter(Boolean).join(", ") || "—"}</span>
                        </div>
                        <button
                          className="ghost"
                          onClick={() => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: entry.threadId } }))}
                        >
                          Ouvrir le chat
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
