// État du bouton « ajouter au chat » de la barre du navigateur selon qu'une
// sélection existe dans la page. Voir browserSelectionAffordance.test.ts pour
// le contrat et la raison du choix (option A, maquette du 2026-08-27).
export type ChatButtonState = {
  className: string;
  filled: boolean;
  titleKey: "action.search-web-add" | "browser.add-selection";
};

export function chatButtonState(hasSelection: boolean): ChatButtonState {
  return hasSelection
    ? { className: "ghost has-selection", filled: true, titleKey: "browser.add-selection" }
    : { className: "ghost", filled: false, titleKey: "action.search-web-add" };
}
