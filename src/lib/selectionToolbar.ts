// Barre flottante de sélection (Quick Ask / Annoter / Ajouter au chat).
//
// Elle est posée en `position: fixed` avec `translateX(-50%)`, centrée sur le
// passage surligné. Sans bornage, une sélection près du bord gauche la pousse
// sous le rail : la moitié de la barre sort de la colonne de lecture.
export function clampToolbarLeft(
  centerX: number,
  toolbarWidth: number,
  bounds: { left: number; right: number },
  gutter = 8,
): number {
  // Pas encore mesurée (premier rendu) : on ne déplace rien plutôt que de
  // faire sauter la barre d'une position fausse vers la bonne.
  if (toolbarWidth <= 0) return centerX;
  const half = toolbarWidth / 2;
  const min = bounds.left + gutter + half;
  const max = bounds.right - gutter - half;
  // Colonne plus étroite que la barre : la centrer est le moins pire.
  if (min > max) return (bounds.left + bounds.right) / 2;
  return Math.min(Math.max(centerX, min), max);
}
