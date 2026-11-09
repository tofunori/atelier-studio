// Cartes « article » des pièces jointes du chat (2026-11-02) : taille, pages,
// titre, revue et année d'un fichier joint, lus côté Rust (`fileCards` :
// notice Zotero, sinon métadonnées du PDF). Un seul aller-retour par lot de
// chemins, mis en cache pour la session : l'historique d'un fil ne relit pas
// les mêmes PDF à chaque rendu.
import { useSyncExternalStore } from "react";
import { wsSend } from "./wsBus";

export type FileCardMeta = {
  path: string;
  size?: number;
  pages?: number;
  title?: string;
  journal?: string;
  year?: string;
  missing?: boolean;
};

const cache = new Map<string, FileCardMeta | "pending">();
const listeners = new Set<() => void>();
let queued = new Set<string>();
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function flush() {
  const paths = [...queued].slice(0, 24);
  queued = new Set([...queued].slice(24));
  if (!paths.length) return;
  if (!wsSend({ type: "fileCards", paths })) {
    // hors ligne : on retentera au prochain rendu
    paths.forEach((path) => cache.delete(path));
    return;
  }
  if (queued.size) queueMicrotask(flush);
}

/** Demande les cartes manquantes (regroupées sur la micro-tâche). */
export function requestFileCards(paths: string[]) {
  const before = queued.size;
  for (const path of paths) {
    if (!path.startsWith("/") || cache.has(path)) continue;
    cache.set(path, "pending");
    queued.add(path);
  }
  if (queued.size && !before) queueMicrotask(flush);
}

export function receiveFileCards(cards: unknown) {
  if (!Array.isArray(cards)) return;
  for (const card of cards as FileCardMeta[]) {
    if (card && typeof card.path === "string") cache.set(card.path, card);
  }
  notify();
}

export function fileCardFor(path: string | undefined): FileCardMeta | null {
  const hit = path ? cache.get(path) : undefined;
  return hit && hit !== "pending" ? hit : null;
}

if (typeof window !== "undefined") {
  window.addEventListener("file-cards", (event) => {
    receiveFileCards(((event as CustomEvent).detail as { cards?: unknown } | undefined)?.cards);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Rend à nouveau quand une carte arrive ; demande celles qui manquent. */
export function useFileCards(paths: string[]): (path: string | undefined) => FileCardMeta | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  requestFileCards(paths);
  return fileCardFor;
}

/** Taille lisible dans la langue de l'interface (« 3,1 Mo », « 3.1 MB »). */
export function formatFileSize(bytes: number, lang: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  try {
    return new Intl.NumberFormat(lang, {
      style: "unit",
      unit: units[unit],
      unitDisplay: "short",
      maximumFractionDigits: unit >= 2 ? 1 : 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${["B", "KB", "MB", "GB"][unit]}`;
  }
}

/** Pour les tests. */
export function resetFileCards() {
  cache.clear();
  queued = new Set();
  notify();
}
