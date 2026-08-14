// Intégration AtelierPane ↔ en-têtes locaux et inspecteur (plan 018) :
// GalleryHeader/DocumentHeader dans la barre de surface, entrée « Inspecter
// le fichier » du menu d'onglet (sélectionne l'onglet puis ouvre), parsing
// relFromTabUrl sur les URLs réelles d'openFileTab (nonce en hash), et
// exclusion des onglets hors du serveur galerie du projet.
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import AtelierPane, { relFromTabUrl } from "./AtelierPane";
import { setLanguage } from "../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

const ORIGIN = "http://127.0.0.1:18800";
const ROOT = "/Users/tofunori/thesis";

function pane(overrides: Partial<Parameters<typeof AtelierPane>[0]> = {}) {
  const props = {
    url: `${ORIGIN}/index.html#atelier_nonce=abc`,
    projectRoot: ROOT,
    activeThreadId: null,
    ws: null,
    files: [],
    onOpenFile: vi.fn(),
    onPinTab: vi.fn(),
    onColorTab: vi.fn(),
    onReorderTabs: vi.fn(),
    tabs: [] as { id: string; url: string; title: string }[],
    activeTab: "gallery",
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    reloadKey: 0,
    showExplorer: false,
    recentFiles: [],
    onOpenExplorer: vi.fn(),
    layout: "split" as const,
    onToggleExpand: vi.fn(),
    projectName: null,
    onGalleryReload: vi.fn(),
    onInspectFile: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AtelierPane {...props} />) };
}

const PDF_TAB = {
  id: "t1",
  url: `${ORIGIN}/.fig_thumbs/pdf_viewer.html?file=figs%2Falbedo.pdf#atelier_nonce=abc`,
  title: "albedo.pdf",
};

describe("relFromTabUrl", () => {
  it("retrouve le chemin projet pour chaque forme d'URL d'openFileTab", () => {
    expect(relFromTabUrl(PDF_TAB.url, ROOT)).toBe("figs/albedo.pdf");
    expect(relFromTabUrl(`${ORIGIN}/.fig_thumbs/md_studio.html?path=${encodeURIComponent(`${ROOT}/notes/ch3.md`)}#atelier_nonce=x`, ROOT)).toBe("notes/ch3.md");
    expect(relFromTabUrl(`${ORIGIN}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${ROOT}/ch/intro.tex`)}&line=L4-9`, ROOT)).toBe("ch/intro.tex");
    expect(relFromTabUrl(`${ORIGIN}/figs/carte%20glacier.png#atelier_nonce=x`, ROOT)).toBe("figs/carte glacier.png");
    expect(relFromTabUrl(`${ORIGIN}/.fig_thumbs/figures_index.html`, ROOT)).toBeNull();
    expect(relFromTabUrl("pas-une-url", ROOT)).toBeNull();
  });

  it("refuse les onglets hors du serveur galerie du projet (origine externe)", () => {
    expect(relFromTabUrl("https://example.com/rapport.html", ROOT, `${ORIGIN}/index.html`)).toBeNull();
    expect(relFromTabUrl(PDF_TAB.url, ROOT, `${ORIGIN}/index.html`)).toBe("figs/albedo.pdf");
  });
});

describe("AtelierPane — chrome du pane (plan 057)", () => {
  it("n'a plus de bande d'onglets : le rail les porte", () => {
    const { container } = pane({ tabs: [PDF_TAB], activeTab: "gallery" });
    expect(container.querySelector(".workspace-pane-tabs")).toBeNull();
    expect(container.querySelectorAll(".atelier-bar")).toHaveLength(0);
    // la galerie reste rendue, elle ne dépendait pas de la bande
    const galleryFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    expect(galleryFrame?.src).toContain("embedded=atelier");
  });

  it("publie ses onglets pour le rail, avec l'onglet actif", async () => {
    const events: { tabs: { id: string; title: string }[]; activeId: string | null }[] = [];
    const onTabs = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("workspace-tabs", onTabs);
    pane({ tabs: [PDF_TAB], activeTab: "t1" });
    window.removeEventListener("workspace-tabs", onTabs);
    const last = events[events.length - 1];
    expect(last?.tabs.some((tab: { title: string }) => tab.title === "albedo.pdf")).toBe(true);
    expect(last?.activeId).toBe("document:t1");
  });

  it("sélectionne et ferme un onglet demandé par le rail", async () => {
    const { props } = pane({ tabs: [PDF_TAB], activeTab: "gallery" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("workspace-select-tab", { detail: { id: "document:t1" } }));
    });
    expect(props.onSelectTab).toHaveBeenCalledWith("t1");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("workspace-close-tab", { detail: { id: "document:t1" } }));
    });
    expect(props.onCloseTab).toHaveBeenCalledWith("t1");
  });

  it("le rechargement de la galerie vit dans les contrôles du pane", () => {
    const { props } = pane({ tabs: [PDF_TAB], activeTab: "gallery" });
    fireEvent.click(screen.getByRole("button", { name: "Recharger (relance le serveur si mort)" }));
    expect(props.onGalleryReload).toHaveBeenCalledTimes(1);
  });

  it("document actif : pas de rechargement galerie, mais le menu du pane", () => {
    const { container } = pane({ tabs: [PDF_TAB], activeTab: "t1" });
    expect(screen.queryByRole("button", { name: "Recharger (relance le serveur si mort)" })).toBeNull();
    expect(container.querySelector(".workspace-pane-controls")).toBeInTheDocument();
  });
});

describe("AtelierPane — menu du pane (actions rescapées de la bande)", () => {
  async function openPaneMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Actions du pane" }));
    await act(async () => { await vi.dynamicImportSettled?.(); });
  }

  it("épingle, colore et inspecte le document actif", async () => {
    const { props } = pane({ tabs: [PDF_TAB], activeTab: "t1" });
    await openPaneMenu();
    fireEvent.click(screen.getByText("Épingler l'onglet"));
    expect(props.onPinTab).toHaveBeenCalledWith("t1");

    await openPaneMenu();
    fireEvent.click(screen.getByText("Inspecter le fichier"));
    expect(props.onInspectFile).toHaveBeenCalledWith("figs/albedo.pdf");

    await openPaneMenu();
    fireEvent.click(document.querySelectorAll(".workspace-pane-swatch")[0]);
    expect(props.onColorTab).toHaveBeenCalledWith("t1", expect.any(String));
  });

  it("onglet sans fichier projet : pas d'entrée Inspecter", async () => {
    pane({
      tabs: [{ id: "x", url: "https://example.com/doc.html", title: "externe" }],
      activeTab: "x",
    });
    await openPaneMenu();
    expect(screen.queryByText("Inspecter le fichier")).toBeNull();
  });
});
