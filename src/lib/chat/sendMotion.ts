// Façade de l'envoi animé (« B · Envol », 2026-11-09). L'entrée JS est au
// plafond de son budget (scripts/check_entry_budget.mts) : le mouvement vit
// dans sendMotionImpl, chargé à l'ouverture du fil. Tant qu'il n'est pas là,
// sendMotion() vaut null et chaque appelant garde l'ancien comportement.
type Impl = typeof import("./sendMotionImpl");
let impl: Impl | null = null;

// Rappelée à chaque montage du fil : le module, une fois chargé, est en cache.
export function loadSendMotion(): void {
  if (!impl) import("./sendMotionImpl").then((m) => { impl = m; }, () => {});
}
export const sendMotion = () => impl;
