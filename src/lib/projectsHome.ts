// Écran d'ouverture des projets (bureau, 2026-11-08) : la part qui reste dans
// l'entrée — l'ordre « récent » des projets, partagé par l'écran (chargé à la
// demande) et par le menu du nom du projet. Rien d'autre ici : budget JS.

/** Échéance d'un projet : date ISO (AAAA-MM-JJ) et mot qui la précède. */
export type ProjectDue = { date: string; label?: string };

type Meta = { openedAt?: number; due?: ProjectDue; journal?: string };
type ThreadLike = { projectRoot: string; updatedAt?: string | null };

/** Dernière activité connue d'un projet (ms) : ouverture dans Atelier ou
 *  conversation la plus récente. 0 quand on ne sait rien. */
export function projectActivity(root: string, meta: Meta | undefined, threads: readonly ThreadLike[]): number {
  let latest = meta?.openedAt ?? 0;
  for (const thread of threads) {
    if (thread.projectRoot !== root || !thread.updatedAt) continue;
    const at = Date.parse(thread.updatedAt);
    if (at > latest) latest = at;
  }
  return latest;
}

/** Projets du plus récent au plus ancien ; à égalité, l'ordre du rail. */
export function recentProjects(
  projects: readonly string[],
  meta: Record<string, Meta | undefined>,
  threads: readonly ThreadLike[],
): string[] {
  const activity = new Map(projects.map((root) => [root, projectActivity(root, meta[root], threads)]));
  return projects
    .map((root, index) => ({ root, index }))
    .sort((a, b) => (activity.get(b.root)! - activity.get(a.root)!) || a.index - b.index)
    .map((entry) => entry.root);
}

/** Nom affiché d'un projet : son libellé s'il en a un, sinon le dossier. */
export function projectName(root: string, label?: string): string {
  if (label && !label.startsWith("icon:")) return label;
  return root.split("/").filter(Boolean).pop() ?? root;
}

// L'écran s'ouvre une fois par lancement de l'app (pas à chaque rechargement
// de la vue, que sessionStorage survit).
const SHOWN_KEY = "atelier-studio.projectsHomeShown";
export function takeLaunchProjectsHome(): boolean {
  try {
    if (sessionStorage.getItem(SHOWN_KEY)) return false;
    sessionStorage.setItem(SHOWN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
