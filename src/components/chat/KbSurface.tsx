// Surface « Connaissances » refondue (plan 054) : UNE liste, UNE barre, UN
// bouton. Les types deviennent des filtres au lieu de sections, les actions de
// rangée passent dans un menu au survol, et la recherche du corpus se fait
// depuis la même barre que le filtre local. Le popover du composer garde son
// panneau historique (KbPickerPanel) — c'est la table de travail qui change.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import SourceReader, { type ReaderTarget } from "./SourceReader";
import type { KbSource } from "../../lib/kbSources";
import {
  articleImportSnapshot, dismissArticleImport, fileName, openArticleDialog, openGbrainPage,
  stageLabel, startDoiImport, subscribeArticleImport, type ArticleJob,
} from "../../lib/articleImports";
import { KindIcon, type ArticleRow, type GbrainSectionProps } from "./KbPicker";
import { clearPendingPassageOpen, consumePendingPassageOpen } from "../../lib/pendingPassageOpen";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "../ui/LazyDropdownMenu";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Input } from "../shadcn/input";
import { RowButton } from "../ui/RowButton";

export type KbFilter = "all" | "attached" | "pdf" | "note" | "web" | "file" | "corpus";

/** Famille de filtre d'une source — les kinds voisins sont regroupés. */
export function filterOf(kind: string): KbFilter {
  if (kind === "pdf" || kind === "zotero") return "pdf";
  if (kind === "web" || kind === "youtube") return "web";
  if (kind === "note") return "note";
  if (kind === "gbrain") return "corpus";
  return "file";
}

const FILTER_LABELS: Record<Exclude<KbFilter, "all" | "attached">, Parameters<typeof t>[0]> = {
  pdf: "kbs.filter-pdf",
  note: "kbs.filter-note",
  web: "kbs.filter-web",
  file: "kbs.filter-file",
  corpus: "kbs.filter-corpus",
};
const FILTER_ORDER: Exclude<KbFilter, "all" | "attached">[] = ["pdf", "note", "web", "file", "corpus"];

