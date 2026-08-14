// Surface « Connaissances » refondue (plan 054) : UNE liste, UNE barre, UN
// bouton. Les types deviennent des filtres au lieu de sections, les actions de
// rangée passent dans un menu au survol, et la recherche du corpus se fait
// depuis la même barre que le filtre local. Le popover du composer garde son
// panneau historique (KbPickerPanel) — c'est la table de travail qui change.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import type { KbSource } from "../../lib/kbSources";
import {
  articleImportSnapshot, fileName, openArticleDialog, startDoiImport,
  subscribeArticleImport, type ArticleJob,
} from "../../lib/articleImports";
import { KindIcon, type ArticleRow, type GbrainSectionProps } from "./KbPicker";
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

/** Rangée unifiée : une source épinglée OU une page du corpus pas encore épinglée. */
type Row = {
  key: string;
  filter: KbFilter;
  kind: string;
  title: string;
  at: string;
  meta: string;
  source: KbSource | null;
  slug: string | null;
};

export function buildRows(
  sources: KbSource[],
  articles: ArticleRow[],
  { now = Date.now() }: { now?: number } = {},
): Row[] {
  const pinned = new Set(
    sources.filter((s) => s.kind === "gbrain").map((s) => String(s.meta?.slug ?? s.origin ?? "")),
  );
  const rows: Row[] = sources.map((source) => ({
    key: source.id,
    filter: filterOf(source.kind),
    kind: source.kind,
    title: source.title,
    at: source.updatedAt || source.addedAt || "",
    meta: fmtAge(source.updatedAt || source.addedAt, now),
    source,
    slug: source.kind === "gbrain" ? String(source.meta?.slug ?? source.origin ?? "") : null,
  }));
  for (const article of articles) {
    if (!article.slug || pinned.has(article.slug)) continue;
    rows.push({
      key: `corpus:${article.slug}`,
      filter: "corpus",
      kind: "gbrain",
      title: article.title || article.slug,
      at: article.date ? `${article.date}T12:00:00Z` : "",
      meta: article.date ?? "",
      source: null,
      slug: article.slug,
    });
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
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
  // imports en vol : rangées vivantes en tête de liste (plan 054)
  const imports = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const live = imports.jobs.filter((job) => job.phase !== "error");

  const shown = archivedView ? (p.archived?.sources ?? []) : p.sources;
  const rows = useMemo(
    () => buildRows(shown, archivedView ? [] : (p.articles ?? [])),
    [shown, p.articles, archivedView],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length, attached: p.attached.length };
    for (const row of rows) out[row.filter] = (out[row.filter] ?? 0) + 1;
    return out;
  }, [rows, p.attached.length]);

  const needle = query.trim().toLowerCase();
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
    const seconds = Math.max(0, Math.round((now - job.startedAt) / 1000));
    const guessed = job.imported?.metaSource === "texte";
    return (
      <div className="kb-row kbs-job" key={job.requestId}>
        <RowButton
          className="kb-row-main"
          title={job.path}
          onClick={() => openArticleDialog(job.requestId)}
        >
          <span className="kb-check" aria-hidden />
          <span className="kb-kind">
            {job.phase === "converting" || job.phase === "writing" ? (
              <svg className="kbs-spin" width="13" height="13" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M8 2a6 6 0 1 0 6 6" />
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
                ? t("kbs.job-converting", { s: seconds })
                : t("kbs.job-ready")}
          </span>
        </RowButton>
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
    // page du corpus pas encore épinglée : une seule action possible
    return [{ key: "pin", label: t("kbs.menu-pin"), onSelect: () => p.gbrain?.onPin(row.slug ?? "") }];
  }

  function renderRow(row: Row) {
    const source = row.source;
    const on = Boolean(source && p.attached.includes(source.id));
    const full = Boolean(source && p.fullContent.includes(source.id));
    return (
      <div className={`kb-row ${on ? "on" : ""}`} key={row.key}>
        <RowButton
          className="kb-row-main"
          title={source?.origin ?? row.slug ?? row.title}
          onClick={() => {
            if (selectMode && source) toggleSelected(source.id);
            else if (source) p.onToggle(source.id);
            else p.gbrain?.onPin(row.slug ?? "");
          }}
        >
          <span
            className={`kb-check ${selectMode ? (source && selected.has(source.id) ? "on" : "") : on ? "on" : ""}`}
            aria-hidden
          />
          <span className="kb-kind"><KindIcon kind={row.kind} /></span>
          <span className="kb-name">{row.title}</span>
          {full && <span className="kbs-flag">{t("kbs.flag-full")}</span>}
          {!source && <span className="kbs-flag kbs-flag-quiet">{t("kbs.flag-corpus")}</span>}
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

  return (
    <div className="kb-panel kb-panel-surface kbs">
      <div className="kb-head">
        <span className="kb-title">{t("kbs.title")}</span>
        {p.attached.length > 0 && (
          <RowButton
            className={`kb-chip-filter ${filter === "attached" ? "on" : ""}`}
            title={t("kbs.attached-title", { title: p.threadTitle?.trim() || t("app.new-chat-title") })}
            onClick={() => setFilter((current) => (current === "attached" ? "all" : "attached"))}
          >
            {t("kbs.attached", { n: p.attached.length })}
          </RowButton>
        )}
        <span className="kbs-spacer" />
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
            { key: "article", label: t("kbs.add-article"), onSelect: () => p.onAddArticle?.() },
            { key: "files", label: t("kb.add-file"), onSelect: () => p.onAddFiles() },
            { key: "folder", label: t("kb.add-folder"), onSelect: () => p.onAddFolder() },
            { key: "note", label: t("kb.add-note"), onSelect: () => setNoteOpen(true) },
          ]}
        />
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
        placeholder={t("kbs.search")}
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
        {!archivedView && live.map(renderJob)}
        {visible.map(renderRow)}
        {visible.length === 0 && (
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
