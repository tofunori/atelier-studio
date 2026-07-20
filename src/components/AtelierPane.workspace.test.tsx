import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { setLanguage, t } from "../lib/i18n";

const ROOT = "/tmp/atelier-workspace-test";
const ORIGIN = "http://127.0.0.1:19990";

const TABS: AtelierTab[] = [
  {
    id: "main",
    title: "main.tex",
    url: `${ORIGIN}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${ROOT}/main.tex`)}`,
  },
  {
    id: "analysis",
    title: "analysis.py",
    url: `${ORIGIN}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${ROOT}/analysis.py`)}`,
  },
];

function renderWorkspace(overrides: Partial<Parameters<typeof AtelierPane>[0]> = {}) {
  const props: Parameters<typeof AtelierPane>[0] = {
    url: `${ORIGIN}/index.html`,
    projectRoot: ROOT,
    activeThreadId: null,
    ws: null,
    files: ["main.tex", "analysis.py"],
    onOpenFile: vi.fn(),
    onPinTab: vi.fn(),
    onColorTab: vi.fn(),
    onReorderTabs: vi.fn(),
    tabs: TABS,
    activeTab: "main",
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onActiveSurfaceChange: vi.fn(),
    reloadKey: 0,
    showExplorer: false,
    recentFiles: [],
    onOpenExplorer: vi.fn(),
    layout: "split",
    onToggleExpand: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AtelierPane {...props} />) };
}

beforeEach(() => {
  localStorage.clear();
  setLanguage("fr");
});
afterEach(cleanup);

describe("AtelierPane — workspace modulaire", () => {
  it("scinde un onglet de code à droite et garde un document actif dans chaque pane", () => {
    const { container } = renderWorkspace();
    const mainTab = screen.getByRole("tab", { name: "main.tex" });
    const originalMainFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="main"]');

    fireEvent.contextMenu(mainTab);
    fireEvent.click(screen.getByText(t("workspace.split-right")));

    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    expect(container.querySelector(".workspace-split.is-horizontal")).toBeInTheDocument();
    const mainFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="main"]');
    const analysisFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="analysis"]');
    expect(mainFrame?.style.display).toBe("block");
    expect(analysisFrame?.style.display).toBe("block");
    expect(mainFrame).toBe(originalMainFrame);
    expect(mainFrame?.closest(".workspace-content-layer")?.getAttribute("data-owner-pane"))
      .not.toBe(analysisFrame?.closest(".workspace-content-layer")?.getAttribute("data-owner-pane"));
  });

  it("offre les cinq zones pendant un drag et crée un split vertical", () => {
    const { container } = renderWorkspace();
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    fireEvent.dragStart(screen.getByRole("tab", { name: "main.tex" }), { dataTransfer });

    expect(container.querySelectorAll(".workspace-drop-zone")).toHaveLength(5);
    const bottom = container.querySelector<HTMLElement>('[data-drop-zone="bottom"]')!;
    fireEvent.dragEnter(bottom, { dataTransfer });
    expect(bottom).toHaveClass("hot");
    fireEvent.drop(bottom, { dataTransfer });

    expect(container.querySelector(".workspace-split.is-vertical")).toBeInTheDocument();
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    const separator = screen.getByRole("separator", { name: t("workspace.resize-split") });
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(separator, { key: "ArrowDown" });
    expect(separator).toHaveAttribute("aria-valuenow", "55");
  });

  it("dépose Zotero depuis le rail simulé dans un pane distinct", () => {
    const { container } = renderWorkspace();
    act(() => {
      window.dispatchEvent(new CustomEvent("workspace-surface-drag-start", { detail: { surface: "biblio" } }));
    });
    const right = container.querySelector<HTMLElement>('[data-drop-zone="right"]')!;
    const dataTransfer = { effectAllowed: "move", dropEffect: "move", setData: vi.fn() };
    fireEvent.drop(right, { dataTransfer });

    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: t("atelier.biblio") })).toBeInTheDocument();
  });

  it("laisse Terminal propriétaire de son chrome quand il est seul dans son pane", () => {
    const { container } = renderWorkspace();
    act(() => {
      window.dispatchEvent(new CustomEvent("workspace-surface-drag-start", { detail: { surface: "terminal" } }));
    });
    const right = container.querySelector<HTMLElement>('[data-drop-zone="right"]')!;
    const dataTransfer = { effectAllowed: "move", dropEffect: "move", setData: vi.fn() };
    fireEvent.drop(right, { dataTransfer });

    const nativePane = container.querySelector<HTMLElement>('[data-pane-chrome="native"]');
    expect(nativePane).toBeInTheDocument();
    expect(nativePane?.querySelector(".workspace-pane-tabs")).toBeNull();
    expect(container.querySelectorAll('[data-pane-chrome="workspace"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: t("workspace.close-pane") }));
    expect(container.querySelector('[data-pane-chrome="native"]')).toBeNull();
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(1);
    expect(container.querySelector(".workspace-split")).toBeNull();
  });

  it("ferme le dernier onglet d'un pane et collapse la branche vide", () => {
    const { container } = renderWorkspace();
    fireEvent.contextMenu(screen.getByRole("tab", { name: "main.tex" }));
    fireEvent.click(screen.getByText(t("workspace.split-right")));
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: `${t("action.close")} main.tex` }));
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(1);
    expect(container.querySelector(".workspace-split")).toBeNull();
  });
});
