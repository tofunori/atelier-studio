import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { normalizeProjectFolders, type ProjectFolders } from "../lib/projectFolders";
import { t } from "../lib/i18n";
import { ProjectFolderMenu, type FolderMenuState } from "./ProjectFolderMenu";
import "./ProjectGallery.css";

// Retained for catalog consumers that identify same-name files across folders.
export function sourceFileIdentity(root: string, rel: string) { return JSON.stringify([root, rel]); }

export default function ProjectGallery({ root, config, mainGallery, onManage, reloadKey, galleryDir, galleryExts, galleryUrl }: {
  root: string; config?: ProjectFolders; ws: WebSocket | null; mainGallery: React.ReactNode;
  onManage: () => void; onOpen: (source: string, rel: string) => Promise<void>; reloadKey: number;
  galleryDir?: string; galleryExts?: string; galleryUrl?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = useMemo(() => normalizeProjectFolders(root, config), [root, config]);
  const folders = useMemo(() => [
    ...(normalized.mainGallery ? [{ path: root, name: root.split("/").pop() || root }] : []),
    ...normalized.folders.filter(folder => folder.gallery),
  ], [root, normalized]);
  // Par défaut, SEUL le projet principal s'affiche : empiler toutes les
  // galeries répétait la barre d'outils à chaque dossier (Thierry
  // 2026-09-10). « Tous les dossiers » reste un choix du menu Dossier.
  const defaultFilter = useMemo(
    () => folders.find(folder => folder.path === root)?.path ?? folders[0]?.path ?? "all",
    [folders, root],
  );
  const [filter, setFilter] = useState(defaultFilter);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const all = filter === "all";
  // La configuration des dossiers peut arriver après le premier rendu : poser
  // le défaut une seule fois, sans jamais écraser un choix de l'utilisateur.
  const defaultApplied = useRef(false);

  useEffect(() => {
    if (!folders.length) return;
    if (!defaultApplied.current) { defaultApplied.current = true; setFilter(defaultFilter); return; }
    if (filter !== "all" && !folders.some(folder => folder.path === filter)) setFilter(defaultFilter);
    if (filter === "all" && folders.length === 1) setFilter(folders[0].path);
  }, [filter, folders, defaultFilter]);

  useEffect(() => {
    let alive = true;
    for (const folder of folders.filter(folder => folder.path !== root && (all || folder.path === filter))) {
      setErrors(current => ({ ...current, [folder.path]: "" }));
      void invoke<string>("start_atelier", { root: folder.path, galleryDir: galleryDir || "", galleryExts: galleryExts || "" })
        .then(url => { if (alive) setUrls(current => ({ ...current, [folder.path]: url })); })
        .catch(error => { if (alive) setErrors(current => ({ ...current, [folder.path]: String(error) })); });
    }
    return () => { alive = false; };
  }, [root, folders, all, filter, galleryDir, galleryExts, reloadKey]);

  useEffect(() => {
    const reveal = (event: Event) => {
      const path = (event as CustomEvent<{ root: string }>).detail?.root;
      if (folders.some(folder => folder.path === path)) setFilter(path);
    };
    window.addEventListener("atelier-gallery-reveal-folder", reveal);
    return () => window.removeEventListener("atelier-gallery-reveal-folder", reveal);
  }, [folders]);

  const choices = [...(folders.length > 1 ? [{ path: "all", name: t("project.folders-all") }] : []), ...folders];
  const menuState: FolderMenuState = { folders: choices, selected: filter, label: t("project.folders"), manageLabel: t("project.folders-manage") };
  useEffect(() => {
    const frames = [...(containerRef.current?.querySelectorAll<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]') || [])];
    const known = frames.map(frame => ({ frame, origin: new URL(frame.src, window.location.href).origin,
      path: frame.dataset.folderRoot || root }));
    const send = (entry: typeof known[number]) => {
      entry.frame.contentWindow?.postMessage({ type: "atelier-folder-state", state: menuState }, entry.origin);
    };
    const receive = (event: MessageEvent) => {
      const entry = known.find(item => item.frame.contentWindow === event.source && item.origin === event.origin);
      if (!entry) return;
      if (event.data?.type === "atelier-folder-ready") send(entry);
      // Hidden galleries cannot change the current folder selection.
      if (!all && entry.path !== filter) return;
      if (event.data?.type === "atelier-folder-select" && choices.some(folder => folder.path === event.data.path)) setFilter(event.data.path);
      if (event.data?.type === "atelier-folder-manage") onManage();
    };
    const cleanup = known.map(entry => {
      const onLoad = () => send(entry);
      entry.frame.addEventListener("load", onLoad); send(entry);
      return () => entry.frame.removeEventListener("load", onLoad);
    });
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); cleanup.forEach(fn => fn()); };
  }, [filter, all, folders, root, urls, mainGallery, onManage, galleryUrl, reloadKey]);

  const embeddedUrl = (url: string) => {
    const embedded = new URL(url);
    embedded.searchParams.set("embedded", "atelier");
    if (galleryUrl) embedded.hash = new URL(galleryUrl).hash;
    return embedded.toString();
  };
  const pending = folders.some(folder => folder.path !== root && (all || folder.path === filter) && !urls[folder.path]);
  return <div className={`project-gallery${all ? " project-gallery-all" : ""}`} ref={containerRef}>
    {(pending || !folders.length) && <div className="project-gallery-toolbar"><ProjectFolderMenu state={menuState} onSelect={setFilter} onManage={onManage}/></div>}
    {/* One renderer in every mode; mounted frames retain favorites, filters and selection. */}
    <section className="project-gallery-section" style={{ display: normalized.mainGallery && (all || filter === root) ? "flex" : "none" }}>
      {all && <h2 className="project-gallery-heading">{root.split("/").pop()}</h2>}
      <div className="project-gallery-native" style={all ? { height: "clamp(400px, 70vh, 720px)", flex: "none" } : undefined}>{mainGallery}</div>
    </section>
    {folders.filter(folder => folder.path !== root).map(folder => <section key={folder.path} className="project-gallery-section"
      style={{ display: all || filter === folder.path ? "flex" : "none" }}>
      {all && <h2 className="project-gallery-heading">{folder.name}</h2>}
      {urls[folder.path] ? <iframe key={`${folder.path}-${reloadKey}`} className="atelier" data-atelier-role="gallery"
        data-folder-root={folder.path} src={embeddedUrl(urls[folder.path])}
        style={all ? { height: "clamp(400px, 70vh, 720px)", flex: "none" } : { flex: 1, minHeight: 0 }}
        aria-label={`Galerie — ${folder.name}`} title="" />
        : <p role={errors[folder.path] ? "alert" : "status"}>{errors[folder.path] || t("project.folders-loading")}</p>}
    </section>)}
  </div>;
}
