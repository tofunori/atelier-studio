import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ZoteroItem } from "./types";
import { useBiblioTabs } from "./useBiblioTabs";

function item(key: string, title = key): ZoteroItem {
  return {
    key,
    title,
    dateAdded: "",
    creators: "",
    year: "",
    publication: "",
    tags: [],
    hasPdf: true,
    pdfKey: `PDF-${key}`,
    pdfFile: `${key}.pdf`,
    citeKey: key,
    fav: false,
  };
}

describe("useBiblioTabs", () => {
  it("ouvre un article indépendamment de l'onglet Bibliothèque et empêche les doublons", () => {
    const { result } = renderHook(() => useBiblioTabs());
    expect(result.current.isLibraryActive).toBe(true);

    act(() => result.current.openArticle(item("A")));
    act(() => result.current.activateLibrary());
    expect(result.current.tabs.map((tab) => tab.key)).toEqual(["A"]);
    expect(result.current.activeTab).toBeNull();

    act(() => result.current.openArticle(item("A", "Titre actualisé")));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTab?.item.title).toBe("Titre actualisé");
  });

  it("conserve une cible de passage propre à chaque onglet", () => {
    const { result } = renderHook(() => useBiblioTabs());
    act(() => result.current.openArticle(item("A"), { key: "A", page: 3, quote: "glace" }));
    act(() => result.current.openArticle(item("B"), { key: "B", section: "2.4" }));

    expect(result.current.tabs[0].passageTarget).toMatchObject({ key: "A", page: 3 });
    expect(result.current.tabs[1].passageTarget).toEqual({ key: "B", section: "2.4" });
    act(() => result.current.setTabPassageTarget("A", { key: "AUTRE", page: 8 }));
    expect(result.current.tabs[0].passageTarget).toEqual({ key: "A", page: 8 });
    expect(result.current.tabs[1].passageTarget).toEqual({ key: "B", section: "2.4" });
  });

  it("préserve la cible lors d'une réouverture ordinaire et l'efface seulement sur null explicite", () => {
    const { result } = renderHook(() => useBiblioTabs());
    act(() => result.current.openArticle(item("A"), { key: "A", page: 5 }));
    const target = result.current.activeTab?.passageTarget;

    act(() => result.current.openArticle(item("A", "Métadonnées neuves")));
    expect(result.current.activeTab?.passageTarget).toBe(target);
    expect(result.current.activeTab?.item.title).toBe("Métadonnées neuves");

    act(() => result.current.openArticle(item("A"), null));
    expect(result.current.activeTab?.passageTarget).toBeNull();
  });

  it("garde le snapshot d'un article quand il disparaît de la liste filtrée du parent", () => {
    const article = item("A", "Visible avant filtrage");
    const { result, rerender } = renderHook(
      ({ visible }: { visible: ZoteroItem[] }) => ({ tabs: useBiblioTabs(), visible }),
      { initialProps: { visible: [article] } },
    );
    act(() => result.current.tabs.openArticle(result.current.visible[0]));

    rerender({ visible: [] });
    expect(result.current.visible).toEqual([]);
    expect(result.current.tabs.activeTab?.item.title).toBe("Visible avant filtrage");
  });

  it("ferme l'onglet actif vers le voisin droit, puis gauche, puis Bibliothèque", () => {
    const { result } = renderHook(() => useBiblioTabs());
    for (const key of ["A", "B", "C"]) act(() => result.current.openArticle(item(key)));
    act(() => result.current.activateArticle("B"));
    act(() => result.current.closeArticle("B"));
    expect(result.current.activeTabKey).toBe("C");

    act(() => result.current.closeArticle("C"));
    expect(result.current.activeTabKey).toBe("A");
    act(() => result.current.closeArticle("A"));
    expect(result.current.activeTabKey).toBeNull();
    expect(result.current.isLibraryActive).toBe(true);
  });

  it("fermer un onglet inactif ne change pas l'article actif", () => {
    const { result } = renderHook(() => useBiblioTabs());
    for (const key of ["A", "B", "C"]) act(() => result.current.openArticle(item(key)));
    act(() => result.current.closeArticle("A"));
    expect(result.current.tabs.map((tab) => tab.key)).toEqual(["B", "C"]);
    expect(result.current.activeTabKey).toBe("C");
  });
});
