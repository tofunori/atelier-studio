// Surface « Connaissances » — redesign 2026-08-22 (base rangeable).
//
// Le panneau de plan 054 (une liste, une barre, un bouton) tenait, mais trois
// gestes n'existaient pas À L'ÉCRAN : supprimer (enterré dans un menu de
// rangée invisible hors survol), sélectionner plusieurs sources (mode caché
// dans le menu du volet, qui redéfinissait en douce le cercle d'attache) et
// ranger (les collections existaient côté store, plus personne ne les
// affichait). Ce qui change :
//
//   - un RAIL à gauche : les vues (toutes / jointes / archivées) et les
//     dossiers, avec dépôt par glisser ;
//   - la sélection SANS mode : l'icône de type devient une case au survol,
//     ⇧-clic prend une plage, ⌘-clic ajoute, ⌘A tout, ⌫ supprime ;
//   - un contrôle = un sens : la case sélectionne, le trombone joint la
//     conversation, la rangée ouvre ;
//   - la suppression est immédiate et réversible 8 s (lib/kbTrash) — pas de
//     modale pour un geste qu'on répare en deux clics ;
//   - les types passent de la rangée de puces à un menu « Type » : ce que
//     l'utilisateur crée mérite une colonne, ce que le système déduit non.
//
// Le dépôt gbrain garde sa nature : lecture et épinglage, ni dossiers ni
// suppression — on ne cure pas un corpus depuis une liste de travail.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import SourceReader, { type ReaderTarget } from "./SourceReader";
import type { KbCollection, KbSource } from "../../lib/kbSources";
import {
  kbTrashBatchSnapshot, kbTrashSnapshot, scheduleKbRemove, subscribeKbTrash, undoKbRemove,
} from "../../lib/kbTrash";
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

/** Vue courante du rail : ce que l'utilisateur a rangé, pas ce que le système déduit. */
export type KbView = "all" | "attached" | "archived" | `coll:${string}`;

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

