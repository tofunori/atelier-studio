import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeviceCredentials, ProjectSummary } from "../transport/types.ts";
import {
  fetchGalleryIndex,
  fetchProjects,
  fetchFileById,
  trashFileById,
} from "../transport/filesClient.ts";
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
import {
  loadGalleryFavorites,
  saveGalleryFavorites,
  toggleGalleryFavorite,
} from "./favorites.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Item } from "@/components/ui/item.tsx";
import { Toggle } from "@/components/ui/toggle.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  FolderOpenIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination.tsx";
import { toast } from "sonner";

const PAGE_SIZE = 24;
const GALLERY_BATCH_SIZE = 30;
const TEXT_PREVIEW_MAX_BYTES = 128 * 1024;
const TEXT_PREVIEW_MAX_CHARS = 900;
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
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  /** grid = gallery figures, list = files browser */
  layout?: "grid" | "list";
  title?: string;
};

export function GalleryScreen(p: Props) {
  const layout = p.layout ?? "grid";
  const title = p.title ?? "Gallery";
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [localProjectId, setLocalProjectId] = useState<string>("");
  const projectId = p.selectedProjectId ?? localProjectId;
  const setProjectId = useCallback((nextProjectId: string) => {
    setLocalProjectId(nextProjectId);
    p.onProjectChange?.(nextProjectId);
  }, [p.onProjectChange]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "name" | "nameDesc" | "size" | "sizeAsc">("recent");
  const [page, setPage] = useState(0);
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadGalleryFavorites());
  const [showFavorites, setShowFavorites] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<GalleryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [textPreviews, setTextPreviews] = useState<Record<string, string>>({});
  const projectOptions = useMemo(
    () => projects.map((project) => ({ label: project.name, value: project.projectId })),
    [projects],
  );
  const sortOptions = useMemo(
    () => [
      { label: "Récents", value: "recent" },
      { label: "Plus anciens", value: "oldest" },
      { label: "Nom A–Z", value: "name" },
      { label: "Nom Z–A", value: "nameDesc" },
      { label: "Plus grands", value: "size" },
      { label: "Plus petits", value: "sizeAsc" },
    ],
    [],
  );

  const loadProjects = useCallback(async () => {
    if (!p.credentials) return;
    try {
      const list = await fetchProjects(p.credentials);
      setProjects(list);
      if (!projectId && list[0]) setProjectId(list[0].projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [p.credentials, projectId, setProjectId]);

  const loadGallery = useCallback(async () => {
    if (!p.credentials || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const idx = await fetchGalleryIndex(p.credentials, projectId);
      setItems(idx.items);
      setPage(0);
      setVisibleCount(GALLERY_BATCH_SIZE);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const source = layout === "grid"
      ? items.filter((item) => item.ext.toLocaleLowerCase("fr") === "png")
      : filterItems(items, filter);
    const next = source.filter((item) =>
      needle ? `${item.name} ${item.ext} ${item.kind}`.toLocaleLowerCase("fr").includes(needle) : true,
    ).filter((item) => layout !== "grid" || !showFavorites || favorites.has(item.fileId));
    return next.sort((a, b) => {
      if (sort === "oldest") return (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
      if (sort === "name") return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      if (sort === "nameDesc") return b.name.localeCompare(a.name, "fr", { sensitivity: "base" });
      if (sort === "size") return b.size - a.size;
      if (sort === "sizeAsc") return a.size - b.size;
      return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
    });
  }, [items, filter, query, sort, layout, showFavorites, favorites]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItemsList = useMemo(
    () => layout === "grid"
      ? filtered.slice(0, visibleCount)
      : pageItems(filtered, page, PAGE_SIZE),
    [filtered, layout, page, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(GALLERY_BATCH_SIZE);
  }, [projectId, query, sort, showFavorites]);

  const toggleFavorite = useCallback((fileId: string) => {
    setFavorites((current) => toggleGalleryFavorite(current, fileId));
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!p.credentials || !deleteCandidate) return;
    setDeleting(true);
    try {
      await trashFileById(p.credentials, deleteCandidate.fileId);
      setItems((current) => current.filter((item) => item.fileId !== deleteCandidate.fileId));
      setFavorites((current) => {
        const next = new Set(current);
        next.delete(deleteCandidate.fileId);
        saveGalleryFavorites(next);
        return next;
      });
      setThumbs((current) => {
        const next = { ...current };
        delete next[deleteCandidate.fileId];
        return next;
      });
      toast.success("Image déplacée dans la corbeille Atelier");
      setDeleteCandidate(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  }, [deleteCandidate, p.credentials]);

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

  // Lightweight content previews for code, Markdown, LaTeX, JSON and data.
  useEffect(() => {
    if (!p.credentials) return;
    let cancelled = false;
    void (async () => {
      for (const item of pageItemsList) {
        if (cancelled) return;
        if (!["code", "data", "latex"].includes(item.kind)) continue;
        if (item.size > TEXT_PREVIEW_MAX_BYTES || textPreviews[item.fileId]) continue;
        try {
          const result = await fetchFileById(p.credentials!, item.fileId);
          if (cancelled || result.notModified) continue;
          const raw = (await result.blob.text()).replace(/\r\n/g, "\n").trim();
          const preview = raw.slice(0, TEXT_PREVIEW_MAX_CHARS);
          if (preview) {
            setTextPreviews((current) =>
              current[item.fileId] ? current : { ...current, [item.fileId]: preview },
            );
          }
        } catch {
          /* Keep the extension placeholder when preview loading fails. */
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
        <Empty>
          <EmptyHeader>
            <FolderOpenIcon />
            <EmptyTitle>Mac non appairé</EmptyTitle>
            <EmptyDescription>Appairez le Mac pour voir les figures, PDF et fichiers du projet.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={p.onNeedPair}>Appairer</Button>
          </EmptyContent>
        </Empty>
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
          toast.success("Ajouté au prochain message");
        }}
      />
    );
  }

  return (
    <div className="screen gallery-screen" data-layout={layout}>
      <div className="gallery-header">
        <h1 className="screen-title">{title}</h1>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Actualiser"
          onClick={() => void loadGallery()}
          disabled={loading}
        >
          {loading ? <Spinner /> : <RefreshCwIcon />}
        </Button>
      </div>

      {projects.length > 0 ? (
        <Field className="gallery-project-field">
          <FieldLabel htmlFor="gallery-project" className="sr-only">Projet</FieldLabel>
          <Select
            items={projectOptions}
            value={projectId}
            onValueChange={(value) => value && setProjectId(value)}
          >
            <SelectTrigger
              id="gallery-project"
              size="sm"
              className="gallery-project-trigger"
              aria-label="Projet"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {projectOptions.map((project) => (
                  <SelectItem key={project.value} value={project.value}>{project.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <p className="screen-sub">
          Aucun projet enregistré sur la gateway. Ajoutez des racines dans{" "}
          <code>remote/projects.json</code> ou ouvrez des threads desktop.
        </p>
      )}

      {layout === "list" && (
        <ToggleGroup
          className="gallery-filters"
          size="sm"
          variant="default"
          spacing={1}
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0] as GalleryFilter | undefined;
            if (!next) return;
            setFilter(next);
            setPage(0);
          }}
          aria-label="Filtres"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem
              key={f.id}
              value={f.id}
              className="gallery-filter"
              aria-label={`Filtrer par ${f.label}`}
            >
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <div className="gallery-tools">
        <InputGroup>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
              setVisibleCount(GALLERY_BATCH_SIZE);
            }}
            placeholder="Rechercher…"
            aria-label="Rechercher dans les fichiers"
          />
          <InputGroupAddon align="inline-start"><SearchIcon /></InputGroupAddon>
        </InputGroup>
        <Select
          items={sortOptions}
          value={sort}
          onValueChange={(value) => {
            if (!value) return;
            setSort(value as "recent" | "oldest" | "name" | "nameDesc" | "size" | "sizeAsc");
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" aria-label="Trier les fichiers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {layout === "grid" && (
        <div className="gallery-library-bar">
          <Toggle
            pressed={showFavorites}
            onPressedChange={setShowFavorites}
            variant="outline"
            size="sm"
            aria-label="Afficher seulement les favoris"
          >
            <StarIcon data-icon="inline-start" className={showFavorites ? "gallery-star-filled" : ""} />
            Favoris
            <Badge variant="secondary">
              {items.filter((item) => item.ext.toLowerCase() === "png" && favorites.has(item.fileId)).length}
            </Badge>
          </Toggle>
          <span className="gallery-result-count">{filtered.length} PNG</span>
        </div>
      )}

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {loading && <Empty><EmptyHeader><Spinner /><EmptyTitle>Chargement…</EmptyTitle></EmptyHeader></Empty>}
      {!loading && pageItemsList.length === 0 && (
        <Empty><EmptyHeader><EmptyTitle>{query ? "Aucun résultat" : "Aucun fichier"}</EmptyTitle></EmptyHeader></Empty>
      )}

      <div className="gallery-grid">
        {pageItemsList.map((it) => layout === "grid" ? (
          <article key={it.fileId} className="gallery-card gallery-image-card">
            <button
              type="button"
              className="gallery-card-open"
              onClick={() => setOpen(it)}
              aria-label={`Ouvrir ${it.name}`}
            >
              <div className="gallery-thumb">
                {thumbs[it.fileId] ? (
                  <img src={thumbs[it.fileId]} alt={it.name} loading="lazy" />
                ) : (
                  <Badge variant="secondary">PNG</Badge>
                )}
              </div>
              <div className="gallery-card-body">
                <div className="list-item-title">{it.name}</div>
                <div className="list-item-meta">{formatBytes(it.size)} · {formatDate(it.modifiedAt)}</div>
              </div>
            </button>
            <div className="gallery-card-actions">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={favorites.has(it.fileId) ? `Retirer ${it.name} des favoris` : `Ajouter ${it.name} aux favoris`}
                aria-pressed={favorites.has(it.fileId)}
                onClick={() => toggleFavorite(it.fileId)}
              >
                <StarIcon className={favorites.has(it.fileId) ? "gallery-star-filled" : ""} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="gallery-delete-button"
                aria-label={`Supprimer ${it.name}`}
                onClick={() => setDeleteCandidate(it)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </article>
        ) : (
          <Item
            key={it.fileId}
            render={<button type="button" onClick={() => setOpen(it)} />}
            variant="muted"
            className="gallery-card"
          >
            <div className="gallery-thumb">
              {thumbs[it.fileId] ? (
                <img src={thumbs[it.fileId]} alt="" loading="lazy" />
              ) : textPreviews[it.fileId] ? (
                <pre className="gallery-text-preview" aria-label={`Aperçu de ${it.name}`}>
                  {textPreviews[it.fileId]}
                </pre>
              ) : (
                <Badge variant="secondary">{it.ext.toUpperCase() || it.kind}</Badge>
              )}
            </div>
            <div className="gallery-card-body">
              <div className="list-item-title">{it.name}</div>
              <div className="list-item-meta">
                {(it.ext || it.kind).toUpperCase()} · {formatBytes(it.size)} · {formatDate(it.modifiedAt)}
              </div>
            </div>
          </Item>
        ))}
      </div>

      {layout === "grid" && visibleCount < filtered.length && (
        <Button
          type="button"
          variant="outline"
          className="gallery-load-more"
          onClick={() => setVisibleCount((current) => current + GALLERY_BATCH_SIZE)}
        >
          Afficher plus · {Math.min(GALLERY_BATCH_SIZE, filtered.length - visibleCount)}
        </Button>
      )}

      {layout === "list" && pageCount > 1 && (
        <Pagination className="mt-4">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text="Préc."
                aria-disabled={page === 0}
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 0) setPage((current) => current - 1);
                }}
              />
            </PaginationItem>
            <PaginationItem><Badge variant="outline">{page + 1} / {pageCount}</Badge></PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                text="Suiv."
                aria-disabled={page >= pageCount - 1}
                onClick={(event) => {
                  event.preventDefault();
                  if (page < pageCount - 1) setPage((current) => current + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <AlertDialog
        open={deleteCandidate != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setDeleteCandidate(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette image ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate?.name} sera déplacée dans la corbeille réversible
              <code> .atelier-trash</code> du projet sur le Mac.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Spinner /> : <Trash2Icon />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
