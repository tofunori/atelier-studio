// Session par projet (2026-08-21).
//
// Un projet est le contexte des chats ET des onglets de l'atelier. Jusqu'ici
// il ne gardait rien : `selectProject` remettait le fil actif à null sans
// exception — le seul moyen d'atteindre l'accueil du projet — et un effet
// fermait tous les onglets ne parlant pas au serveur galerie du projet
// courant. Un aller-retour entre deux projets effaçait donc la conversation en
// cours et les fichiers ouverts.
//
// Les décisions prises ici, testables sans React :
//   - le clic ordinaire sur un projet RESTAURE son dernier fil ;
//   - le re-clic sur le projet DÉJÀ actif bascule vers son accueil (même
//     convention que le filtre « Surlignés ») ;
//   - une mémoire périmée (fil supprimé) retombe sur l'accueil plutôt que
//     d'afficher une conversation fantôme.

export type ProjectSelection = {
  /** Projet à rendre actif. */
  project: string;
  /** Fil à ouvrir, ou null pour l'accueil du projet. */
  threadId: string | null;
};

/**
 * Décide du fil à ouvrir quand on clique un projet dans le rail.
 *
 * `lastThreadByProject` vient du localStorage / du miroir disque : il est donc
 * traité comme une entrée non fiable (forme et fraîcheur). `knownThreadIds`
 * est la liste des fils réellement existants — un id mémorisé qui n'y est plus
 * est ignoré.
 */
export function pickThreadOnProjectSelect(args: {
  clicked: string;
  activeProject: string | null;
  lastThreadByProject: unknown;
  knownThreadIds: Iterable<string>;
}): ProjectSelection {
  const { clicked, activeProject } = args;
  // re-clic sur le projet actif : c'est la porte d'entrée de l'accueil
  if (activeProject && clicked === activeProject) return { project: clicked, threadId: null };
  const remembered = readMemory(args.lastThreadByProject)[clicked];
  if (!remembered) return { project: clicked, threadId: null };
  const known = new Set(args.knownThreadIds);
  return { project: clicked, threadId: known.has(remembered) ? remembered : null };
}

/** Lit une mémoire venue du disque sans jamais faire confiance à sa forme. */
function readMemory(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/** Onglet de l'atelier, réduit à ce qui décide de son appartenance. */
export type AtelierTabLike = {
  url: string;
  kind?: string;
  cwd?: string;
  projectRoot?: string;
};

/**
 * Onglets à AFFICHER pour le projet actif.
 *
 * Filtre de rendu, jamais de destruction : les onglets des autres projets
 * restent montés (l'atelier les garde déjà dans un pool en display:none), donc
 * terminaux connectés, défilement et état d'éditeur survivent à l'aller-retour.
 * L'ancien effet, lui, les retirait de l'état — sans même fermer les ptys.
 *
 * `atelierOrigin` est l'origine du serveur galerie du projet actif : elle sert
 * de repli pour les onglets ouverts avant l'estampille `projectRoot`. Le port
 * étant dérivé du chemin racine (src-tauri/src/atelier.rs), cette origine
 * identifie bien un projet.
 */
export function visibleTabsForProject<T extends AtelierTabLike>(
  tabs: readonly T[],
  activeProject: string | null,
  atelierOrigin: string | null,
): T[] {
  if (!activeProject || !atelierOrigin) return [...tabs];
  return tabs.filter((tab) => {
    if (tab.kind === "term") return !tab.cwd || tab.cwd === activeProject;
    if (tab.projectRoot) return tab.projectRoot === activeProject;
    try {
      return new URL(tab.url).origin === atelierOrigin;
    } catch {
      return false;
    }
  });
}

/** Surfaces toujours disponibles : elles existent pour tout projet. */
const PERMANENT_TABS = new Set(["gallery", "ide"]);

/**
 * Onglet actif à rétablir en rejoignant un projet.
 *
 * `activeTab` est un état unique côté App : sans mémoire par projet, revenir
 * sur un projet affichait l'onglet du projet qu'on venait de quitter, donc un
 * panneau vide une fois le filtre d'affichage appliqué.
 */
export function pickActiveTabForProject(
  remembered: string | null | undefined,
  visibleTabIds: Iterable<string>,
): string {
  if (!remembered) return "gallery";
  if (PERMANENT_TABS.has(remembered)) return remembered;
  return new Set(visibleTabIds).has(remembered) ? remembered : "gallery";
}

/**
 * Pose (ou retire) la valeur mémorisée d'un projet.
 *
 * Rend l'objet d'origine quand rien ne change : ces mémoires alimentent des
 * états React miroités sur disque, et un nouvel objet à chaque rendu
 * relancerait l'écriture en boucle.
 */
export function rememberForProject(
  memory: Record<string, string>,
  project: string,
  value: string | null,
): Record<string, string> {
  if (!project) return memory;
  if (value === null) {
    if (!(project in memory)) return memory;
    const next = { ...memory };
    delete next[project];
    return next;
  }
  if (memory[project] === value) return memory;
  return { ...memory, [project]: value };
}
