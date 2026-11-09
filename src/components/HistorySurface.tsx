// Surface « Historique » (variante A choisie le 2026-11-09) : un seul fil du
// temps pour tout le projet — tours de l'agent, tes séances d'écriture,
// commits, versions nommées, restaurations. Chaque entrée se déplie sur son
// diff, fichier par fichier, avec « Restaurer ce fichier ». « Comparer… »
// montre ce qui a changé entre deux moments quelconques.
// Données : messages `projectHistory*` du runtime (project_history.rs),
// relayés par sidecarRelays sous l'événement fenêtre `project-history`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AtelierDiffView from "./AtelierDiffView";
import { Input } from "./shadcn/input";
import {
  Button, EmptyState, IconButton, Popover, PopoverContent, PopoverTitle, PopoverTrigger, RowButton,
  SegmentedControl, Select, Spinner, showError, showSuccess,
} from "./ui";
import {
  churn, compareSha, entryMeta, entryTitle, filterEntries, formatTime, groupByDay, historyPaths,
  momentLabel, restoreLabel, restoreTarget, strings,
  type HistoryEntry, type HistoryFile, type HistoryFilter, type HistoryRef, type HistoryText,
} from "./history/historyModel";
import "./HistorySurface.css";

/** Écoute les réponses projectHistory* sur la socket (sans relais dans l'entrée). */
function listenHistory(ws: WebSocket | null, handler: (msg: any) => void) {
  if (!ws) return () => {};
  const listener = (event: MessageEvent) => {
    if (typeof event.data !== "string" || !event.data.includes("projectHistory")) return;
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (/^projectHistory/.test(String(msg?.type)) || /^projectHistory/.test(String(msg?.requestType))) handler(msg);
  };
  ws.addEventListener("message", listener);
  return () => ws.removeEventListener("message", listener);
}

type DiffState = { loading: true } | { loading: false; error?: string; before?: HistoryText; after?: HistoryText };

let sequence = 0;
const nextId = () => `h${Date.now().toString(36)}${(sequence++).toString(36)}`;

function svg(path: React.ReactNode, size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
  );
}

const ICONS = {
  turn: svg(<><rect x="3" y="5" width="10" height="7.5" rx="2" /><path d="M8 2.6V5M6.2 8.4v.8M9.8 8.4v.8" /></>),
  edit: svg(<path d="M10.5 3 13 5.5 6 12.5H3.5V10z" />),
  version: svg(<><path d="M3.6 2.4v11.4" /><path d="M3.6 3.2h8.2l-1.8 2.4 1.8 2.4H3.6" /></>),
  commit: svg(<><circle cx="8" cy="8" r="2.4" /><path d="M1.8 8h3.8M10.4 8h3.8" /></>),
  restore: svg(<><path d="M3 4.2v3h3" /><path d="M3.4 7.2A5 5 0 1 1 4.6 11.6" /></>),
};
const FILE_ICON = svg(<><path d="M4 2h5.5L12 4.5V14H4z" /><path d="M9.5 2v2.5H12" /></>);
const COMPARE_ICON = svg(<><path d="M5 2.5v11M11 2.5v11" /><path d="M2.8 5 5 2.8 7.2 5M8.8 11 11 13.2 13.2 11" /></>);
const REFRESH_ICON = svg(<><path d="M13 4.2v3h-3" /><path d="M12.6 7.2A5 5 0 1 0 11.4 11.6" /></>);
const CHAT_ICON = svg(<path d="M3 4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5V11H4a1 1 0 0 1-1-1z" />);
const CHEVRON = svg(<path d="M6.2 4.5 9.7 8l-3.5 3.5" />, 12);

function send(ws: WebSocket | null, message: Record<string, unknown>) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

function Churn({ files }: { files: HistoryFile[] }) {
  const c = churn(files);
  if (!c.known) return null;
  return (
    <span className="hist-churn">
      {c.add > 0 && <span className="hist-add">+{c.add}</span>}
      {c.del > 0 && <span className="hist-del">−{c.del}</span>}
    </span>
  );
}

