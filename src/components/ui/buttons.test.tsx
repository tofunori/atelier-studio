// Tests Button + IconButton (matrice plan 016) : clics, disabled réellement
// inerte, loading sans layout shift (le label garde sa géométrie), nom
// accessible obligatoire des boutons-icônes. Pas d'assertions de couleur
// (jsdom ne calcule pas la cascade).
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Button, IconButton } from "./index";

afterEach(cleanup);

describe("Button", () => {
  it("rend un bouton type=button (pas de submit accidentel) avec la variante par défaut", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Fermer</Button>
      </form>,
    );
    const btn = screen.getByRole("button", { name: "Fermer" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("ui-btn--secondary");
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("déclenche onClick une seule fois par clic", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ouvrir</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applique la classe de variante demandée", () => {
    render(<Button variant="primary">Envoyer</Button>);
    expect(screen.getByRole("button", { name: "Envoyer" }).className).toContain("ui-btn--primary");
  });

  it("disabled est réellement inerte", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Supprimer
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Supprimer" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading : inerte, aria-busy, et le label conserve sa géométrie (pas de layout shift)", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Envoyer</Button>);
    const btn = screen.getByRole("button", { name: "Envoyer" });
    const labelBefore = btn.querySelector(".ui-btn-label")!.textContent;

    rerender(
      <Button onClick={onClick} loading>
        Envoyer
      </Button>,
    );
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    // même nœud label, même texte : la largeur du bouton ne bouge pas,
    // le spinner se superpose (cross-fade à géométrie constante)
    expect(btn.querySelector(".ui-btn-label")!.textContent).toBe(labelBefore);
    expect(btn.querySelector(".ui-btn-spin")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  const icon = (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6h8" />
    </svg>
  );

  it("porte toujours son nom accessible (label obligatoire par le type)", () => {
    render(<IconButton label="Réglages">{icon}</IconButton>);
    const btn = screen.getByRole("button", { name: "Réglages" });
    expect(btn).toHaveAttribute("aria-label", "Réglages");
  });

  it("tailles et cible étendue 40×40 via classes dédiées", () => {
    const { rerender } = render(
      <IconButton label="Fermer" size="s">
        {icon}
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Fermer" }).className).toContain("ui-iconbtn--s");
    rerender(
      <IconButton label="Fermer" size="l" hit40>
        {icon}
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Fermer" });
    expect(btn.className).toContain("ui-iconbtn--l");
    expect(btn.className).toContain("ui-iconbtn--hit40");
  });

  it("disabled est inerte", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Rafraîchir" disabled onClick={onClick}>
        {icon}
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Rafraîchir" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
