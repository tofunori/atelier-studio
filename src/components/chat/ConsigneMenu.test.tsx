import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsigneMenu } from "./ConsigneMenu";
import { CONSIGNES_LIVREES } from "../../lib/consignes";
import { setLanguage } from "../../lib/i18n";

// Sans cleanup explicite, les rendus des `it` précédents restent dans le DOM
// (globals désactivés ici — vitest.config.ts) : "Consigne du fil" devenait
// ambigu dès le 3e test. Même filet que surfaces.test.tsx.
afterEach(cleanup);
// Les libellés passent par t() (round 1 de revue, tâche 8) : la langue du
// runner de test n'est pas garantie (navigator.language) — la fixer ici
// rend les assertions sur le texte français déterministes.
beforeEach(() => setLanguage("fr"));

const base = {
  consignes: CONSIGNES_LIVREES,
  provider: "claude",
  onChoisir: () => {},
  onOuvrirReglages: () => {},
};

describe("ConsigneMenu", () => {
  it("n'affiche aucun libellé tant qu'aucune consigne n'est active", () => {
    render(<ConsigneMenu {...base} actif={null} />);
    expect(screen.queryByText("Concis")).toBeNull();
  });

  it("affiche le nom de la consigne active dans la pilule", () => {
    render(<ConsigneMenu {...base} actif={{ id: "concis", texte: "x" }} />);
    expect(screen.getByText("Concis")).toBeTruthy();
  });

  it("envoie l'identifiant ET une copie du texte au choix", () => {
    const onChoisir = vi.fn();
    render(<ConsigneMenu {...base} actif={null} onChoisir={onChoisir} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    fireEvent.click(screen.getByText("Rigueur scientifique"));
    expect(onChoisir).toHaveBeenCalledWith({
      id: "rigueur",
      texte: CONSIGNES_LIVREES[2].texte,
    });
  });

  it("rend null quand le fil retire la consigne", () => {
    const onChoisir = vi.fn();
    render(
      <ConsigneMenu {...base} actif={{ id: "concis", texte: "x" }} onChoisir={onChoisir} />,
    );
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    fireEvent.click(screen.getByText("Aucune"));
    expect(onChoisir).toHaveBeenCalledWith(null);
  });

  it("garde le fil fonctionnel quand la consigne a disparu du catalogue", () => {
    render(<ConsigneMenu {...base} actif={{ id: "disparue", texte: "x" }} />);
    expect(screen.getByText("(supprimée)")).toBeTruthy();
  });

  it("est éteint sur un CLI sans mécanisme prévu", () => {
    render(<ConsigneMenu {...base} provider="grok" actif={null} />);
    expect(screen.getByLabelText("Consigne du fil")).toHaveAttribute("disabled");
  });

  it("dit comment la consigne est appliquée sur le CLI courant", () => {
    const { rerender } = render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    expect(screen.getByText(/invisible dans le fil/)).toBeTruthy();
    rerender(<ConsigneMenu {...base} provider="codex" actif={null} />);
    expect(screen.getByText(/en tête de chaque message/)).toBeTruthy();
  });
});
