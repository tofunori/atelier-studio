// Surface « Résultats » (variante A validée le 2026-11-10, grille de la
// variante B derrière le bouton en haut à droite) : la bibliothèque de ce que
// le projet a produit — figures, tableaux, PDF — avec, pour chacun, sa
// version, son origine, sa recette, la marque « périmé », une étoile et ses
// liens (« dépend de », « utilisé par »).
// Données : messages `projectResults`, `projectResultDetail` et
// `projectResultStar` du runtime (results.rs), écoutés à même la socket, sans
// relais dans l'entrée. « Comparer » réutilise le diff de l'historique
// (`projectHistoryDiff` + AtelierDiffView), chargé seulement à la demande.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { LazyBoundary, lazyWithRetry } from "./LazyBoundary";
import { localImagePreviewUrl } from "../lib/localImage";
import { Button, EmptyState, IconButton, RowButton, SearchField, SegmentedControl, Spinner, showError, showSuccess } from "./ui";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "./ui/LazyDropdownMenu";
import {
  countByKind, detailMeta, formatDay, formatStamp, originLabel, reproduceDraft, staleSentence, strings, visibleResults,
  type InputState, type ResultBrief, type ResultDetail, type ResultFilter, type ResultKind, type ResultOrigin,
  type ResultSummary, type ResultView,
} from "./results/resultsModel";
import "./ResultsSurface.css";

const AtelierDiffView = lazyWithRetry(() => import("./AtelierDiffView"));

/** Versions montrées avant le repli « n plus anciennes ». */
const VERSIONS_SHOWN = 3;
const VIEW_KEY = "atelier-studio.resultsView";

function svg(path: React.ReactNode, size = 14, stroke = 1.4) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
  );
}

const STAR_PATH = "M8 2.4l1.7 3.5 3.9.5-2.8 2.7.7 3.8L8 11.1l-3.5 1.8.7-3.8-2.8-2.7 3.9-.5z";
const KIND_PATHS: Record<ResultKind, React.ReactNode> = {
  figure: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.8 11.2l3-3 2.2 2.2 1.8-1.8 3.4 3.2" /><circle cx="10.6" cy="6" r=".9" /></>,
  table: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M2.5 9.8h11M6.5 3v10" /></>,
  pdf: <><path d="M4 2h5.5L12 4.5V14H4z" /><path d="M9.5 2v2.5H12M6 8h4M6 10.5h4" /></>,
};
const ORIGIN_PATHS: Record<ResultOrigin["kind"], React.ReactNode> = {
  script: <><path d="M4 2h5.5L12 4.5V14H4z" /><path d="M6.6 8.2 5.3 9.5l1.3 1.3M9.4 8.2l1.3 1.3-1.3 1.3" /></>,
  cell: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M5 6.5 6.8 8 5 9.5M8.5 9.8h2.5" /></>,
  command: <path d="M3.5 5 7 8l-3.5 3M8.5 11.5h4" />,
  turn: <path d="M3 4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5V11H4a1 1 0 0 1-1-1z" />,
};
const WARN_PATH = <><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.4M8 10.8v.1" /></>;
const LIST_ICON = svg(<path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.6 4.5h.1M2.6 8h.1M2.6 11.5h.1" />);
const GRID_ICON = svg(<><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>);
const REPLAY_ICON = svg(<><path d="M3 8a5 5 0 1 0 1.6-3.7" /><path d="M3 3v3h3" /></>, 13);
const MORE_ICON = svg(<><circle cx="3.5" cy="8" r=".7" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r=".7" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r=".7" fill="currentColor" stroke="none" /></>);
const CHEVRON_DOWN = svg(<path d="M4.5 6.2 8 9.7l3.5-3.5" />, 11);
const CHEVRON_RIGHT = svg(<path d="M6.2 4.5 9.7 8l-3.5 3.5" />, 12);

type Send = (message: Record<string, unknown>) => boolean;
type PreviewResolver = (abs: string) => Promise<string>;

let sequence = 0;
const nextId = () => `r${Date.now().toString(36)}${(sequence++).toString(36)}`;

/** Écoute, sur la socket, les réponses des résultats et du diff de l'historique
 *  (« Comparer »). Le filtre textuel évite de décoder le flux du chat. */
function listenResults(ws: WebSocket | null, handler: (msg: any) => void) {
  if (!ws) return () => {};
  const listener = (event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    if (!event.data.includes("projectResult") && !event.data.includes("projectHistoryDiff")) return;
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }
    handler(msg);
  };
  ws.addEventListener("message", listener);
  return () => ws.removeEventListener("message", listener);
}

