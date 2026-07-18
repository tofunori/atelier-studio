// Picker de la base de connaissances (plan 049 T3) : depuis la barre du
// composer, attacher des sources épinglées à la conversation courante
// (kbSourceIds/kbFullContent persistés par thread), épingler fichier/PDF/URL/
// note, retirer une source de la base. La bibliothèque est globale ; l'attache
// est par conversation — portée « ce message » et Zotero viendront ensuite.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import {
  onOpenKbPicker,
  kbArchivedSnapshot,
  kbCollectionsSnapshot,
  kbSourcesSnapshot,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
  type KbSource,
} from "../../lib/kbSources";
import { useKbActions } from "./kbActions";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { Input } from "../shadcn/input";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";

// ré-export : les consommateurs historiques importent le type depuis ce module
export type { KbBinding } from "../../lib/kbSources";

const GROUP_LABELS: Record<string, Parameters<typeof t>[0]> = {
  file: "kb.group-files",
  folder: "kb.group-folders",
  pdf: "kb.group-pdf",
  web: "kb.group-web",
  youtube: "kb.group-youtube",
  note: "kb.group-notes",
  gbrain: "kb.group-gbrain",
  zotero: "kb.group-zotero",
};
const GROUP_ORDER = ["file", "folder", "pdf", "zotero", "web", "youtube", "note", "gbrain"];

// Âge de la dernière synchro NAS d'une page gbrain épinglée.
function fmtSyncAge(syncedAt: unknown): string {
  const ts = typeof syncedAt === "string" ? Date.parse(syncedAt) : NaN;
  if (!Number.isFinite(ts)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 60) return t("kb.gbrain-sync-age", { age: `${minutes} min` });
  if (minutes < 60 * 24) return t("kb.gbrain-sync-age", { age: `${Math.round(minutes / 60)} h` });
  return t("kb.gbrain-sync-age", { age: `${Math.round(minutes / (60 * 24))} j` });
}

/** Résultat de recherche du corpus gbrain (plan 050 P3). */
export type GbrainResult = { slug: string; snippet?: string };
export type GbrainSectionProps = {
  query: string;
  results: GbrainResult[];
  error: string | null;
  searching: boolean;
  /** au moins une recherche a répondu (affiche « aucune page » à bon escient) */
  searched: boolean;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onPin: (slug: string) => void;
};

function fmtChars(chars: number): string {
  if (!Number.isFinite(chars) || chars <= 0) return "";
  return chars < 1000 ? String(chars) : `${Math.round(chars / 1000)}k`;
}

function KindIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.3,
  } as const;
  if (kind === "pdf") {
    return (
      <svg {...common}>
        <path d="M4 1.8h6l3 3v9.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" />
        <path d="M10 1.8v3h3M5.5 9h5M5.5 11.5h3.5" />
      </svg>
    );
  }
  if (kind === "web") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8a10 10 0 0 1 0 12.4M8 1.8a10 10 0 0 0 0 12.4" />
      </svg>
    );
  }
  if (kind === "note") {
    return (
      <svg {...common}>
        <path d="M3.5 2.5h9a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
        <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
      </svg>
    );
  }
  if (kind === "folder") {
    return (
      <svg {...common}>
        <path d="M1.8 4.6c0-.7.6-1.3 1.3-1.3h3l1.5 1.5h5.6c.7 0 1.3.6 1.3 1.3v6c0 .7-.6 1.3-1.3 1.3H3.1c-.7 0-1.3-.6-1.3-1.3v-7.5z" />
      </svg>
    );
  }
  if (kind === "youtube") {
    return (
      <svg {...common}>
        <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="2" />
        <path d="m6.6 6 3.4 2-3.4 2V6z" />
      </svg>
    );
  }
  if (kind === "gbrain") {
    return (
      <svg {...common}>
        <circle cx="3.5" cy="8" r="1.7" />
        <circle cx="12" cy="3.8" r="1.7" />
        <circle cx="12" cy="12.2" r="1.7" />
        <path d="m5 7.2 5.5-2.7M5 8.8l5.5 2.7" />
      </svg>
    );
  }
  if (kind === "zotero") {
    return (
      <svg {...common}>
        <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" />
        <path d="M5.5 5.3h5L5.5 10.7h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 1.8h6l3 3v9.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" />
      <path d="M10 1.8v3h3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M6.5 2.5h-4v4M9.5 13.5h4v-4M13.5 6.5v-4h-4M2.5 9.5v4h4" />
    </svg>
  );
}

