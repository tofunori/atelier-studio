import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpDownIcon, CheckIcon, FilePlus2Icon, PinIcon, QuoteIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../lib/i18n";
import { CloseIcon, PanelIcon, SearchIcon, StarIcon } from "./icons";
import { Input } from "./shadcn/input";
import { Spinner } from "./shadcn/spinner";
import { IconButton, RowButton, Select, showError, showSuccess } from "./ui";
import { ContextMenuTrigger } from "./shadcn/context-menu";
import { BiblioRowMenu, type BiblioRowMenuActions } from "./biblio/BiblioRowMenu";
import { useBiblioList, send, summarizeZoteroAddResults } from "./biblio/useBiblioList";
import { useBiblioReader } from "./biblio/useBiblioReader";
import { groupsForSort } from "./biblio/filter";
import type { PassageTarget, SortBy, ZoteroItem } from "./biblio/types";

export type { ZoteroAddResult } from "./biblio/types";
export { summarizeZoteroAddResults };

const SKELETON_ROWS = 6;

function galleryOrigin(galleryUrl: string): string | null {
  try {
    return new URL(galleryUrl).origin;
  } catch {
    return null;
  }
}

function inheritHash(rawUrl: string, galleryUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const hash = new URL(galleryUrl).hash;
    if (hash) url.hash = hash;
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function pdfViewerUrl(item: ZoteroItem, galleryUrl: string, passage?: PassageTarget | null): string | null {
  if (!item.pdfKey || !item.pdfFile) return null;
  const origin = galleryOrigin(galleryUrl);
  if (!origin) return null;
  const rel = `zotero/${item.pdfKey}/${item.pdfFile}`;
  const pdfUrl = `${origin}/zotero/${encodeURIComponent(item.pdfKey)}/${encodeURIComponent(item.pdfFile)}`;
  const params = new URLSearchParams();
  params.set("file", rel);
  params.set("path", pdfUrl);
  // Le passage s'applique dès qu'il désigne CET article : le PDF ouvert est
  // toujours celui de l'item sélectionné, le lien ne fait que dire où aller
  // dedans (page, citation exacte, ou section numérotée résolue par le lecteur).
  if (passage && passage.key === item.key) {
    if (passage.page) params.set("page", String(passage.page));
    if (passage.quote) params.set("quote", passage.quote.slice(0, 900));
    if (passage.section) params.set("section", passage.section);
  }
  return inheritHash(`${origin}/.fig_thumbs/pdf_viewer.html?${params.toString()}`, galleryUrl);
}

/** Une saisie en cours ne doit jamais être détournée par un raccourci de liste. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

export default function BiblioSurface({
  ws,
  galleryUrl,
  paneControls,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  galleryUrl: string;
  paneControls?: ReactNode;
}) {
  const reader = useBiblioReader();
  const { readerOpen, listOpen, listW, toggleList, toggleReader, openReader, startListResize } = reader;
  const list = useBiblioList({ ws, openReader });
  const {
    search, setSearch, visibleItems, collections,
    filter, setFilter, collectionId, setCollectionId,
    selectedKey, setSelectedKey, selected, passageTarget, setPassageTarget,
    loading, error, pdfOnly, togglePdfOnly, sortBy, changeSort,
    toggleFav, adding, addNote, addPdfs,
  } = list;

  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const selectedViewerUrl = selected?.hasPdf && galleryUrl ? pdfViewerUrl(selected, galleryUrl, passageTarget) : null;

  const sortLabels: Record<SortBy, string> = {
    added: t("biblio.sort-added"),
    year: t("biblio.sort-year"),
    author: t("biblio.sort-author"),
    title: t("biblio.sort-title"),
  };

  // Épingler la pièce jointe Zotero dans la base de connaissances (plan 051) :
  // kind "zotero" — le backend résout ~/Zotero/storage et garde itemKey pour
  // les liens profonds de citation.
  const [kbPinned, setKbPinned] = useState<"ok" | "err" | null>(null);
  const kbPinnedPendingRef = useRef(false);
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ok?: boolean } | undefined;
      if (detail && kbPinnedPendingRef.current) {
        kbPinnedPendingRef.current = false;
        setKbPinned(detail.ok ? "ok" : "err");
        // Le retour vit dans l'icône (accent 2 s) et dans un toast : plus de
        // libellé qui change de largeur dans l'en-tête (maquette 2026-09-06).
        void (detail.ok ? showSuccess(t("biblio.pinned-toast")) : showError(t("biblio.pin-error")));
      }
    };
    window.addEventListener("kb-source-added", onAdded);
    return () => window.removeEventListener("kb-source-added", onAdded);
  }, []);
  useEffect(() => {
    if (!kbPinned) return;
    const timer = window.setTimeout(() => setKbPinned(null), 2000);
    return () => window.clearTimeout(timer);
  }, [kbPinned]);

  const pinToKb = useCallback((item: ZoteroItem) => {
    if (!item.pdfKey || !item.pdfFile) return;
    kbPinnedPendingRef.current = true;
    const origin = `zotero://${item.pdfKey}/${encodeURIComponent(item.pdfFile)}#${item.key ?? ""}`;
    send(ws, { type: "kbAdd", kind: "zotero", origin, title: item.title ?? "" });
  }, [ws]);

  const [cited, setCited] = useState(false);
  const cite = useCallback((item: ZoteroItem | null) => {
    setCited(true);
    window.setTimeout(() => setCited(false), 1600);
    if (!item) return;
    void showSuccess(t("biblio.cited-toast"));
    const label = item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
    const pdfPath = item.pdfKey && item.pdfFile ? `~/Zotero/storage/${item.pdfKey}/${item.pdfFile}` : null;
    const lines = [
      `Référence (bibliothèque Zotero locale — tout est déjà ici, n'ouvre PAS Zotero) :`,
      `- Titre : ${item.title}`,
      `- Auteurs : ${item.creators}${item.year ? ` (${item.year})` : ""}`,
      item.publication ? `- Revue : ${item.publication}` : null,
      item.doi ? `- DOI : ${item.doi}` : null,
      `- Clé de citation : ${label}`,
      pdfPath ? `- PDF (lisible directement avec Read) : ${pdfPath}` : `- Pas de PDF attaché`,
      item.abstract ? `- Résumé : ${item.abstract.slice(0, 900)}` : null,
    ].filter(Boolean).join("\n");
    window.dispatchEvent(new CustomEvent("atelier-add-to-chat-citation", {
      detail: { text: lines, key: item.key, citeKey: item.citeKey, title: item.title },
    }));
  }, []);

  const selectItem = useCallback((item: ZoteroItem, { openPdf = false } = {}) => {
    setSelectedKey(item.key);
    setPassageTarget(null);
    if (openPdf && item.hasPdf) openReader();
  }, [setSelectedKey, setPassageTarget, openReader]);

  const rowActions: BiblioRowMenuActions = {
    openPdf: (item) => selectItem(item, { openPdf: true }),
    cite: (item) => cite(item),
    pinToKb,
    toggleFav,
    copyKey: (item) => { void navigator.clipboard?.writeText(item.key); },
    // window.open sur un schéma zotero:// ne fait rien dans la WebView —
    // l'ouverture externe passe par le helper Tauri (comme Sidebar/Terminal).
    revealInZotero: (item) => { void openUrl(`zotero://select/library/items/${item.key}`).catch(() => {}); },
  };

  const focusList = useCallback(() => {
    listRef.current?.focus();
  }, []);

  const moveSelection = useCallback((delta: number) => {
    if (!visibleItems.length) return;
    const current = visibleItems.findIndex((item) => item.key === selectedKey);
    const next = current < 0
      ? (delta > 0 ? 0 : visibleItems.length - 1)
      : Math.min(visibleItems.length - 1, Math.max(0, current + delta));
    const item = visibleItems[next];
    if (!item) return;
    setSelectedKey(item.key);
    setPassageTarget(null);
    rowRefs.current.get(item.key)?.scrollIntoView?.({ block: "nearest" });
  }, [visibleItems, selectedKey, setSelectedKey, setPassageTarget]);

  // « / » depuis n'importe où dans la surface (hors champ de saisie) amène le
  // curseur dans la recherche — les autres raccourcis restent portés par la
  // surface elle-même pour ne pas capturer le clavier des panneaux voisins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSurfaceKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const editable = isEditableTarget(e.target);
    if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(-1); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (search) setSearch("");
      focusList();
      return;
    }
    if (e.key === "Enter") {
      if (!selected) return;
      e.preventDefault();
      selectItem(selected, { openPdf: true });
      return;
    }
    if (!editable && (e.key === "f" || e.key === "F")) {
      if (!selected) return;
      e.preventDefault();
      toggleFav(selected);
    }
  }

  // Geste 1 : les favoris sont un interrupteur de la barre, plus un segment
  // « Tous / Favoris » — la portée revient à la collection en cours si elle
  // existe, sinon à toute la bibliothèque.
  const favOnly = filter === "fav";
  function toggleFavOnly() {
    setFilter(favOnly ? (collectionId ? "collection" : "all") : "fav");
  }

  const pdfCount = visibleItems.reduce((n, item) => n + (item.hasPdf ? 1 : 0), 0);
  const groups = groupsForSort(visibleItems, sortBy);
  const showYears = sortBy === "year" || sortBy === "added";

  function renderRow(item: ZoteroItem) {
    return (
      <BiblioRowMenu key={item.key} item={item} actions={rowActions}>
        <ContextMenuTrigger
          id={`biblio-row-${item.key}`}
          role="option"
          aria-selected={selected?.key === item.key}
          className="biblio-row"
          ref={(el: HTMLElement | null) => {
            if (el) rowRefs.current.set(item.key, el);
            else rowRefs.current.delete(item.key);
          }}
        >
          <RowButton
            className="biblio-main-button"
            onClick={() => selectItem(item, { openPdf: !readerOpen })}
            title={item.title}
          >
            <span className="biblio-title">{item.title}</span>
            <span className="biblio-meta">
              <span className="biblio-meta-authors">{item.creators || t("common.unknown-author")}</span>
              {item.year && <span className="biblio-meta-year">{item.year}</span>}
              {item.publication && <span className="biblio-meta-source">{item.publication}</span>}
            </span>
          </RowButton>
          <span className="biblio-row-side">
            {item.hasPdf && <span className="biblio-pdf-badge">PDF</span>}
            <IconButton
              className={`biblio-star ${item.fav ? "on" : ""}`}
              label={item.fav ? t("action.remove-favorite") : t("action.add-favorite")}
              onClick={() => toggleFav(item)}
            >
              <StarIcon />
            </IconButton>
          </span>
        </ContextMenuTrigger>
      </BiblioRowMenu>
    );
  }

  return (
    <div className={`biblio-surface ${readerOpen ? "" : "no-reader"} ${listOpen ? "" : "no-list"}`}
      onKeyDown={onSurfaceKeyDown}
      style={listOpen && readerOpen ? { gridTemplateColumns: `${listW}px 8px minmax(0, 1fr)` } : undefined}>
      {listOpen && (
      <aside className="biblio-left">
        <div className="biblio-bar">
          <label className="biblio-search">
            <span className="biblio-search-icon"><SearchIcon /></span>
            <Input
              ref={searchRef}
              className="biblio-search-input"
              value={search}
              onChange={(e) => { setPassageTarget(null); setSearch(e.target.value); }}
              placeholder={t("biblio.search")}
              aria-label={t("biblio.search")}
            />
            <kbd className="biblio-search-kbd" aria-hidden="true">/</kbd>
          </label>
          <Select
            className="biblio-sort"
            title={t("biblio.sort-current", { sort: sortLabels[sortBy] })}
            value={sortBy}
            onChange={(value) => changeSort(value as SortBy)}
            triggerIcon={<ArrowUpDownIcon />}
            menuLabel={t("biblio.sort-menu")}
            menuClassName="biblio-sort-menu"
            positionerClassName="biblio-sort-positioner"
            alignItemWithTrigger={false}
            align="start"
            options={[
              { value: "added", label: sortLabels.added },
              { value: "year", label: sortLabels.year },
              { value: "author", label: sortLabels.author },
              { value: "title", label: sortLabels.title },
            ]}
          />
          <IconButton size="s" aria-pressed={favOnly} onClick={toggleFavOnly}
            title={t("biblio.favorites-only")} label={t("biblio.favorites")}>
            <StarIcon />
          </IconButton>
          <IconButton size="s" aria-pressed={pdfOnly} onClick={togglePdfOnly}
            title={t("biblio.pdf-only")} label={t("biblio.pdf-only")}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
              <path d="M6 9.2h4M6 11.2h2.5" />
            </svg>
          </IconButton>
          <IconButton size="s" className="biblio-add" onClick={addPdfs} disabled={adding}
            title={t("biblio.add-pdf")} label={t("biblio.add-pdf")}>
            {adding
              ? <Spinner data-icon="inline-start" />
              : <FilePlus2Icon data-icon="inline-start" aria-hidden="true" />}
          </IconButton>
          {!readerOpen && paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
        </div>
        <div className="biblio-scope">
          <Select
            className="biblio-collection-select"
            title={t("biblio.collection-aria")}
            value={filter === "collection" ? collectionId ?? "" : ""}
            onChange={(value) => {
              const next = value || null;
              setCollectionId(next);
              setFilter(next ? "collection" : "all");
            }}
            options={[
              { value: "", label: t("biblio.collection") },
              ...collections.map((collection) => ({ value: String(collection.id), label: collection.name })),
            ]}
          />
          <span className="biblio-scope-sep" aria-hidden="true">·</span>
          <span className="biblio-scope-count">
            {visibleItems.length === 1
              ? t("biblio.scope-refs-one")
              : t("biblio.scope-refs", { count: visibleItems.length })}
          </span>
          <span className="biblio-scope-sep" aria-hidden="true">·</span>
          <span className="biblio-scope-count">
            {pdfCount === 1 ? t("biblio.scope-pdf-one") : t("biblio.scope-pdf", { count: pdfCount })}
          </span>
        </div>
        {addNote && <div className="biblio-add-note">{addNote}</div>}
        {error && <div className="biblio-empty" role="status">{error}</div>}
        <div
          className="biblio-list"
          role="listbox"
          tabIndex={0}
          ref={listRef}
          aria-label={t("biblio.title")}
          aria-activedescendant={selected ? `biblio-row-${selected.key}` : undefined}
        >
          {loading && (
            <div className="biblio-skeletons" role="status" aria-label={t("biblio.loading")}>
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div className="biblio-skeleton" key={i} aria-hidden="true">
                  <span className="biblio-skeleton-title" />
                  <span className="biblio-skeleton-meta" />
                </div>
              ))}
            </div>
          )}
          {!error && !loading && visibleItems.length === 0 && <div className="biblio-empty">{t("biblio.empty")}</div>}
          {!loading && groups.map((group) => (
            <Fragment key={group.year || "biblio-no-year"}>
              {showYears && (
                <div className="biblio-year">
                  {group.year || t("biblio.no-year")}
                  <small>{group.items.length}</small>
                </div>
              )}
              {group.items.map(renderRow)}
            </Fragment>
          ))}
        </div>
      </aside>
      )}
      {listOpen && readerOpen && (
        <div className="pane-divider" onMouseDown={startListResize} />
      )}
      {readerOpen && (
      <section className="biblio-reader">
        <div className="biblio-reader-head">
          <IconButton className="ghost biblio-list-toggle" title={listOpen ? t("action.hide-list") : t("action.open-list")}
            label={listOpen ? t("action.hide-list") : t("action.open-list")} onClick={toggleList}>
            <PanelIcon />
          </IconButton>
          <div className="biblio-reader-title">
            <span>{selected?.title ?? t("biblio.title")}</span>
            {selected && (
              <small>
                <span className="biblio-reader-authors">{selected.creators || t("common.unknown-author")}</span>
                {selected.year && <span className="biblio-reader-year">{selected.year}</span>}
                {selected.publication && <i className="biblio-reader-source">{selected.publication}</i>}
              </small>
            )}
          </div>
          <div className="biblio-reader-actions">
            <IconButton
              size="s"
              className={`ghost biblio-pin${kbPinned === "ok" ? " is-on kb-flash-ok" : ""}${kbPinned === "err" ? " is-err kb-flash-err" : ""}`}
              disabled={!selected?.pdfKey || !selected?.pdfFile}
              label={t("biblio.add-kb")}
              title={t("biblio.add-kb")}
              onClick={() => selected && pinToKb(selected)}
            >
              <PinIcon size={13} strokeWidth={1.4} fill={kbPinned === "ok" ? "currentColor" : "none"} />
            </IconButton>
            <IconButton
              size="s"
              className={`ghost biblio-cite-action${cited ? " is-done" : ""}`}
              disabled={!selected}
              label={t("biblio.cite-action")}
              title={t("biblio.cite-tip")}
              onClick={() => cite(selected)}
            >
              {cited ? <CheckIcon size={13} strokeWidth={1.6} /> : <QuoteIcon size={13} strokeWidth={1.4} />}
            </IconButton>
          </div>
          {paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
          {!paneControls && (
            // Une seule croix : dans un panneau, celle du panneau ferme aussi le lecteur.
            <IconButton className="ghost git-icon-btn" title={t("action.close-reader")}
              label={t("action.close-reader")} onClick={toggleReader}>
              <CloseIcon />
            </IconButton>
          )}
        </div>
        <div className="biblio-frame-wrap">
          {!selected && <div className="biblio-placeholder">{t("biblio.placeholder")}</div>}
          {selected && !selected.hasPdf && <div className="biblio-placeholder">{t("biblio.no-pdf")}</div>}
          {selected?.hasPdf && !galleryUrl && (
            <div className="biblio-placeholder">{t("biblio.no-project")}</div>
          )}
          {selected?.hasPdf && galleryUrl && selectedViewerUrl && (
            <iframe className="biblio-frame" src={selectedViewerUrl} title={selected.title} />
          )}
        </div>
      </section>
      )}
    </div>
  );
}