const isReply = (msg: any, type: string) => msg?.type === type || msg?.requestType === type;

// Aperçus déjà résolus, par fichier et par version : la vignette de la liste
// et l'aperçu du détail partagent la même image. Borné, les plus vieux sortent.
const PREVIEW_CACHE_MAX = 120;
const previews = new Map<string, Promise<string>>();
function preview(abs: string, stamp: number | null, resolve: PreviewResolver): Promise<string> {
  const key = `${abs}|${stamp ?? 0}`;
  let found = previews.get(key);
  if (!found) {
    found = resolve(abs);
    found.catch(() => previews.delete(key));
    previews.set(key, found);
    if (previews.size > PREVIEW_CACHE_MAX) {
      const oldest = previews.keys().next().value as string;
      void previews.get(oldest)?.then((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); }).catch(() => {});
      previews.delete(oldest);
    }
  }
  return found;
}

/** Vrai dès que l'élément est entré une fois à l'écran (vignettes paresseuses). */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSeen(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

function Thumb({ result, root, resolve, size }: {
  result: Pick<ResultSummary, "path" | "kind" | "ts">; root: string; resolve: PreviewResolver; size: "mini" | "card" | "big";
}) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [url, setUrl] = useState<string | null>(null);
  const figure = result.kind === "figure";
  useEffect(() => {
    if (!figure || !seen) return;
    let cancelled = false;
    setUrl(null);
    preview(`${root.replace(/\/$/, "")}/${result.path}`, result.ts, resolve)
      .then((value) => { if (!cancelled) setUrl(value); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [figure, resolve, result.path, result.ts, root, seen]);
  if (figure) {
    return (
      <span ref={ref} className="res-thumb res-paper" data-size={size}>
        {url && <img src={url} alt="" draggable={false} onError={() => setUrl(null)} />}
      </span>
    );
  }
  if (size === "mini") {
    return <span ref={ref} className="res-thumb res-thumb-icon" data-size={size}>{svg(KIND_PATHS[result.kind])}</span>;
  }
  // PDF : une feuille ; tableau : une grille. Pas d'aperçu du contenu.
  return (
    <span ref={ref} className="res-thumb res-thumb-plain" data-size={size}>
      {result.kind === "pdf"
        ? <span className="res-sheet res-paper" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
        : <span className="res-cells" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} />)}</span>}
    </span>
  );
}

