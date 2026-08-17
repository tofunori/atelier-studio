// Onglets de la barre du haut (lot 068) : noms complets, glyphes de type,
// débordement, fermeture par la croix et au clic milieu, glisser vers un pane.
// Reprend la couverture de RailFiles (les tuiles à deux lettres qu'ils
// remplacent), moins le monogramme — c'est justement lui qu'on retire.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup, act } from "@testing-library/react";
import TopBarTabs, { MAX_TABS, kindOf, tabLabel, splitLabel, parentFolder, folderPrefixes } from "./TopBarTabs";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
import { WORKSPACE_POINTER_DRAG_START } from "../lib/workspaceDrag";

const TABS = [
  { id: "document:t1", title: "methods_en.tex", url: "file:///p/manuscript_ch1/methods_en.tex" },
  { id: "document:t2", title: "intro_en.tex", url: "file:///p/manuscript_ch1/intro_en.tex" },
  { id: "document:t3", title: "albedo_trends.py", url: "file:///p/scripts/albedo_trends.py" },
  { id: "document:t4", title: "notes-terrain.md", url: "file:///p/journal/notes-terrain.md" },
];

function props(over: Partial<React.ComponentProps<typeof TopBarTabs>> = {}) {
  return {
    tabs: TABS,
    activeTab: "document:t1",
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Le nom d'un onglet est rendu en DEUX boîtes (tronc + extension) pour que
 *  l'ellipse morde le tronc et laisse l'extension lisible : `getByText` ne
 *  traverse pas les éléments, on vise donc l'onglet par son texte complet. */
function tab(name: string): HTMLElement {
  const found = [...document.querySelectorAll(".topbar-tab")]
    .find((node) => (node.textContent ?? "").trim() === name);
  if (!found) throw new Error(`onglet introuvable : ${name}`);
  return found as HTMLElement;
}

describe("libellé d'onglet", () => {
  it("garde le nom entier, extension comprise", () => {
    expect(tabLabel("methods_en.tex")).toBe("methods_en.tex");
    expect(tabLabel("/p/scripts/albedo_trends.py")).toBe("albedo_trends.py");
    expect(tabLabel("Methods_EN.tex")).toBe("Methods_EN.tex");
  });

  it("distingue ce que le monogramme confondait", () => {
    // le rail rendait « me » pour les trois — c'est le défaut qu'on corrige
    const noms = ["methods_en.tex", "memoire.tex", "meeting-2026-08.md"];
    expect(new Set(noms.map(tabLabel)).size).toBe(3);
  });

  it("ne rend jamais une pastille vide", () => {
    expect(tabLabel("")).toBe(t("tabs.untitled"));
    expect(tabLabel("   ")).toBe(t("tabs.untitled"));
  });
});

describe("type de fichier", () => {
  it("range les extensions en quatre familles", () => {
    expect(kindOf({ id: "a", title: "x.tex" })).toBe("tex");
    expect(kindOf({ id: "a", title: "x.py" })).toBe("code");
    expect(kindOf({ id: "a", title: "x.md" })).toBe("note");
    expect(kindOf({ id: "a", title: "x.pdf" })).toBe("image");
    expect(kindOf({ id: "a", title: "Makefile" })).toBe("doc");
  });

  it("lit l'extension de l'URL quand le titre n'en a pas", () => {
    expect(kindOf({ id: "a", title: "Sans titre", url: "file:///p/a.py" })).toBe("code");
    expect(kindOf({ id: "a", title: "figure", url: "http://x/f.png?v=2" })).toBe("image");
  });
});

describe("TopBarTabs", () => {
  it("reste absent quand rien n'est ouvert", () => {
    const { container } = renderUi(<TopBarTabs {...props({ tabs: [] })} />);
    expect(container.querySelector(".topbar-tabs")).toBeNull();
  });

  it("écrit le nom complet de chaque onglet et marque l'actif", () => {
    const { container } = renderUi(<TopBarTabs {...props()} />);
    expect(container.querySelectorAll(".topbar-tab").length).toBe(4);
    expect(tab("methods_en.tex")).toBeTruthy();
    expect(tab("albedo_trends.py")).toBeTruthy();
    expect(container.querySelector(".topbar-tab.on")?.textContent).toContain("methods_en.tex");
  });

  it("porte le nom du fichier comme nom accessible, pas deux lettres", () => {
    renderUi(<TopBarTabs {...props()} />);
    const actif = tab("methods_en.tex").querySelector("button")!;
    expect(actif.getAttribute("aria-current")).toBe("page");
    expect(actif.textContent).toContain("methods_en.tex");
  });

  it("sélectionne au clic, ferme au clic milieu", () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    renderUi(<TopBarTabs {...props({ onSelectTab, onCloseTab })} />);
    fireEvent.click(tab("intro_en.tex").querySelector(".topbar-tab-main")!);
    expect(onSelectTab).toHaveBeenCalledWith("document:t2");
    // auxClick n'est pas exposé par fireEvent : on émet l'événement natif
    fireEvent(tab("albedo_trends.py").querySelector(".topbar-tab-main")!, new MouseEvent("auxclick", { button: 1, bubbles: true }));
    expect(onCloseTab).toHaveBeenCalledWith("document:t3");
  });

  it("ferme par la croix, qui nomme le fichier qu'elle ferme", () => {
    const onCloseTab = vi.fn();
    renderUi(<TopBarTabs {...props({ onCloseTab })} />);
    const croix = screen.getByRole("button", { name: `${t("action.close-tab")} — intro_en.tex` });
    fireEvent.click(croix);
    expect(onCloseTab).toHaveBeenCalledWith("document:t2");
  });

  it("ignore le clic droit — il ne ferme rien", () => {
    const onCloseTab = vi.fn();
    renderUi(<TopBarTabs {...props({ onCloseTab })} />);
    fireEvent(tab("albedo_trends.py").querySelector(".topbar-tab-main")!, new MouseEvent("auxclick", { button: 2, bubbles: true }));
    expect(onCloseTab).not.toHaveBeenCalled();
  });

  it("plafonne à huit onglets et range le reste derrière un compteur", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id: `document:t${i}`, title: `fichier_${i}.tex`,
    }));
    const onSelectTab = vi.fn();
    const { container } = renderUi(<TopBarTabs {...props({ tabs: many, onSelectTab })} />);
    expect(container.querySelectorAll(".topbar-tab").length).toBe(MAX_TABS);
    fireEvent.click(screen.getByText("+3"));
    await act(async () => { await vi.dynamicImportSettled(); });
    fireEvent.click(screen.getByText("fichier_10.tex"));
    expect(onSelectTab).toHaveBeenCalledWith("document:t10");
  });

  it("rend les onglets glissables vers un autre pane", () => {
    renderUi(<TopBarTabs {...props()} />);
    const listener = vi.fn();
    window.addEventListener(WORKSPACE_POINTER_DRAG_START, listener);
    fireEvent.pointerDown(tab("intro_en.tex").querySelector(".topbar-tab-main")!, {
      button: 0, clientX: 240, clientY: 18, pointerId: 5,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.ref)
      .toEqual({ kind: "document", tabId: "t2" });
    window.removeEventListener(WORKSPACE_POINTER_DRAG_START, listener);
  });

  it("donne le chemin complet en infobulle, sans promettre de raccourci", () => {
    renderUi(<TopBarTabs {...props()} />);
    expect(screen.getByTitle("methods_en.tex")).toBeTruthy();
    expect(screen.getByTitle("albedo_trends.py")).toBeTruthy();
    // « — ⌥1 » annonçait un raccourci qui n'a jamais eu de handler
    expect(screen.queryByTitle(/⌥/)).toBeNull();
  });
});

