// Ordre d'affichage des niveaux d'effort — le slider du composer pose un axe
// « Plus rapide » (gauche) → « Plus intelligent » (droite), donc la liste DOIT
// être croissante.
//
// Les providers ACP annoncent leur propre ordre et rien ne le contraint : côté
// Rust, `grok.rs` documente explicitement « L'ordre est celui annoncé par Grok
// — jamais trié ». Grok liste du plus fort au plus faible, ce qui plaçait
// `xhigh` en deuxième position : curseur, remplissage et point d'accent se
// retrouvaient inversés alors que le libellé, lui, était juste.
//
// L'ordre d'un provider n'est pas un contrat d'affichage : on le normalise ici,
// une fois, pour tous les providers.

// "" = Auto (le CLI décide) — toujours en tête. Les échelles off/on (Kimi) et
// minimal→max (API, Codex, Grok) ne coexistent jamais ; les ranger dans la même
// table garde chacune monotone sans cas particulier à l'appel.
const EFFORT_RANK: Record<string, number> = {
  "": 0,
  off: 1,
  none: 1,
  minimal: 2,
  low: 3,
  medium: 4,
  on: 5,
  high: 5,
  xhigh: 6,
  max: 7,
  // Claude Code : cran terminal annoncé par claude.rs. Il vaut xhigh + le
  // réglage `ultracode` (orchestration multi-agents), donc il se range APRÈS
  // max sur l'axe rapide→intelligent, jamais avant.
  ultracode: 8,
};

const UNKNOWN_RANK = 90;

/** Trie des niveaux d'effort du plus rapide au plus intelligent. Tri stable :
 *  un niveau inconnu du barème garde sa place relative, après les niveaux
 *  connus — on ne devine jamais où placer un palier qu'on ne comprend pas. */
export function sortEffortLevels(levels: string[]): string[] {
  return levels
    .map((level, index) => ({ level, index, rank: EFFORT_RANK[level] ?? UNKNOWN_RANK }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.level);
}
