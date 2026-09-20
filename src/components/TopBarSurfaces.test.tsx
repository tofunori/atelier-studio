// Surfaces dans la barre du haut (plan 055) : épinglage, révélation de la
// surface active non épinglée, menu complet.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup, act } from "@testing-library/react";
import TopBarSurfaces, { DEFAULT_PINNED, MAX_PINNED, buildTargets, readPinned } from "./TopBarSurfaces";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";

function props(over: Partial<React.ComponentProps<typeof TopBarSurfaces>> = {}) {
  return {
    activeSurface: "atelier" as const,
    showAtelier: true,
    ideActive: false,
    showExplorer: false,
    onSelectSurface: vi.fn(),
    onSelectIde: vi.fn(),
    onToggleExplorer: vi.fn(),
    showAnnots: false,
    onToggleAnnots: vi.fn(),
    ...over,
  };
}

/** Le menu se charge en différé : laisser l'import dynamique se poser. */
async function openMenu() {
  fireEvent.contextMenu(screen.getByRole("toolbar", { name: t("topbar.surfaces") }));
  fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.back-surfaces")}));
  await act(async () => { await vi.dynamicImportSettled(); });
}

async function openSurfaceActions(label: string) {
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
  await act(async () => { await vi.dynamicImportSettled(); });
}

beforeEach(() => {
  resetTestState();
  // Les épingles vivent dans localStorage : sans ce nettoyage, un cas qui en
  // ajoute une fixe le compte de tous les suivants (couplage à l'ordre des
  // tests, révélé par la sélection courte du lot 068).
  localStorage.clear();
  setLanguage("fr");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("cibles", () => {
  it("réunit l'explorateur, l'IDE et toutes les surfaces", () => {
    const targets = buildTargets(props());
    expect(targets[0].id).toBe("explorer");
    expect(targets[1].id).toBe("ide");
    expect(targets.map((target) => target.id)).toContain("calculs");
    expect(targets.map((target) => target.id)).toContain("connaissances");
  });

  it("la galerie n'est pas active quand l'IDE la recouvre", () => {
    expect(buildTargets(props()).find((x) => x.id === "atelier")?.active).toBe(true);
    expect(buildTargets(props({ ideActive: true })).find((x) => x.id === "atelier")?.active).toBe(false);
    expect(buildTargets(props({ showAtelier: false })).find((x) => x.id === "atelier")?.active).toBe(false);
  });

  it("retombe sur la sélection par défaut quand le stockage est vide ou cassé", () => {
    expect(readPinned()).toEqual(DEFAULT_PINNED);
    localStorage.setItem("atelier-studio.topbar-surfaces", "pas du json");
    expect(readPinned()).toEqual(DEFAULT_PINNED);
    localStorage.setItem("atelier-studio.topbar-surfaces", "[]");
    expect(readPinned()).toEqual([]);
  });
});

describe("TopBarSurfaces", () => {
  it("n'affiche que les surfaces épinglées", () => {
    renderUi(<TopBarSurfaces {...props()} />);
    expect(screen.getByRole("button", { name: t("atelier.connaissances") })).toBeTruthy();
    // sélection par défaut COURTE depuis le lot 068 : la largeur de la barre
    // appartient aux onglets du pane, les autres surfaces vivent au menu
    expect(screen.queryByRole("button", { name: t("atelier.git") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.calculs") })).toBeNull();
  });

  it("respecte le choix même quand une surface non épinglée est active", () => {
    renderUi(<TopBarSurfaces {...props({ activeSurface: "calculs" })} />);
    expect(screen.queryByRole("button", { name: t("atelier.calculs") })).toBeNull();
  });

  it("bascule de surface au clic", () => {
    const onSelectSurface = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onSelectSurface })} />);
    fireEvent.click(screen.getByRole("button", { name: t("atelier.connaissances") }));
    expect(onSelectSurface).toHaveBeenCalledWith("connaissances");
  });

  it("le menu liste tout, avec les libellés", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    expect(screen.getByText(t("atelier.calculs"))).toBeTruthy();
    expect(screen.getByText(t("atelier.biblio"))).toBeTruthy();
  });

  it("ouvre directement une surface sans sous-menu répétant son nom", async () => {
    const onSelectSurface=vi.fn();
    renderUi(<TopBarSurfaces {...props({onSelectSurface})} />);
    await openMenu();
    const surface=screen.getByRole("menuitem",{name:t("atelier.connaissances")});
    expect(surface).not.toHaveAttribute("aria-haspopup");
    fireEvent.click(surface);
    expect(onSelectSurface).toHaveBeenCalledWith("connaissances");
  });

  it("épingle depuis le menu, et le choix survit au remontage", async () => {
    const { unmount } = renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.customize")}));
    fireEvent.click(screen.getByRole("menuitemcheckbox", {name:t("atelier.calculs")}));
    expect(readPinned()).toContain("calculs");
    expect(readPinned().length).toBeLessThanOrEqual(MAX_PINNED);

    unmount();
    renderUi(<TopBarSurfaces {...props()} />);
    expect(screen.getByRole("button", { name: t("atelier.calculs") })).toBeTruthy();
  });

  it("réorganise les épinglées depuis le menu", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    const before = readPinned();
    // Connaissances est en 3ᵉ position par défaut : une flèche gauche la remonte
    fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.customize")}));
    await openSurfaceActions(t("topbar.reorder"));
    fireEvent.click(screen.getByRole("menuitem", { name: `${t("atelier.connaissances")} — ${t("topbar.move-up")}` }));
    const after = readPinned();
    expect(after.indexOf("connaissances")).toBe(before.indexOf("connaissances") - 1);
    expect(after).toHaveLength(before.length);
  });

  it("la première épinglée ne peut pas remonter, la dernière pas descendre", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.customize")}));
    await openSurfaceActions(t("topbar.reorder"));
    const firstUp = screen.getByRole("menuitem", { name: `${t("atelier.file-explorer")} — ${t("topbar.move-up")}` });
    expect(firstUp).toHaveAttribute("data-disabled");
    fireEvent.click(firstUp);
    expect(readPinned()).toEqual(DEFAULT_PINNED);
  });

  it("accepte d'épingler au-delà de la sélection courte", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem",{name:t("topbar.customize")}));
    for (const label of [t("atelier.calculs"), t("atelier.biblio"), t("atelier.browser")]) {
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: label }));
    }
    expect(readPinned().length).toBe(DEFAULT_PINNED.length + 3);
    expect(readPinned().length).toBeLessThanOrEqual(MAX_PINNED);
  });

  it("l'explorateur est une bascule, pas une surface", () => {
    const onToggleExplorer = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onToggleExplorer, showExplorer: true })} />);
    const explorer = screen.getByRole("button", { name: t("atelier.file-explorer") });
    expect(explorer.classList.contains("on")).toBe(true);
    fireEvent.click(explorer);
    expect(onToggleExplorer).toHaveBeenCalled();
  });
});