describe("ce que le ruban NE porte pas", () => {
  const SURFACE = { id: "surface:narval", title: "Narval", kind: "surface" as const, surface: "narval" as const };
  const IDE = { id: "ide", title: "IDE", kind: "ide" as const };
  const AGENT = { id: "agent:th1", title: "Claude — albédo", kind: "agent" as const };

  it("écarte les surfaces : elles ont leur icône à droite de la même barre", () => {
    renderUi(<TopBarTabs {...props({ tabs: [...TABS, SURFACE], activeTab: "document:t1" })} />);
    expect(screen.queryByText("Narval")).toBeNull();
    expect(tab("methods_en.tex")).toBeTruthy();
  });

  it("écarte l'IDE, destination lui aussi", () => {
    renderUi(<TopBarTabs {...props({ tabs: [...TABS, IDE], activeTab: "document:t1" })} />);
    expect(screen.queryByText("IDE")).toBeNull();
  });

  it("garde les fils d'agent, qui n'ont AUCUNE icône ailleurs", () => {
    // les exclure les rendrait introuvables et infermables depuis la barre
    renderUi(<TopBarTabs {...props({ tabs: [AGENT, ...TABS], activeTab: "agent:th1" })} />);
    expect(screen.getByText("Claude — albédo")).toBeTruthy();
  });

  it("disparaît entièrement quand seules des destinations sont ouvertes", () => {
    const { container } = renderUi(<TopBarTabs {...props({
      tabs: [SURFACE, IDE], activeTab: "surface:narval",
    })} />);
    expect(container.querySelector(".topbar-tabs")).toBeNull();
  });

  it("ne compte pas les destinations dans le plafond de huit", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `document:t${i}`, title: `fichier_${i}.tex`,
    }));
    const { container } = renderUi(<TopBarTabs {...props({
      tabs: [SURFACE, ...many, IDE], activeTab: "document:t0",
    })} />);
    // huit documents visibles, aucun menu de débordement : les deux
    // destinations ne volent pas de place
    expect(container.querySelectorAll(".topbar-tab").length).toBe(8);
    expect(container.querySelector(".topbar-tab-more")).toBeNull();
  });
});

