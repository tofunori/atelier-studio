/** Mode rendu quand on quitte le mode Plan par l'entrée « Mode plan » du menu
 * « + ». Le menu basculait entre plan et bypassPermissions : un fil en
 * acceptEdits (le défaut) qui passait en Plan puis en sortait tournait ensuite
 * en accès complet, sans approbation. On revient donc au mode d'avant Plan
 * dans CE fil, sinon au mode par défaut des réglages, sinon à acceptEdits —
 * jamais à l'accès complet par ce chemin : il se choisit explicitement dans le
 * sélecteur de permission. */
export function modeApresPlan(
  precedent: string | null | undefined,
  permis: readonly string[],
  defaut?: string | null,
): string {
  const repli = (mode: string | null | undefined): mode is string =>
    !!mode && mode !== "plan" && mode !== "bypassPermissions" && permis.includes(mode);
  if (repli(precedent)) return precedent;
  if (repli(defaut)) return defaut;
  if (repli("acceptEdits")) return "acceptEdits";
  return permis.find((mode) => repli(mode)) ?? "acceptEdits";
}

/** Mode effectivement appliqué pour un fournisseur. « Auto » n'existe que
 * chez Claude (classifieur du CLI) : un réglage par défaut « Auto » qui atteint
 * un fournisseur sans ce mode prend son plus proche voisin, « Éditions auto ».
 * Catalogue inconnu ou vide : le mode passe tel quel (le backend a le même
 * repli). */
export function modePourFournisseur(mode: string, permis?: readonly string[] | null): string {
  if (mode !== "auto" || !permis || permis.length === 0 || permis.includes("auto")) return mode;
  return permis.includes("acceptEdits") ? "acceptEdits" : (permis.find((m) => m !== "bypassPermissions") ?? mode);
}
