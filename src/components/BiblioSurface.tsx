import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../lib/i18n";
import { CloseIcon, PanelIcon, SearchIcon, StarIcon } from "./icons";
import { Select } from "./Select";
import { Input } from "./shadcn/input";
import { Button, IconButton, RowButton } from "./ui";

type ZoteroItem = {
  key: string;
  dateAdded: string;
  title: string;
  creators: string;
  year: string;
  publication: string;
  tags: string[];
  hasPdf: boolean;
  pdfKey: string | null;
  pdfFile: string | null;
  citeKey: string;
  fav: boolean;
};

type ZoteroCollection = { id: number | string; name: string; parent: number | string | null };
type FilterMode = "all" | "fav" | "collection";
type PassageTarget = { key: string; pdfKey: string; pdfFile: string; page: number; quote: string };

const STORAGE_KEY = "atelier-studio.biblio";

function send(ws: WebSocket | null, msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function loadState(): { key: string | null; filter: FilterMode; collectionId: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      key: typeof raw.key === "string" ? raw.key : null,
      filter: raw.filter === "fav" || raw.filter === "collection" ? raw.filter : "all",
      collectionId: raw.collectionId != null ? String(raw.collectionId) : null,
    };
  } catch {
    return { key: null, filter: "all", collectionId: null };
  }
}

function saveState(state: { key: string | null; filter: FilterMode; collectionId: string | null }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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
  if (passage && passage.key === item.key && passage.pdfKey === item.pdfKey && passage.pdfFile === item.pdfFile) {
    params.set("page", String(passage.page));
    params.set("quote", passage.quote.slice(0, 900));
  }
  return inheritHash(`${origin}/.fig_thumbs/pdf_viewer.html?${params.toString()}`, galleryUrl);
}

