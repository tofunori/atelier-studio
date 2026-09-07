// Liste de la surface Bibliothèque : chargement du catalogue, portée
// (collection / favoris / PDF), recherche LOCALE, tri, favoris optimistes.
//
// Contrat WebSocket (backend Rust) :
//   → { type:"zoteroSearch", q?, query?, collection?, collectionId?, tag?,
//       fav?, limit?, requestId? }
//   ← { type:"zoteroItems", items, requestId?, error? }
//   → { type:"zoteroFav", key, fav, on }
//   ← { type:"zoteroFav", key, fav, ok, error? }
//
// Les champs partent en DOUBLE (q/query, collection/collectionId, fav/on).
// Le backend Rust accepte DÉSORMAIS les deux jeux de noms : `q`/`collection`/
// `fav` sont ceux du contrat, `query`/`collectionId`/`on` ne subsistent que
// pour un routeur plus ancien encore déployé. Le double envoi reste volontaire
// pendant la transition — à retirer quand plus aucun binaire legacy ne tourne.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { t } from "../../lib/i18n";
import { clearPendingPassageOpen, consumePendingPassageOpen } from "../../lib/pendingPassageOpen";
import { CATALOG_LIMIT, filterItems, sortItems } from "./filter";
import type {
  FilterMode,
  PassageTarget,
  SortBy,
  ZoteroAddResult,
  ZoteroCollection,
  ZoteroItem,
} from "./types";

const STORAGE_KEY = "atelier-studio.biblio";
const PDF_ONLY_KEY = "atelier-studio.biblio.pdfOnly";
const SORT_KEY = "atelier-studio.biblio.sort";