const TRIM_KEY = "atelier-studio.topbar-surfaces.trim-v1";
const ANNOTS_KEY = "atelier-studio.topbar-surfaces.annots-v1";

describe("migration preuves-v1 (fix 2026-08-16)", () => {
  // la coupe du lot 068 et la migration annots-v1 sont neutralisées ici : ces
  // cas testent l'insertion de Preuves, pas la longueur de la barre
  const sansCoupe = () => {
    localStorage.clear();
    localStorage.setItem(TRIM_KEY, "1");
    localStorage.setItem(ANNOTS_KEY, "1");
  };

  it("liste persistée d'avant la surface Preuves : insérée une fois après Connaissances", () => {
    sansCoupe();
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "connaissances", "git"]));
    expect(readPinned()).toEqual(["explorer", "connaissances", "preuves", "git"]);
    // idempotent : relire ne duplique pas
    expect(readPinned().filter((id) => id === "preuves")).toHaveLength(1);
  });
  it("l'utilisateur qui retire Preuves après migration est respecté", () => {
    sansCoupe();
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "git"]));
    readPinned(); // migre + pose le flag
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "git"]));
    expect(readPinned()).toEqual(["explorer", "git"]);
  });
  it("liste au plafond : pas d'insertion forcée, flag posé quand même", () => {
    sansCoupe();
    const full = Array.from({ length: MAX_PINNED }, (_, i) => (i === 0 ? "connaissances" : `s${i}`));
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(full));
    expect(readPinned()).toHaveLength(MAX_PINNED);
    expect(readPinned()).not.toContain("preuves");
  });
});

