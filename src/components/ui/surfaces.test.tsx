// Tests SurfaceHeader + EmptyState + InlineNotice + StatusBadge +
// InspectorPanel (matrice plan 016) : structure, régions vives, fermeture
// nommée de l'inspecteur.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SurfaceHeader, EmptyState, InlineNotice, StatusBadge, InspectorPanel, Button } from "./index";

afterEach(cleanup);

describe("SurfaceHeader", () => {
  it("rend eyebrow, titre (ellipsé par CSS) et actions à droite", () => {
    render(
      <SurfaceHeader
        eyebrow="Projet"
        title="Albédo des glaciers — figures"
        actions={<Button>Actualiser</Button>}
      />,
    );
    const header = screen.getByRole("banner");
    expect(header.querySelector(".eyebrow")).toHaveTextContent("Projet");
    expect(header.querySelector(".title")).toHaveTextContent("Albédo des glaciers — figures");
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
  });

  it("sans eyebrow ni actions : structure minimale", () => {
    const { container } = render(<SurfaceHeader title="Galerie" />);
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(container.querySelector(".actions")).toBeNull();
    expect(container.querySelector(".title")).toHaveTextContent("Galerie");
  });
});

describe("EmptyState", () => {
  it("rend titre, description et actions empilées", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Aucun projet ouvert"
        description="Choisissez un dossier pour commencer."
        actions={<Button onClick={onClick}>Ouvrir un dossier…</Button>}
      />,
    );
    expect(screen.getByText("Aucun projet ouvert")).toBeInTheDocument();
    expect(screen.getByText("Choisissez un dossier pour commencer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir un dossier…" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("InlineNotice", () => {
  it("info/succès/avertissement = région polie (status), erreur = alert", () => {
    const { rerender } = render(<InlineNotice tone="info">Index à jour.</InlineNotice>);
    expect(screen.getByRole("status")).toHaveTextContent("Index à jour.");
    rerender(<InlineNotice tone="warning">Sonde lente.</InlineNotice>);
    expect(screen.getByRole("status")).toHaveTextContent("Sonde lente.");
    rerender(<InlineNotice tone="error">Serveur galerie injoignable.</InlineNotice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Serveur galerie injoignable.");
  });

  it("la tonalité pilote la classe (pas d'assertion de couleur en jsdom)", () => {
    render(<InlineNotice tone="success">Snapshot créé.</InlineNotice>);
    expect(screen.getByRole("status").className).toContain("ui-notice--success");
  });
});

describe("StatusBadge", () => {
  it("libellé + point décoratif ; la classe suit le statut", () => {
    const { rerender } = render(<StatusBadge status="running">actif</StatusBadge>);
    const badge = screen.getByText("actif").closest(".ui-badge")!;
    expect(badge.className).toContain("ui-badge--running");
    expect(badge.querySelector(".dot")).toHaveAttribute("aria-hidden", "true");
    rerender(<StatusBadge>hors ligne</StatusBadge>);
    expect(screen.getByText("hors ligne").closest(".ui-badge")!.className).not.toContain("ui-badge--");
  });
});

describe("InspectorPanel", () => {
  it("assemble en-tête, corps scrollable et footer ; la fermeture est nommée et fonctionne", () => {
    const onClose = vi.fn();
    render(
      <InspectorPanel
        eyebrow="Figure"
        title="fig3_albedo_saisonnier.pdf"
        onClose={onClose}
        closeLabel="Fermer l'inspecteur"
        footer={<Button variant="primary">Appliquer</Button>}
      >
        <p>Métadonnées scientifiques</p>
      </InspectorPanel>,
    );
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByText("Métadonnées scientifiques")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appliquer" })).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Fermer l'inspecteur" });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sans onClose : aucun bouton de fermeture", () => {
    render(
      <InspectorPanel title="Détails">
        <p>corps</p>
      </InspectorPanel>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
