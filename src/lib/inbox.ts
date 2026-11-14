// Arrivées depuis le reste du Mac (Atelier partout, lot 1) : Service
// « Envoyer à Atelier » (Finder, texte sélectionné), « Ouvrir avec →
// Atelier », dépôt sur le Dock et liens atelier://send?…
//
// La file vit côté Rust (crate atelier-inbox, src-tauri/src/inbox.rs) ;
// l'événement `inbox:arrival` n'est qu'un signal pour venir la vider, ce qui
// couvre aussi un envoi reçu avant que l'interface écoute (lancement à froid).
// Tout arrive comme pilule dans le compositeur : rien ne part sans ↵.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DraftAttachment } from "./chatDraftStore";
import { fileAttachment } from "./composerAttachments";
import { t } from "./i18n";

export type InboxEntry = { path: string; isDir: boolean };

export type InboxArrival = {
  id: number;
  via: "service" | "open" | "link";
  sourceApp: string | null;
  receivedAtMs: number;
} & (
  | { kind: "files"; entries: InboxEntry[]; omitted: number }
  | { kind: "text"; text: string; truncated: boolean; title: string | null }
  | { kind: "link"; url: string; title: string | null }
);

export async function drainInbox(): Promise<InboxArrival[]> {
  if (!isTauri()) return [];
  return invoke<InboxArrival[]>("inbox_drain");
}

export async function onInboxArrival(handler: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<number>("inbox:arrival", () => handler());
}

/** D'où vient l'envoi, tel que la pilule l'affiche (« Finder », « Safari »…). */
export function arrivalOrigin(arrival: InboxArrival): string {
  if (arrival.sourceApp) return arrival.sourceApp;
  if (arrival.via === "open") return t("inbox.via-open");
  if (arrival.via === "link") return t("inbox.via-link");
  return t("inbox.source-unknown");
}

/** Dossier hors projet joint par son chemin : l'agent le parcourt lui-même. */
export function externalFolderAttachment(path: string): DraftAttachment {
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const name = `${prefix.split("/").filter(Boolean).pop() ?? prefix}/`;
  return {
    name,
    lines: null,
    path: prefix,
    kind: "folder",
    text: [
      `Dossier joint comme contexte : ${prefix}`,
      "Contenu non injecté automatiquement ; liste-le et lis les fichiers utiles si nécessaire.",
    ].join("\n"),
    preview: { title: name, rows: [{ label: "Type", value: "Folder" }, { label: "Path", value: prefix }] },
  };
}

function quoted(text: string) {
  return `> ${text.split("\n").join("\n> ")}`;
}

/** Fichiers à ouvrir dans l'atelier plutôt qu'à joindre : « Ouvrir avec » et
 * le Dock disent « ouvre ce fichier ». Les dossiers, eux, rejoignent le chat. */
export function arrivalFilesToOpen(arrival: InboxArrival): string[] {
  if (arrival.via !== "open" || arrival.kind !== "files") return [];
  return arrival.entries.filter((entry) => !entry.isDir).map((entry) => entry.path);
}

/** Pilules que l'envoi dépose dans le compositeur. `skipPaths` : fichiers
 * déjà ouverts dans l'atelier, qu'on ne joint pas en plus. */
export function arrivalAttachments(
  arrival: InboxArrival,
  options: { now?: number; skipPaths?: ReadonlySet<string> } = {},
): DraftAttachment[] {
  const origin = arrivalOrigin(arrival);
  const arrivedAt = options.now ?? Date.now();
  const stamp = (attachment: DraftAttachment): DraftAttachment => ({ ...attachment, origin, arrivedAt });
  if (arrival.kind === "files") {
    return arrival.entries
      .filter((entry) => !options.skipPaths?.has(entry.path))
      .map((entry) => stamp(entry.isDir ? externalFolderAttachment(entry.path) : fileAttachment(entry.path)));
  }
  if (arrival.kind === "text") {
    const flat = arrival.text.replace(/\s+/g, " ").trim();
    const head = arrival.title
      ? `Texte envoyé depuis ${origin} (« ${arrival.title} ») :`
      : `Texte envoyé depuis ${origin} :`;
    return [stamp({
      name: `« ${flat.slice(0, 50)}${flat.length > 50 ? "…" : ""} »`,
      lines: null,
      kind: "quote",
      text: [head, quoted(arrival.text), ...(arrival.truncated ? ["(texte tronqué à la réception)"] : [])].join("\n"),
    })];
  }
  let host = arrival.url;
  try { host = new URL(arrival.url).hostname; } catch { /* adresse déjà validée côté Rust */ }
  return [stamp({
    name: arrival.title || host,
    lines: null,
    kind: "link",
    text: `Page web envoyée à Atelier : ${arrival.url}${arrival.title ? ` (« ${arrival.title} »)` : ""}. Consulte-la si nécessaire.`,
    preview: { title: arrival.title || host, rows: [{ label: "URL", value: arrival.url }] },
  })];
}