describe("migration trim-v1 (lot 068)", () => {
  it("coupe UNE fois la longue liste d'avant, en gardant l'ordre de l'utilisateur", () => {
    localStorage.clear();
    localStorage.setItem("atelier-studio.topbar-surfaces",
      JSON.stringify(["terminal", "git", "atelier", "preuves", "connaissances", "ide", "explorer"]));
    // la coupe garde les DEFAULT_PINNED.length premières (4 depuis le panneau
    // Annotations) dans l'ordre de l'utilisateur
    expect(readPinned()).toEqual(["terminal", "git", "atelier", "preuves"]);
    // la coupe est persistée, pas seulement affichée
    expect(JSON.parse(localStorage.getItem("atelier-studio.topbar-surfaces")!))
      .toEqual(["terminal", "git", "atelier", "preuves"]);
  });

  it("ne recoupe jamais ce que l'utilisateur ré-épingle ensuite", () => {
    localStorage.clear();
    localStorage.setItem("atelier-studio.topbar-surfaces",
      JSON.stringify(["explorer", "ide", "connaissances", "git", "terminal"]));
    expect(readPinned()).toHaveLength(DEFAULT_PINNED.length);
    // il en ré-épingle deux : elles survivent au remontage suivant
    localStorage.setItem("atelier-studio.topbar-surfaces",
      JSON.stringify(["explorer", "ide", "connaissances", "git", "terminal"]));
    expect(readPinned()).toHaveLength(5);
  });

  it("une installation neuve naît courte et n'est jamais tronquée après coup", () => {
    localStorage.clear();
    expect(readPinned()).toEqual(DEFAULT_PINNED);
    // l'utilisateur épingle une quatrième surface : elle DOIT survivre
    localStorage.setItem("atelier-studio.topbar-surfaces",
      JSON.stringify([...DEFAULT_PINNED, "calculs"]));
    expect(readPinned()).toEqual([...DEFAULT_PINNED, "calculs"]);
  });

  it("une installation neuve ne se voit PAS greffer Preuves", () => {
    // Régression du lot 068 : Preuves ayant quitté le défaut, sa migration
    // (preuves-v1) retrouvait de quoi mordre et s'ajoutait toute seule à la
    // première liste écrite par un utilisateur qui n'a rien demandé.
    localStorage.clear();
    readPinned();
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "ide"]));
    expect(readPinned()).toEqual(["explorer", "ide"]);
  });
});

describe("migration annots-v1 (panneau Annotations)", () => {
  // même neutralisation que pour preuves-v1 : on teste l'insertion, pas la coupe
  const sansCoupe = () => {
    localStorage.clear();
    localStorage.setItem(TRIM_KEY, "1");
    localStorage.setItem("atelier-studio.topbar-surfaces.preuves-v1", "1");
  };

  it("liste persistée d'avant le panneau : Annotations insérée une fois après Connaissances", () => {
    sansCoupe();
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "connaissances", "git"]));
    expect(readPinned()).toEqual(["explorer", "connaissances", "annots", "git"]);
    // idempotent : relire ne duplique pas
    expect(readPinned().filter((id) => id === "annots")).toHaveLength(1);
  });

  it("l'utilisateur qui retire Annotations après migration est respecté", () => {
    sansCoupe();
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "git"]));
    readPinned(); // migre + pose le flag
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["explorer", "git"]));
    expect(readPinned()).toEqual(["explorer", "git"]);
  });
});

it("personnalise plusieurs surfaces sans fermer le menu et mémorise une barre vide", async () => {
  const { unmount } = renderUi(<TopBarSurfaces {...props()} />);
  await openMenu();
  fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.customize")}));
  for (const target of buildTargets(props())) {
    const item = screen.getByRole("menuitemcheckbox", {name:target.label});
    if (item.getAttribute("aria-checked") === "true") fireEvent.click(item);
  }
  expect(readPinned()).toEqual([]);
  expect(screen.getByRole("menuitemcheckbox", {name:t("atelier.calculs")})).toBeVisible();
  unmount();
  renderUi(<TopBarSurfaces {...props()} />);
  expect(screen.queryByRole("button", {name:t("atelier.connaissances")})).toBeNull();
  await openMenu();
  fireEvent.click(screen.getByRole("menuitem", {name:t("topbar.customize")}));
  fireEvent.click(screen.getByRole("menuitemcheckbox", {name:t("atelier.calculs")}));
  fireEvent.click(screen.getByRole("menuitemcheckbox", {name:t("atelier.git")}));
  expect(readPinned()).toEqual(["calculs", "git"]);
});