describe("lisibilité du nom (redesign liseré, 2026-08-16)", () => {
  it("l'extension sort du tronc, pour survivre à l'ellipse", () => {
    expect(splitLabel("methods_en.tex")).toEqual({stem: "methods_en", ext: ".tex"});
    // pas d'extension, ou point en tête/en fin : rien à détacher
    expect(splitLabel("Makefile")).toEqual({stem: "Makefile", ext: ""});
    expect(splitLabel(".gitignore")).toEqual({stem: ".gitignore", ext: ""});
    expect(splitLabel("brouillon.")).toEqual({stem: "brouillon.", ext: ""});
  });

  it("le dossier parent n'apparaît QUE sur les homonymes", () => {
    const tabs = [
      {id: "a", title: "drafts/methods_en.tex"},
      {id: "b", title: "sections/methods_en.tex"},
      {id: "c", title: "src/partition.py"},
    ];
    const prefixes = folderPrefixes(tabs);
    expect(prefixes.get("a")).toBe("drafts");
    expect(prefixes.get("b")).toBe("sections");
    // nom unique : aucun préfixe, la barre ne se charge pas pour rien
    expect(prefixes.has("c")).toBe(false);
    expect(parentFolder("methods_en.tex")).toBe("");
  });

  it("deux homonymes deviennent distinguables à l'écran", () => {
    renderUi(<TopBarTabs {...props({
      tabs: [
        {id: "document:a", title: "drafts/methods_en.tex"},
        {id: "document:b", title: "sections/methods_en.tex"},
      ],
      activeTab: "document:a",
    })} />);
    expect(tab("drafts/methods_en.tex")).toBeTruthy();
    expect(tab("sections/methods_en.tex")).toBeTruthy();
  });
});
