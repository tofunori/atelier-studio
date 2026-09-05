import { useEffect, useMemo, useRef, useState } from "react";
import { File, Folder, RefreshCw, Search } from "lucide-react";
import { Button, IconButton, RowButton } from "./ui";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "./shadcn/popover";
import { Input } from "./shadcn/input";
import { normalizeProjectFolders, type ProjectFolders } from "../lib/projectFolders";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../lib/i18n";
import "./ProjectGallery.css";
import { ProjectFolderMenu, type FolderMenuState } from "./ProjectFolderMenu";

type Source = { root: string; name: string; files: string[]; truncated?: boolean; error?: string };
const artifact = /\.(pdf|png|jpe?g|webp|gif|svg|html?|md|tex|ipynb)$/i;
export function sourceFileIdentity(root: string, rel: string) { return JSON.stringify([root, rel]); }
export default function ProjectGallery({ root, config, ws, mainGallery, onManage, onOpen, reloadKey, galleryDir, galleryExts }: {
  root: string; config?: ProjectFolders; ws: WebSocket | null; mainGallery: React.ReactNode;
  onManage: () => void; onOpen: (source: string, rel: string) => Promise<void>; reloadKey: number; galleryDir?: string; galleryExts?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = useMemo(() => normalizeProjectFolders(root, config), [root, config]);
  const availableFolders = [...(normalized.mainGallery ? [{ path: root, name: root.split("/").pop() || root }] : []), ...normalized.folders.filter(f => f.gallery)];
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState(availableFolders.length === 1 ? availableFolders[0].path : "all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [limit, setLimit] = useState(120);
  useEffect(() => {
    if (!ws || ws.readyState !== 1) { setError(t("project.folders-offline")); return; }
    let alive = true;
    const requestId = crypto.randomUUID(); setLoading(true); setError(""); setSources([]);
    const timer = window.setTimeout(() => { if (alive) { setLoading(false); setError(t("project.folders-timeout")); } }, 30000);
    function message(event: MessageEvent) {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (!alive || data.type !== "projectFolderCatalog" || data.requestId !== requestId || data.projectRoot !== root) return;
      clearTimeout(timer); setSources(Array.isArray(data.sources) ? data.sources : []); setLoading(false); if (data.error) setError(t("project.folders-timeout"));
    }
    ws.addEventListener("message", message);
    ws.send(JSON.stringify({ type: "projectFolderCatalog", projectRoot: root, requestId, config: normalized }));
    return () => { alive = false; clearTimeout(timer); ws.removeEventListener("message", message); };
  }, [root, normalized, ws, revision, reloadKey]);
  useEffect(() => { if (filter === "all" && availableFolders.length === 1) setFilter(availableFolders[0].path); }, [normalized, filter, root]);
  useEffect(() => { setLimit(120); }, [filter, query]);
  useEffect(() => { if (filter !== "all" && filter !== root && !normalized.folders.some(f => f.path === filter && f.gallery)) setFilter("all"); if (filter === root && !normalized.mainGallery) setFilter("all"); }, [normalized, filter, root]);
  useEffect(() => {
    if (filter === root) return;
    let alive = true;
    for (const source of sources.filter(s => !s.error && (filter === "all" || s.root === filter))) {
      if (!source.files.some(rel => /\.(pdf|png|jpe?g|webp|gif|svg)$/i.test(rel))) continue;
      void invoke<string>("start_atelier", { root: source.root, galleryDir: galleryDir || "", galleryExts: galleryExts || "" })
        .then(url => { if (alive) setSourceUrls(current => ({ ...current, [source.root]: new URL(url).origin })); })
        .catch(() => { /* The filename remains usable; opening reports the server error. */ });
    }
    return () => { alive = false; };
  }, [sources, filter, root, galleryDir, galleryExts]);
  const visibleSources = sources.filter(s => filter === "all" || s.root === filter);
  const entries = visibleSources.flatMap(s => s.files.filter(rel => artifact.test(rel) && rel.toLowerCase().includes(query.toLowerCase())).map(rel => ({ source: s, rel })));
  const filters = [...(availableFolders.length > 1 ? [{ path: "all", name: t("project.folders-all") }] : []), ...availableFolders];
  const menuState: FolderMenuState = { folders: filters, selected: filter, label: t("project.folders"), manageLabel: t("project.folders-manage") };
  // The iframe owns its toolbar. Exchange only folder state and validated actions.
  useEffect(() => {
    const frame = containerRef.current?.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    if (!frame) return;
    const origin = new URL(frame.src, window.location.href).origin;
    const send = () => frame.contentWindow?.postMessage({ type: "atelier-folder-state", state: menuState }, origin);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== origin) return;
      if (event.data?.type === "atelier-folder-ready") send();
      if (event.data?.type === "atelier-folder-select" && filters.some(f => f.path === event.data.path)) setFilter(event.data.path);
      if (event.data?.type === "atelier-folder-manage") onManage();
    };
    window.addEventListener("message", receive); frame.addEventListener("load", send); send();
    return () => { window.removeEventListener("message", receive); frame.removeEventListener("load", send); };
  }, [filter, normalized, root, onManage, mainGallery]);
  return <div className="project-gallery" ref={containerRef}>
    {filter !== root && <div className="project-gallery-toolbar"><ProjectFolderMenu state={menuState} onSelect={setFilter} onManage={onManage}/><span className="project-gallery-toolbar-space"/><Popover><PopoverTrigger render={<IconButton label={t("project.folders-search")}><Search size={16}/></IconButton>}/><PopoverContent align="end"><PopoverTitle className="tw:sr-only">{t("project.folders-search")}</PopoverTitle><Input type="search" aria-label={t("project.folders-search")} placeholder={t("project.folders-search")} value={query} onChange={e => setQuery(e.target.value)} /></PopoverContent></Popover><IconButton label={t("project.folders-refresh")} onClick={() => setRevision(v => v + 1)}><RefreshCw size={14}/></IconButton></div>}
    {/* Main gallery remains mounted: preserve annotations, selection and command bridge. */}
    <div className="project-gallery-native" style={{ display: filter === root ? "flex" : "none" }}>{mainGallery}</div>
    {filter !== root && <div className="project-gallery-catalog">
      {loading && <p role="status">{t("project.folders-loading")}</p>}{error && <p role="alert">{error}</p>}
      {visibleSources.filter(s => s.error || s.truncated).map(s => <p key={s.root} role="status">{s.name} — {s.error || t("project.folders-truncated")}</p>)}
      <div className="project-gallery-grid">{entries.slice(0, limit).map(({ source, rel }) => { const id = sourceFileIdentity(source.root, rel); return <RowButton type="button" className="project-gallery-file" key={id} disabled={opening !== null} title={`${source.root}/${rel}`} onClick={async () => { setOpening(id); setError(""); try { await onOpen(source.root, rel); } catch (e) { setError(String(e)); } finally { setOpening(null); } }}><div className="project-gallery-preview"><File size={30}/>{sourceUrls[source.root] && /\.(pdf|png|jpe?g|webp|gif|svg)$/i.test(rel) && <img loading="lazy" alt="" src={`${sourceUrls[source.root]}/thumb?path=${encodeURIComponent(rel)}&w=480&rev=${reloadKey}-${revision}`} onError={e => { e.currentTarget.style.display = "none"; }} />}<span>{opening === id ? "…" : rel.split(".").pop()?.toUpperCase()}</span></div><strong>{rel.split("/").pop()}</strong><span className="project-gallery-origin"><Folder size={12}/>{source.name}</span><span className="project-gallery-relative">{rel}</span></RowButton>; })}</div>
      {!loading && !error && <p className="project-gallery-count">{entries.length} {t("project.folders-files")}</p>}{entries.length > limit && <Button onClick={() => setLimit(v => v + 120)}>{t("project.folders-more")}</Button>}
    </div>}
  </div>;
}
