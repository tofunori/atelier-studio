// Signaux du rail calculés par le chunk de RailSignalsSource (hors de
// l'entrée) et lus par App : un petit store plutôt qu'un rappel vers le
// parent, pour qu'App ne se redessine que quand ce que montre le rail change.
import type { RailSignal } from "./railSignalLabel";
import type { AttentionMap } from "./railSignals";

export type RailView = {
  signals: {
    projects: Record<string, RailSignal>;
    threads: Record<string, RailSignal>;
    notes: Record<string, string[]>;
    discussions: number;
  };
  attention: AttentionMap;
};

let current: RailView | null = null;
const listeners = new Set<() => void>();

export const railViewStore = {
  get: (): RailView | null => current,
  set(view: RailView) {
    current = view;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
