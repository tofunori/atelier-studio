//! `atelier [dossier]` : ouvre un projet dans Atelier, app fermée ou non.
//!
//! Le frontend consomme le dossier au démarrage (`cli_project`, argument de
//! lancement) et à chaud (événement `atelier-open-project`, envoyé par une
//! autre invocation via la socket de l'instance vivante).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Dossier passé au lancement, une seule fois par processus. */
export async function takeCliProject(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("cli_project");
}

/** `atelier ./these` lancé pendant qu'Atelier tourne. */
export async function onOpenProject(handler: (path: string) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<string>("atelier-open-project", (event) => {
    if (typeof event.payload === "string" && event.payload.trim()) handler(event.payload);
  });
}