function DiffBody({ state, path }: { state: DiffState | undefined; path: string }) {
  const s = strings();
  if (!state || state.loading) return <div className="hist-diff-note"><Spinner size={12} />{s.diffLoading}</div>;
  if (state.error) return <div className="hist-diff-note">{state.error === "pruned" ? s.pruned : state.error}</div>;
  const before = state.before, after = state.after;
  if (before?.state === "binary" || after?.state === "binary") return <div className="hist-diff-note">{s.binary}</div>;
  if (before?.state === "large" || after?.state === "large") return <div className="hist-diff-note">{s.large}</div>;
  const b = before?.state === "text" ? before.text : "";
  const a = after?.state === "text" ? after.text : "";
  if (b === a) return <div className="hist-diff-note">{s.noChange}</div>;
  return (
    <>
      {before?.state === "missing" && <div className="hist-diff-note">{s.missingBefore}</div>}
      {after?.state === "missing" && <div className="hist-diff-note">{s.missingAfter}</div>}
      <div className="hist-diff">
        <AtelierDiffView before={b} after={a} path={path} compact />
      </div>
    </>
  );
}

function useDiffs(ws: WebSocket | null, projectRoot: string) {
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({});
  const pending = useRef(new Map<string, string>());
  useEffect(() => {
    const onMessage = (msg: any) => {
      if (msg?.type !== "projectHistoryDiff" && msg?.requestType !== "projectHistoryDiff") return;
      const key = pending.current.get(msg.requestId);
      if (!key) return;
      pending.current.delete(msg.requestId);
      setDiffs((current) => ({
        ...current,
        [key]: { loading: false, error: msg.error ?? msg.message, before: msg.before, after: msg.after },
      }));
    };
    return listenHistory(ws, onMessage);
  }, [ws]);
  const known = useRef(new Set<string>());
  const request = useCallback((key: string, path: string, before: HistoryRef, after: HistoryRef) => {
    if (known.current.has(key)) return;
    const requestId = nextId();
    pending.current.set(requestId, key);
    if (!send(ws, { type: "projectHistoryDiff", projectRoot, requestId, path, before, after })) {
      pending.current.delete(requestId);
      return;
    }
    known.current.add(key);
    setDiffs((current) => ({ ...current, [key]: { loading: true } }));
  }, [projectRoot, ws]);
  const reset = useCallback(() => { pending.current.clear(); known.current.clear(); setDiffs({}); }, []);
  return { diffs, request, reset };
}

