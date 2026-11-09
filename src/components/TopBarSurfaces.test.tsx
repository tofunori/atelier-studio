// Surfaces dans la barre du haut (plan 055 ; onglets posés 2026-11-09) :
// onglet Galerie épinglé, surface ouverte en onglet, ⌄ des surfaces au bord.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup, act, within } from "@testing-library/react";
import TopBarSurfaces, { SurfacesMenu, buildTargets } from "./TopBarSurfaces";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
import { WORKSPACE_PANE_MENU } from "../lib/workspacePaneMenu";

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
  fireEvent.click(screen.getByRole("button", { name: t("topbar.surfaces") }));
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

const GALLERY = () => t("atelier.gallery-title");

describe("TopBarSurfaces", () => {
  it("garde la Galerie en onglet épinglé, enfoncée quand elle est ouverte", () => {
    const onSelectSurface = vi.fn();
    renderUi(<TopBarSurfaces {...props({ onSelectSurface })} />);
    const gallery = screen.getByRole("button", { name: GALLERY() });
    expect(gallery).toHaveAttribute("aria-pressed", "true");
    expect(gallery.closest(".document-tab-shell")).toHaveAttribute("data-active", "true");
    fireEvent.click(gallery);
    expect(onSelectSurface).toHaveBeenCalledWith("atelier");
    // sur la Galerie, aucun autre onglet de surface
    expect(screen.queryByRole("button", { name: t("atelier.connaissances") })).toBeNull();
  });

  it("la surface ouverte hors Galerie devient un onglet nommé", () => {
    renderUi(<TopBarSurfaces {...props({ activeSurface: "calculs" })} />);
    expect(screen.getByRole("button", { name: t("atelier.calculs") })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: GALLERY() })).toHaveAttribute("aria-pressed", "false");
  });

  it("l'IDE ne se nomme que sans document actif, et rien quand l'atelier est masqué", () => {
    const { unmount } = renderUi(<TopBarSurfaces {...props({ ideActive: true })} />);
    expect(screen.getByRole("button", { name: "IDE" })).toBeTruthy();
    unmount();
    const again = renderUi(<TopBarSurfaces {...props({ ideActive: true })} documentActive />);
    expect(screen.queryByRole("button", { name: "IDE" })).toBeNull();
    again.unmount();
    renderUi(<TopBarSurfaces {...props({ activeSurface: "calculs", showAtelier: false })} />);
    expect(screen.queryByRole("button", { name: t("atelier.calculs") })).toBeNull();
  });
});

describe("SurfacesMenu", () => {
  it("liste toutes les autres surfaces et ouvre celle choisie", async () => {
    const onSelectSurface = vi.fn();
    renderUi(<SurfacesMenu {...props({ onSelectSurface })} />);
    await openLauncher();
    expect(item(t("atelier.biblio"))).toBeTruthy();
    expect(item(t("atelier.noyau"))).toBeTruthy();
    expect(screen.queryByText(t("atelier.surface"))).toBeNull();
    fireEvent.click(item(t("atelier.connaissances")));
    expect(onSelectSurface).toHaveBeenCalledWith("connaissances");
  });

  it("coche la surface ouverte", async () => {
    renderUi(<SurfacesMenu {...props({ activeSurface: "biblio" })} />);
    await openLauncher();
    expect(item(t("atelier.biblio"))).toHaveAttribute("aria-checked", "true");
    expect(item(t("atelier.calculs"))).toHaveAttribute("aria-checked", "false");
  });

  it("l'explorateur reste une bascule, pas une surface", async () => {
    const onToggleExplorer = vi.fn();
    renderUi(<SurfacesMenu {...props({ onToggleExplorer })} />);
    await openLauncher();
    fireEvent.click(item(t("atelier.file-explorer")));
    expect(onToggleExplorer).toHaveBeenCalled();
  });
});

describe("TopBarSurfaces — clic droit = actions du pane", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); });
  afterEach(cleanup);

  const capture = () => {
    const requests: unknown[] = [];
    const listen = (event: Event) => requests.push((event as CustomEvent).detail);
    window.addEventListener(WORKSPACE_PANE_MENU, listen);
    return { requests, stop: () => window.removeEventListener(WORKSPACE_PANE_MENU, listen) };
  };

  it("sur la Galerie affichée, demande le menu de la galerie", () => {
    const { requests, stop } = capture();
    renderUi(<TopBarSurfaces {...props()} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: GALLERY() }), { clientX: 10, clientY: 20 });
    stop();
    expect(requests).toEqual([{ surface: "atelier", x: 10, y: 20 }]);
  });

  it("sur l'onglet de surface, demande son menu — pas celui du navigateur", () => {
    const { requests, stop } = capture();
    const { unmount } = renderUi(<TopBarSurfaces {...props({ activeSurface: "terminal" })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: t("atelier.terminal") }), { clientX: 5, clientY: 6 });
    unmount();
    renderUi(<TopBarSurfaces {...props({ activeSurface: "browser" })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: t("atelier.browser") }), { clientX: 5, clientY: 6 });
    stop();
    expect(requests).toEqual([{ surface: "terminal", x: 5, y: 6 }]);
  });
});
