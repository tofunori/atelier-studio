import { useSyncExternalStore } from "react";

// La barre principale possède l'emplacement ; AtelierPane possède les actions
// du panneau focalisé. Le portail évite toute superposition sur les documents.
let host: HTMLSpanElement | null = null;
const subscribers = new Set<() => void>();
const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
};
const getSnapshot = () => host;
const setHost = (element: HTMLSpanElement | null) => {
  if (host === element) return;
  host = element;
  subscribers.forEach((listener) => listener());
};

export function WorkspacePaneMenuSlot() {
  return <span className="workspace-pane-menu-slot" ref={setHost} />;
}

export function useWorkspacePaneMenuHost() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

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
