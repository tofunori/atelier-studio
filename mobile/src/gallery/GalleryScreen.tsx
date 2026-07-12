import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeviceCredentials, ProjectSummary } from "../transport/types.ts";
import { fetchGalleryIndex, fetchProjects, fetchFileById } from "../transport/filesClient.ts";
import {
  filterItems,
  formatBytes,
  formatDate,
  pageItems,
} from "../files/classify.ts";
import type { GalleryFilter, GalleryItem } from "../files/types.ts";
import { THUMB_MAX_BYTES } from "../files/types.ts";
import { thumbCacheGet, thumbCacheSet } from "../files/thumbnailCache.ts";
import { FileViewer } from "../files/FileViewer.tsx";

const PAGE_SIZE = 24;
const FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "pdf", label: "PDF" },
  { id: "figure", label: "Figures" },
  { id: "latex", label: "LaTeX" },
  { id: "data", label: "Données" },
  { id: "code", label: "Code" },
];

type Props = {
  credentials: DeviceCredentials | null;
  onNeedPair: () => void;
  /** grid = gallery figures, list = files browser */
  layout?: "grid" | "list";
  title?: string;
};

export function GalleryScreen(p: Props) {
  const layout = p.layout ?? "grid";
  const title = p.title ?? "Gallery";
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!p.credentials) return;
    try {
      const list = await fetchProjects(p.credentials);
      setProjects(list);
      if (!projectId && list[0]) setProjectId(list[0].projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [p.credentials, projectId]);

  const loadGallery = useCallback(async () => {
    if (!p.credentials || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const idx = await fetchGalleryIndex(p.credentials, projectId);
      setItems(idx.items);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [p.credentials, projectId]);

  useEffect(() => {
    if (!p.credentials) return;
    void loadProjects();
  }, [p.credentials, loadProjects]);

  useEffect(() => {
    if (projectId) void loadGallery();
  }, [projectId, loadGallery]);

  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItemsList = useMemo(
    () => pageItems(filtered, page, PAGE_SIZE),
    [filtered, page],
  );

  // progressive thumbs for small figures only
  useEffect(() => {
    if (!p.credentials) return;
    let cancelled = false;
    (async () => {
      for (const it of pageItemsList) {
        if (cancelled) return;
        if (it.kind !== "figure" || it.ext === "svg") continue;
        if (it.size > THUMB_MAX_BYTES) continue;
        const cached = thumbCacheGet(it.fileId, it.etag);
        if (cached) {
          setThumbs((t) => (t[it.fileId] ? t : { ...t, [it.fileId]: cached }));
          continue;
        }
        try {
          const res = await fetchFileById(p.credentials!, it.fileId, {
            ifNoneMatch: it.etag,
          });
          if (cancelled || res.notModified) continue;
          const url = thumbCacheSet(it.fileId, res.blob, res.etag || it.etag);
          setThumbs((t) => ({ ...t, [it.fileId]: url }));
        } catch {
          /* skip thumb */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageItemsList, p.credentials]);

  if (!p.credentials) {
    return (
      <div className="screen">
        <h1 className="screen-title">{title}</h1>
        <p className="screen-sub">Appairez le Mac pour voir les figures et PDF du projet.</p>
        <button type="button" className="btn btn-primary" onClick={p.onNeedPair}>
          Appairer
        </button>
      </div>
    );
  }

  if (open) {
    return (
      <FileViewer
        credentials={p.credentials}
        projectId={projectId}
        item={open}
        onBack={() => setOpen(null)}
        onAddedToChat={() => {
          setToast("Ajouté au prochain message");
          setTimeout(() => setToast(null), 2000);
        }}
      />
    );
  }

  return (
    <div className="screen gallery-screen" data-layout={layout}>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <h1 className="screen-title" style={{ margin: 0 }}>
          {title}
        </h1>
        <button type="button" className="btn btn-ghost" onClick={() => void loadGallery()} disabled={loading}>
          Actualiser
        </button>
      </div>

      {projects.length > 0 ? (
        <label className="field">
          <span>Projet</span>
          <select
            className="gallery-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Projet"
          >
            {projects.map((pr) => (
              <option key={pr.projectId} value={pr.projectId}>
                {pr.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="screen-sub">
          Aucun projet enregistré sur la gateway. Ajoutez des racines dans{" "}
          <code>remote/projects.json</code> ou ouvrez des threads desktop.
        </p>
      )}

      <div className="filter-row" role="tablist" aria-label="Filtres">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`filter-chip ${filter === f.id ? "on" : ""}`}
            onClick={() => {
              setFilter(f.id);
              setPage(0);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" style={{ color: "var(--status-error)" }}>
          {error}
        </div>
      )}
      {toast && (
        <div className="status-banner" data-tone="ok" role="status">
          {toast}
        </div>
      )}
      {loading && <div className="empty">Chargement…</div>}
      {!loading && pageItemsList.length === 0 && (
        <div className="empty">Aucun fichier</div>
      )}

      <div className="gallery-grid">
        {pageItemsList.map((it) => (
          <button
            key={it.fileId}
            type="button"
            className="gallery-card"
            onClick={() => setOpen(it)}
          >
            <div className="gallery-thumb">
              {thumbs[it.fileId] ? (
                <img src={thumbs[it.fileId]} alt="" loading="lazy" />
              ) : (
                <span className="gallery-placeholder">{it.ext.toUpperCase() || it.kind}</span>
              )}
            </div>
            <div className="gallery-card-body">
              <div className="list-item-title">{it.name}</div>
              <div className="list-item-meta">
                {it.kind} · {formatBytes(it.size)} · {formatDate(it.modifiedAt)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="row-actions" style={{ justifyContent: "center", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Préc.
          </button>
          <span className="list-item-meta">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Suiv.
          </button>
        </div>
      )}
    </div>
  );
}
