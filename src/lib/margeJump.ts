// Saut de la marge annotée vers un message (bug mesuré 2026-08-23) : le
// scrollToIndex de LegendList vise une position ESTIMÉE (estimatedItemSize)
// pour toute rangée jamais mesurée — sur un long fil, l'atterrissage est à
// des centaines de pixels de la cible. La géométrie réelle n'est connue
// qu'une fois les rangées posées : on attend que le défilement se stabilise,
// puis on corrige sur la position mesurée de la rangée, en itérant (chaque
// correction re-virtualise et peut re-mesurer des voisins).
//
// Fonction pure, sans DOM ni React : le composant sonde (scrollTop, rangée)
// à chaque frame et applique l'action rendue.

export type JumpProbe = {
  /** scrollTop courant du scroller. */
  scrollTop: number;
  /** Écart rangée-cible → haut de la fenêtre, null si la rangée n'est pas rendue. */
  rowDelta: number | null;
};

export type JumpState = {
  attempts: number;
  stable: number;
  lastTop: number | null;
  /** scrollTop au moment de la dernière correction — si inchangé à la
   * stabilisation suivante, la butée est atteinte (cible trop près du bas). */
  correctedFrom: number | null;
};

export type JumpAction =
  | { kind: "wait" }
  | { kind: "done" }
  | { kind: "correct"; delta: number }
  | { kind: "rescroll" }
  | { kind: "abandon" };

export const JUMP_TOLERANCE_PX = 4;
export const JUMP_MAX_ATTEMPTS = 90;
const STABLE_FRAMES = 2;

export function initialJumpState(): JumpState {
  return { attempts: 0, stable: 0, lastTop: null, correctedFrom: null };
}

export function nextJumpAction(
  state: JumpState,
  probe: JumpProbe,
  tolerance = JUMP_TOLERANCE_PX,
  maxAttempts = JUMP_MAX_ATTEMPTS,
): [JumpState, JumpAction] {
  const attempts = state.attempts + 1;
  if (attempts > maxAttempts) return [{ ...state, attempts }, { kind: "abandon" }];
  const stable = probe.scrollTop === state.lastTop ? state.stable + 1 : 0;
  const next: JumpState = { ...state, attempts, stable, lastTop: probe.scrollTop };
  if (stable < STABLE_FRAMES) return [next, { kind: "wait" }];
  // stabilisé : mesurer
  if (probe.rowDelta != null && Math.abs(probe.rowDelta) <= tolerance) {
    return [next, { kind: "done" }];
  }
  // correction sans effet (scrollTop identique à la précédente) : butée du
  // scroller, on ne fera jamais mieux — inutile de boucler jusqu'au cap.
  if (state.correctedFrom != null && probe.scrollTop === state.correctedFrom) {
    return [next, { kind: "done" }];
  }
  if (probe.rowDelta == null) {
    // la rangée cible n'est toujours pas rendue : re-viser (non animé)
    return [{ ...next, stable: 0, correctedFrom: probe.scrollTop }, { kind: "rescroll" }];
  }
  return [
    { ...next, stable: 0, correctedFrom: probe.scrollTop },
    { kind: "correct", delta: probe.rowDelta },
  ];
}
