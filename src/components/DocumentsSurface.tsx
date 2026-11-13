// Surface Documents : un traitement de texte .docx autonome. À gauche, les
// documents du projet (récents d'abord) et « Nouveau » ; à droite, les
// documents ouverts en onglets, chacun dans le panneau .docx de la galerie
// (docx_studio.html : suivis signés, commentaires, pages comme dans Word).
// Les fichiers sont créés par le serveur galerie (POST /docx/new, en Rust).
// Un seul panneau à gauche, sous l'icône des onglets (⌘\) : Documents (ici),
// Plan et Commentaires (dessinés par le document ouvert, même place, même
// largeur), comme un seul panneau à trois onglets.
// Les dossiers rattachés au projet (réglages du projet) sont listés aussi :
// chacun a son serveur galerie, démarré comme pour sa galerie, et ses
// documents s'y ouvrent par chemin absolu (comme openSourceFile d'App).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../lib/i18n";
import type { ProjectFolder } from "../lib/projectFolders";
import { shortDate } from "./documentsDate";
import { CloseIcon, PlusIcon, SearchIcon, SidebarIcon } from "./icons";
import { Input } from "./shadcn/input";
import { Button, EmptyState, IconButton, Popover, PopoverContent, PopoverTitle, PopoverTrigger, RowButton, SegmentedControl, Select, showError } from "./ui";
import "./DocumentsSurface.css";

import { FileIcon } from "lucide-react";
type DocEntry = { path: string; mtime: number; changes: number };
/** Un serveur galerie : celui du projet (`root` absent) ou d'un dossier rattaché. */
type Source = { root?: string; name?: string; url: string };
type Template = "blank" | "article" | "copy";
/** Onglet du panneau de gauche. */
type PanelTab = "docs" | "plan" | "com";

const MAX_RECENT = 6;
const NO_FOLDERS: ProjectFolder[] = [];
const LIST_HIDDEN_KEY = "atelier-studio.documents.list-hidden";
const PANEL_TAB_KEY = "atelier-studio.documents.panel-tab";

function storageKey(kind: "recent" | "tabs", projectRoot: string) {
  return `atelier-studio.documents.${kind}:${projectRoot}`;
}

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch { /* stockage indisponible : la liste ne survivra pas à la session */ }
}

function baseName(path: string) {
  return path.split("/").pop() || path;
}

