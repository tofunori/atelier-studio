// Demande d'ouverture du menu des actions du pane, émise par la barre du haut
// et servie par AtelierPane (voir WorkspacePaneMenuSlot pour l'emplacement).

/**
 * Le menu des actions du pane s'ouvre au CLIC DROIT sur ce qui nomme le
 * contenu : un onglet de document, ou le bouton de la surface affichée.
 * L'icône isolée qui l'ouvrait ressemblait trait pour trait aux trois
 * boutons de mise en page et passait pour un quatrième choix de disposition
 * (Thierry 2026-11-02, variante C : « suppression »).
 */
export const WORKSPACE_PANE_MENU = "workspace-pane-menu";

export type WorkspacePaneMenuRequest = {
  /** id d'onglet du workspace (document, fil d'agent) */
  id?: string;
  /** ou la surface dont on a cliqué le bouton */
  surface?: string;
  /** point d'ancrage du menu, en coordonnées de la fenêtre */
  x: number;
  y: number;
};

export function requestWorkspacePaneMenu(
  event: Pick<MouseEvent, "clientX" | "clientY" | "currentTarget" | "preventDefault">,
  target: { id?: string; surface?: string },
) {
  event.preventDefault();
  let x = event.clientX;
  let y = event.clientY;
  // touche Menu / Maj+F10 : pas de pointeur, on ancre sous l'élément
  if (!x && !y && event.currentTarget instanceof Element) {
    const rect = event.currentTarget.getBoundingClientRect();
    x = rect.left;
    y = rect.bottom;
  }
  window.dispatchEvent(new CustomEvent<WorkspacePaneMenuRequest>(WORKSPACE_PANE_MENU, {
    detail: { ...target, x, y },
  }));
}
