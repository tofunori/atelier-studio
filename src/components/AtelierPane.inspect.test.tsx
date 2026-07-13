// Intégration AtelierPane ↔ en-têtes locaux et inspecteur (plan 018) :
// GalleryHeader/DocumentHeader dans la barre de surface, entrée « Inspecter
// le fichier » du menu d'onglet (sélectionne l'onglet puis ouvre), parsing
// relFromTabUrl sur les URLs réelles d'openFileTab (nonce en hash), et
// exclusion des onglets hors du serveur galerie du projet.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

describe("AtelierPane — en-têtes locaux", () => {
  it("galerie active : Home compact, onglets ouverts et refresh dans un header unique", () => {
    const { props, container } = pane({ tabs: [PDF_TAB], activeTab: "gallery" });
    expect(container.querySelectorAll(".atelier-bar")).toHaveLength(1);
    const home = screen.getByRole("tab", { name: "galerie" });
    expect(home.querySelector("svg")).toBeInTheDocument();
    expect(home.querySelector(".ui-tab-label")).toBeNull();
    const galleryFrame = container.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    expect(galleryFrame?.src).toContain("embedded=atelier");
    expect(galleryFrame?.title).toBe("atelier");
    expect(galleryFrame?.dataset.atelierReady).toBe("false");
    expect(container.querySelector('.atelier-bar .ui-tab[title="albedo.pdf"]')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.atelier-bar .ui-tab[title="albedo.pdf"]')!);
    expect(props.onSelectTab).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: "Recharger (relance le serveur si mort)" }));
    expect(props.onGalleryReload).toHaveBeenCalledTimes(1);
  });

  it("document actif : onglet, provenance, type et inspecteur partagent une seule barre", () => {
    const { props, container } = pane({ tabs: [PDF_TAB], activeTab: "t1" });
    expect(container.querySelector('.atelier-bar .ui-tab[title="albedo.pdf"]')).toBeInTheDocument();
    expect(container.querySelectorAll(".atelier-bar")).toHaveLength(1);
    expect(container.querySelector(".atelier-surface-header")).toBeNull();
    expect(container.querySelector(".atelier-home.is-compact")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "galerie" }));
    expect(props.onSelectTab).toHaveBeenCalledWith("gallery");
    // provenance + type dérivé + action accessible, rien d'inventé
    expect(screen.getByTitle("figs/albedo.pdf")).toBeInTheDocument();
    expect(screen.getByText("figs")).toBeInTheDocument();
    expect(screen.getByText("figure")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspecter le fichier" }));
    expect(props.onInspectFile).toHaveBeenCalledWith("figs/albedo.pdf");
  });

  it("onglet externe (autre origine) : aucune méta de document projet", () => {
    pane({
      tabs: [{ id: "x", url: "https://example.com/rapport.html", title: "rapport" }],
      activeTab: "x",
    });
    expect(screen.queryByText("figure")).toBeNull();
    expect(screen.queryByRole("button", { name: "Inspecter le fichier" })).toBeNull();
  });
});

describe("AtelierPane — menu contextuel d'onglet", () => {
  it("« Inspecter le fichier » sélectionne l'onglet source PUIS ouvre l'inspecteur, et ferme le menu", () => {
    const { props, container } = pane({ tabs: [PDF_TAB], activeTab: "t1" });
    fireEvent.contextMenu(container.querySelector('.atelier-bar .ui-tab[title="albedo.pdf"]')!);
    expect(document.querySelector('[data-slot="context-menu-content"]')).not.toBeNull();
    fireEvent.click(screen.getByText("Inspecter le fichier"));
    expect(props.onSelectTab).toHaveBeenCalledWith("t1");
    expect(props.onInspectFile).toHaveBeenCalledWith("figs/albedo.pdf");
    expect(screen.queryByText("Inspecter le fichier")).toBeNull(); // menu fermé
  });

  it("onglet sans fichier projet : pas d'entrée Inspecter", () => {
    const { container } = pane({
      tabs: [{ id: "x", url: "https://example.com/doc.html", title: "externe" }],
      activeTab: "x",
    });
    fireEvent.contextMenu(container.querySelector('.atelier-bar .ui-tab[title="externe"]')!);
    expect(screen.queryByText("Inspecter le fichier")).toBeNull();
  });

  it("utilise les actions shadcn pour épingler et fermer", () => {
    const { props, container } = pane({ tabs: [PDF_TAB], activeTab: "t1" });
    const tab = container.querySelector('.atelier-bar .ui-tab[title="albedo.pdf"]')!;

    fireEvent.contextMenu(tab);
    fireEvent.click(screen.getByText("Épingler l'onglet"));
    expect(props.onPinTab).toHaveBeenCalledWith("t1");

    fireEvent.contextMenu(tab);
    fireEvent.click(screen.getByText("Fermer"));
    expect(props.onCloseTab).toHaveBeenCalledWith("t1");
  });
});
