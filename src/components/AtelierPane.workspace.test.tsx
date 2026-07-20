import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { setLanguage, t } from "../lib/i18n";
import { WORKSPACE_POINTER_DRAG_START } from "../lib/workspaceDrag";

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

function mockWorkspaceGeometry(container: HTMLElement) {
  const makeRect = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect);
  const root = container.querySelector<HTMLElement>(".workspace-root")!;
  const pane = container.querySelector<HTMLElement>("[data-pane-id]")!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 1000, 800));
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 1000, 800));
}

function startSurfacePointerDrag(surface: "biblio" | "terminal", pointerId: number) {
  window.dispatchEvent(new CustomEvent(WORKSPACE_POINTER_DRAG_START, {
    detail: { ref: { kind: "surface", surface }, clientX: 500, clientY: 400, pointerId },
  }));
}

beforeEach(() => {
  localStorage.clear();
  setLanguage("fr");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AtelierPane — workspace modulaire", () => {
  it("donne le chrome au Knowledge Base actif même s'il partage le pane avec Galerie", async () => {
    const { container } = renderWorkspace();
    act(() => {
      window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface: "connaissances" } }));
    });

    const pane = container.querySelector<HTMLElement>("[data-pane-id]")!;
    expect(pane).toHaveAttribute("data-pane-chrome", "native");
    expect(pane.querySelector(".workspace-pane-tabs")).toBeNull();
    await waitFor(() => expect(container.querySelector(".kb-head .workspace-pane-controls-slot")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByText(t("atelier.gallery")));
    expect(pane).toHaveAttribute("data-pane-chrome", "workspace");
    expect(pane.querySelector(".workspace-pane-tabs")).toBeInTheDocument();
  });

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

  it("affiche un aperçu magnétique unique pendant le drag et crée un split vertical", async () => {
    const { container } = renderWorkspace();
    mockWorkspaceGeometry(container);
    fireEvent.pointerDown(screen.getByRole("tab", { name: "main.tex" }), {
      button: 0, pointerId: 11, clientX: 500, clientY: 400,
    });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 500, clientY: 770 });
    await waitFor(() => expect(container.querySelector('[data-drop-zone="bottom"]')).toBeInTheDocument());
    expect(container.querySelectorAll(".workspace-drop-preview")).toHaveLength(1);
    expect(container.querySelector(".workspace-drop-zone")).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 500, clientY: 770 });

    expect(container.querySelector(".workspace-split.is-vertical")).toBeInTheDocument();
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    const separator = screen.getByRole("separator", { name: t("workspace.resize-split") });
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(separator, { key: "ArrowDown" });
    expect(separator).toHaveAttribute("aria-valuenow", "55");
  });

  it("dépose Zotero depuis le rail simulé dans un pane distinct sans barre externe", async () => {
    const { container } = renderWorkspace();
    mockWorkspaceGeometry(container);
    act(() => {
      startSurfacePointerDrag("biblio", 12);
    });
    fireEvent.pointerMove(window, { pointerId: 12, clientX: 970, clientY: 400 });
    await waitFor(() => expect(container.querySelector('[data-drop-zone="right"]')).toBeInTheDocument());
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 970, clientY: 400 });

    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    const nativePane = container.querySelector<HTMLElement>('[data-pane-chrome="native"]');
    expect(nativePane).toBeInTheDocument();
    expect(nativePane?.querySelector(".workspace-pane-tabs")).toBeNull();
    await waitFor(() => expect(container.querySelector(".biblio-surface .workspace-pane-controls-slot")).toBeInTheDocument());
  });

  it("laisse Terminal propriétaire de son chrome et y intègre les commandes du pane", async () => {
    const { container } = renderWorkspace();
    mockWorkspaceGeometry(container);
    act(() => {
      startSurfacePointerDrag("terminal", 13);
    });
    fireEvent.pointerMove(window, { pointerId: 13, clientX: 970, clientY: 400 });
    await waitFor(() => expect(container.querySelector('[data-drop-zone="right"]')).toBeInTheDocument());
    fireEvent.pointerUp(window, { pointerId: 13, clientX: 970, clientY: 400 });

    const nativePane = container.querySelector<HTMLElement>('[data-pane-chrome="native"]');
    expect(nativePane).toBeInTheDocument();
    expect(nativePane?.querySelector(".workspace-pane-tabs")).toBeNull();
    expect(container.querySelectorAll('[data-pane-chrome="workspace"]')).toHaveLength(1);
    await waitFor(() => expect(container.querySelector(".term-bar .workspace-pane-controls-slot")).toBeInTheDocument());

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