function EntryDetail({
  entry, ws, projectRoot, diffs, requestDiff, onOpenFile, onRestore, onRemoveVersion, busy, repo,
}: {
  entry: HistoryEntry;
  ws: WebSocket | null;
  projectRoot: string;
  diffs: Record<string, DiffState>;
  requestDiff: (key: string, path: string, before: HistoryRef, after: HistoryRef) => void;
  onOpenFile: (rel: string) => void;
  onRestore: (entry: HistoryEntry, file: HistoryFile) => void;
  onRemoveVersion: (entry: HistoryEntry) => void;
  busy: boolean;
  repo: boolean;
}) {
  const s = strings();
  const [selected, setSelected] = useState(entry.files[0]?.path ?? "");
  const [againstNow, setAgainstNow] = useState(false);
  const file = entry.files.find((f) => f.path === selected) ?? entry.files[0];
  const key = file ? `${entry.id}|${file.path}|${againstNow ? "now" : "change"}` : "";
  useEffect(() => {
    if (!file || !ws) return;
    if (againstNow) requestDiff(key, file.path, restoreTarget(entry, file), { disk: true });
    else requestDiff(key, file.path, file.before, file.after);
  }, [againstNow, entry, file, key, projectRoot, requestDiff, ws]);
  if (!file) return null;
  return (
    <div className="hist-detail">
      {entry.files.length > 1 && (
        <div className="hist-files" role="listbox" aria-label={s.files(entry.files.length)}>
          {entry.files.map((f) => (
            <RowButton key={f.path} role="option" aria-selected={f.path === file.path} className="hist-file"
              onClick={() => setSelected(f.path)} title={f.path}>
              <span className="hist-file-icon">{FILE_ICON}</span>
              <span className="hist-file-path">{f.path}</span>
              <Churn files={[f]} />
            </RowButton>
          ))}
        </div>
      )}
      <div className="hist-card">
        <div className="hist-card-head">
          <span className="hist-file-icon">{FILE_ICON}</span>
          <span className="hist-card-path" title={file.path}>{file.path}</span>
          {!againstNow && <Churn files={[file]} />}
          {againstNow && <span className="hist-card-note">{s.compareNow}</span>}
        </div>
        <DiffBody state={diffs[key]} path={file.path} />
        <div className="hist-actions">
          {repo && (
            <Button variant="secondary" loading={busy} onClick={() => onRestore(entry, file)}>
              {ICONS.restore}{entry.kind === "restore" ? s.undoRestore : s.restoreFile}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setAgainstNow((v) => !v)}>
            {COMPARE_ICON}{againstNow ? s.thisChange : s.compareNow}
          </Button>
          <Button variant="ghost" onClick={() => onOpenFile(file.path)}>{FILE_ICON}{s.openFile}</Button>
          {entry.kind === "turn" && entry.threadId && (
            <Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: entry.threadId } }))}>
              {CHAT_ICON}{s.openConversation}
            </Button>
          )}
          {entry.kind === "version" && (
            <Button variant="ghost" className="hist-remove" onClick={() => onRemoveVersion(entry)}>{s.removeVersion}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveVersion({ disabled, onSave }: { disabled: boolean; onSave: (name: string) => Promise<boolean> }) {
  const s = strings();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submit = async () => {
    if (!name.trim()) { inputRef.current?.focus(); return; }
    setBusy(true);
    try {
      if (await onSave(name.trim())) { setOpen(false); setName(""); }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) window.setTimeout(() => inputRef.current?.focus(), 0); }}>
      <PopoverTrigger render={<Button variant="secondary" disabled={disabled} />}>
        {ICONS.version}<span>{s.saveVersion}</span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" plain className="hist-pop">
        <PopoverTitle className="hist-pop-title">{s.saveVersion}</PopoverTitle>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="hist-field">
            <span className="hist-label">{s.versionName}</span>
            <Input ref={inputRef} value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
              placeholder={s.versionPlaceholder} aria-label={s.versionName} />
          </label>
          <p className="hist-pop-help">{s.versionHelp}</p>
          <div className="hist-pop-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>{s.cancel}</Button>
            <Button variant="secondary" type="submit" loading={busy} disabled={!name.trim()}>{s.save}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ComparePane({
  ws, projectRoot, entries, diffs, requestDiff,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  entries: HistoryEntry[];
  diffs: Record<string, DiffState>;
  requestDiff: (key: string, path: string, before: HistoryRef, after: HistoryRef) => void;
}) {
  const s = strings();
  const moments = useMemo(() => entries.filter((e) => compareSha(e)), [entries]);
  const [from, setFrom] = useState(() => {
    const first = moments.find((e) => e.kind === "version") ?? moments[0];
    return first ? compareSha(first) ?? "" : "";
  });
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ files: HistoryFile[]; error?: string; loading: boolean } | null>(null);
  const [selected, setSelected] = useState("");
  const requestRef = useRef("");
  useEffect(() => {
    const onMessage = (msg: any) => {
      if (msg?.requestId !== requestRef.current) return;
      if (msg.type !== "projectHistoryCompare" && msg.requestType !== "projectHistoryCompare") return;
      const files: HistoryFile[] = (msg.files ?? []).map((f: { path: string; add: number | null; del: number | null }) => ({
        ...f, before: { git: from }, after: to ? { git: to } : { disk: true },
      }));
      setResult({ files, error: msg.error ?? msg.message, loading: false });
      setSelected(files[0]?.path ?? "");
    };
    return listenHistory(ws, onMessage);
  }, [from, to, ws]);
  useEffect(() => {
    if (!from) return;
    requestRef.current = nextId();
    setResult({ files: [], loading: true });
    send(ws, { type: "projectHistoryCompare", projectRoot, requestId: requestRef.current, from, to: to || null });
  }, [from, projectRoot, to, ws]);
  const file = result?.files.find((f) => f.path === selected);
  const key = file ? `cmp|${from}|${to}|${file.path}` : "";
  useEffect(() => {
    if (file) requestDiff(key, file.path, file.before, file.after);
  }, [file, key, requestDiff]);
  const options = moments.map((e) => ({ value: compareSha(e)!, label: momentLabel(e) }));
  if (!options.length) return <EmptyState title={s.compareHint} />;
  return (
    <div className="hist-compare">
      <div className="hist-compare-bar">
        <span className="hist-label">{s.from}</span>
        <Select value={from} onChange={setFrom} options={options} ariaLabel={s.from} className="hist-moment" />
        <span className="hist-label">{s.to}</span>
        <Select value={to} onChange={setTo} options={[{ value: "", label: s.now }, ...options]} ariaLabel={s.to} className="hist-moment" />
        {result && !result.loading && !result.error && <span className="hist-meta-inline">{s.between(result.files.length)}</span>}
      </div>
      {result?.loading && <div className="hist-diff-note"><Spinner size={12} />{s.diffLoading}</div>}
      {result?.error && <div className="hist-diff-note">{result.error}</div>}
      {result && !result.loading && !result.error && result.files.length === 0 && <div className="hist-diff-note">{s.compareEmpty}</div>}
      {result && result.files.length > 0 && (
        <div className="hist-compare-body">
          <div className="hist-files hist-files--side" role="listbox" aria-label={s.between(result.files.length)}>
            {result.files.map((f) => (
              <RowButton key={f.path} role="option" aria-selected={f.path === selected} className="hist-file"
                onClick={() => setSelected(f.path)} title={f.path}>
                <span className="hist-file-icon">{FILE_ICON}</span>
                <span className="hist-file-path">{f.path}</span>
                <Churn files={[f]} />
              </RowButton>
            ))}
          </div>
          {file && <div className="hist-card hist-card--fill"><DiffBody state={diffs[key]} path={file.path} /></div>}
        </div>
      )}
    </div>
  );
}

type SurfaceProps = {
  ws: WebSocket | null;
  projectRoot: string;
  visible: boolean;
  onOpenFile: (rel: string) => void;
};

// Changer de projet repart d'un état neuf (fil, filtres, diffs en cache).
export default function HistorySurface(props: SurfaceProps) {
  return <ProjectHistory key={props.projectRoot} {...props} />;
}

function ProjectHistory({ ws, projectRoot, visible, onOpenFile }: SurfaceProps) {
  const s = strings();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [repo, setRepo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [path, setPath] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<"timeline" | "compare">("timeline");
  const [busy, setBusy] = useState<string | null>(null);
  const listRequest = useRef("");
  const actions = useRef(new Map<string, (msg: any) => void>());
  const { diffs, request: requestDiff, reset: resetDiffs } = useDiffs(ws, projectRoot);

  const refresh = useCallback(() => {
    if (!projectRoot) return;
    listRequest.current = nextId();
    setLoading(true);
    if (!send(ws, { type: "projectHistory", projectRoot, requestId: listRequest.current })) setLoading(false);
  }, [projectRoot, ws]);

  useEffect(() => {
    const onMessage = (msg: any) => {
      if (!msg || msg.projectRoot && msg.projectRoot !== projectRoot) return;
      const action = actions.current.get(msg.requestId);
      if (action) { actions.current.delete(msg.requestId); action(msg); return; }
      if ((msg.type === "projectHistory" || msg.requestType === "projectHistory") && msg.requestId === listRequest.current) {
        setLoading(false);
        setError(msg.error ?? msg.message ?? "");
        setRepo(msg.repo !== false);
        setEntries(Array.isArray(msg.entries) ? msg.entries : []);
        resetDiffs();
      }
    };
    return listenHistory(ws, onMessage);
  }, [projectRoot, resetDiffs, ws]);

  // Rafraîchi à chaque retour sur l'onglet : le fil suit le travail en cours.
  useEffect(() => { if (visible) refresh(); }, [refresh, visible]);

  const act = useCallback((message: Record<string, unknown>) => new Promise<any>((resolve) => {
    const requestId = nextId();
    actions.current.set(requestId, resolve);
    if (!send(ws, { ...message, projectRoot, requestId })) {
      actions.current.delete(requestId);
      resolve({ ok: false, error: "connexion indisponible" });
    }
  }), [projectRoot, ws]);

  const restore = useCallback(async (entry: HistoryEntry, file: HistoryFile) => {
    setBusy(entry.id);
    const reply = await act({ type: "projectHistoryRestore", path: file.path, ref: restoreTarget(entry, file), label: restoreLabel(entry) });
    setBusy(null);
    if (reply.ok) { showSuccess(s.restored(file.path)); refresh(); }
    else showError(s.restoreFailed(String(reply.error ?? reply.message ?? "")));
  }, [act, refresh, s]);

  const saveVersion = useCallback(async (name: string) => {
    const reply = await act({ type: "projectHistorySaveVersion", name });
    if (reply.ok) { showSuccess(s.versionSaved(name)); refresh(); return true; }
    showError(s.versionFailed(String(reply.error ?? reply.message ?? "")));
    return false;
  }, [act, refresh, s]);

  const removeVersion = useCallback(async (entry: HistoryEntry) => {
    const reply = await act({ type: "projectHistoryDeleteVersion", sha: entry.sha });
    if (reply.ok) refresh();
    else showError(String(reply.error ?? reply.message ?? ""));
  }, [act, refresh]);

  const paths = useMemo(() => historyPaths(entries), [entries]);
  const visibleEntries = useMemo(() => filterEntries(entries, filter, path), [entries, filter, path]);
  const days = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);

  if (!projectRoot) return <div className="hist-surface"><EmptyState title={s.noProject} /></div>;

  return (
    <div className="hist-surface" data-mode={mode}>
      <div className="hist-bar">
        {mode === "timeline" ? (
          <>
            <SegmentedControl
              label={s.filters}
              value={filter}
              onChange={(v) => setFilter(v as HistoryFilter)}
              options={(["all", "versions", "agent", "me", "commits"] as HistoryFilter[]).map((v) => ({ value: v, label: s[v] }))}
            />
            {paths.length > 1 && (
              <Select value={path} onChange={setPath} ariaLabel={s.allFiles} className="hist-path-select"
                options={[{ value: "", label: s.allFiles }, ...paths.map((p) => ({ value: p, label: p }))]} />
            )}
          </>
        ) : null}
        <span className="hist-spacer" />
        <Button variant="ghost" onClick={() => setMode(mode === "timeline" ? "compare" : "timeline")} disabled={!repo}>
          {mode === "timeline" ? <>{COMPARE_ICON}{s.compare}</> : s.timeline}
        </Button>
        <SaveVersion disabled={!repo} onSave={saveVersion} />
        <IconButton label={s.refresh} title={s.refresh} onClick={refresh}>{REFRESH_ICON}</IconButton>
      </div>
      {!repo && <div className="hist-notice">{s.noRepo}</div>}
      {mode === "compare" ? (
        <ComparePane ws={ws} projectRoot={projectRoot} entries={entries} diffs={diffs} requestDiff={requestDiff} />
      ) : (
        <div className="hist-scroll">
          {error && <div className="hist-notice">{error}</div>}
          {loading && entries.length === 0 && <div className="hist-diff-note"><Spinner size={12} />{s.loading}</div>}
          {!loading && !error && visibleEntries.length === 0 && <EmptyState title={s.empty} description={s.emptyHelp} />}
          {days.map(([day, list]) => (
            <section key={day} className="hist-day" aria-label={day}>
              <h3 className="hist-day-title">{day}</h3>
              {list.map((entry) => {
                const open = expanded === entry.id;
                return (
                  <div key={entry.id} className="hist-entry" data-kind={entry.kind} data-open={open || undefined}>
                    <RowButton className="hist-row" aria-expanded={open} onClick={() => setExpanded(open ? null : entry.id)}>
                      <span className="hist-ico" data-kind={entry.kind}>{ICONS[entry.kind]}</span>
                      <span className="hist-text">
                        <span className="hist-title">{entryTitle(entry)}</span>
                        <span className="hist-meta">
                          <span className="hist-meta-text">{entryMeta(entry)}</span>
                          {entry.kind !== "version" && <Churn files={entry.files} />}
                        </span>
                      </span>
                      <span className="hist-when">{formatTime(entry.ts)}</span>
                      <span className="hist-chevron">{CHEVRON}</span>
                    </RowButton>
                    {open && (
                      <EntryDetail entry={entry} ws={ws} projectRoot={projectRoot} diffs={diffs} requestDiff={requestDiff}
                        onOpenFile={onOpenFile} onRestore={restore} onRemoveVersion={removeVersion}
                        busy={busy === entry.id} repo={repo} />
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
