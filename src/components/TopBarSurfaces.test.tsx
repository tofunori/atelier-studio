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
    ...over,
  };
}

/** Le menu se charge en différé : laisser l'import dynamique se poser. */
async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: t("atelier.more") }));
  await act(async () => { await vi.dynamicImportSettled(); });
}

beforeEach(() => {
  resetTestState();
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
    expect(targets.map((target) => target.id)).toContain("narval");
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
    expect(readPinned()).toEqual(DEFAULT_PINNED);
  });
});

describe("TopBarSurfaces", () => {
  it("n'affiche que les surfaces épinglées", () => {
    renderUi(<TopBarSurfaces {...props()} />);
    expect(screen.getByRole("button", { name: t("atelier.git") })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("atelier.connaissances") })).toBeTruthy();
    // Narval n'est pas dans la sélection par défaut
    expect(screen.queryByRole("button", { name: t("atelier.narval") })).toBeNull();
  });

  it("révèle la surface active même non épinglée", () => {
    renderUi(<TopBarSurfaces {...props({ activeSurface: "narval" })} />);
    const narval = screen.getByRole("button", { name: t("atelier.narval") });
    expect(narval.classList.contains("on")).toBe(true);
  });

  it("bascule de surface au clic", () => {
    const onSelectSurface = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onSelectSurface })} />);
    fireEvent.click(screen.getByRole("button", { name: t("atelier.git") }));
    expect(onSelectSurface).toHaveBeenCalledWith("git");
  });

  it("le menu liste tout, avec les libellés", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    expect(screen.getByText(t("atelier.narval"))).toBeTruthy();
    expect(screen.getByText(t("atelier.biblio"))).toBeTruthy();
  });

  it("épingle depuis le menu, et le choix survit au remontage", async () => {
    const { unmount } = renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    const row = screen.getByText(t("atelier.narval")).closest(".topbar-menu-row");
    fireEvent.click(row!.querySelector(".topbar-menu-pin")!);
    expect(readPinned()).toContain("narval");
    expect(readPinned().length).toBeLessThanOrEqual(MAX_PINNED);

    unmount();
    renderUi(<TopBarSurfaces {...props()} />);
    expect(screen.getByRole("button", { name: t("atelier.narval") })).toBeTruthy();
  });

  it("réorganise les épinglées depuis le menu", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    const before = readPinned();
    const row = screen.getByText(t("atelier.connaissances")).closest(".topbar-menu-row");
    // Connaissances est en 3ᵉ position par défaut : une flèche gauche la remonte
    fireEvent.click(row!.querySelectorAll(".topbar-menu-move")[0]);
    const after = readPinned();
    expect(after.indexOf("connaissances")).toBe(before.indexOf("connaissances") - 1);
    expect(after).toHaveLength(before.length);
  });

  it("la première épinglée ne peut pas remonter, la dernière pas descendre", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    const rows = document.querySelectorAll(".topbar-menu-row");
    const firstUp = rows[0].querySelectorAll(".topbar-menu-move")[0];
    expect(firstUp.classList.contains("off")).toBe(true);
    fireEvent.click(firstUp);
    expect(readPinned()).toEqual(DEFAULT_PINNED);
  });

  it("accepte plus de six surfaces dans la barre", async () => {
    renderUi(<TopBarSurfaces {...props()} />);
    await openMenu();
    for (const label of [t("atelier.narval"), t("atelier.biblio"), t("atelier.browser")]) {
      const row = screen.getByText(label).closest(".topbar-menu-row");
      fireEvent.click(row!.querySelector(".topbar-menu-pin")!);
    }
    expect(readPinned().length).toBe(9);
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
