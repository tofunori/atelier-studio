import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpDownIcon, CheckIcon, ChevronRightIcon, FilePlus2Icon, FileTextIcon, FolderIcon, FolderOpenIcon, InfoIcon, LibraryIcon, PinIcon, QuoteIcon } from "lucide-react";
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
import { useBiblioTabs } from "./biblio/useBiblioTabs";
import { useBiblioReadState } from "./biblio/useBiblioReadState";
import { buildCollectionTree, type CollectionTreeNode } from "./biblio/collections";
import "./biblio/BiblioWorkspace.css";
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
  const { openReader: markReaderOpen } = reader;
  const tabs = useBiblioTabs();
  const reading = useBiblioReadState(galleryUrl);
  useEffect(() => {
    if (tabs.isLibraryActive) reading.refresh();
  }, [tabs.isLibraryActive, reading.refresh]);
  const [readerRequested, setReaderRequested] = useState(false);
  const openReader = useCallback(() => {
    markReaderOpen();
    setReaderRequested(true);
  }, [markReaderOpen]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
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

  const { openArticle } = tabs;
  useEffect(() => {
    if (!readerRequested || !selected) return;
    openArticle(selected, passageTarget);
    setReaderRequested(false);
  }, [readerRequested, selected, passageTarget, openArticle]);
  const collectionTree = useMemo(() => buildCollectionTree(collections), [collections]);
  const detailItem = tabs.activeTab?.item ?? selected;

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
    if (openPdf) {
      markReaderOpen();
      setReaderRequested(false);
      openArticle(item);
    }
  }, [setSelectedKey, setPassageTarget, markReaderOpen, openArticle]);

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
      if (tabs.isLibraryActive) searchRef.current?.focus();
      else { tabs.activateLibrary(); requestAnimationFrame(() => searchRef.current?.focus()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs.activateLibrary, tabs.isLibraryActive]);

  function onSurfaceKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || !tabs.isLibraryActive) return;
    const editable = isEditableTarget(e.target);
    if (editable && e.key !== "Escape") return;
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

  const pdfCount = visibleItems.reduce((n, item) => n + (item.hasPdf ? 1 : 0), 0);
  function chooseCollection(id: string | null) {
    setCollectionId(id);
    setFilter(id ? "collection" : "all");
    setPassageTarget(null);
  }

  function renderCollection(node: CollectionTreeNode, depth = 0): ReactNode {
    const id = String(node.id);
    const expanded = !collapsed.has(id);
    return <li key={id}>
      <div className="biblio-folder-row" style={{ paddingLeft: depth * 14 }}>
        {node.children.length > 0 ? <IconButton size="s"
          label={`${expanded ? t("biblio.collapse") : t("biblio.expand")} ${node.collection.name}`}
          aria-expanded={expanded} onClick={() => setCollapsed(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}><ChevronRightIcon className={expanded ? "is-expanded" : ""} /></IconButton>
          : <span className="biblio-folder-spacer" />}
        <RowButton className="biblio-folder" aria-current={filter === "collection" && collectionId === id ? "true" : undefined}
          onClick={() => chooseCollection(id)} title={node.collection.name}>
          {expanded && node.children.length ? <FolderOpenIcon /> : <FolderIcon />}<span>{node.collection.name}</span>
        </RowButton>
      </div>
      {expanded && node.children.length > 0 && <ul>{node.children.map(child => renderCollection(child, depth + 1))}</ul>}
    </li>;
  }

  function renderRow(item: ZoteroItem) {
    return <BiblioRowMenu key={item.key} item={item} actions={rowActions}>
      <ContextMenuTrigger id={`biblio-row-${item.key}`} role="option"
        aria-selected={selected?.key === item.key} className="biblio-row"
        ref={(el: HTMLElement | null) => {
          if (el) rowRefs.current.set(item.key, el); else rowRefs.current.delete(item.key);
        }}>
        <RowButton className="biblio-main-button" onClick={() => selectItem(item)}
          onDoubleClick={() => selectItem(item, { openPdf: true })} title={item.title}>
          <span className="biblio-title">{item.title}</span>
          <span className="biblio-table-author" title={item.creators}>{item.creators || t("common.unknown-author")}</span>
          <span className="biblio-table-year">{item.year}</span>
          <span className="biblio-table-publication" title={item.publication}>{item.publication}</span>
        </RowButton>
        <span className="biblio-row-side">
          <IconButton size="s" label={`${t("biblio.open-pdf")} — ${item.title}`} disabled={!item.hasPdf}
            onClick={() => selectItem(item, { openPdf: true })}><FileTextIcon /></IconButton>
          <IconButton className={`biblio-star ${item.fav ? "on" : ""}`}
            label={item.fav ? t("action.remove-favorite") : t("action.add-favorite")} onClick={() => toggleFav(item)}><StarIcon /></IconButton>
          <IconButton size="s" className="biblio-read"
            label={`${t(reading.readKeys.has(item.key) ? "biblio.mark-unread" : "biblio.mark-read")} — ${item.title}`}
            title={t(reading.readKeys.has(item.key) ? "biblio.mark-unread" : "biblio.mark-read")}
            aria-pressed={reading.readKeys.has(item.key)} aria-busy={reading.pending.has(item.key)}
            disabled={!reading.ready || reading.pending.has(item.key)}
            onKeyDown={event => event.stopPropagation()}
            onClick={() => void reading.setRead(item.key, !reading.readKeys.has(item.key))}><CheckIcon /></IconButton>
        </span>
      </ContextMenuTrigger>
    </BiblioRowMenu>;
  }

  return <div className="biblio-surface biblio-workspace" onKeyDown={onSurfaceKeyDown}>
    <div className="biblio-tabs-bar">
      <div className="biblio-tabs" role="tablist" aria-label={t("biblio.open-tabs")} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        if ((event.target as HTMLElement).getAttribute('role') !== 'tab') return;
        event.preventDefault(); event.stopPropagation();
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = controls.indexOf(event.target as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length;
        controls[next]?.click(); controls[next]?.focus();
      }}>
        <RowButton role="tab" tabIndex={tabs.isLibraryActive ? 0 : -1} id="biblio-library-tab" aria-selected={tabs.isLibraryActive}
          aria-controls="biblio-library-panel" className="biblio-tab biblio-library-tab document-tab-shell" onClick={() => { tabs.activateLibrary(); reading.refresh(); }}>
          <LibraryIcon /><span>{t("biblio.title")}</span>
        </RowButton>
        {tabs.tabs.map(tab => <div className="biblio-document-tab document-tab-shell" key={tab.item.key} data-active={tabs.activeTabKey === tab.item.key}>
          <RowButton role="tab" tabIndex={tabs.activeTabKey === tab.item.key ? 0 : -1} id={`biblio-tab-${tab.item.key}`} aria-selected={tabs.activeTabKey === tab.item.key}
            aria-controls={`biblio-panel-${tab.item.key}`} className="biblio-tab" title={tab.item.title}
            onClick={() => tabs.activateArticle(tab.item.key)}><FileTextIcon /><span>{tab.item.title}</span></RowButton>
          <IconButton size="s" className="document-tab-close" label={`${t("action.close-reader")} — ${tab.item.title}`} onClick={() => tabs.closeArticle(tab.item.key)}><CloseIcon /></IconButton>
        </div>)}
      </div>
      <IconButton size="s" label={t("biblio.information")} aria-pressed={infoOpen} disabled={!detailItem} onClick={() => setInfoOpen(!infoOpen)}><InfoIcon /></IconButton>
      {paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
    </div>
    <div className={`biblio-workspace-body ${infoOpen && detailItem ? "has-info" : ""}`}>
      <div id="biblio-library-panel" role="tabpanel" aria-labelledby="biblio-library-tab" hidden={!tabs.isLibraryActive}
        className={`biblio-library-panel ${collectionsOpen ? "" : "collections-hidden"}`}>
        <aside className="biblio-collections" aria-label={t("biblio.collection-aria")}>
          <div className="biblio-collections-heading">Zotero</div>
          <RowButton className="biblio-folder" aria-current={filter === "all" ? "true" : undefined} onClick={() => chooseCollection(null)}><LibraryIcon />{t("biblio.all-items")}</RowButton>
          <RowButton className="biblio-folder" aria-current={favOnly ? "true" : undefined} onClick={() => { setCollectionId(null); setFilter("fav"); }}><StarIcon />{t("biblio.favorites")}</RowButton>
          <div className="biblio-collections-heading">{t("biblio.collections")}</div>
          <ul className="biblio-collection-tree">{collectionTree.map(node => renderCollection(node))}</ul>
        </aside>
        <section className="biblio-left">
          <div className="biblio-bar">
            <IconButton size="s" label={t("biblio.toggle-collections")} aria-pressed={collectionsOpen} onClick={() => setCollectionsOpen(!collectionsOpen)}><PanelIcon /></IconButton>
            <label className="biblio-search"><span className="biblio-search-icon"><SearchIcon /></span>
              <Input ref={searchRef} className="biblio-search-input" value={search}
                onChange={e => { setPassageTarget(null); setSearch(e.target.value); }} placeholder={t("biblio.search")} aria-label={t("biblio.search")} />
              <kbd className="biblio-search-kbd" aria-hidden="true">/</kbd>
            </label>
            <Select className="biblio-sort" title={t("biblio.sort-current", { sort: sortLabels[sortBy] })}
              value={sortBy} onChange={value => changeSort(value as SortBy)} triggerIcon={<ArrowUpDownIcon />}
              menuLabel={t("biblio.sort-menu")} alignItemWithTrigger={false}
              options={Object.entries(sortLabels).map(([value, label]) => ({ value, label }))} />
            <IconButton size="s" aria-pressed={pdfOnly} onClick={togglePdfOnly} label={t("biblio.pdf-only")}><FileTextIcon /></IconButton>
            <IconButton size="s" onClick={addPdfs} disabled={adding} label={t("biblio.add-pdf")}>
              {adding ? <Spinner /> : <FilePlus2Icon />}
            </IconButton>
          </div>
          <div className="biblio-scope"><span>{filter === "collection" ? collections.find(c => String(c.id) === collectionId)?.name : favOnly ? t("biblio.favorites") : t("biblio.all-items")}</span>
            <span className="biblio-scope-count">{t("biblio.scope-refs", { count: visibleItems.length })} · {t("biblio.scope-pdf", { count: pdfCount })}</span></div>
          {addNote && <div className="biblio-add-note" role="status">{addNote}</div>}
          {error && <div className="biblio-empty" role="status">{error}</div>}
          {reading.error && <div className="biblio-add-note" role="alert">{reading.error}</div>}
          <div className="biblio-table-head" aria-hidden="true"><span>{t("biblio.column-title")}</span><span>{t("biblio.column-author")}</span><span>{t("biblio.column-year")}</span><span>{t("biblio.column-publication")}</span><span className="biblio-table-actions"><span>PDF</span><span /><span>{t("biblio.column-read")}</span></span></div>
          <div className="biblio-list" role="listbox" tabIndex={0} ref={listRef} aria-label={t("biblio.title")}
            aria-activedescendant={selected ? `biblio-row-${selected.key}` : undefined}>
            {loading && <div className="biblio-skeletons" role="status" aria-label={t("biblio.loading")}>
              {Array.from({ length: SKELETON_ROWS }, (_, i) => <div className="biblio-skeleton" key={i} aria-hidden="true"><span className="biblio-skeleton-title" /><span className="biblio-skeleton-meta" /></div>)}
            </div>}
            {!error && !loading && !visibleItems.length && <div className="biblio-empty">{t("biblio.empty")}</div>}
            {!loading && visibleItems.map(renderRow)}
          </div>
        </section>
      </div>
      {tabs.tabs.map(tab => {
        const url = tab.item.hasPdf && galleryUrl ? pdfViewerUrl(tab.item, galleryUrl, tab.passageTarget) : null;
        return <section key={tab.item.key} id={`biblio-panel-${tab.item.key}`} role="tabpanel" aria-labelledby={`biblio-tab-${tab.item.key}`}
          hidden={tabs.activeTabKey !== tab.item.key} className="biblio-reader">
          <div className="biblio-frame-wrap">
            {!tab.item.hasPdf && <div className="biblio-placeholder">{t("biblio.no-pdf")}</div>}
            {tab.item.hasPdf && !url && <div className="biblio-placeholder">{t("biblio.no-project")}</div>}
            {url && <iframe className="biblio-frame atelier" data-atelier-role="biblio-pdf" src={url} aria-label={tab.item.title} title="" />}
          </div>
        </section>;
      })}
      {infoOpen && detailItem && <aside className="biblio-information">
        <div className="biblio-information-heading"><span>{t("biblio.information")}</span><IconButton size="s" label={t("biblio.close-information")} onClick={() => setInfoOpen(false)}><CloseIcon /></IconButton></div>
        <h2>{detailItem.title}</h2><p>{detailItem.creators}</p>
        <dl><dt>{t("biblio.column-publication")}</dt><dd>{detailItem.publication || "—"}</dd><dt>{t("biblio.column-year")}</dt><dd>{detailItem.year || "—"}</dd>{detailItem.doi && <><dt>DOI</dt><dd>{detailItem.doi}</dd></>}</dl>
        <div className="biblio-info-actions"><IconButton label={t("biblio.cite-action")} onClick={() => cite(detailItem)}>{cited ? <CheckIcon /> : <QuoteIcon />}</IconButton>
          <IconButton label={t("biblio.add-kb")} disabled={!detailItem.pdfKey || !detailItem.pdfFile} onClick={() => pinToKb(detailItem)} className={kbPinned === "ok" ? "is-on" : ""}><PinIcon /></IconButton>
        </div>
        {!!detailItem.tags.length && <div className="biblio-tags">{detailItem.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
        {detailItem.abstract && <p className="biblio-abstract">{detailItem.abstract}</p>}
      </aside>}
    </div>
  </div>;
}
