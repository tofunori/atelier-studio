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