function folderOf(path: string) {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

/** Dossier rattaché qui contient `path` (chemin absolu), le plus profond d'abord. */
function sourceOf(path: string, sources: Source[]): Source | null {
  if (!path.startsWith("/")) return sources.find((s) => !s.root) ?? null;
  return sources
    .filter((s) => s.root && path.startsWith(s.root === "/" ? "/" : `${s.root}/`))
    .sort((a, b) => (b.root?.length ?? 0) - (a.root?.length ?? 0))[0] ?? null;
}

/** Dossier affiché sous le nom : relatif au projet, ou « dossier rattaché/… ». */
function whereOf(path: string, sources: Source[]) {
  const source = path.startsWith("/") ? sourceOf(path, sources) : null;
  if (!source?.root) return folderOf(path);
  const rel = path.slice(source.root === "/" ? 1 : source.root.length + 1);
  return [source.name || baseName(source.root), folderOf(rel)].filter(Boolean).join("/");
}

function frameUrl(galleryUrl: string, path: string): string | null {
  try {
    const base = new URL(galleryUrl);
    const url = new URL(`${base.origin}/.fig_thumbs/docx_studio.html`);
    url.searchParams.set("path", path);
    // Plan et commentaires suivent le panneau de la surface (un seul panneau).
    url.searchParams.set("panel", "host");
    // Le nonce (dans le fragment) authentifie les messages de l'iframe.
    url.hash = base.hash;
    return url.toString();
  } catch {
    return null;
  }
}

const FILE_ICON = (
  <FileIcon size={14} />
);

export default function DocumentsSurface({
  galleryUrl,
  projectRoot,
  folders = NO_FOLDERS,
  galleryDir,
  galleryExts,
  visible = true,
}: {
  galleryUrl?: string;
  projectRoot: string;
  /** dossiers rattachés au projet (normalizeProjectFolders) */
  folders?: ProjectFolder[];
  galleryDir?: string;
  galleryExts?: string;
  visible?: boolean;
}) {
  const origin = useMemo(() => {
    try { return galleryUrl ? new URL(galleryUrl).origin : null; } catch { return null; }
  }, [galleryUrl]);
  // Serveur de chaque dossier rattaché, démarré quand la surface se montre.
  // App rend un nouveau tableau `folders` à chaque rendu : la clé JSON le
  // stabilise.
  const foldersJson = JSON.stringify(folders.filter((f) => f.path !== projectRoot).map((f) => ({ path: f.path, name: f.name })));
  const linked = useMemo(() => JSON.parse(foldersJson) as { path: string; name: string }[], [foldersJson]);
  const [folderUrls, setFolderUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!visible || !linked.length) return;
    let alive = true;
    for (const folder of linked) {
      void invoke<string>("start_atelier", { root: folder.path, galleryDir: galleryDir || "", galleryExts: galleryExts || "" })
        .then((url) => { if (alive) setFolderUrls((cur) => (cur[folder.path] === url ? cur : { ...cur, [folder.path]: url })); })
        .catch(() => { /* dossier absent ou serveur en échec : ses documents ne sont pas listés */ });
    }
    return () => { alive = false; };
  }, [visible, linked, galleryDir, galleryExts]);
  const sources = useMemo<Source[]>(() => {
    // Le nonce de l'app (fragment de l'URL du projet) vaut pour tous ses serveurs.
    const nonce = (() => { try { return galleryUrl ? new URL(galleryUrl).hash : ""; } catch { return ""; } })();
    const withNonce = (url: string) => { try { const u = new URL(url); u.hash = nonce; return u.toString(); } catch { return url; } };
    return [
      ...(galleryUrl ? [{ url: galleryUrl }] : []),
      ...linked.filter((f) => folderUrls[f.path]).map((f) => ({ root: f.path, name: f.name, url: withNonce(folderUrls[f.path]) })),
    ];
  }, [galleryUrl, linked, folderUrls]);
  const origins = useMemo(() => new Set(sources.map((s) => { try { return new URL(s.url).origin; } catch { return ""; } })), [sources]);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readList(storageKey("recent", projectRoot)));
  const [tabs, setTabs] = useState<string[]>(() => readList(storageKey("tabs", projectRoot)));
  const [active, setActive] = useState<string | null>(() => readList(storageKey("tabs", projectRoot))[0] ?? null);

  // Panneau masquable (bouton à gauche des onglets, ⌘\ ici comme dans le
  // document), à trois onglets : Documents, Plan, Commentaires.
  const [listHidden, setListHidden] = useState(() => {
    try { return localStorage.getItem(LIST_HIDDEN_KEY) === "1"; } catch { return false; }
  });
  const toggleList = useCallback(() => {
    const next = !listHidden;
    setListHidden(next);
    try { localStorage.setItem(LIST_HIDDEN_KEY, next ? "1" : "0"); } catch { /* vaut pour cette session */ }
  }, [listHidden]);
  const [panelTab, setPanelTabState] = useState<PanelTab>(() => {
    try { const v = localStorage.getItem(PANEL_TAB_KEY); return v === "plan" || v === "com" ? v : "docs"; } catch { return "docs"; }
  });
  const setPanelTab = useCallback((next: PanelTab) => {
    setPanelTabState(next);
    try { localStorage.setItem(PANEL_TAB_KEY, next); } catch { /* vaut pour cette session */ }
  }, []);
  // Commentaires ouverts du document actif (compte envoyé par son iframe).
  const [comments, setComments] = useState<Record<string, number>>({});
  const framesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "\\") { e.preventDefault(); toggleList(); }
    };
    // Le raccourci tapé dans un document arrive de son iframe, comme ses
    // choix d'onglet et son compte de commentaires.
    const onMessage = (e: MessageEvent) => {
      const type = e.data?.type;
      if (!origins.has(e.origin) || typeof type !== "string" || !type.startsWith("atelier-docs-")) return;
      const frame = Array.from(framesRef.current?.querySelectorAll("iframe") ?? []).find((f) => f.contentWindow === e.source);
      if (!frame) return;
      if (type === "atelier-docs-toggle-list") toggleList();
      else if (type === "atelier-docs-panel-tab") {
        const tab = e.data.tab;
        if (tab === "docs" || tab === "plan" || tab === "com") setPanelTab(tab);
      } else if (type === "atelier-docs-panel-count" && typeof e.data.comments === "number") {
        const path = frame.dataset.path || "";
        setComments((cur) => (cur[path] === e.data.comments ? cur : { ...cur, [path]: e.data.comments }));
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("message", onMessage); };
  }, [visible, origins, toggleList, setPanelTab]);

  // Changement de projet : ses propres récents et onglets.
  const lastRoot = useRef(projectRoot);
  useEffect(() => {
    if (lastRoot.current === projectRoot) return;
    lastRoot.current = projectRoot;
    const nextTabs = readList(storageKey("tabs", projectRoot));
    setRecent(readList(storageKey("recent", projectRoot)));
    setTabs(nextTabs);
    setActive(nextTabs[0] ?? null);
  }, [projectRoot]);

  const refresh = useCallback(async () => {
    if (!sources.length) return;
    const lists = await Promise.all(sources.map(async (source) => {
      try {
        const res = await fetch(`${new URL(source.url).origin}/docx/list`);
        if (!res.ok) throw new Error(`docx/list ${res.status}`);
        const data = await res.json() as { documents?: DocEntry[] };
        const found = Array.isArray(data.documents) ? data.documents : [];
        // Documents d'un dossier rattaché : chemin absolu, ouvert par son serveur.
        return source.root ? found.map((d) => ({ ...d, path: `${source.root === "/" ? "" : source.root}/${d.path}` })) : found;
      } catch { return null; /* serveur pas encore prêt : liste précédente gardée */ }
    }));
    if (lists.every((list) => list === null)) { setLoaded(true); return; }
    setDocs((previous) => {
      const merged: DocEntry[] = [];
      lists.forEach((list, i) => {
        const source = sources[i];
        merged.push(...(list ?? previous.filter((d) => sourceOf(d.path, sources) === source)));
      });
      return merged.sort((a, b) => b.mtime - a.mtime);
    });
    setLoaded(true);
  }, [sources]);

  useEffect(() => { if (visible) void refresh(); }, [visible, refresh]);
  useEffect(() => {
    if (!visible) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [visible, refresh]);

  const open = useCallback((path: string) => {
    const nextTabs = tabs.includes(path) ? tabs : [...tabs, path];
    setTabs(nextTabs);
    writeList(storageKey("tabs", projectRoot), nextTabs);
    setActive(path);
    const nextRecent = [path, ...recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
    setRecent(nextRecent);
    writeList(storageKey("recent", projectRoot), nextRecent);
  }, [projectRoot, tabs, recent]);

  const close = useCallback((path: string) => {
    const at = tabs.indexOf(path);
    const next = tabs.filter((p) => p !== path);
    setTabs(next);
    writeList(storageKey("tabs", projectRoot), next);
    if (active === path) setActive(next[Math.min(at, next.length - 1)] ?? null);
  }, [projectRoot, tabs, active]);

  // Sans document ouvert, Plan et Commentaires n'ont rien à montrer.
  const shownTab: PanelTab = active ? panelTab : "docs";
  const panelOpen = !listHidden;
  const tellFrame = useCallback((frame: HTMLIFrameElement) => {
    try {
      const origin = new URL(frame.src).origin;
      frame.contentWindow?.postMessage({ type: "atelier-docs-panel", open: panelOpen, tab: shownTab }, origin);
    } catch { /* iframe sans adresse valide : rien à piloter */ }
  }, [panelOpen, shownTab]);
  useEffect(() => {
    // Seulement les documents chargés : avant, l'iframe est encore about:blank.
    framesRef.current?.querySelectorAll<HTMLIFrameElement>("iframe[data-ready]").forEach(tellFrame);
  }, [tellFrame, tabs]);

  const byPath = useMemo(() => new Map(docs.map((d) => [d.path, d])), [docs]);
  const needle = query.trim().toLowerCase();
  const matches = (p: string) => !needle || p.toLowerCase().includes(needle);
  const recentDocs = recent.map((p) => byPath.get(p)).filter((d): d is DocEntry => !!d && matches(d.path));
  const recentSet = new Set(recentDocs.map((d) => d.path));
  const otherDocs = docs.filter((d) => !recentSet.has(d.path) && matches(d.path));

  const row = (d: DocEntry) => (
    <RowButton key={d.path} className="docs-row" aria-current={active === d.path ? "true" : undefined} title={d.path} onClick={() => open(d.path)}>
      <span className="docs-row-icon">{FILE_ICON}</span>
      <span className="docs-row-text">
        <span className="docs-row-name">{baseName(d.path)}</span>
        <span className="docs-row-meta">
          <span className="docs-row-where">{[whereOf(d.path, sources), shortDate(d.mtime)].filter(Boolean).join(" · ")}</span>
          {d.changes > 0 && <span className="docs-pill">{t("docs.changes", { count: d.changes })}</span>}
        </span>
      </span>
    </RowButton>
  );

  const openComments = active ? comments[active] : undefined;
  const panelTabs = (
    <SegmentedControl
      className="docs-panel-tabs"
      label={t("docs.panel")}
      value={shownTab}
      onChange={(v) => setPanelTab(v as PanelTab)}
      options={[
        { value: "docs", label: t("atelier.documents") },
        { value: "plan", label: t("docs.plan"), disabled: !active },
        { value: "com", label: <>{t("docs.comments")}{openComments ? <i className="docs-panel-count">{openComments}</i> : null}</>, ariaLabel: t("docs.comments"), disabled: !active },
      ]}
    />
  );

  return (
    <div className="docs-surface" data-list={listHidden ? "hidden" : undefined} data-panel={panelOpen ? shownTab : "closed"}>
      <div className="docs-tabs">
        <IconButton size="s" className="docs-list-toggle" label={t(listHidden ? "docs.show-list" : "docs.hide-list")} title={t(listHidden ? "docs.show-list" : "docs.hide-list")}
          aria-expanded={!listHidden} onClick={toggleList}><SidebarIcon size={14} /></IconButton>
        <div className="docs-tablist" role="tablist" aria-label={t("atelier.documents")}>
          {tabs.map((path) => (
            <div key={path} className="docs-tab document-tab-shell" data-active={active === path}>
              <RowButton role="tab" aria-selected={active === path} className="docs-tab-label" title={path} onClick={() => setActive(path)}>
                <span>{baseName(path)}</span>
              </RowButton>
              <IconButton size="s" className="document-tab-close" label={t("docs.close", { name: baseName(path) })} onClick={() => close(path)}><CloseIcon /></IconButton>
            </div>
          ))}
        </div>
      </div>
      <div className="docs-body">
        <aside className="docs-side" hidden={listHidden || shownTab !== "docs"} aria-label={t("docs.panel")}>
          {panelTabs}
          <div className="docs-side-head">
            <label className="docs-search">
              <span className="docs-search-icon"><SearchIcon /></span>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("docs.search")} aria-label={t("docs.search")} />
            </label>
            <NewDocument origin={origin} docs={docs} onCreated={(path) => { open(path); void refresh(); }} />
          </div>
          <div className="docs-lists">
            {recentDocs.length > 0 && <>
              <div className="docs-heading">{t("docs.recent")}</div>
              {recentDocs.map(row)}
            </>}
            {otherDocs.length > 0 && <>
              <div className="docs-heading">{t("docs.in-project")}</div>
              {otherDocs.map(row)}
            </>}
            {loaded && docs.length === 0 && <div className="docs-none">{t("docs.empty-list")}</div>}
          </div>
        </aside>
        <div className="docs-frames" ref={framesRef}>
          {tabs.length === 0 && <EmptyState title={t("docs.empty-title")} description={t("docs.empty")} />}
          {tabs.map((path) => {
            const source = sourceOf(path, sources);
            const src = source && frameUrl(source.url, path);
            return src && (
              <iframe key={path} className="docs-frame atelier" data-atelier-role="docx" data-path={path} src={src} hidden={active !== path} title={baseName(path)}
                onLoad={(e) => { e.currentTarget.dataset.ready = "1"; tellFrame(e.currentTarget); }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewDocument({ origin, docs, onCreated }: { origin: string | null; docs: DocEntry[]; onCreated: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<Template>("article");
  const [from, setFrom] = useState("");
  const [dir, setDir] = useState("documents");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const templates: { id: Template; label: string; hint: string }[] = [
    { id: "blank", label: t("docs.blank"), hint: t("docs.blank-hint") },
    { id: "article", label: t("docs.article"), hint: t("docs.article-hint") },
    { id: "copy", label: t("docs.copy"), hint: t("docs.copy-hint") },
  ];
  const source = from || docs[0]?.path || "";

  async function create() {
    if (!origin || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${origin}/docx/new`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || t("docs.untitled"), dir: dir.trim().replace(/\/+$/, ""), template, from: template === "copy" ? source : undefined }),
      });
      const data = await res.json() as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error || res.statusText);
      setOpen(false);
      setName("");
      onCreated(data.path);
    } catch (error) {
      showError(t("docs.create-failed", { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) window.setTimeout(() => nameRef.current?.focus(), 0); }}>
      <PopoverTrigger render={<Button variant="secondary" className="docs-new" aria-label={t("docs.new-title")} title={t("docs.new-title")} disabled={!origin} />}>
        <PlusIcon size={14} />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" plain className="docs-pop">
        <PopoverTitle className="docs-pop-title">{t("docs.new-title")}</PopoverTitle>
        <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label className="docs-field">
            <span className="docs-label">{t("docs.name")}</span>
            <span className="docs-name">
              <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("docs.untitled")} aria-label={t("docs.name")} />
              <span className="docs-ext">.docx</span>
            </span>
          </label>
          <div className="docs-field">
            <span className="docs-label">{t("docs.template")}</span>
            <div className="docs-templates" role="radiogroup" aria-label={t("docs.template")}>
              {templates.map((tp) => (
                <RowButton key={tp.id} role="radio" aria-checked={template === tp.id} className="docs-template" data-kind={tp.id}
                  disabled={tp.id === "copy" && docs.length === 0} onClick={() => setTemplate(tp.id)}>
                  <span className="docs-thumb" aria-hidden="true"><i /><i /><i /><i /></span>
                  <span className="docs-template-label">{tp.label}</span>
                  <span className="docs-template-hint">{tp.hint}</span>
                </RowButton>
              ))}
            </div>
          </div>
          {template === "copy" && (
            <div className="docs-field">
              <span className="docs-label">{t("docs.copy-from")}</span>
              <Select value={source} onChange={setFrom} title={t("docs.copy-from")} options={docs.map((d) => ({ value: d.path, label: d.path }))} />
            </div>
          )}
          <label className="docs-field">
            <span className="docs-label">{t("docs.location")}</span>
            <Input value={dir} onChange={(e) => setDir(e.target.value)} aria-label={t("docs.location")} />
          </label>
          <div className="docs-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("docs.cancel")}</Button>
            <Button variant="primary" type="submit" loading={busy}>{t("docs.create")}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
