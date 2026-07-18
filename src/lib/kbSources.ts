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
};

// Liaison d'attache d'une conversation (partagée picker/panneau, plan 050).
export type KbBinding = {
  attached: string[];
  fullContent: string[];
  onChange: (next: { kbSourceIds: string[]; kbFullContent: string[] }) => void;
};

let sources: KbSource[] = [];
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

export function kbSourcesLoaded(): boolean {
  return loaded;
}

export function subscribeKbSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestKbSources(): void {
  wsSend({ type: "kbList" });
}

// test seulement : remet le cache à zéro entre deux cas
export function resetKbSourcesForTests(): void {
  sources = [];
  loaded = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("kb-sources", (e) => {
    const detail = (e as CustomEvent).detail;
    if (Array.isArray(detail)) {
      sources = detail as KbSource[];
      loaded = true;
      emit();
    }
  });
  // après un épinglage réussi (browser, picker), la liste est rafraîchie
  window.addEventListener("kb-source-added", (e) => {
    const detail = (e as CustomEvent).detail as { ok?: boolean } | undefined;
    if (detail?.ok) requestKbSources();
  });
}
