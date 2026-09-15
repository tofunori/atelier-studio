// Onglets du lecteur Bibliothèque. Cet état reste distinct de la sélection du
// catalogue : filtrer ou déplacer le rail de sélection ne ferme pas les PDF
// déjà ouverts.
import { useCallback, useMemo, useState } from "react";

import type { PassageTarget, ZoteroItem } from "./types";

export type BiblioTab = {
  key: string;
  item: ZoteroItem;
  passageTarget: PassageTarget | null;
};

export type BiblioTabsState = {
  tabs: BiblioTab[];
  /** `null` désigne l'onglet Bibliothèque. */
  activeTabKey: string | null;
};

type BiblioTabsAction =
  | { type: "open"; item: ZoteroItem; passageTarget?: PassageTarget | null }
  | { type: "activate-library" }
  | { type: "activate-article"; key: string }
  | { type: "close"; key: string }
  | { type: "set-passage"; key: string; passageTarget: PassageTarget | null };

export const EMPTY_BIBLIO_TABS: BiblioTabsState = { tabs: [], activeTabKey: null };

function passageFor(key: string, target: PassageTarget | null): PassageTarget | null {
  return target ? { ...target, key } : null;
}

/** Réducteur exporté pour rendre les règles de navigation testables sans DOM. */
export function reduceBiblioTabs(state: BiblioTabsState, action: BiblioTabsAction): BiblioTabsState {
  if (action.type === "activate-library") {
    return state.activeTabKey === null ? state : { ...state, activeTabKey: null };
  }

  if (action.type === "activate-article") {
    if (state.activeTabKey === action.key || !state.tabs.some((tab) => tab.key === action.key)) return state;
    return { ...state, activeTabKey: action.key };
  }

  if (action.type === "open") {
    const index = state.tabs.findIndex((tab) => tab.key === action.item.key);
    if (index < 0) {
      const passageTarget = action.passageTarget === undefined
        ? null
        : passageFor(action.item.key, action.passageTarget);
      return {
        tabs: [...state.tabs, { key: action.item.key, item: action.item, passageTarget }],
        activeTabKey: action.item.key,
      };
    }

    const current = state.tabs[index];
    const passageTarget = action.passageTarget === undefined
      ? current.passageTarget
      : passageFor(action.item.key, action.passageTarget);
    const tabs = state.tabs.slice();
    // Met à jour le snapshot bibliographique sans déplacer ni dupliquer
    // l'onglet. Une ouverture ordinaire préserve la cible et donc l'URL.
    tabs[index] = { ...current, item: action.item, passageTarget };
    return { tabs, activeTabKey: action.item.key };
  }

  if (action.type === "set-passage") {
    const index = state.tabs.findIndex((tab) => tab.key === action.key);
    if (index < 0) return state;
    const next = passageFor(action.key, action.passageTarget);
    if (state.tabs[index].passageTarget === next) return state;
    const tabs = state.tabs.slice();
    tabs[index] = { ...tabs[index], passageTarget: next };
    return { ...state, tabs };
  }

  const index = state.tabs.findIndex((tab) => tab.key === action.key);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.key !== action.key);
  if (state.activeTabKey !== action.key) return { ...state, tabs };
  // Le voisin de droite garde le même index après retrait. À défaut, le
  // voisin de gauche devient actif ; l'onglet Bibliothèque est le dernier repli.
  const neighbor = tabs[index] ?? tabs[index - 1] ?? null;
  return { tabs, activeTabKey: neighbor?.key ?? null };
}

export type BiblioTabs = ReturnType<typeof useBiblioTabs>;

export function useBiblioTabs() {
  const [state, setState] = useState<BiblioTabsState>(EMPTY_BIBLIO_TABS);

  const dispatch = useCallback((action: BiblioTabsAction) => {
    setState((current) => reduceBiblioTabs(current, action));
  }, []);

  const openArticle = useCallback((item: ZoteroItem, passageTarget?: PassageTarget | null) => {
    dispatch({ type: "open", item, passageTarget });
  }, [dispatch]);
  const activateLibrary = useCallback(() => dispatch({ type: "activate-library" }), [dispatch]);
  const activateArticle = useCallback((key: string) => dispatch({ type: "activate-article", key }), [dispatch]);
  const closeArticle = useCallback((key: string) => dispatch({ type: "close", key }), [dispatch]);
  const setTabPassageTarget = useCallback((key: string, passageTarget: PassageTarget | null) => {
    dispatch({ type: "set-passage", key, passageTarget });
  }, [dispatch]);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.key === state.activeTabKey) ?? null,
    [state.tabs, state.activeTabKey],
  );

  return {
    tabs: state.tabs,
    activeTabKey: state.activeTabKey,
    activeTab,
    isLibraryActive: state.activeTabKey === null,
    openArticle,
    activateLibrary,
    activateArticle,
    closeArticle,
    setTabPassageTarget,
  };
}
