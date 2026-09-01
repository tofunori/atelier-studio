import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Consignes } from "./Consignes";
import { CONSIGNES_LIVREES } from "../../../lib/consignes";
import { setLanguage } from "../../../lib/i18n";

// La langue du runner de test n'est pas garantie (navigator.language) — la
// fixer rend les assertions sur le texte français déterministes (même filet
// que ConsigneMenu.test.tsx, tâche 8).
afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

describe("réglages — consignes", () => {
  it("liste les consignes du catalogue", () => {
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={() => {}} />);
    expect(screen.getByText("Concis")).toBeTruthy();
    expect(screen.getByText("Français québécois")).toBeTruthy();
  });

  it("interdit de supprimer une consigne livrée", () => {
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Concis"));
    expect(screen.queryByText("Supprimer")).toBeNull();
  });

  it("permet de supprimer une consigne personnelle", () => {
    const onChange = vi.fn();
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[...CONSIGNES_LIVREES, mienne]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.click(screen.getByText("Supprimer"));
    expect(onChange).toHaveBeenCalledWith(CONSIGNES_LIVREES);
  });

  it("coupe un nom trop long à la saisie", () => {
    const onChange = vi.fn();
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[mienne]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.change(screen.getByLabelText("Nom"), {
      target: { value: "Un nom vraiment beaucoup trop long" },
    });
    const derniers = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(derniers?.[0][0].nom).toBe("Un nom vraiment beaucoup");
  });

  it("crée une consigne vide avec un identifiant libre", () => {
    const onChange = vi.fn();
    render(<Consignes consignes={CONSIGNES_LIVREES} onChange={onChange} />);
    fireEvent.click(screen.getByText("Nouvelle consigne"));
    const derniers = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    const ajoutee = derniers?.[derniers.length - 1];
    expect(ajoutee.id).toBe("c1");
    expect(ajoutee.livree).toBeUndefined();
  });
});
