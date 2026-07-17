// Tiroir « Autres surfaces » du rail : IDE + Galerie toujours visibles,
// surfaces secondaires repliées par défaut, surface active rangée toujours
// révélée (même règle que le provider du thread courant dans le picker).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup } from "@testing-library/react";
import Rail from "./Rail";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
import type { Surface } from "./surfaces";
import type { ViewId } from "../lib/settings";

function makeProps(over: Partial<React.ComponentProps<typeof Rail>> = {}) {
  return {
    projects: [] as string[],
    activeProject: null,
    meta: {},
    running: new Set<string>(),
    activeView: "chats" as ViewId,
    compact: true,
    layout: "split" as const,
    activeSurface: "atelier" as Surface,
    onSelectSurface: vi.fn(),
    onSelectGallery: vi.fn(),
    onSelectIde: vi.fn(),
    ideActive: false,
    showExplorer: false,
    onToggleExplorer: vi.fn(),
    onSelectView: vi.fn(),
    onSelectProject: vi.fn(),
    onAddProject: vi.fn(),
    onExpand: vi.fn(),
    onSettings: vi.fn(),
    onSetMeta: vi.fn(),
    onReorder: vi.fn(),
    moreOpen: false,
    onToggleMore: vi.fn(),
    onNewChat: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
});
afterEach(cleanup);

describe("Rail — tiroir de surfaces", () => {
  it("replié : Galerie visible, secondaires dans le pli, chevron non déplié", () => {
    const { container } = renderUi(<Rail {...makeProps()} />);
    const more = screen.getByRole("button", { name: t("atelier.more") });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    const fold = container.querySelector(".rail-fold");
    expect(fold?.classList.contains("open")).toBe(false);
    // les 5 surfaces secondaires + Surlignés vivent dans le pli, la Galerie hors du pli
    expect(fold?.querySelectorAll(".rail-view").length).toBe(6);
    expect(screen.getByRole("button", { name: t("view.highlights") }).closest(".rail-fold")).not.toBeNull();
    expect(screen.getByRole("button", { name: t("atelier.surface") }).closest(".rail-fold")).toBeNull();
  });

  it("replié avec surface active rangée : elle reste révélée hors du pli, sans doublon", () => {
    const { container } = renderUi(<Rail {...makeProps({ activeSurface: "narval" })} />);
    const narval = screen.getAllByRole("button", { name: t("atelier.narval") });
    expect(narval.length).toBe(1);
    expect(narval[0].closest(".rail-fold")).toBeNull();
    expect(narval[0].classList.contains("on")).toBe(true);
    // le pli garde Surlignés + les 4 autres surfaces
    expect(container.querySelector(".rail-fold")?.querySelectorAll(".rail-view").length).toBe(5);
  });

  it("replié avec vue Surlignés active : le crayon reste révélé hors du pli", () => {
    const { container } = renderUi(<Rail {...makeProps({ activeView: "highlights" })} />);
    const hl = screen.getAllByRole("button", { name: t("view.highlights") });
    expect(hl.length).toBe(1);
    expect(hl[0].closest(".rail-fold")).toBeNull();
    expect(hl[0].classList.contains("on")).toBe(true);
    expect(container.querySelector(".rail-fold")?.querySelectorAll(".rail-view").length).toBe(5);
  });

  it("compact : bouton Nouveau chat présent et câblé ; absent quand le panneau est déplié", () => {
    const props = makeProps({ compact: true });
    renderUi(<Rail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: t("action.new-chat") }));
    expect(props.onNewChat).toHaveBeenCalledTimes(1);
    cleanup();
    renderUi(<Rail {...makeProps({ compact: false })} />);
    expect(screen.queryByRole("button", { name: t("action.new-chat") })).toBeNull();
  });

  it("déplié : le pli s'ouvre, chaque secondaire une seule fois, clic → onSelectSurface", () => {
    const props = makeProps({ moreOpen: true, activeSurface: "narval" });
    const { container } = renderUi(<Rail {...props} />);
    expect(screen.getByRole("button", { name: t("atelier.more") }).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".rail-fold")?.classList.contains("open")).toBe(true);
    expect(screen.getAllByRole("button", { name: t("atelier.narval") }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: t("view.highlights") }).length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: t("atelier.terminal") }));
    expect(props.onSelectSurface).toHaveBeenCalledWith("terminal");
  });

  it("le chevron bascule via onToggleMore", () => {
    const props = makeProps();
    renderUi(<Rail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: t("atelier.more") }));
    expect(props.onToggleMore).toHaveBeenCalledTimes(1);
  });
});
