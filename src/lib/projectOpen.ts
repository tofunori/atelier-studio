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

/** Chemin absolu sans barre finale, ou null. */
function projectRoot(raw: string): string | null {
  const root = raw.replace(/\/+$/, "") || "/";
  return root.startsWith("/") ? root : null;
}

/**
 * Branche les deux voies une fois par processus. Ajoute le projet à la liste
 * puis l'active, comme le dialogue « Ouvrir un projet » (App.addProject).
 */
let wired = false;
export async function wireProjectOpen(
  setProjects: (update: (projects: string[]) => string[]) => void,
  setActiveProject: (root: string) => void,
  markOpened: (root: string) => void,
): Promise<void> {
  if (wired) return;
  wired = true;
  const openRaw = (raw: string) => {
    const root = projectRoot(raw);
    if (!root) return;
    setProjects((projects) => (projects.includes(root) ? projects : [...projects, root]));
    setActiveProject(root);
    markOpened(root);
  };
  try {
    await onOpenProject(openRaw);
    const path = await takeCliProject();
    if (path) openRaw(path);
  } catch (error) {
    console.warn("[atelier] ouverture de projet par la commande impossible", error);
  }
}
