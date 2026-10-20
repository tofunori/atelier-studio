// Surface Documents : un traitement de texte .docx autonome. À gauche, les
// documents du projet (récents d'abord) et « Nouveau » ; à droite, les
// documents ouverts en onglets, chacun dans le panneau .docx de la galerie
// (docx_studio.html : suivis signés, commentaires, pages comme dans Word).
// Les fichiers sont créés par le serveur galerie (POST /docx/new, en Rust).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { shortDate } from "./documentsDate";
import { CloseIcon, PlusIcon, SearchIcon, SidebarIcon } from "./icons";
import { Input } from "./shadcn/input";
import { Button, EmptyState, IconButton, Popover, PopoverContent, PopoverTitle, PopoverTrigger, RowButton, Select, showError } from "./ui";
import "./DocumentsSurface.css";

type DocEntry = { path: string; mtime: number; changes: number };
type Template = "blank" | "article" | "copy";

const MAX_RECENT = 6;
const LIST_HIDDEN_KEY = "atelier-studio.documents.list-hidden";

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

function frameUrl(galleryUrl: string, path: string): string | null {
  try {
    const base = new URL(galleryUrl);
    const url = new URL(`${base.origin}/.fig_thumbs/docx_studio.html`);
    url.searchParams.set("path", path);
    // Le nonce (dans le fragment) authentifie les messages de l'iframe.
    url.hash = base.hash;
    return url.toString();
  } catch {
    return null;
  }
}

const FILE_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 1.8h5.2L12.5 5v8.2c0 .6-.4 1-1 1h-7.5c-.6 0-1-.4-1-1V2.8c0-.6.4-1 1-1z" />
    <path d="M9 1.8V5h3.5" />
  </svg>
);

export default function DocumentsSurface({
  galleryUrl,
  projectRoot,
  visible = true,
}: {
  galleryUrl?: string;
  projectRoot: string;
  visible?: boolean;
}) {
  const origin = useMemo(() => {
    try { return galleryUrl ? new URL(galleryUrl).origin : null; } catch { return null; }
  }, [galleryUrl]);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readList(storageKey("recent", projectRoot)));
  const [tabs, setTabs] = useState<string[]>(() => readList(storageKey("tabs", projectRoot)));
  const [active, setActive] = useState<string | null>(() => readList(storageKey("tabs", projectRoot))[0] ?? null);

  // Liste masquable (bouton à gauche des onglets, ⌘\ ici comme dans le panneau).
  const [listHidden, setListHidden] = useState(() => {
    try { return localStorage.getItem(LIST_HIDDEN_KEY) === "1"; } catch { return false; }
  });
  const toggleList = useCallback(() => {
    const next = !listHidden;
    setListHidden(next);
    try { localStorage.setItem(LIST_HIDDEN_KEY, next ? "1" : "0"); } catch { /* vaut pour cette session */ }
  }, [listHidden]);
  const framesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "\\") { e.preventDefault(); toggleList(); }
    };
    // Le raccourci tapé dans un document arrive de son iframe.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.type !== "atelier-docs-toggle-list") return;
      const frames = Array.from(framesRef.current?.querySelectorAll("iframe") ?? []);
      if (frames.some((f) => f.contentWindow === e.source)) toggleList();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("message", onMessage); };
  }, [visible, origin, toggleList]);

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
    if (!origin) return;
    try {
      const res = await fetch(`${origin}/docx/list`);
      if (!res.ok) throw new Error(`docx/list ${res.status}`);
      const data = await res.json() as { documents?: DocEntry[] };
      setDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch { /* serveur galerie pas encore prêt : la liste reste vide */ }
    setLoaded(true);
  }, [origin]);

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
          <span className="docs-row-where">{[folderOf(d.path), shortDate(d.mtime)].filter(Boolean).join(" · ")}</span>
          {d.changes > 0 && <span className="docs-pill">{t("docs.changes", { count: d.changes })}</span>}
        </span>
      </span>
    </RowButton>
  );

  return (
    <div className="docs-surface" data-list={listHidden ? "hidden" : undefined}>
      <aside className="docs-side" hidden={listHidden}>
        <div className="docs-side-head">
          <span className="docs-side-title">{t("atelier.documents")}</span>
          <NewDocument origin={origin} docs={docs} onCreated={(path) => { open(path); void refresh(); }} />
        </div>
        <label className="docs-search">
          <span className="docs-search-icon"><SearchIcon /></span>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("docs.search")} aria-label={t("docs.search")} />
        </label>
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
      <section className="docs-main">
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
        <div className="docs-frames" ref={framesRef}>
          {tabs.length === 0 && <EmptyState title={t("atelier.documents")} description={t("docs.empty")} />}
          {galleryUrl && tabs.map((path) => {
            const src = frameUrl(galleryUrl, path);
            return src && (
              <iframe key={path} className="docs-frame atelier" data-atelier-role="docx" src={src} hidden={active !== path} title={baseName(path)} />
            );
          })}
        </div>
      </section>
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
      <PopoverTrigger render={<Button variant="primary" className="docs-new" disabled={!origin} />}>
        <PlusIcon size={12} /><span>{t("docs.new")}</span>
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
