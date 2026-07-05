import { useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { BookIcon, PanelIcon, RefreshIcon, StarIcon } from "./icons";

type ZoteroItem = {
  key: string;
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

function pdfViewerUrl(item: ZoteroItem, galleryUrl: string): string | null {
  if (!item.pdfKey || !item.pdfFile) return null;
  const origin = galleryOrigin(galleryUrl);
  if (!origin) return null;
  const rel = `zotero/${item.pdfKey}/${item.pdfFile}`;
  const pdfUrl = `${origin}/zotero/${encodeURIComponent(item.pdfKey)}/${encodeURIComponent(item.pdfFile)}`;
  const params = new URLSearchParams();
  params.set("file", rel);
  params.set("path", pdfUrl);
  return inheritHash(`${origin}/.fig_thumbs/pdf_viewer.html?${params.toString()}`, galleryUrl);
}

function creatorLine(item: ZoteroItem): string {
  return [item.creators || t("common.unknown-author"), item.year].filter(Boolean).join(" · ");
}

export default function BiblioSurface({
  ws,
  galleryUrl,
}: {
  ws: WebSocket | null;
  projectRoot: string;
  galleryUrl: string;
}) {
  const persisted = useMemo(loadState, []);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [filter, setFilter] = useState<FilterMode>(persisted.filter);
  const [collectionId, setCollectionId] = useState<string | null>(persisted.collectionId);
  const [selectedKey, setSelectedKey] = useState<string | null>(persisted.key);
  const [error, setError] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(() => localStorage.getItem("atelier-studio.biblio.reader") !== "0");
  const [listOpen, setListOpen] = useState(() => localStorage.getItem("atelier-studio.biblio.list") !== "0");
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
    window.addEventListener("zotero-changed", onChanged);
    window.addEventListener("zotero-items", onItems);
    window.addEventListener("zotero-collections", onCollections);
    window.addEventListener("zotero-fav", onFav);
    return () => {
      window.removeEventListener("zotero-changed", onChanged);
      window.removeEventListener("zotero-items", onItems);
      window.removeEventListener("zotero-collections", onCollections);
      window.removeEventListener("zotero-fav", onFav);
    };
  }, [selectedKey, ws, query, filter, collectionId]);

  useEffect(() => {
    send(ws, { type: "zoteroCollections" });
  }, [ws]);

  useEffect(() => {
    const activeCollection = filter === "collection" ? collectionId : null;
    send(ws, {
      type: "zoteroSearch",
      query,
      collectionId: activeCollection,
    });
  }, [ws, query, filter, collectionId]);

  const visibleItems = filter === "fav" ? items.filter((item) => item.fav) : items;
  const selected = visibleItems.find((item) => item.key === selectedKey) ?? null;
  const selectedViewerUrl = selected?.hasPdf && galleryUrl ? pdfViewerUrl(selected, galleryUrl) : null;

  function toggleFav(item: ZoteroItem) {
    const next = !item.fav;
    setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, fav: next } : it)));
    send(ws, { type: "zoteroFav", key: item.key, on: next });
  }

  function citeSelected() {
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

  return (
    <div className={`biblio-surface ${readerOpen ? "" : "no-reader"} ${listOpen ? "" : "no-list"}`}>
      {listOpen && (
      <aside className="biblio-left">
        <div className="biblio-search-row">
          <BookIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("biblio.search")}
            aria-label={t("biblio.search-aria")}
          />
          <button className={`ghost ${readerOpen ? "on" : ""}`} title={readerOpen ? t("action.close-reader") : t("action.open-reader")}
            onClick={toggleReader}>
            <PanelIcon />
          </button>
          <button className="ghost" title={t("action.refresh")} onClick={() => send(ws, { type: "zoteroSearch", query, collectionId: filter === "collection" ? collectionId : null })}>
            <RefreshIcon />
          </button>
        </div>
        <div className="biblio-filters">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>{t("biblio.all")}</button>
          <button className={filter === "fav" ? "on" : ""} onClick={() => setFilter("fav")} aria-label={t("biblio.favorites")}>
            <StarIcon />
          </button>
          <select
            value={filter === "collection" ? collectionId ?? "" : ""}
            onChange={(e) => {
              const value = e.target.value || null;
              setCollectionId(value);
              setFilter(value ? "collection" : "all");
            }}
            aria-label={t("biblio.collection-aria")}
          >
            <option value="">{t("biblio.collection")}</option>
            {collections.map((collection) => (
              <option key={collection.id} value={String(collection.id)}>
                {collection.name}
              </option>
            ))}
          </select>
        </div>
        {error && <div className="biblio-empty">{error}</div>}
        <div className="biblio-list">
          {!error && visibleItems.length === 0 && <div className="biblio-empty">{t("biblio.empty")}</div>}
          {visibleItems.map((item) => (
            <div
              key={item.key}
              className={`biblio-row ${selected?.key === item.key ? "on" : ""}`}
            >
              <button
                type="button"
                className="biblio-main-button"
                onClick={() => { setSelectedKey(item.key); if (!readerOpen && item.hasPdf) toggleReader(); }}
                title={item.title}
              >
                <span className="biblio-title">{item.title}</span>
                <span className="biblio-meta">{creatorLine(item)}</span>
              </button>
              <button
                type="button"
                className={`biblio-star ${item.fav ? "on" : ""}`}
                aria-label={item.fav ? t("action.remove-favorite") : t("action.add-favorite")}
                onClick={() => toggleFav(item)}
              >
                <StarIcon />
              </button>
            </div>
          ))}
        </div>
      </aside>
      )}
      {readerOpen && (
      <section className="biblio-reader">
        <div className="biblio-reader-head">
          <button className="ghost biblio-list-toggle" title={listOpen ? t("action.hide-list") : t("action.open-list")}
            onClick={toggleList}>
            <PanelIcon />
          </button>
          <div className="biblio-reader-title">
            <span>{selected?.title ?? t("biblio.title")}</span>
            {selected && <small>{creatorLine(selected)}</small>}
          </div>
          <button className="ghost biblio-cite" disabled={!selected} onClick={citeSelected}>
            {t("biblio.cite")}
          </button>
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
