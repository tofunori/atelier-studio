// Sélection du projet actif quand le miroir disque arrive (plan 064, correctif
// du spike Linux 2026-08-16).
//
// `activeProject` s'initialise UNE fois, depuis le localStorage WKWebView
// (`App.tsx` : `loadProjects()[0] ?? null`). Sur une webview vierge ce
// localStorage est vide, donc rien n'est sélectionné — puis le miroir disque
// arrive, remplit le rail de projets… et la sélection reste nulle pour
// toujours. L'utilisateur voit ses projets dans le rail ET « aucun projet
// ouvert » au centre.
//
// Ce n'est PAS un cas de laboratoire : le localStorage de WKWebView est indexé
// sur l'identifiant de bundle, que le plan 064 renomme. Le premier lancement
// après ce renommage tombe exactement dedans, comme tout nouveau poste
// restauré depuis une sauvegarde. Constaté pour de vrai sur Linux (run CI
// 31967329679, pastille « P » dans le rail + panneau « No project open »).

export type ActiveProjectDecision = {
  /** Projet à sélectionner, ou null pour ne rien changer. */
  next: string | null;
  /** Vrai quand l'appelant doit appliquer `next`. */
  shouldAdopt: boolean;
};

/**
 * Décide s'il faut adopter un projet du disque comme projet actif.
 *
 * On n'adopte QUE si rien n'est sélectionné : un projet déjà actif (choisi par
 * l'utilisateur, ou restauré d'un localStorage sain) ne doit jamais être
 * déplacé sous ses pieds par l'arrivée asynchrone du miroir. Le premier de la
 * liste disque reprend la convention de l'initialiseur — c'est la même règle,
 * appliquée à la bonne source de vérité.
 */
export function pickActiveProjectFromDisk(
  currentActive: string | null,
  diskProjects: unknown,
): ActiveProjectDecision {
  if (currentActive) return { next: currentActive, shouldAdopt: false };
  if (!Array.isArray(diskProjects)) return { next: null, shouldAdopt: false };
  const first = diskProjects.find(
    (root): root is string => typeof root === "string" && root.trim() !== "",
  );
  if (!first) return { next: null, shouldAdopt: false };
  return { next: first, shouldAdopt: true };
}