/** Collections d'une source, quel que soit l'âge de l'entrée du registre. */
export function collectionsOf(source: KbSource | null): string[] {
  const raw = (source as { collections?: unknown } | null)?.collections;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
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
  /** Suppression d'une source OU d'une sélection — passe par la corbeille. */
  onRemoveSources: (ids: string[]) => void;
  onPromote: (id: string) => void;
  onPromotePage?: (id: string) => void;
  onResync?: (slug: string) => void;
  /** Archivage d'une source ou d'un lot ; `off` désarchive. */
  onArchive?: (ids: string[], off: boolean) => void;
  archived?: { count: number; sources: KbSource[] };
  /** Dossiers (collections du registre) — le rail les affiche enfin. */
  collections?: KbCollection[];
  onCreateCollection?: (title: string) => void;
  onTag?: (ids: string[], slug: string, off: boolean) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onAddNote: (title: string, text: string) => void;
  onAddUrl: (url: string) => void;
  onAddArticle?: () => void;
  /** Ouvre le PDF d'origine d'une page du dépôt (chemin du front matter). */
  onOpenOrigin?: (path: string) => void;
  onBatchAttach?: (ids: string[]) => void;
  gbrain?: GbrainSectionProps;
  headerEnd?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<KbFilter>("all");
  const [view, setView] = useState<KbView>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [newColl, setNewColl] = useState<string | null>(null);
  // Sélection ordonnée : l'ordre sert aux plages ⇧-clic et aux actions de lot.
  const [selected, setSelected] = useState<string[]>([]);
  const anchorRef = useRef<string | null>(null);
  const dragRef = useRef<string[]>([]);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
  // Corbeille : les sources en attente de suppression sont déjà hors de la
  // liste, et le bandeau d'annulation court.
  const trashIds = useSyncExternalStore(subscribeKbTrash, kbTrashSnapshot);
  const trashBatch = useSyncExternalStore(subscribeKbTrash, kbTrashBatchSnapshot);

  const archivedView = view === "archived";
  const collections = p.collections ?? [];
  const shown = useMemo(() => {
    const pool = archivedView ? (p.archived?.sources ?? []) : p.sources;
    return trashIds.length ? pool.filter((s) => !trashIds.includes(s.id)) : pool;
  }, [archivedView, p.archived?.sources, p.sources, trashIds]);
  const rows = useMemo(() => buildRows(shown), [shown]);
  const corpusRows = useMemo(
    () => buildCorpusRows(p.sources, p.articles ?? []),
    [p.sources, p.articles],
  );

  // Les sources de la VUE courante (avant filtre de type et recherche) : c'est
  // sur elles que comptent les puces de type et « tout sélectionner ».
  const inView = useMemo(() => rows.filter((row) => {
    if (view === "attached") return Boolean(row.source && p.attached.includes(row.source.id));
    if (view.startsWith("coll:")) return collectionsOf(row.source).includes(view.slice(5));
    return true;
  }), [rows, view, p.attached]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: inView.length };
    for (const row of inView) out[row.filter] = (out[row.filter] ?? 0) + 1;
    return out;
  }, [inView]);

  const needle = query.trim().toLowerCase();
  const corpusVisible = corpusRows.filter((row) => !needle
    || `${row.title} ${row.slug ?? ""}`.toLowerCase().includes(needle));
  const visible = inView.filter((row) => {
    if (type !== "all" && row.filter !== type) return false;
    if (!needle) return true;
    return `${row.title} ${row.slug ?? ""} ${row.source?.origin ?? ""}`.toLowerCase().includes(needle);
  });
  const visibleIds = visible.map((row) => row.source?.id).filter((id): id is string => Boolean(id));

  // Une sélection ne survit ni à un changement de vue ni à la disparition de
  // ses rangées : une action de lot doit toujours porter sur ce qu'on voit.
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => visibleIds.includes(id));
      return next.length === current.length ? current : next;
    });
    // visibleIds change à chaque rendu : on compare par contenu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(",")]);

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

  /** Sélection : clic simple bascule, ⇧-clic prend la plage depuis l'ancre. */
  function pick(id: string, range: boolean) {
    setSelected((current) => {
      if (range && anchorRef.current && visibleIds.includes(anchorRef.current)) {
        const a = visibleIds.indexOf(anchorRef.current);
        const b = visibleIds.indexOf(id);
        if (a > -1 && b > -1) {
          const slice = visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1);
          return [...current, ...slice.filter((x) => !current.includes(x))];
        }
      }
      anchorRef.current = id;
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  function clearSelection() {
    anchorRef.current = null;
    setSelected([]);
  }

  function removeSources(ids: string[]) {
    if (!ids.length) return;
    const titles = ids
      .map((id) => p.sources.find((s) => s.id === id)?.title ?? "")
      .filter(Boolean);
    clearSelection();
    scheduleKbRemove(ids, p.onRemoveSources, { titles });
  }

  function tag(ids: string[], slug: string, off: boolean) {
    if (!ids.length) return;
    p.onTag?.(ids, slug, off);
    if (!off) clearSelection();
  }

  function archive(ids: string[], off: boolean) {
    if (!ids.length) return;
    p.onArchive?.(ids, off);
    clearSelection();
  }

  // Clavier : les raccourcis n'entrent en jeu qu'une fois la sélection
  // commencée ou le focus dans le panneau — sinon ⌘A volerait la sélection de
  // texte du composer voisin.
  useEffect(() => {
    if (tab !== "base" || lecture) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // `e.target` peut être window/document (raccourci global, tests) : sans
      // ce garde-fou, `contains` reçoit un non-Node et lève.
      const raw = e.target as unknown;
      const el = raw && typeof (raw as HTMLElement).tagName === "string" ? (raw as HTMLElement) : null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"
        || el.isContentEditable));
      const inside = Boolean(el && panelRef.current?.contains(el));
      if (typing) return;
      if (!selected.length && !inside) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        anchorRef.current = visibleIds[0] ?? null;
        setSelected(visibleIds);
      } else if (e.key === "Escape" && selected.length) {
        clearSelection();
      } else if ((e.key === "Backspace" || e.key === "Delete") && selected.length) {
        e.preventDefault();
        removeSources(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function collectionItems(ids: string[], current: string[] = []): LazyDropdownMenuItem[] {
    const items: LazyDropdownMenuItem[] = collections.map((coll) => {
      const on = current.includes(coll.slug);
      return {
        key: `coll-${coll.slug}`,
        label: on ? `✓ ${coll.title}` : coll.title,
        onSelect: () => tag(ids, coll.slug, on),
      };
    });
    if (p.onCreateCollection) {
      items.push({
        key: "coll-new",
        separatorBefore: items.length > 0,
        label: t("kbs.new-folder"),
        onSelect: () => setNewColl(""),
      });
    }
    return items;
  }

  function rowMenu(row: Row): LazyDropdownMenuItem[] {
    const items: LazyDropdownMenuItem[] = [];
    const source = row.source;
    if (source) {
      items.push({
        key: "open",
        label: t("kbs.menu-open"),
        onSelect: () => openLecture({ kind: "source", id: source.id }),
      });
      items.push({
        key: "attach",
        label: t(p.attached.includes(source.id) ? "kbs.detach" : "kbs.attach"),
        onSelect: () => p.onToggle(source.id),
      });
      items.push({
        key: "full",
        label: t(p.fullContent.includes(source.id) ? "kbs.menu-full-on" : "kbs.menu-full"),
        onSelect: () => p.onToggleFull(source.id),
      });
      if (p.onTag) {
        items.push({
          key: "classify",
          separatorBefore: true,
          label: t("kbs.menu-classify"),
          children: collectionItems([source.id], collectionsOf(source)),
        });
      }
      if (p.onPromotePage) {
        items.push({ key: "page", separatorBefore: true, label: t("kb.promote-page"), onSelect: () => p.onPromotePage?.(source.id) });
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
          onSelect: () => archive([source.id], archivedView),
        });
      }
      items.push({
        key: "remove",
        destructive: true,
        label: t("kb.remove-source"),
        onSelect: () => removeSources([source.id]),
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
    const sel = Boolean(source && selected.includes(source.id));
    // Le dépôt ne s'attache pas à une conversation : on y puise. Ni case, ni
    // trombone — une seule action utile, faire entrer la page dans la base.
    const corpus = !source;
    const chips = collectionsOf(source);
    return (
      <div
        className={`kb-row ${on ? "on" : ""} ${sel ? "sel" : ""}`}
        key={row.key}
        draggable={Boolean(source) && Boolean(p.onTag)}
        onDragStart={(e) => {
          if (!source) return;
          dragRef.current = selected.includes(source.id) ? [...selected] : [source.id];
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", source.id);
        }}
        onDragEnd={() => { dragRef.current = []; setDropOn(null); }}
      >
        {/* Un contrôle, un sens : l'icône de type devient la case au survol,
            le trombone joint la conversation, la rangée ouvre. Le cercle
            d'avant portait l'attachement ET la sélection selon un mode
            invisible — personne ne trouvait ni l'un ni l'autre. */}
        {!corpus && source && (
          <RowButton
            className={`kb-pick ${sel ? "on" : ""}`}
            aria-pressed={sel}
            title={t("kbs.select")}
            onClick={(e) => pick(source.id, e.shiftKey)}
          >
            <span className="kb-pick-kind"><KindIcon kind={row.kind} /></span>
            <span className="kb-pick-box" aria-hidden />
          </RowButton>
        )}
        {corpus && <span className="kb-kind kb-pick"><KindIcon kind={row.kind} /></span>}
        <RowButton
          className="kb-row-main"
          title={source?.origin ?? row.slug ?? row.title}
          onClick={(e) => {
            if (source && (e.shiftKey || e.metaKey || e.ctrlKey)) pick(source.id, e.shiftKey);
            else if (source && selected.length) pick(source.id, false);
            else if (source) openLecture({ kind: "source", id: source.id });
            else openLecture({ kind: "gbrain", slug: row.slug ?? "" });
          }}
        >
          <span className="kb-name">{row.title}</span>
          {full && <span className="kbs-flag">{t("kbs.flag-full")}</span>}
          {corpus && row.pinned && (
            <span className="kbs-flag kbs-flag-quiet">{t("kbs.flag-in-base")}</span>
          )}
          {/* Une puce suffit à dire « c'est rangé » ; les autres se comptent.
              Et dans un dossier ouvert, sa propre puce ne dit plus rien. */}
          {chips
            .filter((slug) => `coll:${slug}` !== view)
            .slice(0, 1)
            .map((slug) => (
              <span className="kbs-chip-coll" key={slug}>
                {collections.find((c) => c.slug === slug)?.title ?? slug}
              </span>
            ))}
          {chips.filter((slug) => `coll:${slug}` !== view).length > 1 && (
            <span className="kbs-chip-more">
              +{chips.filter((slug) => `coll:${slug}` !== view).length - 1}
            </span>
          )}
        </RowButton>
        {!corpus && source && (
          <RowButton
            className={`kb-clip ${on ? "on" : ""}`}
            aria-pressed={on}
            title={t(on ? "kbs.detach" : "kbs.attach")}
            onClick={() => p.onToggle(source.id)}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.6 3.6v7.2a3.1 3.1 0 0 1-6.2 0V4.2a2 2 0 0 1 4 0v6.4a1 1 0 0 1-2 0V4.8" />
            </svg>
          </RowButton>
        )}
        <span className="kb-meta">{row.meta}</span>
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

  function railItem(key: KbView, label: string, kind: string, n: number, droppable = false) {
    return (
      <RowButton
        key={key}
        className={`kbs-rail-item ${view === key ? "on" : ""} ${dropOn === key ? "drop" : ""}`}
        aria-pressed={view === key}
        onClick={() => { setView(key); clearSelection(); }}
        onDragOver={droppable ? (e) => { e.preventDefault(); setDropOn(key); } : undefined}
        onDragLeave={droppable ? () => setDropOn((cur) => (cur === key ? null : cur)) : undefined}
        onDrop={droppable ? (e) => {
          e.preventDefault();
          setDropOn(null);
          const ids = dragRef.current;
          dragRef.current = [];
          if (ids.length && key.startsWith("coll:")) tag(ids, key.slice(5), false);
        } : undefined}
      >
        <span className="kbs-rail-icon"><KindIcon kind={kind} /></span>
        <span className="kbs-rail-name">{label}</span>
        <span className="kbs-rail-n">{n}</span>
      </RowButton>
    );
  }

  function renderRail() {
    if (tab === "brain") {
      return (
        <aside className="kbs-rail">
          <div className="kbs-rail-label">{t("kbs.tab-brain")}</div>
          <p className="kbs-rail-note">{t("kbs.brain-note")}</p>
        </aside>
      );
    }
    const base = rows.filter((row) => row.source);
    return (
      <aside className="kbs-rail">
        <div className="kbs-rail-label">{t("kbs.views")}</div>
        {railItem("all", t("kbs.view-all"), "file", archivedView ? p.sources.length : base.length)}
        {railItem("attached", t("kbs.view-attached"), "gbrain", p.attached.length)}
        <div className="kbs-rail-label">{t("kbs.folders")}</div>
        {collections.map((coll) => railItem(
          `coll:${coll.slug}`,
          coll.title,
          "folder",
          p.sources.filter((s) => collectionsOf(s).includes(coll.slug)).length,
          Boolean(p.onTag),
        ))}
        {collections.length === 0 && newColl === null && (
          <p className="kbs-rail-note">{t("kbs.folders-empty")}</p>
        )}
        {newColl === null ? (
          p.onCreateCollection && (
            <RowButton className="kbs-rail-new" onClick={() => setNewColl("")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.35" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
              {t("kbs.new-folder")}
            </RowButton>
          )
        ) : (
          <Input
            autoFocus
            className="kbs-rail-input"
            placeholder={t("kbs.new-folder-placeholder")}
            value={newColl}
            onChange={(e) => setNewColl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const title = newColl.trim();
                if (title) p.onCreateCollection?.(title);
                setNewColl(null);
              }
              if (e.key === "Escape") setNewColl(null);
            }}
            onBlur={() => {
              const title = (newColl ?? "").trim();
              if (title) p.onCreateCollection?.(title);
              setNewColl(null);
            }}
          />
        )}
        <div className="kbs-rail-sep" />
        {railItem("archived", t("kbs.view-archived"), "note", p.archived?.count ?? 0)}
      </aside>
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

  const allPicked = visibleIds.length > 0 && selected.length === visibleIds.length;

  return (
    <div
      className={`kb-panel kb-panel-surface kbs ${selected.length ? "kbs-picking" : ""}`}
      ref={panelRef}
    >
      <div className="kb-head">
        <span className="kb-title">{t("kbs.title")}</span>
        <span className="kbs-seg" role="tablist" aria-label={t("kbs.tabs-label")}>
          <RowButton
            role="tab"
            aria-selected={tab === "base"}
            className={`kbs-seg-tab ${tab === "base" ? "on" : ""}`}
            onClick={() => { setTab("base"); clearSelection(); }}
          >
            {t("kbs.tab-base")} <span className="kbs-seg-n">{rows.length}</span>
          </RowButton>
          <RowButton
            role="tab"
            aria-selected={tab === "brain"}
            className={`kbs-seg-tab ${tab === "brain" ? "on" : ""}`}
            onClick={() => { setTab("brain"); clearSelection(); }}
          >
            {t("kbs.tab-brain")} <span className="kbs-seg-n">{corpusRows.length}</span>
          </RowButton>
        </span>
        <span className="kbs-spacer" />
        {tab === "base" && (
          <LazyDropdownMenu
            open={typeOpen}
            onOpenChange={setTypeOpen}
            align="end"
            label={t("kbs.type")}
            trigger={(
              <Button type="button" variant="ghost" className={`ghost kbs-add ${type === "all" ? "" : "on"}`}>
                {type === "all" ? t("kbs.type") : t(FILTER_LABELS[type as Exclude<KbFilter, "all" | "attached">])}
              </Button>
            )}
            items={[
              {
                key: "type-all",
                label: `${type === "all" ? "✓ " : ""}${t("kbs.type-all")} · ${counts.all ?? 0}`,
                onSelect: () => setType("all"),
              },
              ...FILTER_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => ({
                key: `type-${key}`,
                label: `${type === key ? "✓ " : ""}${t(FILTER_LABELS[key])} · ${counts[key]}`,
                onSelect: () => setType(key),
              })),
            ]}
          />
        )}
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
              key: "select-all",
              label: t(allPicked ? "kbs.select-none" : "kbs.select-all"),
              disabled: visibleIds.length === 0,
              onSelect: () => (allPicked ? clearSelection() : setSelected(visibleIds)),
            },
            {
              key: "archived",
              separatorBefore: true,
              label: t(archivedView ? "kbs.menu-back" : "kbs.menu-archived", { n: p.archived?.count ?? 0 }),
              disabled: !archivedView && (p.archived?.count ?? 0) === 0,
              onSelect: () => { setView(archivedView ? "all" : "archived"); clearSelection(); },
            },
          ]}
        />
        {p.headerEnd && <div className="workspace-pane-controls-slot">{p.headerEnd}</div>}
      </div>

      <div className="kbs-body">
        {renderRail()}
        <div className="kbs-main">
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

          <div className="kbs-listhead">
            {tab === "base" && (
              <RowButton
                className="kbs-listhead-act"
                disabled={visibleIds.length === 0}
                onClick={() => (allPicked ? clearSelection() : setSelected(visibleIds))}
              >
                {t(allPicked ? "kbs.select-none" : "kbs.select-all")}
              </RowButton>
            )}
            <span className="kbs-spacer" />
            <span className="kbs-listhead-count">
              {tab === "brain"
                ? t("kbs.count-brain", { n: corpusVisible.length })
                : t("kbs.count-base", { n: visible.length, a: p.attached.length })}
            </span>
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
              <div className="kb-empty">
                {t(needle
                  ? "kbs.empty-search"
                  : view.startsWith("coll:")
                    ? "kbs.empty-folder"
                    : archivedView
                      ? "kb.archived-empty"
                      : "kbs.empty")}
              </div>
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
                      <span className="kb-kind"><KindIcon kind="gbrain" /></span>
                      <span className="kb-name">{result.slug}</span>
                      <span className="kb-meta">{t("kb.gbrain-meta-nas")}</span>
                    </RowButton>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="kb-batchbar">
          <span className="kb-batch-count">{t("kb.selected-count", { n: selected.length })}</span>
          {p.onBatchAttach && (
            <RowButton
              className="kb-batch-act"
              onClick={() => {
                p.onBatchAttach?.(selected);
                clearSelection();
              }}
            >
              {t("kbs.batch-attach")}
            </RowButton>
          )}
          {p.onTag && (
            <LazyDropdownMenu
              open={tagOpen}
              onOpenChange={setTagOpen}
              align="center"
              label={t("kbs.batch-tag")}
              trigger={<RowButton className="kb-batch-act">{t("kbs.batch-tag")}</RowButton>}
              items={collectionItems(selected)}
            />
          )}
          {p.onArchive && (
            <RowButton className="kb-batch-act" onClick={() => archive(selected, archivedView)}>
              {t(archivedView ? "kb.unarchive" : "kb.archive")}
            </RowButton>
          )}
          <RowButton
            className="kb-batch-act kb-batch-danger"
            onClick={() => removeSources(selected)}
          >
            {t("kbs.batch-remove")}
          </RowButton>
          <RowButton className="kb-batch-act kb-batch-cancel" onClick={clearSelection}>
            {t("action.cancel")}
          </RowButton>
        </div>
      )}

      {/* Suppression : elle a déjà eu lieu à l'écran, le filet court 8 s. */}
      {trashBatch && (
        <div className="kb-undo" role="status">
          <span className="kb-undo-text">
            {trashBatch.ids.length > 1
              ? t("kbs.removed", { n: trashBatch.ids.length })
              : t("kbs.removed-one", { title: trashBatch.titles[0] ?? "" })}
          </span>
          <RowButton className="kb-undo-act" onClick={undoKbRemove}>{t("kbs.undo")}</RowButton>
        </div>
      )}
    </div>
  );
}
