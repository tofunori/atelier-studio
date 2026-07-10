// AtelierHeaders (plan 018) — RTL : titre + action recharger nommée
// (GalleryHeader), dérivation name/dir/kind et nom accessible complet
// (DocumentHeader), pas d'eyebrow à la racine. Aucune assertion de couleur.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { GalleryHeader, DocumentHeader } from "./AtelierHeaders";
import { setLanguage, t } from "../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

describe("GalleryHeader", () => {
  it("rend le titre galerie et le bouton recharger qui appelle onRefresh", () => {
    const onRefresh = vi.fn();
    render(<GalleryHeader projectName="Thèse albédo" onRefresh={onRefresh} />);

    expect(screen.getByText(t("atelier.gallery"))).toBeInTheDocument();
    expect(screen.getByText("Thèse albédo")).toBeInTheDocument();

    // même nom accessible ET même title que l'ancien bouton TopBar
    const btn = screen.getByRole("button", { name: t("action.refresh-hard") });
    expect(btn).toHaveAttribute("title", t("action.refresh-hard"));
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("sans nom de projet : pas d'eyebrow, pas de texte fantôme", () => {
    const { container } = render(<GalleryHeader projectName={null} onRefresh={vi.fn()} />);
    expect(container.querySelector(".eyebrow")).toBeNull();
  });
});

describe("DocumentHeader", () => {
  it("dérive name, dir et kind depuis rel, avec le chemin complet accessible", () => {
    render(<DocumentHeader rel="figs/albedo.pdf" />);

    expect(screen.getByText("albedo.pdf")).toBeInTheDocument();
    expect(screen.getByText("figs")).toBeInTheDocument();
    expect(screen.getByText(t("home.kind.figure"))).toBeInTheDocument();
    // nom accessible complet = rel via title natif
    expect(screen.getByTitle("figs/albedo.pdf")).toHaveTextContent("albedo.pdf");
  });

  it("fichier à la racine : aucun eyebrow rendu", () => {
    const { container } = render(<DocumentHeader rel="notes.md" />);
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(screen.getByText(t("home.kind.document"))).toBeInTheDocument();
  });
});
