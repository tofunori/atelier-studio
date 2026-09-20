import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
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
  return { props, ...render(<><WorkspacePaneMenuSlot /><AtelierPane {...props} /></>) };
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
    await waitFor(() => expect(container.querySelector(".workspace-pane-menu-slot button")).toBeInTheDocument());
    expect(container.querySelector(".kb-head .workspace-pane-controls-slot")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    // Les onglets du pane vivent dans un sous-menu : le menu ne déplie plus
    // toutes les listes (2026-09-10).
    fireEvent.click(screen.getByText(t("workspace.pane-tabs")));
    fireEvent.click(await screen.findByText(t("atelier.gallery")));
    expect(pane).toHaveAttribute("data-pane-chrome", "workspace");
    // Aucun contrôle ne recouvre la galerie.
    expect(pane.querySelector(".workspace-pane-controls")).toBeNull();
    expect(container.querySelectorAll(".workspace-pane-menu-slot button")).toHaveLength(1);
  });

  it("scinde un onglet de code à droite et garde un document actif dans chaque pane", () => {
    const { container } = renderWorkspace();
    const originalMainFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="main"]');

    // plan 057 : le split vit dans le menu du pane, la bande a disparu
    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByText(t("workspace.split-right")));

    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);
    expect(container.querySelector(".workspace-split.is-horizontal")).toBeInTheDocument();
    const mainFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="main"]');
    const analysisFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="analysis"]');
    expect(mainFrame?.style.display).toBe("block");
    expect(analysisFrame?.style.display).toBe("block");
    expect(mainFrame).toBe(originalMainFrame);
    expect(mainFrame).toHaveAttribute("aria-label", "main.tex");
    expect(mainFrame).toHaveAttribute("title", "");
    expect(analysisFrame).toHaveAttribute("title", "");
    expect(mainFrame?.closest(".workspace-content-layer")?.getAttribute("data-owner-pane"))
      .not.toBe(analysisFrame?.closest(".workspace-content-layer")?.getAttribute("data-owner-pane"));
  });

  it("affiche un aperçu magnétique unique pendant le drag et crée un split vertical", async () => {
    const { container } = renderWorkspace();
    mockWorkspaceGeometry(container);
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKSPACE_POINTER_DRAG_START, {
        detail: {
          ref: { kind: "document", tabId: "main" },
          clientX: 500, clientY: 400, pointerId: 11,
        },
      }));
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
    await waitFor(() => expect(container.querySelector(".workspace-pane-menu-slot button")).toBeInTheDocument());
    expect(container.querySelector(".biblio-surface .workspace-pane-controls-slot")).toBeNull();
  });

  it("laisse Terminal propriétaire de son chrome sans superposer les commandes du panneau", async () => {
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
    expect(container.querySelectorAll('[data-pane-chrome="workspace"]')).toHaveLength(1);
    await waitFor(() => expect(container.querySelector(".workspace-pane-menu-slot button")).toBeInTheDocument());
    expect(container.querySelector(".term-bar .workspace-pane-controls-slot")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("workspace.close-pane") }));
    expect(container.querySelector('[data-pane-chrome="native"]')).toBeNull();
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(1);
    expect(container.querySelector(".workspace-split")).toBeNull();
  });

  it("ferme le dernier onglet d'un pane et collapse la branche vide", () => {
    const { container } = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByText(t("workspace.split-right")));
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(2);

    // Le menu suit le panneau focalisé par le split.
    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("workspace.close-pane") }));
    expect(container.querySelectorAll(".workspace-pane")).toHaveLength(1);
    expect(container.querySelector(".workspace-split")).toBeNull();
  });

  it("le menu suit le document focalisé dans une iframe après un split", () => {
    const { container, props } = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("workspace.split-right") }));
    const focusedId = container.querySelector<HTMLElement>(".workspace-pane.is-focused")!.dataset.paneId;
    const frame = [...container.querySelectorAll<HTMLIFrameElement>("iframe[data-atelier-tab]")]
      .find((candidate) => candidate.closest<HTMLElement>("[data-owner-pane]")?.dataset.ownerPane !== focusedId)!;
    const owner = frame.closest<HTMLElement>("[data-owner-pane]")!.dataset.ownerPane;
    const sendFocus = (origin: string) => act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "atelier-pane-focus" }, source: frame.contentWindow, origin,
      }));
    });
    sendFocus("https://unrelated.example");
    expect(container.querySelector<HTMLElement>(".workspace-pane.is-focused")!.dataset.paneId).toBe(focusedId);
    sendFocus(ORIGIN);
    expect(container.querySelector<HTMLElement>(".workspace-pane.is-focused")!.dataset.paneId).toBe(owner);
    fireEvent.click(screen.getByRole("button", { name: t("workspace.pane-actions") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("workspace.close-pane") }));
    expect(props.onCloseTab).toHaveBeenCalledWith(frame.dataset.atelierTab);
  });
});
