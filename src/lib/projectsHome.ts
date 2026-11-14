// Écran d'ouverture des projets (bureau, 2026-11-08) : la part qui reste dans
// l'entrée — l'ordre « récent » des projets, partagé par l'écran (chargé à la
// demande) et par le menu du nom du projet. Rien d'autre ici : budget JS.

/** Échéance d'un projet : date ISO (AAAA-MM-JJ) et mot qui la précède. */
export type ProjectDue = { date: string; label?: string };

type Meta = { openedAt?: number; due?: ProjectDue; journal?: string; name?: string; label?: string };
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

/** Ce qui nomme un projet dans projMeta : `name` est le nom d'affichage
 *  (2026-11-14, jamais le dossier sur le disque) ; `label` ne porte plus que
 *  l'icône (« icon:… ») ou les initiales. Un ancien libellé de plus de deux
 *  caractères était un nom donné à la création : il compte encore comme nom. */
type Naming = { name?: string; label?: string };

/** Nom choisi par l'utilisateur, ou null quand le projet garde celui du dossier. */
export function customProjectName(meta?: Naming): string | null {
  const name = meta?.name?.trim();
  if (name) return name;
  const label = meta?.label?.trim();
  return label && !label.startsWith("icon:") && [...label].length > 2 ? label : null;
}

/** Nom affiché d'un projet : celui qu'on lui a donné, sinon le dossier. */
export function projectName(root: string, meta?: Naming): string {
  return customProjectName(meta) ?? (root.split("/").filter(Boolean).pop() ?? root);
}

/** Range un ancien nom (dans `label`) sous `name`, pour que choisir une icône
 *  ou des initiales ne l'efface plus. Rend la même référence si rien ne change. */
export function migrateProjectNames<M extends Naming>(all: Record<string, M>): Record<string, M> {
  let next: Record<string, M> | null = null;
  for (const [root, meta] of Object.entries(all)) {
    if (!meta || meta.name || !customProjectName(meta)) continue;
    next ??= { ...all };
    next[root] = { ...meta, name: meta.label!.trim(), label: undefined };
  }
  return next ?? all;
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