function Star({ result, onToggle, className }: { result: ResultSummary; onToggle: (result: ResultSummary) => void; className?: string }) {
  const s = strings();
  const label = result.starred ? s.unstar : s.star;
  return (
    <IconButton size="s" label={label} title={label} aria-pressed={result.starred}
      className={`res-star${className ? ` ${className}` : ""}`} onClick={() => onToggle(result)}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill={result.starred ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={STAR_PATH} /></svg>
    </IconButton>
  );
}

/** Nom de fichier coupable après chaque « _ » (cartes de la grille). */
function breakable(name: string): React.ReactNode {
  return name.split("_").map((part, index) => (index === 0 ? part : [`_`, <wbr key={index} />, part]));
}

function StaleMark() {
  return <span className="res-stale">{svg(WARN_PATH, 12)}{strings().staleMark}</span>;
}

function Origin({ origin, size = 13 }: { origin: ResultOrigin; size?: number }) {
  const label = originLabel(origin);
  return (
    <span className="res-origin" title={origin.path ?? label}>
      {svg(ORIGIN_PATHS[origin.kind], size)}<span>{label}</span>
    </span>
  );
}

const INPUT_LABEL: Record<InputState, "unchanged" | "changed" | "missing" | "unknown"> = {
  unchanged: "unchanged", changed: "changed", missing: "missing", unknown: "unknown",
};

type DiffText = { state: "text"; text: string } | { state: "missing" | "binary" | "large" };
type DiffState = { version: number; loading: boolean; error?: string; before?: DiffText; after?: DiffText };

function CompareBody({ diff, path }: { diff: DiffState; path: string }) {
  const s = strings();
  if (diff.loading) return <div className="res-note"><Spinner size={12} />{s.diffLoading}</div>;
  if (diff.error) return <div className="res-note">{diff.error === "pruned" ? s.pruned : diff.error}</div>;
  const { before, after } = diff;
  if (before?.state === "binary" || after?.state === "binary") return <div className="res-note">{s.binary}</div>;
  if (before?.state === "large" || after?.state === "large") return <div className="res-note">{s.large}</div>;
  const b = before?.state === "text" ? before.text : "";
  const a = after?.state === "text" ? after.text : "";
  if (a === b) return <div className="res-note">{s.noChange}</div>;
  return (
    <div className="res-diff">
      <LazyBoundary fallback={<div className="res-note"><Spinner size={12} />{s.diffLoading}</div>}>
        <AtelierDiffView before={b} after={a} path={path} compact />
      </LazyBoundary>
    </div>
  );
}

function Links({ title, items, onSelect }: { title: string; items: ResultBrief[]; onSelect: (path: string) => void }) {
  return (
    <div className="res-links">
      <h4 className="res-section">{title}</h4>
      {items.length === 0 && <div className="res-link-none">{strings().none}</div>}
      {items.map((item) => (
        <RowButton key={item.path} className="res-link" title={item.path} onClick={() => onSelect(item.path)}>
          <span className="res-link-icon">{svg(KIND_PATHS[item.kind])}</span>
          <span className="res-link-name">{item.name}</span>
          <span className="res-link-version">v{item.version}</span>
        </RowButton>
      ))}
    </div>
  );
}

function Detail({
  ws, summary, detail, loading, error, root, send, resolve, onToggleStar, onSelect, onOpenFile,
}: {
  ws: WebSocket | null;
  summary: ResultSummary;
  detail: ResultDetail | null;
  loading: boolean;
  error: string;
  root: string;
  send: Send;
  resolve: PreviewResolver;
  onToggleStar: (result: ResultSummary) => void;
  onSelect: (path: string) => void;
  onOpenFile: (rel: string) => void;
}) {
  const s = strings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [allVersions, setAllVersions] = useState(false);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const diffRequest = useRef("");
  // Le détail d'un autre résultat (ou d'une autre version) repart replié.
  useEffect(() => { setAllVersions(false); setDiff(null); diffRequest.current = ""; }, [summary.path, summary.version]);

  const head = detail ?? summary;
  const abs = detail?.abs ?? `${root.replace(/\/$/, "")}/${summary.path}`;
  const recipe = detail?.recipe;

  const reproduce = () => {
    if (!detail) return;
    window.dispatchEvent(new CustomEvent("kernel-add-to-chat", { detail: { text: reproduceDraft(detail) } }));
    showSuccess(s.reproduceReady);
  };
  const reveal = () => {
    revealItemInDir(abs).catch((failure) => showError(s.revealFailed(String(failure))));
  };
  const compare = (version: number, ref: { git: string }) => {
    if (!detail?.diffPath) return;
    if (diff?.version === version) { setDiff(null); diffRequest.current = ""; return; }
    const requestId = nextId();
    diffRequest.current = requestId;
    setDiff({ version, loading: true });
    if (!send({ type: "projectHistoryDiff", requestId, path: detail.diffPath, before: ref, after: { disk: true } })) setDiff(null);
  };
  const onDiff = useCallback((msg: any) => {
    if (!isReply(msg, "projectHistoryDiff") || msg.requestId !== diffRequest.current) return;
    setDiff((current) => current && { version: current.version, loading: false, error: msg.error ?? msg.message, before: msg.before, after: msg.after });
  }, []);
  useEffect(() => listenResults(ws, onDiff), [onDiff, ws]);

  const menu: LazyDropdownMenuItem[] = [];
  const scriptPath = recipe?.script?.path;
  if (scriptPath && !scriptPath.startsWith("/")) menu.push({ key: "script", label: s.openScript, onSelect: () => onOpenFile(scriptPath) });
  const threadId = recipe?.threadId;
  if (threadId) {
    menu.push({ key: "thread", label: s.openConversation,
      onSelect: () => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId } })) });
  }
  menu.push({ key: "copy", label: s.copyPath,
    onSelect: () => { void navigator.clipboard?.writeText(abs).then(() => showSuccess(s.pathCopied)).catch(() => {}); } });

  const versions = detail?.versions ?? [];
  const shown = allVersions ? versions : versions.slice(0, VERSIONS_SHOWN);
  const lost = detail ? Math.max(0, detail.versionCount - versions.length) : 0;
  const envName = recipe?.env.name ? `${recipe.env.name}${recipe.env.manager === "pixi" ? " (pixi)" : ""}` : "";
  const envLine = recipe ? [envName, recipe.env.python ? `Python ${recipe.env.python}` : ""].filter(Boolean).join(" · ") : "";
  // Env pixi : l'empreinte du verrou dit tout l'env ; sinon celle de l'instantané des paquets.
  const envSha = recipe ? recipe.env.lock || recipe.env.sha : null;
  const emptyRecipe = recipe && !recipe.script && !recipe.command && !recipe.cell && recipe.inputs.length === 0 && !envLine;

  return (
    <aside className="res-detail" aria-label={head.name}>
      <div className="res-preview"><Thumb result={summary} root={root} resolve={resolve} size="big" /></div>
      <div className="res-detail-title">
        <h3 className="res-detail-name" title={head.path}>{head.name}</h3>
        <Star result={summary} onToggle={onToggleStar} />
      </div>
      <div className="res-detail-meta">{detailMeta(head)}</div>
      {head.stale && (
        <div className="res-banner" role="status">
          {svg(WARN_PATH)}
          <span><b>{s.staleLead}</b> {staleSentence(head.stale)}</span>
        </div>
      )}
      <div className="res-actions">
        <Button variant="secondary" disabled={!detail} title={s.reproduceHint} onClick={reproduce}>{REPLAY_ICON}{s.reproduce}</Button>
        <Button variant="ghost" onClick={() => onOpenFile(summary.path)}>{s.open}</Button>
        <Button variant="ghost" onClick={reveal}>{s.reveal}</Button>
        <span className="res-spacer" />
        <LazyDropdownMenu open={menuOpen} onOpenChange={setMenuOpen} align="end" label={s.more} items={menu}
          trigger={<IconButton size="s" label={s.more} title={s.more}>{MORE_ICON}</IconButton>} />
      </div>

      {error && <div className="res-note">{error}</div>}
      {!detail && loading && <div className="res-note"><Spinner size={12} />{s.detailLoading}</div>}
      {recipe && (
        <section aria-label={s.recipe}>
          <h4 className="res-section">{s.recipe}</h4>
          {emptyRecipe && <div className="res-link-none">{s.noRecipe}</div>}
          {recipe.script && (
            <div className="res-kv">
              <span className="res-k">{s.script}</span>
              <div className="res-v"><span className="res-mono">{recipe.script.path}</span>{recipe.script.sha && <span className="res-sha">{recipe.script.sha}</span>}</div>
            </div>
          )}
          {recipe.cell?.id != null && (
            <div className="res-kv">
              <span className="res-k">{s.cellLabel}</span>
              <div className="res-v res-v-wrap">
                <span>{[String(recipe.cell.id), recipe.cell.purpose].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
          )}
          {recipe.command && (
            <div className="res-kv">
              <span className="res-k">{s.command}</span>
              <div className="res-v res-v-wrap"><span className="res-mono">{recipe.command}</span></div>
            </div>
          )}
          {recipe.inputs.length > 0 && (
            <div className="res-kv">
              <span className="res-k">{s.inputs}</span>
              <div className="res-v">
                {recipe.inputs.map((input) => (
                  <div key={input.path} className="res-input" title={input.path}>
                    <span className="res-mono">{input.name}</span>
                    <span className="res-sha">{input.sha ?? ""}</span>
                    <span className="res-input-state" data-state={input.state}>{s[INPUT_LABEL[input.state]]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {envLine && (
            <div className="res-kv">
              <span className="res-k">{s.environment}</span>
              <div className="res-v"><span>{envLine}</span>{envSha && <span className="res-sha">{envSha}</span>}</div>
            </div>
          )}
        </section>
      )}

      {detail && (
        <section aria-label={s.versions}>
          <h4 className="res-section">{s.versions}<span className="res-section-count">{detail.versionCount}</span></h4>
          {shown.map((version) => (
            <div key={version.version} className="res-version" data-current={version.current || undefined}>
              <span className="res-version-number">v{version.version}</span>
              <span className="res-version-date">{formatStamp(version.ts)}</span>
              <span className="res-spacer" />
              {version.current
                ? <span className="res-version-note">{s.current}</span>
                : version.compare && detail.diffPath && (
                  <RowButton className="res-version-compare" aria-expanded={diff?.version === version.version}
                    onClick={() => compare(version.version, version.compare!)}>
                    {diff?.version === version.version ? s.closeCompare : s.compare}
                  </RowButton>
                )}
            </div>
          ))}
          {!allVersions && versions.length > VERSIONS_SHOWN && (
            <RowButton className="res-version-more" onClick={() => setAllVersions(true)}>
              {CHEVRON_RIGHT}{s.older(versions.length - VERSIONS_SHOWN)}
            </RowButton>
          )}
          {(allVersions || versions.length <= VERSIONS_SHOWN) && lost > 0 && <div className="res-link-none">{s.versionsLost(lost)}</div>}
          {diff && detail.diffPath && (
            <div className="res-compare">
              <div className="res-compare-head">{s.compareTitle(diff.version)}</div>
              <CompareBody diff={diff} path={detail.diffPath} />
            </div>
          )}
        </section>
      )}

      {detail && (
        <div className="res-columns">
          <Links title={s.dependsOn} items={detail.dependsOn} onSelect={onSelect} />
          <Links title={s.usedBy} items={detail.usedBy} onSelect={onSelect} />
        </div>
      )}
    </aside>
  );
}

type SurfaceProps = {
  ws: WebSocket | null;
  projectRoot: string;
  visible: boolean;
  onOpenFile: (rel: string) => void;
  /** Résolution d'un aperçu d'image (bancs et tests) ; par défaut, lecture locale. */
  previewUrl?: PreviewResolver;
};

// Changer de projet repart d'un état neuf (liste, sélection, filtres).
export default function ResultsSurface(props: SurfaceProps) {
  return <ProjectResults key={props.projectRoot} {...props} />;
}

function storedView(): ResultView {
  try { return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list"; } catch { return "list"; }
}

function ProjectResults({ ws, projectRoot, visible, onOpenFile, previewUrl = localImagePreviewUrl }: SurfaceProps) {
  const s = strings();
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recipes, setRecipes] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [view, setView] = useState<ResultView>(storedView);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResultDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const listRequest = useRef("");
  const detailRequest = useRef("");
  const starRequests = useRef(new Map<string, { path: string; previous: boolean }>());

  const send = useCallback<Send>((message) => {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ projectRoot, ...message }));
    return true;
  }, [projectRoot, ws]);

  const refresh = useCallback(() => {
    if (!projectRoot) return;
    listRequest.current = nextId();
    setLoading(true);
    if (!send({ type: "projectResults", requestId: listRequest.current })) setLoading(false);
  }, [projectRoot, send]);

  const setStar = useCallback((path: string, starred: boolean) => {
    setResults((current) => current.map((r) => (r.path === path ? { ...r, starred } : r)));
    setDetail((current) => (current && current.path === path ? { ...current, starred } : current));
  }, []);

  useEffect(() => listenResults(ws, (msg) => {
    if (!msg || (msg.projectRoot && msg.projectRoot !== projectRoot)) return;
    if (isReply(msg, "projectResults") && msg.requestId === listRequest.current) {
      setLoading(false);
      setLoaded(true);
      setError(String(msg.error ?? msg.message ?? ""));
      setRecipes(msg.recipes !== false);
      setTruncated(msg.truncated === true);
      setResults(Array.isArray(msg.results) ? msg.results : []);
      return;
    }
    if (isReply(msg, "projectResultDetail") && msg.requestId === detailRequest.current) {
      setDetailLoading(false);
      setDetailError(msg.result ? "" : String(msg.error ?? msg.message ?? ""));
      if (msg.result) setDetail(msg.result);
      return;
    }
    if (isReply(msg, "projectResultStarred")) {
      const pending = starRequests.current.get(msg.requestId);
      if (!pending) return;
      starRequests.current.delete(msg.requestId);
      if (msg.ok === true) return;
      // L'étoile n'a pas été écrite : l'écran revient à l'état du disque.
      setStar(pending.path, pending.previous);
      showError(s.starFailed(String(msg.error ?? msg.message ?? "")));
    }
  }), [projectRoot, s, setStar, ws]);

  // Rafraîchi à chaque retour sur l'onglet : la liste suit le travail en cours.
  useEffect(() => { if (visible) refresh(); }, [refresh, visible]);

  const counts = useMemo(() => countByKind(results), [results]);
  const staleCount = useMemo(() => results.filter((r) => r.stale).length, [results]);
  const shown = useMemo(() => visibleResults(results, filter, query, newestFirst), [results, filter, query, newestFirst]);
  const current = useMemo(
    () => shown.find((r) => r.path === selected) ?? results.find((r) => r.path === selected) ?? shown[0] ?? null,
    [results, selected, shown],
  );
  const currentPath = current?.path ?? null;
  const currentVersion = current?.version ?? 0;
  const currentStale = current?.stale ? `${current.stale.input}|${current.stale.changedAt}|${current.stale.count}` : "";

  // Le détail suit la sélection, et se recharge quand la version ou l'état
  // « périmé » du résultat choisi a changé dans la liste.
  useEffect(() => {
    if (!currentPath) { setDetail(null); return; }
    detailRequest.current = nextId();
    setDetailError("");
    setDetailLoading(true);
    setDetail((previous) => (previous?.path === currentPath ? previous : null));
    if (!send({ type: "projectResultDetail", requestId: detailRequest.current, path: currentPath })) setDetailLoading(false);
  }, [currentPath, currentStale, currentVersion, send]);

  const toggleStar = useCallback((result: ResultSummary) => {
    const requestId = nextId();
    const starred = !result.starred;
    setStar(result.path, starred);
    starRequests.current.set(requestId, { path: result.path, previous: result.starred });
    if (!send({ type: "projectResultStar", requestId, path: result.path, starred })) {
      starRequests.current.delete(requestId);
      setStar(result.path, result.starred);
    }
  }, [send, setStar]);

  const changeView = (next: string) => {
    const value: ResultView = next === "grid" ? "grid" : "list";
    setView(value);
    try { localStorage.setItem(VIEW_KEY, value); } catch { /* préférence non mémorisée */ }
  };
  const turnRecipesOn = () => {
    window.dispatchEvent(new CustomEvent("results-recipes-on"));
    setRecipes(true);
  };
  // Un lien « dépend de » peut pointer hors du filtre en cours : on le lève.
  const select = useCallback((path: string) => {
    setSelected(path);
    setFilter((active) => (active === "all" || results.find((r) => r.path === path)?.kind === active ? active : "all"));
    setQuery("");
  }, [results]);

  if (!projectRoot) return <div className="res-surface"><EmptyState title={s.noProject} /></div>;

  const filterLabel = (key: ResultFilter) => (key === "all"
    ? s.all
    : <>{s[key]}<span className="res-filter-count">{counts[key]}</span></>);
  const empty = loaded && !error && results.length === 0;

  return (
    <div className="res-surface" data-view={view}>
      <header className="res-head">
        <h2 className="res-title">{s.title}</h2>
        {results.length > 0 && (
          <span className="res-count">{[s.count(results.length), staleCount ? s.staleCount(staleCount) : ""].filter(Boolean).join(" · ")}</span>
        )}
        <span className="res-spacer" />
        {/* Filtres, recherche et bascule n'ont de sens que s'il y a des résultats. */}
        {results.length > 0 && (
          <>
            <SegmentedControl className="res-seg" label={s.filters} value={filter} onChange={(v) => setFilter(v as ResultFilter)}
              options={(["all", "figure", "table", "pdf"] as ResultFilter[]).map((key) => ({ value: key, label: filterLabel(key), ariaLabel: key === "all" ? s.all : s[key] }))} />
            <SearchField className="res-search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={s.search} aria-label={s.search} />
            <SegmentedControl className="res-seg" label={s.view} value={view} onChange={changeView}
              options={[
                { value: "list", label: LIST_ICON, ariaLabel: s.list, title: s.list },
                { value: "grid", label: GRID_ICON, ariaLabel: s.grid, title: s.grid },
              ]} />
          </>
        )}
      </header>
      {error && <div className="res-notice">{error}</div>}
      {truncated && <div className="res-notice">{s.truncated}</div>}
      {!recipes && results.length > 0 && (
        <div className="res-notice">
          <span>{s.recipesOffNotice}</span>
          <Button variant="secondary" size="sm" onClick={turnRecipesOn}>{s.turnOn}</Button>
        </div>
      )}
      {!loaded && loading && <div className="res-note res-note-pad"><Spinner size={12} />{s.loading}</div>}
      {empty && (
        <EmptyState title={s.emptyTitle} description={recipes ? s.emptyOn : s.emptyOff}
          actions={recipes ? undefined : <Button variant="secondary" onClick={turnRecipesOn}>{s.turnOn}</Button>} />
      )}
      {results.length > 0 && (
        <div className="res-body">
          <div className="res-main">
            {shown.length === 0 && <div className="res-note res-note-pad">{s.noMatch}</div>}
            {shown.length > 0 && view === "list" && (
              <div className="res-list">
                <div className="res-list-head">
                  <span />
                  <span>{s.name}</span>
                  <span>{s.origin}</span>
                  <RowButton className="res-sort" data-reversed={!newestFirst || undefined}
                    title={newestFirst ? s.sortNewest : s.sortOldest} onClick={() => setNewestFirst((v) => !v)}>
                    {s.modified}{CHEVRON_DOWN}
                  </RowButton>
                </div>
                {shown.map((result) => (
                  <div key={result.path} className="res-row" data-selected={result.path === currentPath || undefined}>
                    <RowButton className="res-row-main" aria-current={result.path === currentPath ? "true" : undefined}
                      title={result.path} onClick={() => setSelected(result.path)}>
                      <Thumb result={result} root={projectRoot} resolve={previewUrl} size="mini" />
                      <span className="res-name"><span className="res-name-text">{result.name}</span><span className="res-version-tag">v{result.version}</span></span>
                      <Origin origin={result.origin} />
                      <span className="res-date">{formatStamp(result.ts)}</span>
                      <span className="res-row-stale">{result.stale && <StaleMark />}</span>
                    </RowButton>
                    <Star result={result} onToggle={toggleStar} />
                  </div>
                ))}
              </div>
            )}
            {shown.length > 0 && view === "grid" && (
              <div className="res-grid">
                {shown.map((result) => (
                  <div key={result.path} className="res-card" data-selected={result.path === currentPath || undefined}>
                    <RowButton className="res-card-main" aria-current={result.path === currentPath ? "true" : undefined}
                      title={result.path} onClick={() => setSelected(result.path)}>
                      <Thumb result={result} root={projectRoot} resolve={previewUrl} size="card" />
                      <span className="res-card-name">{breakable(result.name)}</span>
                      <span className="res-card-line"><Origin origin={result.origin} size={12} /></span>
                      <span className="res-card-line">
                        <span>v{result.version}{result.ts != null ? ` · ${formatDay(result.ts)}` : ""}</span>
                        {result.stale && <StaleMark />}
                      </span>
                    </RowButton>
                    <Star result={result} onToggle={toggleStar} className="res-card-star" />
                  </div>
                ))}
              </div>
            )}
          </div>
          {current && (
            <Detail ws={ws} summary={current} detail={detail?.path === current.path ? detail : null} loading={detailLoading}
              error={detailError} root={projectRoot} send={send} resolve={previewUrl}
              onToggleStar={toggleStar} onSelect={select} onOpenFile={onOpenFile} />
          )}
        </div>
      )}
    </div>
  );
}