export function send(ws: WebSocket | null, msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function loadState(): { key: string | null; filter: FilterMode; collectionId: string | null } {
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

export function summarizeZoteroAddResults(results: ZoteroAddResult[]): string | null {
  const ok = results.filter((result) => result.ok).length;
  const duplicates = results.filter((result) => result.error === "duplicate");
  const zoteroOff = results.some((result) => result.error === "zotero-off");
  const zoteroTimeout = results.some((result) => result.error === "zotero-timeout");
  const failed = results.filter(
    (result) => !result.ok
      && result.error !== "duplicate"
      && result.error !== "zotero-off"
      && result.error !== "zotero-timeout",
  ).length;
  const parts: string[] = [];
  if (ok) parts.push(t("biblio.add-done", { count: ok }));
  if (duplicates.length === 1) {
    parts.push(t("biblio.add-dup-one", { title: (duplicates[0].match ?? duplicates[0].name).slice(0, 60) }));
  } else if (duplicates.length > 1) {
    parts.push(t("biblio.add-dup", { count: duplicates.length }));
  }
  if (zoteroOff) parts.push(t("biblio.add-zotero-off"));
  if (zoteroTimeout) parts.push(t("biblio.add-zotero-timeout"));
  if (failed) parts.push(t("biblio.add-failed", { count: failed }));
  return parts.join(" · ") || null;
}

export type BiblioList = ReturnType<typeof useBiblioList>;

export function useBiblioList({ ws, openReader }: { ws: WebSocket | null; openReader: () => void }) {
  const persisted = useMemo(loadState, []);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [filter, setFilter] = useState<FilterMode>(persisted.filter);
  const [collectionId, setCollectionId] = useState<string | null>(persisted.collectionId);
  const [selectedKey, setSelectedKey] = useState<string | null>(persisted.key);
  const [passageTarget, setPassageTarget] = useState<PassageTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Course de requêtes (point 2) : un identifiant monotone par envoi ; toute
  // réponse dont le requestId n'est PAS le dernier attendu est jetée, quel que
  // soit son ordre d'arrivée. Une réponse sans requestId (routeur d'avant le
  // port) reste acceptée — sinon la surface resterait vide.
  const requestSeq = useRef(0);
  const pendingRequest = useRef<number | null>(null);
  // Le catalogue de la portée est-il tronqué par le plafond serveur ? Si oui
  // la recherche repart sur le réseau, sinon elle reste 100 % locale.
  const [serverFallback, setServerFallback] = useState(false);
  const favRollback = useRef(new Map<string, boolean>());

  const [pdfOnly, setPdfOnly] = useState(() => localStorage.getItem(PDF_ONLY_KEY) === "1");
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const v = localStorage.getItem(SORT_KEY);
    return v === "year" || v === "author" || v === "title" ? v : "added";
  });

  function togglePdfOnly() {
    setPdfOnly((v) => {
      localStorage.setItem(PDF_ONLY_KEY, v ? "0" : "1");
      return !v;
    });
  }
  function changeSort(v: SortBy) {
    localStorage.setItem(SORT_KEY, v);
    setSortBy(v);
  }

  const sendScoped = useCallback(
    (socket: WebSocket | null, q: string) => {
      const requestId = ++requestSeq.current;
      pendingRequest.current = requestId;
      const collection = filter === "collection" ? collectionId : null;
      send(socket, {
        type: "zoteroSearch",
        q,
        query: q,
        collection,
        collectionId: collection,
        fav: filter === "fav" ? true : undefined,
        limit: CATALOG_LIMIT,
        requestId,
      });
    },
    [filter, collectionId],
  );

  async function addPdfs() {
    const picked = await openDialog({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter(
      (x): x is string => typeof x === "string",
    );
    if (!paths.length) return;
    setAdding(true);
    setAddNote(null);
    send(ws, { type: "zoteroAddPdf", paths });
  }

  useEffect(() => {
    const onAdd = (e: Event) => {
      const results = ((e as CustomEvent).detail?.results ?? []) as ZoteroAddResult[];
      setAdding(false);
      const ok = results.filter((result) => result.ok).length;
      setAddNote(summarizeZoteroAddResults(results));
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

  // Ouvre le lecteur sur un passage précis — factorisé pour être appelé à la
  // fois par le listener chat-open-zotero-passage EN DIRECT et, au montage,
  // par le rattrapage d'une entrée pendingPassageOpen (finding 1, revue
  // finale de branche) : même traitement, deux déclencheurs.
  const applyPassageTarget = useCallback(
    (detail: PassageTarget) => {
      setSearch("");
      setQuery("");
      setFilter("all");
      setCollectionId(null);
      setSelectedKey(detail.key);
      setPassageTarget(detail);
      openReader();
    },
    [openReader],
  );

  // Premier clic perdu (revue finale de branche, finding 1) : openZoteroPassage
  // (md.tsx) dispatche chat-open-zotero-passage de façon SYNCHRONE au moment
  // même où App.tsx bascule la surface — mais BiblioSurface ne monte qu'au
  // rendu SUIVANT, donc le listener ci-dessous n'existe pas encore quand
  // l'événement part. openZoteroPassage pose l'entrée dans pendingPassageOpen
  // AVANT le dispatch ; ici, au montage (une seule fois), on la consomme et
  // on la traite comme si l'événement venait d'arriver.
  useEffect(() => {
    const pending = consumePendingPassageOpen();
    if (pending?.kind !== "zotero") return;
    const detail = pending.detail as PassageTarget | undefined;
    if (!detail || typeof detail.key !== "string") return;
    applyPassageTarget(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage seul, cf. commentaire
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    saveState({ key: selectedKey, filter, collectionId });
  }, [selectedKey, filter, collectionId]);

  useEffect(() => {
    const onItems = (e: Event) => {
      const msg = (e as CustomEvent).detail as {
        items?: ZoteroItem[];
        error?: string;
        requestId?: number | string;
      };
      if (msg.requestId != null && pendingRequest.current != null
        && Number(msg.requestId) !== pendingRequest.current) return;
      if (requestTimer.current) clearTimeout(requestTimer.current);
      setLoading(false);
      setError(msg.error ?? null);
      const next = msg.items ?? [];
      setItems(next);
      setServerFallback(next.length >= CATALOG_LIMIT);
    };
    const onCollections = (e: Event) => {
      const msg = (e as CustomEvent).detail as { collections: ZoteroCollection[]; error?: string };
      if (msg.error) setError(msg.error);
      setCollections(msg.collections ?? []);
    };
    // Favori : la bascule est optimiste ; si le backend répond ok:false on
    // REMET l'état d'avant et l'échec s'affiche dans la zone d'état — jamais
    // d'alert, jamais un cœur allumé qui ment.
    const onFav = (e: Event) => {
      const msg = (e as CustomEvent).detail as { key: string; fav: boolean; ok?: boolean; error?: string };
      const previous = favRollback.current.get(msg.key);
      favRollback.current.delete(msg.key);
      if (msg.ok === false) {
        if (previous !== undefined) {
          setItems((prev) => prev.map((item) => (item.key === msg.key ? { ...item, fav: previous } : item)));
        }
        setError(msg.error ? t("biblio.fav-failed-detail", { error: msg.error }) : t("biblio.fav-failed"));
        return;
      }
      setItems((prev) => prev.map((item) => (item.key === msg.key ? { ...item, fav: msg.fav } : item)));
    };
    const onChanged = () => {
      sendScoped(ws, serverFallback ? query : "");
      send(ws, { type: "zoteroCollections" });
    };
    const onSelect = (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      if (typeof key !== "string") return;
      setFilter("all");
      setCollectionId(null);
      setSelectedKey(key);
      setPassageTarget(null);
      openReader();
    };
    const onOpenPassage = (e: Event) => {
      // reçu en direct (listener déjà monté) : efface une éventuelle entrée
      // pending pour qu'elle ne soit pas rejouée à un remontage futur sans
      // rapport (finding 1, revue finale de branche).
      clearPendingPassageOpen();
      const detail = (e as CustomEvent<PassageTarget>).detail;
      if (!detail || typeof detail.key !== "string") return;
      applyPassageTarget(detail);
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
  }, [ws, query, serverFallback, sendScoped, applyPassageTarget, openReader]);

  useEffect(() => {
    send(ws, { type: "zoteroCollections" });
  }, [ws]);

  // Chargement du CATALOGUE de la portée : une seule fois à l'ouverture, puis
  // à chaque changement de collection / favoris / cible de passage. La saisie
  // n'est PAS une dépendance — elle filtre localement (cf. visibleItems).
  useEffect(() => {
    const request = () => {
      if (requestTimer.current) clearTimeout(requestTimer.current);
      if (ws?.readyState !== WebSocket.OPEN) {
        setLoading(false);
        setError(t("biblio.offline"));
        return;
      }
      setLoading(true);
      setError(null);
      sendScoped(ws, passageTarget?.key ?? "");
      requestTimer.current = setTimeout(() => {
        setLoading(false);
        setError(t("biblio.timeout"));
      }, 15000);
    };
    const disconnected = () => {
      setLoading(false);
      setError(t("biblio.offline"));
    };
    request();
    ws?.addEventListener?.("open", request);
    ws?.addEventListener?.("close", disconnected);
    return () => {
      if (requestTimer.current) clearTimeout(requestTimer.current);
      ws?.removeEventListener?.("open", request);
      ws?.removeEventListener?.("close", disconnected);
    };
  }, [ws, filter, collectionId, passageTarget, sendScoped]);

  // Repli serveur : uniquement quand la portée dépasse le plafond du
  // catalogue — sinon la saisie ne touche JAMAIS au réseau.
  useEffect(() => {
    if (!serverFallback) return;
    if (ws?.readyState !== WebSocket.OPEN) return;
    sendScoped(ws, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la portée a son propre effet
  }, [query, serverFallback]);

  const scopedItems = useMemo(() => {
    const byMode = filter === "fav" ? items.filter((item) => item.fav) : items;
    return pdfOnly ? byMode.filter((item) => item.hasPdf) : byMode;
  }, [items, filter, pdfOnly]);

  // Le filtrage local et le tri sont deux mémos distincts : changer de tri ne
  // refiltre pas, et taper ne retrie pas la liste entière deux fois.
  const searchedItems = useMemo(
    () => (serverFallback ? scopedItems : filterItems(scopedItems, query)),
    [scopedItems, query, serverFallback],
  );
  const visibleItems = useMemo(() => sortItems(searchedItems, sortBy), [searchedItems, sortBy]);

  const selected = visibleItems.find((item) => item.key === selectedKey) ?? null;

  const toggleFav = useCallback(
    (item: ZoteroItem) => {
      const next = !item.fav;
      favRollback.current.set(item.key, item.fav);
      setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, fav: next } : it)));
      send(ws, { type: "zoteroFav", key: item.key, fav: next, on: next });
    },
    [ws],
  );

  return {
    search, setSearch, query,
    items, visibleItems, collections,
    filter, setFilter, collectionId, setCollectionId,
    selectedKey, setSelectedKey, selected,
    passageTarget, setPassageTarget, applyPassageTarget,
    loading, error, setError,
    pdfOnly, togglePdfOnly, sortBy, changeSort,
    toggleFav, adding, addNote, addPdfs,
    serverFallback,
  };
}