/** Panneau interne — pur vis-à-vis du réseau, testable sans popover/portal.
 * layout "popover" (défaut) : groupes par type, compact.
 * layout "surface" (plan 050) : Attachées à la conversation d'abord, puis la
 * bibliothèque (non attachées) groupée par type — même rangées, mêmes actions. */
export function KbPickerPanel(p: {
  sources: KbSource[];
  attached: string[];
  fullContent: string[];
  error: string | null;
  onToggle: (id: string) => void;
  onToggleFull: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onPromote: (id: string) => void;
  promoted: string | null;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onAddUrl: (url: string) => void;
  onAddNote: (title: string, text: string) => void;
  layout?: "popover" | "surface";
  threadTitle?: string;
  /** Re-synchroniser une page gbrain épinglée depuis le NAS (kind gbrain). */
  onResync?: (slug: string) => void;
  /** Section « Pages gbrain » (surface seulement, plan 050 P3). */
  gbrain?: GbrainSectionProps;
  /** Fermer le message d'erreur (sinon il reste jusqu'au prochain succès). */
  onDismissError?: () => void;
  /** Page directe gbrain (plan 050 P4) : ouvre le dialogue d'aperçu. */
  onPromotePage?: (id: string) => void;
  /** Destination de la zone d'ajout (surface) : base locale ou corpus. */
  destination?: { value: "local" | "gbrain"; onChange: (value: "local" | "gbrain") => void };
  /** Plan 051 : collections (chips-filtres) et archivage. */
  collections?: { slug: string; title: string }[];
  archived?: { count: number; sources: KbSource[] };
  onCreateCollection?: (title: string) => void;
  onTag?: (id: string, slug: string, off: boolean) => void;
  onArchive?: (id: string, off: boolean) => void;
  /** Plan 052 : actions en lot (mode sélection, surface) et collection
   * active remontée (l'épinglage y entre automatiquement). */
  onBatchTag?: (ids: string[], slug: string) => void;
  onBatchArchive?: (ids: string[]) => void;
  onBatchAttach?: (ids: string[]) => void;
  onCollFilterChange?: (slug: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [url, setUrl] = useState("");
  const surface = p.layout === "surface";
  // Plan 051 : chips-collections, tri, groupes repliables, plafond 20.
  const [collFilter, setCollFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "alpha" | "size">("recent");
  const [newCollOpen, setNewCollOpen] = useState(false);
  const [newCollTitle, setNewCollTitle] = useState("");
  const [collMenuFor, setCollMenuFor] = useState<string | null>(null);
  const [expandedKinds, setExpandedKinds] = useState<Set<string>>(() => new Set());
  // Plan 052 : mode sélection + lot.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [batchCollOpen, setBatchCollOpen] = useState(false);
  const lastSelRef = useRef<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("atelier-studio.kbGroupsOpen") ?? "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch { return {}; }
  });
  function toggleGroup(kind: string) {
    setOpenGroups((current) => {
      const next = { ...current, [kind]: !(current[kind] ?? false) };
      try { localStorage.setItem("atelier-studio.kbGroupsOpen", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Recherche étendue : préfixes type:<kind> et coll:<slug>, texte sur
  // titre + origine (domaine, chemin, slug).
  const parsed = (() => {
    let text = query.trim().toLowerCase();
    let kindFilter: string | null = null;
    let collPrefix: string | null = null;
    text = text.replace(/(?:^|\s)type:([a-z]+)/g, (_, v) => { kindFilter = v; return " "; });
    text = text.replace(/(?:^|\s)coll:([a-z0-9-]+)/g, (_, v) => { collPrefix = v; return " "; });
    return { text: text.replace(/\s+/g, " ").trim(), kindFilter, collPrefix };
  })();
  const activeColl = parsed.collPrefix ?? (collFilter !== "__archived" ? collFilter : null);
  useEffect(() => {
    p.onCollFilterChange?.(collFilter && collFilter !== "__archived" ? collFilter : null);
    // eslint hors périmètre : notification volontairement limitée au filtre
  }, [collFilter]);
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitSelect(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);
  const archivedView = collFilter === "__archived";
  const filtering = Boolean(parsed.text || parsed.kindFilter || activeColl);

  const matches = (source: KbSource) => {
    if (parsed.kindFilter && source.kind !== parsed.kindFilter) return false;
    if (activeColl && !(source as { collections?: string[] }).collections?.includes(activeColl)) return false;
    if (!parsed.text) return true;
    const haystack = `${source.title} ${source.origin ?? ""}`.toLowerCase();
    return haystack.includes(parsed.text);
  };
  const sortFn = (a: KbSource, b: KbSource) =>
    sortMode === "alpha" ? a.title.localeCompare(b.title, "fr")
    : sortMode === "size" ? (b.chars || 0) - (a.chars || 0)
    : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  const base = archivedView ? (p.archived?.sources ?? []) : p.sources;
  const filtered = base.filter(matches).sort(sortFn);
  const attachedSources = surface && !archivedView
    ? p.attached
        .filter((id) => id !== "gbrain")
        .map((id) => filtered.find((source) => source.id === id))
        .filter((source): source is KbSource => Boolean(source))
    : [];
  const librarySources = surface && !archivedView
    ? filtered.filter((source) => !p.attached.includes(source.id))
    : filtered;
  // Récents : bases assez grosses seulement (sinon redondant avec les groupes)
  const recents = !archivedView && !filtering && p.sources.length > 8
    ? [...p.sources]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .filter((source) => !p.attached.includes(source.id))
        .slice(0, 5)
    : [];
  const kinds = [
    ...GROUP_ORDER.filter((kind) => librarySources.some((source) => source.kind === kind)),
    ...[...new Set(librarySources.map((source) => source.kind))].filter((kind) => !GROUP_ORDER.includes(kind)),
  ];
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setBatchCollOpen(false);
    lastSelRef.current = null;
  }

  // Ordre visible aplati (miroir du rendu) — support des plages ⇧-clic.
  const visibleIds: string[] = (() => {
    if (archivedView) return filtered.map((s2) => s2.id);
    const out: string[] = [];
    if (surface) out.push(...attachedSources.map((s2) => s2.id));
    out.push(...recents.map((s2) => s2.id));
    for (const kind of kinds) {
      const group = librarySources.filter((s2) => s2.kind === kind);
      const open = !surface || filtering || (openGroups[kind] ?? false);
      if (!open) continue;
      const rows = surface && !expandedKinds.has(kind) ? group.slice(0, 20) : group;
      out.push(...rows.map((s2) => s2.id));
    }
    return [...new Set(out)];
  })();

  function handleSelect(id: string, shift: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      const last = lastSelRef.current;
      if (shift && last && visibleIds.includes(last) && visibleIds.includes(id)) {
        const a = visibleIds.indexOf(last);
        const b = visibleIds.indexOf(id);
        for (const vid of visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(vid);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelRef.current = id;
  }

  const collCount = (slug: string) =>
    p.sources.filter((source) => (source as { collections?: string[] }).collections?.includes(slug)).length;

  function submitUrl() {
    const value = url.trim();
    if (!value) return;
    p.onAddUrl(value);
    setUrl("");
  }

  function submitNote() {
    if (!noteTitle.trim() || !noteText.trim()) return;
    p.onAddNote(noteTitle.trim(), noteText.trim());
    setNoteTitle("");
    setNoteText("");
    setNoteOpen(false);
  }

  const renderRow = (source: KbSource) => {
    const on = p.attached.includes(source.id);
    const full = p.fullContent.includes(source.id);
    const isSelected = selected.has(source.id);
    return (
      <div key={source.id} className="kb-row-wrap">
      <div className={`kb-row ${on ? "on" : ""} ${selectMode && isSelected ? "sel" : ""}`}>
        <RowButton
          className="kb-row-main"
          title={source.origin ?? source.title}
          onClick={(e: React.MouseEvent) => {
            if (selectMode) handleSelect(source.id, e.shiftKey);
            else p.onToggle(source.id);
          }}
        >
          <span className={`kb-check ${selectMode ? (isSelected ? "on" : "") : on ? "on" : ""}`} aria-hidden />
          <span className="kb-kind"><KindIcon kind={source.kind} /></span>
          <span className="kb-name">{source.title}</span>
          <span className="kb-meta">
            {source.kind === "gbrain" ? fmtSyncAge(source.meta?.syncedAt) : fmtChars(source.chars)}
          </span>
        </RowButton>
        <span className="kb-row-actions" style={selectMode ? { display: "none" } : undefined}>
          {source.kind === "gbrain" && p.onResync && typeof source.meta?.slug === "string" && (
            <IconButton
              size="s"
              className="ghost"
              label={t("kb.gbrain-resync")}
              title={t("kb.gbrain-resync")}
              onClick={() => p.onResync?.(source.meta?.slug as string)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.8v2.7h-2.7" />
              </svg>
            </IconButton>
          )}
          <IconButton
            size="s"
            className={`ghost ${p.promoted === source.id ? "on" : ""}`}
            label={t("kb.promote")}
            title={p.promoted === source.id ? t("kb.promoted") : t("kb.promote")}
            onClick={() => p.onPromote(source.id)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5" />
              <path d="M3 14h10" />
            </svg>
          </IconButton>
          {p.onPromotePage && (
            <IconButton
              size="s"
              className="ghost"
              label={t("kb.promote-page")}
              title={t("kb.promote-page")}
              onClick={() => p.onPromotePage?.(source.id)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M4 1.8h6l3 3v9.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z" />
                <path d="M10 1.8v3h3M8 7.5v4M6 9.5h4" />
              </svg>
            </IconButton>
          )}
          <IconButton
            size="s"
            className={`ghost kb-full ${full ? "on" : ""}`}
            label={t("kb.full-content")}
            title={full ? t("kb.full-content-on") : t("kb.full-content")}
            onClick={() => p.onToggleFull(source.id)}
          >
            <ExpandIcon />
          </IconButton>
          {p.onTag && (p.collections?.length ?? 0) > 0 && (
            <IconButton
              size="s"
              className={`ghost ${collMenuFor === source.id ? "on" : ""}`}
              label={t("kb.collections-menu")}
              title={t("kb.collections-menu")}
              onClick={() => setCollMenuFor((current) => (current === source.id ? null : source.id))}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />
              </svg>
            </IconButton>
          )}
          {p.onArchive && (
            <IconButton
              size="s"
              className="ghost"
              label={source.archived ? t("kb.unarchive") : t("kb.archive")}
              title={source.archived ? t("kb.unarchive") : t("kb.archive")}
              onClick={() => p.onArchive?.(source.id, source.archived === true)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M2.2 3h11.6v3H2.2zM3.2 6v6.5a.8.8 0 0 0 .8.8h8a.8.8 0 0 0 .8-.8V6M6.5 9h3" />
              </svg>
            </IconButton>
          )}
          <IconButton
            size="s"
            className="ghost"
            label={t("kb.remove-source")}
            title={t("kb.remove-source")}
            onClick={() => p.onRemoveSource(source.id)}
          >
            ×
          </IconButton>
        </span>
      </div>
      {collMenuFor === source.id && p.onTag && (
        <div className="kb-coll-menu">
          {(p.collections ?? []).map((coll) => {
            const tagged = ((source as { collections?: string[] }).collections ?? []).includes(coll.slug);
            return (
              <RowButton
                key={coll.slug}
                className={`kb-coll-opt ${tagged ? "on" : ""}`}
                onClick={() => p.onTag?.(source.id, coll.slug, tagged)}
              >
                <span className={`kb-check ${tagged ? "on" : ""}`} aria-hidden />
                <span className="kb-name">{coll.title}</span>
              </RowButton>
            );
          })}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className={`kb-panel ${surface ? "kb-panel-surface" : ""}`}>
      <div className="kb-head">
        <span className="kb-title">{t("kb.title")}</span>
        {surface && !archivedView && (
          <RowButton
            className={`kb-sort kb-select-btn ${selectMode ? "on" : ""}`}
            title={t(selectMode ? "kb.select-cancel" : "kb.select")}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          >
            {t(selectMode ? "kb.select-cancel" : "kb.select")}
          </RowButton>
        )}
        {surface && (
          <RowButton
            className="kb-sort"
            title={t("kb.sort-title")}
            onClick={() => setSortMode((mode) => mode === "recent" ? "alpha" : mode === "alpha" ? "size" : "recent")}
          >
            {t(sortMode === "recent" ? "kb.sort-recent" : sortMode === "alpha" ? "kb.sort-alpha" : "kb.sort-size")}
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </RowButton>
        )}
        <Input
          className="kb-search"
          placeholder={t("kb.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {((p.collections?.length ?? 0) > 0 || p.onCreateCollection || (p.archived?.count ?? 0) > 0) && (
        <div className="kb-chips-row">
          <RowButton
            className={`kb-chip-filter ${!collFilter ? "on" : ""}`}
            onClick={() => setCollFilter(null)}
          >
            {t("kb.chips-all", { n: p.sources.length })}
          </RowButton>
          {(p.collections ?? []).map((coll) => (
            <RowButton
              key={coll.slug}
              className={`kb-chip-filter ${collFilter === coll.slug ? "on" : ""}`}
              onClick={() => setCollFilter((current) => (current === coll.slug ? null : coll.slug))}
            >
              {coll.title} · {collCount(coll.slug)}
            </RowButton>
          ))}
          {(p.archived?.count ?? 0) > 0 && (
            <RowButton
              className={`kb-chip-filter kb-chip-archived ${archivedView ? "on" : ""}`}
              onClick={() => setCollFilter((current) => (current === "__archived" ? null : "__archived"))}
            >
              {t("kb.chips-archived", { n: p.archived?.count ?? 0 })}
            </RowButton>
          )}
          {p.onCreateCollection && !newCollOpen && (
            <RowButton className="kb-chip-filter kb-chip-new" onClick={() => setNewCollOpen(true)}>
              {t("kb.chips-new")}
            </RowButton>
          )}
          {p.onCreateCollection && newCollOpen && (
            <Input
              autoFocus
              className="kb-chip-input"
              placeholder={t("kb.coll-name-placeholder")}
              value={newCollTitle}
              onChange={(e) => setNewCollTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  p.onCreateCollection?.(newCollTitle);
                  setNewCollTitle("");
                  setNewCollOpen(false);
                }
                if (e.key === "Escape") setNewCollOpen(false);
              }}
            />
          )}
        </div>
      )}
      <div className="kb-actions">
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={p.onAddFiles}>
          {t("kb.add-file")}
        </Button>
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={p.onAddFolder}>
          {t("kb.add-folder")}
        </Button>
        <Button type="button" variant="ghost" className="ghost kb-action" onClick={() => setNoteOpen((v) => !v)}>
          {t("kb.add-note")}
        </Button>
        <Input
          className="kb-url"
          placeholder={t("kb.url-placeholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitUrl();
            }
          }}
        />
      </div>
      {surface && p.destination && (
        <div className="kb-dest" role="group" aria-label={t("kb.dest-label")}>
          <RowButton
            className={`kb-dest-opt ${p.destination.value === "local" ? "on" : ""}`}
            title={t("kb.dest-local-title")}
            onClick={() => p.destination?.onChange("local")}
          >
            {t("kb.dest-local")}
          </RowButton>
          <RowButton
            className={`kb-dest-opt ${p.destination.value === "gbrain" ? "on" : ""}`}
            title={t("kb.dest-gbrain-title")}
            onClick={() => p.destination?.onChange("gbrain")}
          >
            {t("kb.dest-gbrain")}
          </RowButton>
        </div>
      )}
      {noteOpen && (
        <div className="kb-note-form">
          <Input
            autoFocus
            placeholder={t("kb.note-title")}
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <textarea
            className="kb-note-text"
            placeholder={t("kb.note-text")}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <div className="kb-note-actions">
            <Button type="button" variant="ghost" className="ghost" onClick={() => setNoteOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" variant="ghost" className="ghost" onClick={submitNote}>
              {t("kb.note-save")}
            </Button>
          </div>
        </div>
      )}
      {p.error && (
        <div className="kb-error">
          <span className="kb-error-text">{p.error}</span>
          {p.onDismissError && (
            <IconButton
              size="s"
              className="ghost"
              label={t("kb.error-dismiss")}
              title={t("kb.error-dismiss")}
              onClick={() => p.onDismissError?.()}
            >
              ×
            </IconButton>
          )}
        </div>
      )}
      <div className="kb-list">
        {archivedView && (
          <div>
            <div className="kb-group">{t("kb.archived-title", { n: p.archived?.count ?? 0 })}</div>
            {filtered.map(renderRow)}
            {filtered.length === 0 && <div className="kb-empty">{t("kb.archived-empty")}</div>}
          </div>
        )}
        {surface && !archivedView && (
          <div>
            <div className="kb-group">
              {t("kb.panel-attached", {
                title: p.threadTitle?.trim() || t("app.new-chat-title"),
                n: p.attached.length,
              })}
            </div>
            {attachedSources.map(renderRow)}
            {attachedSources.length === 0 && !p.attached.includes("gbrain") && (
              <div className="kb-empty">{t("kb.panel-attached-empty")}</div>
            )}
          </div>
        )}
        {!archivedView && recents.length > 0 && (
          <div>
            <div className="kb-group">{t("kb.recents")}</div>
            {recents.map(renderRow)}
          </div>
        )}
        {surface && !archivedView && filtered.length > 0 && (
          <div className="kb-group kb-group-section">{t("kb.panel-library")}</div>
        )}
        {!surface && !archivedView && filtered.length === 0 && <div className="kb-empty">{t("kb.empty")}</div>}
        {!archivedView && kinds.map((kind) => {
          const group = librarySources.filter((source) => source.kind === kind);
          // surface : groupes repliés par défaut (comptes visibles), le filtre
          // ou la recherche ouvre tout ; plafond 20 + « tout afficher »
          const open = !surface || filtering || (openGroups[kind] ?? false);
          const expanded = expandedKinds.has(kind);
          const rows = surface && !expanded ? group.slice(0, 20) : group;
          const label = GROUP_LABELS[kind] ? t(GROUP_LABELS[kind]) : kind;
          return (
            <div key={kind}>
              {surface ? (
                <RowButton
                  className="kb-group kb-group-toggle"
                  onClick={() => {
                    if (selectMode) {
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const s2 of group) next.add(s2.id);
                        return next;
                      });
                    } else {
                      toggleGroup(kind);
                    }
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                    {open ? <path d="m4 6 4 4 4-4" /> : <path d="m6 4 4 4-4 4" />}
                  </svg>
                  <span>{label}</span>
                  <span className="kb-group-count">— {group.length}</span>
                </RowButton>
              ) : (
                <div className="kb-group">{label}</div>
              )}
              {open && rows.map(renderRow)}
              {open && surface && group.length > rows.length && (
                <RowButton className="kb-more" onClick={() => setExpandedKinds((s2) => new Set(s2).add(kind))}>
                  {t("kb.show-all", { n: group.length })}
                </RowButton>
              )}
            </div>
          );
        })}
        <div>
          {!archivedView && (
            <>
              <div className="kb-group">{t("kb.group-corpus")}</div>
              <div className={`kb-row ${p.attached.includes("gbrain") ? "on" : ""}`}>
                <RowButton
                  className="kb-row-main"
                  title={t("kb.gbrain-title")}
                  onClick={() => p.onToggle("gbrain")}
                >
                  <span className={`kb-check ${p.attached.includes("gbrain") ? "on" : ""}`} aria-hidden />
                  <span className="kb-kind"><KindIcon kind="gbrain" /></span>
                  <span className="kb-name">{t("kb.gbrain-title")}</span>
                  <span className="kb-meta">{t("kb.gbrain-meta")}</span>
                </RowButton>
              </div>
            </>
          )}
        </div>
        {surface && !archivedView && p.gbrain && (
          <div className="kb-gbrain-section">
            <div className="kb-group kb-group-section">{t("kb.gbrain-pages")}</div>
            <Input
              className="kb-gbrain-search"
              placeholder={t("kb.gbrain-search-placeholder")}
              value={p.gbrain.query}
              onChange={(e) => p.gbrain?.onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  p.gbrain?.onSearch();
                }
              }}
            />
            {p.gbrain.error && <div className="kb-error">{p.gbrain.error}</div>}
            {p.gbrain.searching && <div className="kb-empty">{t("kb.gbrain-searching")}</div>}
            {p.gbrain.searched && !p.gbrain.searching && !p.gbrain.error
              && p.gbrain.results.length === 0 && (
              <div className="kb-empty">{t("kb.gbrain-none")}</div>
            )}
            {p.gbrain.results.map((result) => {
              const pinned = p.sources.find(
                (source) => source.kind === "gbrain" && source.meta?.slug === result.slug,
              );
              if (pinned) return renderRow(pinned);
              return (
                <div key={result.slug} className="kb-row">
                  <RowButton
                    className="kb-row-main"
                    title={result.snippet ?? result.slug}
                    onClick={() => p.gbrain?.onPin(result.slug)}
                  >
                    <span className="kb-check" aria-hidden />
                    <span className="kb-kind"><KindIcon kind="gbrain" /></span>
                    <span className="kb-name">{result.slug}</span>
                    <span className="kb-meta">{t("kb.gbrain-meta-nas")}</span>
                  </RowButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectMode && (
        <div className="kb-batchbar">
          <span className="kb-batch-count">{t("kb.selected-count", { n: selected.size })}</span>
          {filtering && visibleIds.some((id) => !selected.has(id)) && (
            <RowButton className="kb-batch-act" onClick={() => setSelected(new Set([...selected, ...visibleIds]))}>
              {t("kb.select-visible", { n: visibleIds.length })}
            </RowButton>
          )}
          {(p.collections?.length ?? 0) > 0 && p.onBatchTag && (
            <RowButton
              className={`kb-batch-act ${batchCollOpen ? "on" : ""}`}
              onClick={() => setBatchCollOpen((v) => !v)}
            >
              {t("kb.batch-add-to")}
            </RowButton>
          )}
          {p.onBatchArchive && (
            <RowButton
              className="kb-batch-act"
              onClick={() => { p.onBatchArchive?.([...selected]); exitSelect(); }}
            >
              {t("kb.batch-archive")}
            </RowButton>
          )}
          {p.onBatchAttach && (
            <RowButton
              className="kb-batch-act"
              onClick={() => { p.onBatchAttach?.([...selected]); exitSelect(); }}
            >
              {t("kb.batch-attach")}
            </RowButton>
          )}
          <RowButton className="kb-batch-act kb-batch-cancel" onClick={exitSelect}>
            {t("kb.select-cancel")}
          </RowButton>
        </div>
      )}
      {selectMode && batchCollOpen && (
        <div className="kb-coll-menu kb-batch-coll">
          {(p.collections ?? []).map((coll) => (
            <RowButton
              key={coll.slug}
              className="kb-coll-opt"
              onClick={() => { p.onBatchTag?.([...selected], coll.slug); exitSelect(); }}
            >
              <span className="kb-check" aria-hidden />
              <span className="kb-name">{coll.title}</span>
            </RowButton>
          ))}
        </div>
      )}
      <div className="kb-foot">
        <span>{t("kb.attached-count").replace("{n}", String(p.attached.length))}</span>
        {surface && (p.archived?.count ?? 0) > 0 && !archivedView && (
          <span className="kb-foot-archived">{t("kb.foot-archived", { n: p.archived?.count ?? 0 })}</span>
        )}
        <span className="kb-scope">{t("kb.scope-conversation")}</span>
      </div>
    </div>
  );
}

export function KbPicker({ binding }: { binding: KbBinding }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  const collections = useSyncExternalStore(subscribeKbSources, kbCollectionsSnapshot);
  const archived = useSyncExternalStore(subscribeKbSources, kbArchivedSnapshot);
  const openRef = useRef(pickerOpen);
  openRef.current = pickerOpen;
  // toute la logique d'actions vit dans le hook partagé avec la surface
  // Connaissances (plan 050) — le popover n'est qu'une coquille
  const activeCollRef = useRef<string | null>(null);
  const actions = useKbActions(binding, () => openRef.current, {
    activeCollection: () => activeCollRef.current,
  });
  // ouverture externe (pilule agrégée)
  useEffect(() => onOpenKbPicker(() => {
    actions.setError(null);
    requestKbSources();
    setPickerOpen(true);
  }), []);
  return (
    <Popover
      open={pickerOpen}
      onOpenChange={(next) => {
        setPickerOpen(next);
        if (next) {
          actions.setError(null);
          requestKbSources();
        }
      }}
    >
      <PopoverTrigger
        render={
          <IconButton
            size="s"
            className="ghost kb-trigger"
            label={t("kb.open")}
            // le badge donne le compte, le survol donne les titres (les
            // pilules KB du composer ont été retirées — plan 050)
            title={binding.attached.length
              ? `${t("kb.open")} — ${binding.attached
                  .map((id) => (id === "gbrain" ? t("kb.gbrain-title") : sources.find((s) => s.id === id)?.title ?? id))
                  .slice(0, 3)
                  .join(", ")}${binding.attached.length > 3 ? ` +${binding.attached.length - 3}` : ""}`
              : t("kb.open")}
          >
            <BookIcon />
            {binding.attached.length > 0 && (
              <span className="kb-badge">{binding.attached.length}</span>
            )}
          </IconButton>
        }
      />
      {pickerOpen && (
        <PopoverContent plain side="top" align="start" sideOffset={8} className="kb-pop">
          <KbPickerPanel
            sources={sources}
            attached={binding.attached}
            fullContent={binding.fullContent}
            error={actions.error}
            onToggle={actions.toggle}
            onToggleFull={actions.toggleFull}
            onRemoveSource={actions.removeSource}
            onPromote={actions.promote}
            promoted={actions.promoted}
            onDismissError={() => actions.setError(null)}
            collections={collections}
            archived={archived}
            onCreateCollection={actions.createCollection}
            onTag={actions.tagSource}
            onArchive={actions.archiveSource}
            onCollFilterChange={(slug) => { activeCollRef.current = slug; }}
            onAddFiles={() => { void actions.addFiles(); }}
            onAddFolder={() => { void actions.addFolder(); }}
            onAddUrl={actions.addUrl}
            onAddNote={actions.addNote}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