function creatorLine(item: ZoteroItem): string {
  return [item.creators || t("common.unknown-author"), item.year].filter(Boolean).join(" · ");
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
  const persisted = useMemo(loadState, []);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [filter, setFilter] = useState<FilterMode>(persisted.filter);
  const [collectionId, setCollectionId] = useState<string | null>(persisted.collectionId);
  const [selectedKey, setSelectedKey] = useState<string | null>(persisted.key);
  const [passageTarget, setPassageTarget] = useState<PassageTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(() => localStorage.getItem("atelier-studio.biblio.reader") !== "0");
  const [listOpen, setListOpen] = useState(() => localStorage.getItem("atelier-studio.biblio.list") !== "0");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);
  async function addPdfs() {
    const picked = await openDialog({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter((x): x is string => typeof x === "string");
    if (!paths.length) return;
    setAdding(true);
    setAddNote(null);
    send(ws, { type: "zoteroAddPdf", paths });
  }
  useEffect(() => {
    const onAdd = (e: Event) => {
      const results = ((e as CustomEvent).detail?.results ?? []) as { name: string; ok: boolean; error?: string; match?: string }[];
      setAdding(false);
      const ok = results.filter((r) => r.ok).length;
      const dups = results.filter((r) => r.error === "duplicate");
      const zoteroOff = results.some((r) => r.error === "zotero-off");
      const parts: string[] = [];
      if (ok) parts.push(t("biblio.add-done", { count: ok }));
      if (dups.length === 1) parts.push(t("biblio.add-dup-one", { title: (dups[0].match ?? dups[0].name).slice(0, 60) }));
      else if (dups.length > 1) parts.push(t("biblio.add-dup", { count: dups.length }));
      if (zoteroOff) parts.push(t("biblio.add-zotero-off"));
      setAddNote(parts.join(" · ") || null);
      window.setTimeout(() => setAddNote(null), 8000);
      // la reconnaissance des métadonnées prend quelques secondes : double refresh
      if (ok) {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("zotero-changed")), 2000);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("zotero-changed")), 8000);
      }
    };
    window.addEventListener("zotero-add-result", onAdd);
    return () => window.removeEventListener("zotero-add-result", onAdd);
  }, []);
  const [pdfOnly, setPdfOnly] = useState(() => localStorage.getItem("atelier-studio.biblio.pdfOnly") === "1");
  function togglePdfOnly() {
    setPdfOnly((v) => {
      localStorage.setItem("atelier-studio.biblio.pdfOnly", v ? "0" : "1");
      return !v;
    });
  }
  const [sortBy, setSortBy] = useState<"added" | "year" | "author" | "title">(() => {
    const v = localStorage.getItem("atelier-studio.biblio.sort");
    return v === "year" || v === "author" || v === "title" ? v : "added";
  });
  function changeSort(v: "added" | "year" | "author" | "title") {
    localStorage.setItem("atelier-studio.biblio.sort", v);
    setSortBy(v);
  }
  function toggleList() {
    setListOpen((v) => {
      localStorage.setItem("atelier-studio.biblio.list", v ? "0" : "1");
      return !v;
    });
  }
  function toggleReader() {
    setReaderOpen((v) => {
      localStorage.setItem("atelier-studio.biblio.reader", v ? "0" : "1");
      if (v && !listOpen) { localStorage.setItem("atelier-studio.biblio.list", "1"); setListOpen(true); }
      return !v;
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    saveState({ key: selectedKey, filter, collectionId });
  }, [selectedKey, filter, collectionId]);

  useEffect(() => {
    const onItems = (e: Event) => {
      const msg = (e as CustomEvent).detail as { items: ZoteroItem[]; error?: string };
      setError(msg.error ?? null);
      setItems(msg.items ?? []);
    };
    const onCollections = (e: Event) => {
      const msg = (e as CustomEvent).detail as { collections: ZoteroCollection[]; error?: string };
      if (msg.error) setError(msg.error);
      setCollections(msg.collections ?? []);
    };
    const onFav = (e: Event) => {
      const msg = (e as CustomEvent).detail as { key: string; fav: boolean };
      setItems((prev) => prev.map((item) => (item.key === msg.key ? { ...item, fav: msg.fav } : item)));
    };
    const onChanged = () => {
      send(ws, { type: "zoteroSearch", query, collectionId: filter === "collection" ? collectionId : null });
      send(ws, { type: "zoteroCollections" });
    };
    const onSelect = (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      if (typeof key !== "string") return;
      setFilter("all");
      setCollectionId(null);
      setSelectedKey(key);
      setPassageTarget(null);
      if (!readerOpen) {
        localStorage.setItem("atelier-studio.biblio.reader", "1");
        setReaderOpen(true);
      }
    };
    const onOpenPassage = (e: Event) => {
      const detail = (e as CustomEvent<PassageTarget>).detail;
      if (!detail || typeof detail.key !== "string" || !Number.isInteger(detail.page)) return;
      setSearch("");
      setQuery("");
      setFilter("all");
      setCollectionId(null);
      setSelectedKey(detail.key);
      setPassageTarget(detail);
      if (!readerOpen) {
        localStorage.setItem("atelier-studio.biblio.reader", "1");
        setReaderOpen(true);
      }
    };
    window.addEventListener("zotero-changed", onChanged);
    window.addEventListener("zotero-items", onItems);
    window.addEventListener("zotero-collections", onCollections);
    window.addEventListener("zotero-fav", onFav);
    window.addEventListener("biblio-select", onSelect);
    window.addEventListener("chat-open-zotero-passage", onOpenPassage);
    return () => {
      window.removeEventListener("zotero-changed", onChanged);
      window.removeEventListener("zotero-items", onItems);
      window.removeEventListener("zotero-collections", onCollections);
      window.removeEventListener("zotero-fav", onFav);
      window.removeEventListener("biblio-select", onSelect);
      window.removeEventListener("chat-open-zotero-passage", onOpenPassage);
    };
  }, [selectedKey, ws, query, filter, collectionId, readerOpen]);

  useEffect(() => {
    send(ws, { type: "zoteroCollections" });
  }, [ws]);

  useEffect(() => {
    const activeCollection = filter === "collection" ? collectionId : null;
    send(ws, {
      type: "zoteroSearch",
      query: passageTarget?.key ?? query,
      collectionId: activeCollection,
    });
  }, [ws, query, filter, collectionId, passageTarget]);

  const modeItems = filter === "fav" ? items.filter((item) => item.fav) : items;
  const filteredItems = pdfOnly ? modeItems.filter((item) => item.hasPdf) : modeItems;
  const visibleItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortBy === "added") list.sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""));
    if (sortBy === "year") list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    if (sortBy === "author") list.sort((a, b) => (a.creators || "\uffff").localeCompare(b.creators || "\uffff", undefined, { sensitivity: "base" }));
    if (sortBy === "title") list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return list;
  }, [filteredItems, sortBy]);
  const selected = visibleItems.find((item) => item.key === selectedKey) ?? null;
  const selectedViewerUrl = selected?.hasPdf && galleryUrl ? pdfViewerUrl(selected, galleryUrl, passageTarget) : null;

  function toggleFav(item: ZoteroItem) {
    const next = !item.fav;
    setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, fav: next } : it)));
    send(ws, { type: "zoteroFav", key: item.key, on: next });
  }

  // Épingler la pièce jointe Zotero ouverte dans la base de connaissances
  // (plan 051) : kind "zotero" — le backend résout ~/Zotero/storage et garde
  // itemKey pour les liens profonds de citation.
  const [kbPinned, setKbPinned] = useState<"ok" | "err" | null>(null);
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ok?: boolean } | undefined;
      if (detail && kbPinnedPendingRef.current) {
        kbPinnedPendingRef.current = false;
        setKbPinned(detail.ok ? "ok" : "err");
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
  const kbPinnedPendingRef = useRef(false);
  function pinSelectedToKb() {
    if (!selected?.pdfKey || !selected?.pdfFile) return;
    kbPinnedPendingRef.current = true;
    const origin = `zotero://${selected.pdfKey}/${encodeURIComponent(selected.pdfFile)}#${selected.key ?? ""}`;
    send(ws, { type: "kbAdd", kind: "zotero", origin, title: selected.title ?? "" });
  }

  const [cited, setCited] = useState(false);
  function citeSelected() {
    setCited(true);
    window.setTimeout(() => setCited(false), 1600);
    if (!selected) return;
    const label = selected.citeKey ? `@${selected.citeKey}` : `@${selected.key}`;
    const s = selected as ZoteroItem & { doi?: string; abstract?: string };
    const pdfPath = s.pdfKey && s.pdfFile
      ? `~/Zotero/storage/${s.pdfKey}/${s.pdfFile}` : null;
    const lines = [
      `Référence (bibliothèque Zotero locale — tout est déjà ici, n'ouvre PAS Zotero) :`,
      `- Titre : ${s.title}`,
      `- Auteurs : ${s.creators}${s.year ? ` (${s.year})` : ""}`,
      s.publication ? `- Revue : ${s.publication}` : null,
      s.doi ? `- DOI : ${s.doi}` : null,
      `- Clé de citation : ${label}`,
      pdfPath ? `- PDF (lisible directement avec Read) : ${pdfPath}` : `- Pas de PDF attaché`,
      s.abstract ? `- Résumé : ${s.abstract.slice(0, 900)}` : null,
    ].filter(Boolean).join("\n");
    window.dispatchEvent(new CustomEvent("atelier-add-to-chat-citation", {
      detail: { text: lines, key: s.key, citeKey: s.citeKey, title: s.title },
    }));
  }

  const [listW, setListW] = useState(() => {
    const v = Number(localStorage.getItem("atelier-studio.biblioListW"));
    return Number.isFinite(v) && v >= 220 && v <= 560 ? v : 300;
  });
  function startListResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listW;
    document.body.classList.add("dragging");
    const move = (ev: MouseEvent) => {
      const w = Math.min(560, Math.max(220, startW + ev.clientX - startX));
      setListW(w);
    };
    const up = (ev: MouseEvent) => {
      const w = Math.min(560, Math.max(220, startW + ev.clientX - startX));
      localStorage.setItem("atelier-studio.biblioListW", String(w));
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div className={`biblio-surface ${readerOpen ? "" : "no-reader"} ${listOpen ? "" : "no-list"}`}
      style={listOpen && readerOpen ? { gridTemplateColumns: `${listW}px 4px minmax(0, 1fr)` } : undefined}>
      {listOpen && (
      <aside className="biblio-left">
        <div className="biblio-search-row">
          <span className="biblio-search-icon"><SearchIcon /></span>
          <Input
            className="biblio-search-input"
            value={search}
            onChange={(e) => { setPassageTarget(null); setSearch(e.target.value); }}
            placeholder={t("biblio.search")}
            aria-label={t("biblio.search")}
          />
          {!readerOpen && paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
        </div>
        <div className="biblio-filters">
          <Button variant="ghost" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>{t("biblio.all")}</Button>
          <IconButton size="s" className={filter === "fav" ? "on" : ""} onClick={() => setFilter("fav")} label={t("biblio.favorites")}>
            <StarIcon />
          </IconButton>
          <IconButton size="s" className={pdfOnly ? "on" : ""} onClick={togglePdfOnly}
            title={t("biblio.pdf-only")} label={t("biblio.pdf-only")}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
              <path d="M6 9.2h4M6 11.2h2.5" />
            </svg>
          </IconButton>
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
          <Select
            className="biblio-sort"
            title={t("biblio.sort-aria")}
            value={sortBy}
            onChange={(value) => changeSort(value as "added" | "year" | "author" | "title")}
            options={[
              { value: "added", label: t("biblio.sort-added") },
              { value: "year", label: t("biblio.sort-year") },
              { value: "author", label: t("biblio.sort-author") },
              { value: "title", label: t("biblio.sort-title") },
            ]}
          />
          <IconButton size="s" className="biblio-add" onClick={addPdfs} disabled={adding}
            title={t("biblio.add-pdf")} label={t("biblio.add-pdf")}>
            {adding ? "…" : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            )}
          </IconButton>
        </div>
        {addNote && <div className="biblio-add-note">{addNote}</div>}
        {error && <div className="biblio-empty">{error}</div>}
        <div className="biblio-list">
          {!error && visibleItems.length === 0 && <div className="biblio-empty">{t("biblio.empty")}</div>}
          {visibleItems.map((item) => (
            <div
              key={item.key}
              className={`biblio-row ${selected?.key === item.key ? "on" : ""}`}
            >
              <RowButton
                className="biblio-main-button"
                onClick={() => { setSelectedKey(item.key); setPassageTarget(null); if (!readerOpen && item.hasPdf) toggleReader(); }}
                title={item.title}
              >
                <span className="biblio-title">{item.title}</span>
                <span className="biblio-meta">{creatorLine(item)}</span>
              </RowButton>
              <IconButton
                className={`biblio-star ${item.fav ? "on" : ""}`}
                label={item.fav ? t("action.remove-favorite") : t("action.add-favorite")}
                onClick={() => toggleFav(item)}
              >
                <StarIcon />
              </IconButton>
            </div>
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
            {selected && <small>{creatorLine(selected)}</small>}
          </div>
          <Button variant="ghost" className={`biblio-citekey ${cited ? "ok" : ""}`} disabled={!selected}
            title={t("biblio.cite-tip")} onClick={citeSelected}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3 9.5C3 6.5 4.8 4.4 7 3.5l.6 1.2c-1.4.7-2.3 1.8-2.5 3 .2-.1.5-.2.9-.2 1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1C4.4 11.6 3 10.8 3 9.5zm6.5 0c0-3 1.8-5.1 4-6l.6 1.2c-1.4.7-2.3 1.8-2.5 3 .2-.1.5-.2.9-.2 1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1c-1.5 0-2.9-.8-2.9-2.1z"/>
            </svg>
            <span>{cited ? "✓" : (selected ? `@${selected.citeKey || selected.key}` : "@…")}</span>
          </Button>
          <IconButton
            className={`ghost ${kbPinned === "ok" ? "kb-flash-ok" : ""}${kbPinned === "err" ? " kb-flash-err" : ""}`}
            disabled={!selected?.pdfKey || !selected?.pdfFile}
            title={kbPinned === "ok" ? t("biblio.added-kb") : t("biblio.add-kb")}
            label={t("biblio.add-kb")}
            onClick={pinSelectedToKb}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
            </svg>
          </IconButton>
          {paneControls && <div className="workspace-pane-controls-slot">{paneControls}</div>}
          <IconButton className="ghost git-icon-btn" title={t("action.close-reader")}
            label={t("action.close-reader")} onClick={toggleReader}>
            <CloseIcon />
          </IconButton>
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
