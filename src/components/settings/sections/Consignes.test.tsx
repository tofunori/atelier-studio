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

  it("propose Rédiger quand le champ est vide et Reformuler sinon", () => {
    const vide = { id: "c1", nom: "Ma règle", description: "d", texte: "" };
    const { rerender } = render(<Consignes consignes={[vide]} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Ma règle"));
    expect(screen.getByText("Rédiger")).toBeTruthy();
    rerender(
      <Consignes consignes={[{ ...vide, texte: "un texte" }]} onChange={() => {}} />,
    );
    expect(screen.getByText("Reformuler")).toBeTruthy();
  });

  it("garde le texte original derrière Rétablir jusqu'à la frappe suivante", async () => {
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "original" };
    const onChange = vi.fn();
    render(
      <Consignes consignes={[mienne]} onChange={onChange} reformuler={async () => "reformulé"} />,
    );
    fireEvent.click(screen.getByText("Ma règle"));
    fireEvent.click(screen.getByText("Reformuler"));
    expect(await screen.findByText("Rétablir")).toBeTruthy();
    fireEvent.click(screen.getByText("Rétablir"));
    const derniers = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(derniers?.[0][0].texte).toBe("original");
  });

  it("éteint le bouton quand le CLI est indisponible", () => {
    const mienne = { id: "c1", nom: "Ma règle", description: "d", texte: "t" };
    render(<Consignes consignes={[mienne]} onChange={() => {}} reformuler={null} />);
    fireEvent.click(screen.getByText("Ma règle"));
    expect(screen.getByText("Reformuler").closest("button")).toHaveAttribute("disabled");
  });

  it("laisse choisir le modèle qui reformule", () => {
    const save = vi.fn();
    render(
      <Consignes
        consignes={[]}
        onChange={() => {}}
        assist={{ provider: "codex", model: "gpt-5.6-sol" }}
        onChangeAssist={save}
      />,
    );
    fireEvent.change(screen.getByLabelText("Modèle de reformulation"), {
      target: { value: "codex:gpt-5.5" },
    });
    expect(save).toHaveBeenCalledWith({ provider: "codex", model: "gpt-5.5" });
  });
});
