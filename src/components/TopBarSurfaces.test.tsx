// Surfaces dans la barre du haut (plan 055, compacté 2026-11-01) : bouton
// Galerie toujours visible + un lanceur qui nomme la surface ouverte.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup, act, within } from "@testing-library/react";
import TopBarSurfaces, { buildTargets } from "./TopBarSurfaces";
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
    onToggleAnnots: vi.fn(),
    ...over,
  };
}

/** Le menu se charge en différé : laisser l'import dynamique se poser. */
async function openLauncher() {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t("topbar.surfaces")}`) }));
  await act(async () => { await vi.dynamicImportSettled(); });
  await screen.findByText(t("atelier.calculs"));
}

/** Rangée du menu par son libellé (rangée cochable ou simple). */
const item = (label: string) => within(screen.getByRole("menu")).getByText(label).closest<HTMLElement>("[role^=menuitem]")!;

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

});

describe("TopBarSurfaces", () => {
  it("garde la galerie à un clic, enfoncée quand elle est ouverte", () => {
    const onSelectSurface = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onSelectSurface })} />);
    const gallery = screen.getByRole("button", { name: t("atelier.surface") });
    expect(gallery).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(gallery);
    expect(onSelectSurface).toHaveBeenCalledWith("atelier");
    // plus de rangée d'icônes : les autres surfaces vivent dans le lanceur
    expect(screen.queryByRole("button", { name: t("atelier.connaissances") })).toBeNull();
  });

  it("le lanceur dit « Surfaces » sur la galerie, et le nom de la surface ouverte ailleurs", () => {
    const { unmount } = renderUi(<TopBarSurfaces {...props()} />);
    expect(screen.getByRole("button", { name: t("topbar.surfaces") })).toBeTruthy();
    unmount();
    renderUi(<TopBarSurfaces {...props({ activeSurface: "calculs" })} />);
    expect(screen.getByRole("button", { name: `${t("topbar.surfaces")} : ${t("atelier.calculs")}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("atelier.surface") })).toHaveAttribute("aria-pressed", "false");
  });

  it("nomme l'IDE quand il recouvre la galerie, rien quand l'atelier est masqué", () => {
    const { unmount } = renderUi(<TopBarSurfaces {...props({ ideActive: true })} />);
    expect(screen.getByRole("button", { name: `${t("topbar.surfaces")} : ${t("atelier.ide")}` })).toBeTruthy();
    unmount();
    renderUi(<TopBarSurfaces {...props({ activeSurface: "calculs", showAtelier: false })} />);
    expect(screen.getByRole("button", { name: t("topbar.surfaces") })).toBeTruthy();
  });

  it("le menu liste toutes les autres surfaces et ouvre celle choisie", async () => {
    const onSelectSurface = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onSelectSurface })} />);
    await openLauncher();
    expect(item(t("atelier.biblio"))).toBeTruthy();
    expect(item(t("atelier.noyau"))).toBeTruthy();
    expect(screen.queryByText(t("atelier.surface"))).toBeNull();
    fireEvent.click(item(t("atelier.connaissances")));
    expect(onSelectSurface).toHaveBeenCalledWith("connaissances");
  });

  it("coche la surface ouverte dans le menu", async () => {
    renderUi(<TopBarSurfaces {...props({ activeSurface: "biblio" })} />);
    await openLauncher();
    expect(item(t("atelier.biblio"))).toHaveAttribute("aria-checked", "true");
    expect(item(t("atelier.calculs"))).toHaveAttribute("aria-checked", "false");
  });

  it("l'explorateur reste une bascule, pas une surface", async () => {
    const onToggleExplorer = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onToggleExplorer })} />);
    await openLauncher();
    fireEvent.click(item(t("atelier.file-explorer")));
    expect(onToggleExplorer).toHaveBeenCalled();
  });
});
