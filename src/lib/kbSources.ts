// Cache global des sources de la base de connaissances (plan 049 T3).
// La bibliothèque est globale à l'app (pas liée à un thread) : un petit store
// module-level alimenté par les événements fenêtre relayés depuis App
// (`kb-sources`, `kb-source-added`), lu via useSyncExternalStore.
import { wsSend } from "./wsBus";

export type KbSource = {
  id: string;
  kind: string; // file | pdf | web | note (T6+: folder, youtube, zotero)
  title: string;
  origin: string | null;
  chars: number;
  addedAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
  /** plan 051 : organisation */
  collections?: string[];
  archived?: boolean;
};

// Liaison d'attache d'une conversation (partagée picker/panneau, plan 050).
export type KbBinding = {
  attached: string[];
  fullContent: string[];
  onChange: (next: { kbSourceIds: string[]; kbFullContent: string[] }) => void;
};

export type KbCollection = { slug: string; title: string };

let sources: KbSource[] = [];
let collections: KbCollection[] = [];
let archived: { count: number; sources: KbSource[] } = { count: 0, sources: [] };
let loaded = false;
const listeners = new Set<() => void>();

// Signal d'ouverture du picker : la pilule agrégée (et tout autre déclencheur
// externe) ouvre le popover sans dépendance de props à travers le composer.
const openPickerListeners = new Set<() => void>();
export function onOpenKbPicker(listener: () => void): () => void {
  openPickerListeners.add(listener);
  return () => openPickerListeners.delete(listener);
}
export function openKbPicker() {
  for (const listener of [...openPickerListeners]) listener();
}

function emit() {
  for (const listener of [...listeners]) listener();
}

export function kbSourcesSnapshot(): KbSource[] {
  return sources;
}

export function kbCollectionsSnapshot(): KbCollection[] {
  return collections;
}

export function kbArchivedSnapshot(): { count: number; sources: KbSource[] } {
  return archived;
}

export function kbSourcesLoaded(): boolean {
  return loaded;
}

export function subscribeKbSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let fetchedAt = 0;
const KB_LIST_TTL_MS = 30_000;

/** Demande la liste — no-op si le cache a moins de 30 s (plan 051 P3). */
export function requestKbSources(opts: { force?: boolean } = {}): void {
  if (!opts.force && loaded && Date.now() - fetchedAt < KB_LIST_TTL_MS) return;
  wsSend({ type: "kbList" });
}

// test seulement : remet le cache à zéro entre deux cas
export function resetKbSourcesForTests(): void {
  sources = [];
  collections = [];
  archived = { count: 0, sources: [] };
  loaded = false;
  fetchedAt = 0;
}

if (typeof window !== "undefined") {
  window.addEventListener("kb-sources", (e) => {
    const detail = (e as CustomEvent).detail as
      | KbSource[]
      | { sources?: KbSource[]; collections?: KbCollection[]; archivedCount?: number; archivedSources?: KbSource[] };
    // deux formes : tableau (héritage/tests) ou payload complet du backend
    const payload = Array.isArray(detail) ? { sources: detail } : detail;
    if (!payload || !Array.isArray(payload.sources)) return;
    sources = payload.sources;
    collections = Array.isArray(payload.collections) ? payload.collections : collections;
    archived = {
      count: typeof payload.archivedCount === "number" ? payload.archivedCount : archived.count,
      sources: Array.isArray(payload.archivedSources) ? payload.archivedSources : archived.sources,
    };
    loaded = true;
    fetchedAt = Date.now();
    emit();
  });
  // après un épinglage réussi (browser, picker), la liste est rafraîchie
  window.addEventListener("kb-source-added", (e) => {
    const detail = (e as CustomEvent).detail as { ok?: boolean } | undefined;
    if (detail?.ok) requestKbSources({ force: true });
  });
}