/** Âge lisible : on cherche par récence, pas au caractère près. */
export function fmtAge(value: unknown, now = Date.now()): string {
  const ts = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ts)) return "";
  const minutes = Math.max(0, Math.round((now - ts) / 60_000));
  if (minutes < 1) return t("kbs.age-now");
  if (minutes < 60) return t("kbs.age-min", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("kbs.age-hour", { n: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return t("kbs.age-yesterday");
  if (days < 30) return t("kbs.age-day", { n: days });
  return new Date(ts).toISOString().slice(0, 10);
}

/** Rangée : une source de la base, ou une page du dépôt gbrain. */
type Row = {
  key: string;
  filter: KbFilter;
  kind: string;
  title: string;
  at: string;
  meta: string;
  source: KbSource | null;
  slug: string | null;
  /** Page gbrain déjà présente dans la base (onglet gbrain seulement). */
  pinned?: boolean;
};

/** Slugs des pages gbrain que l'utilisateur a épinglées dans sa base. */
function pinnedSlugs(sources: KbSource[]) {
  return new Set(
    sources.filter((s) => s.kind === "gbrain").map((s) => String(s.meta?.slug ?? s.origin ?? "")),
  );
}

/** La BASE : uniquement ce que l'utilisateur a mis là. Le dépôt gbrain ne s'y
 *  déverse pas — sinon la liste qu'il cure grossit à chaque ingestion, ce qui
 *  était exactement le reproche. Une page gbrain n'y entre que par un geste
 *  explicite d'épinglage, et elle arrive alors comme une source ordinaire. */
export function buildRows(sources: KbSource[], { now = Date.now() }: { now?: number } = {}): Row[] {
  return sources
    .map((source) => ({
      key: source.id,
      filter: filterOf(source.kind),
      kind: source.kind,
      title: source.title,
      at: source.updatedAt || source.addedAt || "",
      meta: fmtAge(source.updatedAt || source.addedAt, now),
      source,
      slug: source.kind === "gbrain" ? String(source.meta?.slug ?? source.origin ?? "") : null,
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Le DÉPÔT : les articles ingérés, qu'ils soient déjà dans la base ou non.
 *  Ceux qui y sont se signalent au lieu de disparaître — on doit pouvoir lire
 *  le dépôt pour ce qu'il contient, pas pour ce qui lui manque. */
export function buildCorpusRows(
  sources: KbSource[],
  articles: ArticleRow[],
  { now = Date.now() }: { now?: number } = {},
): Row[] {
  void now;
  const pinned = pinnedSlugs(sources);
  return articles
    .filter((article) => Boolean(article.slug))
    .map((article) => ({
      key: `corpus:${article.slug}`,
      filter: "corpus" as KbFilter,
      kind: "gbrain",
      title: article.title || String(article.slug),
      at: article.date ? `${article.date}T12:00:00Z` : "",
      meta: article.date ?? "",
      source: null,
      slug: String(article.slug),
      pinned: pinned.has(String(article.slug)),
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export default function KbSurface(p: {
  sources: KbSource[];
  attached: string[];
  fullContent: string[];
  articles?: ArticleRow[];
  threadTitle?: string;
  error: string | null;
  onDismissError?: () => void;
  onToggle: (id: string) => void;
  onToggleFull: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onPromote: (id: string) => void;
  onPromotePage?: (id: string) => void;
  onResync?: (slug: string) => void;
  onArchive?: (id: string, off: boolean) => void;
  archived?: { count: number; sources: KbSource[] };
  onAddFiles: () => void;
  onAddFolder: () => void;
  onAddNote: (title: string, text: string) => void;
  onAddUrl: (url: string) => void;
  onAddArticle?: () => void;
  /** Ouvre le PDF d'origine d'une page du dépôt (chemin du front matter). */
  onOpenOrigin?: (path: string) => void;
  onBatchAttach?: (ids: string[]) => void;
  onBatchArchive?: (ids: string[]) => void;
  gbrain?: GbrainSectionProps;
  headerEnd?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<KbFilter>("all");
  const [archivedView, setArchivedView] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Deux territoires : « base » est ce que l'utilisateur a choisi et cure,
  // « gbrain » est le dépôt qui s'accumule et où les PDF entrent. Ils n'ont pas
  // la même vie ; les mélanger faisait grossir la base à chaque ingestion.
  const [tab, setTab] = useState<"base" | "brain">("base");
  // Page du dépôt ouverte en lecture : le lecteur remplace la liste, avec un
  // retour. Pas de modale — une lecture d'article dure.
  const [lecture, setLecture] = useState<ReaderTarget | null>(null);
  // Citation à défiler/surligner dans le lecteur (carte passage gbrain, tâche
  // 6) — distincte de `lecture` : une ouverture normale (rangée, menu) n'a
  // rien à surligner et doit effacer un highlight resté d'une ouverture
  // précédente.
  const [lectureHighlight, setLectureHighlight] = useState<string | null>(null);
  function openLecture(target: ReaderTarget, highlightQuote: string | null = null) {
    setLecture(target);
    setLectureHighlight(highlightQuote);
  }
  // Ouverture depuis une carte passage gbrain du chat (md.tsx,
  // openGbrainPassage) — même schéma découplé que chat-open-zotero-passage/
  // BiblioSurface : App.tsx bascule la surface, ce listener ouvre le lecteur.
  //
  // Premier clic perdu (revue finale de branche, finding 1) : l'événement
  // part de façon SYNCHRONE au moment même où App.tsx bascule la surface —
  // mais ce composant ne monte qu'au rendu SUIVANT, donc ce listener n'existe
  // pas encore quand l'event arrive. openGbrainPassage pose une entrée dans
  // pendingPassageOpen AVANT le dispatch ; au montage, on la consomme et on
  // la traite comme si l'événement venait d'arriver. Un événement reçu en
  // direct (listener déjà monté) efface l'entrée — sinon un remontage futur
  // sans rapport la rejouerait à tort.
  useEffect(() => {
    const handleGbrainPassage = (detail: { slug?: string; quote?: string } | undefined) => {
      if (!detail?.slug) return;
      openLecture({ kind: "gbrain", slug: detail.slug }, detail.quote || null);
    };
    const onOpenGbrainPassage = (e: Event) => {
      clearPendingPassageOpen();
      handleGbrainPassage((e as CustomEvent).detail);
    };
    window.addEventListener("kb-open-gbrain-passage", onOpenGbrainPassage);
    const pending = consumePendingPassageOpen();
    if (pending?.kind === "gbrain") {
      handleGbrainPassage(pending.detail as { slug?: string; quote?: string } | undefined);
    }
    return () => window.removeEventListener("kb-open-gbrain-passage", onOpenGbrainPassage);
  }, []);
  // imports en vol : rangées vivantes en tête de liste (plan 054)
  const imports = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const live = imports.jobs.filter((job) => job.phase !== "error");

  const shown = archivedView ? (p.archived?.sources ?? []) : p.sources;
  const rows = useMemo(() => buildRows(shown), [shown]);
  const corpusRows = useMemo(
    () => buildCorpusRows(p.sources, p.articles ?? []),
    [p.sources, p.articles],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length, attached: p.attached.length };
    for (const row of rows) out[row.filter] = (out[row.filter] ?? 0) + 1;
    return out;
  }, [rows, p.attached.length]);

  const needle = query.trim().toLowerCase();
  const corpusVisible = corpusRows.filter((row) => !needle
    || `${row.title} ${row.slug ?? ""}`.toLowerCase().includes(needle));
  const visible = rows.filter((row) => {
    if (filter === "attached") {
      if (!row.source || !p.attached.includes(row.source.id)) return false;
    } else if (filter !== "all" && row.filter !== filter) return false;
    if (!needle) return true;
    return `${row.title} ${row.slug ?? ""} ${row.source?.origin ?? ""}`.toLowerCase().includes(needle);
  });

  // Une URL collée s'épingle, un DOI importe sa fiche de référence ; le reste
  // filtre la liste. La barre dit ce qu'elle fera avant qu'on valide.
  const trimmed = query.trim();
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed) && !/doi\.org\//i.test(trimmed);
  const doi = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(trimmed)?.[1] ?? null;

  function submitBar() {
    const value = query.trim();
    if (!value) return;
    if (doi) {
      // un DOI est une ingestion : il appartient au dépôt, on y bascule
      setTab("brain");
      startDoiImport(doi);
      setQuery("");
      return;
    }
    if (looksLikeUrl) {
      p.onAddUrl(value);
      setQuery("");
      return;
    }
    p.gbrain?.onQueryChange(value);
    p.gbrain?.onSearch();
  }

  useEffect(() => {
    if (!live.some((job) => job.phase === "converting")) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  function renderJob(job: ArticleJob) {
    const guessed = job.imported?.metaSource === "texte";
    const done = job.phase === "done";
    return (
      <div className={`kb-row kbs-job${done ? " kbs-job-done" : ""}`} key={job.requestId}>
        <RowButton
          className="kb-row-main"
          title={done ? String(job.writtenSlug ?? "") : job.path}
          // Une fiche terminée mène à SA page ; une conversion mène au suivi.
          onClick={() => (done
            ? void openGbrainPage(String(job.writtenSlug ?? ""))
            : openArticleDialog(job.requestId))}
        >
          <span className="kb-check" aria-hidden />
          <span className="kb-kind">
            {job.phase === "converting" || job.phase === "writing" ? (
              <svg className="kbs-spin" width="13" height="13" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M8 2a6 6 0 1 0 6 6" />
              </svg>
            ) : done ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8.5l3.5 3.5L13 4" />
              </svg>
            ) : (
              <KindIcon kind="pdf" />
            )}
          </span>
          <span className="kb-name">{job.imported?.meta?.title || fileName(job.path)}</span>
          {job.phase === "ready" && guessed && <span className="kbs-flag">{t("kbs.flag-review")}</span>}
          <span className="kb-meta">
            {job.phase === "writing"
              ? t("article.writing")
              : job.phase === "converting"
                // l'étape réelle plutôt que le seul compteur : « conversion
                // chez MinerU — 42 s » dit ce qui se passe, « 42 s » non
                ? stageLabel(job, now)
                : done
                  ? `${t(job.writtenUpdated ? "kbs.job-updated" : "kbs.job-done")} · ${job.writtenSlug ?? ""}`
                  : t("kbs.job-ready")}
          </span>
        </RowButton>
        {done && (
          <IconButton
            className="kbs-job-clear"
            label={t("kbs.job-clear")}
            onClick={() => dismissArticleImport(job.requestId)}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </IconButton>
        )}
      </div>
    );
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function rowMenu(row: Row): LazyDropdownMenuItem[] {
    const items: LazyDropdownMenuItem[] = [];
    const source = row.source;
    if (source) {
      items.push({
        key: "full",
        label: t(p.fullContent.includes(source.id) ? "kbs.menu-full-on" : "kbs.menu-full"),
        onSelect: () => p.onToggleFull(source.id),
      });
      if (p.onPromotePage) {
        items.push({ key: "page", label: t("kb.promote-page"), onSelect: () => p.onPromotePage?.(source.id) });
      }
      items.push({ key: "promote", label: t("kb.promote"), onSelect: () => p.onPromote(source.id) });
      if (row.slug && p.onResync) {
        items.push({ key: "resync", label: t("kb.gbrain-resync"), onSelect: () => p.onResync?.(row.slug as string) });
      }
      if (p.onArchive) {
        items.push({
          key: "archive",
          separatorBefore: true,
          label: t(archivedView ? "kb.unarchive" : "kb.archive"),
          onSelect: () => p.onArchive?.(source.id, archivedView),
        });
      }
      items.push({
        key: "remove",
        destructive: true,
        label: t("kb.remove-source"),
        onSelect: () => p.onRemoveSource(source.id),
      });
      return items;
    }
    // page du dépôt : la lire, ou la faire entrer dans la base
    return [
      { key: "read", label: t("kbs.menu-read"), onSelect: () => openLecture({ kind: "gbrain", slug: row.slug ?? "" }) },
      {
        key: "pin",
        separatorBefore: true,
        label: t(row.pinned ? "kbs.menu-resync" : "kbs.menu-pin"),
        onSelect: () => p.gbrain?.onPin(row.slug ?? ""),
      },
    ];
  }

  function renderRow(row: Row) {
    const source = row.source;
    const on = Boolean(source && p.attached.includes(source.id));
    const full = Boolean(source && p.fullContent.includes(source.id));
    // Le dépôt ne s'attache pas à une conversation : on y puise. Pas de case,
    // et une seule action utile — faire entrer la page dans la base.
    const corpus = !source;
    return (
      <div className={`kb-row ${on ? "on" : ""}`} key={row.key}>
        {/* Le cercle porte l'attachement, la rangée ouvre. Le clic était
            dépensé pour attacher et rien n'ouvrait la source ; le cercle, lui,
            ne faisait que refléter l'état. Même grammaire dans les deux
            onglets : cliquer ouvre, un geste distinct engage. */}
        {!corpus && source && (
          <RowButton
            className={`kb-check-btn ${selectMode ? (selected.has(source.id) ? "on" : "") : on ? "on" : ""}`}
            aria-pressed={selectMode ? selected.has(source.id) : on}
            title={t(selectMode ? "kbs.select" : on ? "kbs.detach" : "kbs.attach")}
            onClick={() => (selectMode ? toggleSelected(source.id) : p.onToggle(source.id))}
          >
            <span className="kb-check" aria-hidden />
          </RowButton>
        )}
        <RowButton
          className="kb-row-main"
          title={source?.origin ?? row.slug ?? row.title}
          onClick={() => {
            if (selectMode && source) toggleSelected(source.id);
            else if (source) openLecture({ kind: "source", id: source.id });
            else openLecture({ kind: "gbrain", slug: row.slug ?? "" });
          }}
        >
          <span className="kb-kind"><KindIcon kind={row.kind} /></span>
          <span className="kb-name">{row.title}</span>
          {full && <span className="kbs-flag">{t("kbs.flag-full")}</span>}
          {corpus && row.pinned && (
            <span className="kbs-flag kbs-flag-quiet">{t("kbs.flag-in-base")}</span>
          )}
          <span className="kb-meta">{row.meta}</span>
        </RowButton>
        <span className="kb-row-actions">
          <LazyDropdownMenu
            open={menuFor === row.key}
            onOpenChange={(open) => setMenuFor(open ? row.key : null)}
            align="end"
            label={t("kbs.menu-label")}
            trigger={(
              <IconButton size="s" className="ghost" label={t("kbs.menu-label")} title={t("kbs.menu-label")}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="8" cy="3" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="8" cy="13" r="1.3" />
                </svg>
              </IconButton>
            )}
            items={rowMenu(row)}
          />
        </span>
      </div>
    );
  }

  if (lecture) {
    return (
      <div className="kb-panel kb-panel-surface kbs">
        <SourceReader
          target={lecture}
          onClose={() => { setLecture(null); setLectureHighlight(null); }}
          onPin={(slug) => p.gbrain?.onPin(slug)}
          onToggleFull={p.onToggleFull}
          full={lecture.kind === "source" && p.fullContent.includes(lecture.id)}
          highlightQuote={lectureHighlight ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="kb-panel kb-panel-surface kbs">
      <div className="kb-head">
        <span className="kb-title">{t("kbs.title")}</span>
        <span className="kbs-seg" role="tablist" aria-label={t("kbs.tabs-label")}>
          <RowButton
            role="tab"
            aria-selected={tab === "base"}
            className={`kbs-seg-tab ${tab === "base" ? "on" : ""}`}
            onClick={() => setTab("base")}
          >
            {t("kbs.tab-base")} <span className="kbs-seg-n">{rows.length}</span>
          </RowButton>
          <RowButton
            role="tab"
            aria-selected={tab === "brain"}
            className={`kbs-seg-tab ${tab === "brain" ? "on" : ""}`}
            onClick={() => setTab("brain")}
          >
            {t("kbs.tab-brain")} <span className="kbs-seg-n">{corpusRows.length}</span>
          </RowButton>
        </span>
        {tab === "base" && p.attached.length > 0 && (
          <RowButton
            className={`kb-chip-filter ${filter === "attached" ? "on" : ""}`}
            title={t("kbs.attached-title", { title: p.threadTitle?.trim() || t("app.new-chat-title") })}
            onClick={() => setFilter((current) => (current === "attached" ? "all" : "attached"))}
          >
            {t("kbs.attached", { n: p.attached.length })}
          </RowButton>
        )}
        <span className="kbs-spacer" />
        {tab === "brain" ? (
          // Dans le dépôt, une seule entrée possible : un PDF à convertir.
          <Button
            type="button"
            variant="ghost"
            className="ghost kbs-add"
            onClick={() => p.onAddArticle?.()}
          >
            {t("kbs.import-pdf")}
          </Button>
        ) : (
        <LazyDropdownMenu
          open={addOpen}
          onOpenChange={setAddOpen}
          align="end"
          label={t("kbs.add")}
          trigger={(
            <Button type="button" variant="ghost" className="ghost kbs-add">
              {t("kbs.add")}
            </Button>
          )}
          items={[
            { key: "files", label: t("kb.add-file"), onSelect: () => p.onAddFiles() },
            { key: "folder", label: t("kb.add-folder"), onSelect: () => p.onAddFolder() },
            { key: "note", label: t("kb.add-note"), onSelect: () => setNoteOpen(true) },
            // L'import d'article n'ajoute rien à la base : il alimente le dépôt.
            {
              key: "article",
              separatorBefore: true,
              label: t("kbs.add-article"),
              onSelect: () => { setTab("brain"); p.onAddArticle?.(); },
            },
          ]}
        />
        )}
        <LazyDropdownMenu
          open={panelOpen}
          onOpenChange={setPanelOpen}
          align="end"
          label={t("kbs.panel-menu")}
          trigger={(
            <IconButton size="s" className="ghost" label={t("kbs.panel-menu")} title={t("kbs.panel-menu")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
              </svg>
            </IconButton>
          )}
          items={[
            {
              key: "select",
              label: t(selectMode ? "kb.select-cancel" : "kb.select"),
              onSelect: () => (selectMode ? exitSelect() : setSelectMode(true)),
            },
            {
              key: "archived",
              separatorBefore: true,
              label: t(archivedView ? "kbs.menu-back" : "kbs.menu-archived", { n: p.archived?.count ?? 0 }),
              disabled: !archivedView && (p.archived?.count ?? 0) === 0,
              onSelect: () => setArchivedView((v) => !v),
            },
          ]}
        />
        {p.headerEnd && <div className="workspace-pane-controls-slot">{p.headerEnd}</div>}
      </div>

      <Input
        className="kbs-search"
        placeholder={t(tab === "brain" ? "kbs.search-brain" : "kbs.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitBar();
          }
        }}
      />
      {doi && <div className="kbs-hint">{t("kbs.hint-doi")}</div>}
      {looksLikeUrl && <div className="kbs-hint">{t("kbs.hint-url")}</div>}

      {/* Le dépôt est d'une seule nature : rien à filtrer par type. */}
      {tab === "base" && (
        <div className="kb-chips-row">
          <RowButton
            className={`kb-chip-filter ${filter === "all" ? "on" : ""}`}
            onClick={() => setFilter("all")}
          >
            {t("kbs.filter-all", { n: counts.all ?? 0 })}
          </RowButton>
          {FILTER_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => (
            <RowButton
              key={key}
              className={`kb-chip-filter ${filter === key ? "on" : ""}`}
              onClick={() => setFilter((current) => (current === key ? "all" : key))}
            >
              {t(FILTER_LABELS[key])} · {counts[key]}
            </RowButton>
          ))}
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
            <Button
              type="button"
              variant="ghost"
              className="ghost"
              onClick={() => {
                if (!noteTitle.trim() && !noteText.trim()) return;
                p.onAddNote(noteTitle.trim(), noteText.trim());
                setNoteTitle("");
                setNoteText("");
                setNoteOpen(false);
              }}
            >
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
        {/* Les conversions vivent dans le dépôt : elles n'ont rien à faire dans
            la liste que l'utilisateur cure. */}
        {tab === "brain" && live.map(renderJob)}
        {tab === "brain" && corpusVisible.map(renderRow)}
        {tab === "brain" && corpusVisible.length === 0 && live.length === 0 && (
          <div className="kb-empty">{t(needle ? "kbs.empty-search" : "kbs.empty-brain")}</div>
        )}
        {tab === "brain" && corpusRows.length > 0 && (
          <div className="kbs-foot">{t("kbs.brain-cap", { n: corpusRows.length })}</div>
        )}
        {tab === "base" && visible.map(renderRow)}
        {tab === "base" && visible.length === 0 && (
          <div className="kb-empty">{t(needle ? "kbs.empty-search" : "kbs.empty")}</div>
        )}

        {/* Le corpus se cherche depuis la même barre : dernière ligne, pas
            deuxième champ. */}
        {p.gbrain && needle.length >= 2 && !looksLikeUrl && (
          <>
            <RowButton className="kbs-corpus-cta" onClick={submitBar}>
              {p.gbrain.searching
                ? t("kb.gbrain-searching")
                : t("kbs.search-corpus", { q: query.trim() })}
            </RowButton>
            {p.gbrain.error && <div className="kb-error">{p.gbrain.error}</div>}
            {p.gbrain.results.map((result) => (
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
            ))}
          </>
        )}
      </div>

      {selectMode && (
        <div className="kb-batchbar">
          <span className="kb-batch-count">{t("kb.selected-count", { n: selected.size })}</span>
          <RowButton
            className="kb-batch-act"
            onClick={() => {
              p.onBatchAttach?.([...selected]);
              exitSelect();
            }}
          >
            {t("kbs.batch-attach")}
          </RowButton>
          {p.onBatchArchive && (
            <RowButton
              className="kb-batch-act"
              onClick={() => {
                p.onBatchArchive?.([...selected]);
                exitSelect();
              }}
            >
              {t("kb.archive")}
            </RowButton>
          )}
          <RowButton className="kb-batch-act kb-batch-cancel" onClick={exitSelect}>
            {t("action.cancel")}
          </RowButton>
        </div>
      )}
    </div>
  );
}
