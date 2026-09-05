import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsigneMenu } from "./ConsigneMenu";
import { CONSIGNES_LIVREES, composerConsigne, COMPOSITION_VIDE, basculerConsigne, consignesSelectionnees } from "../../lib/consignes";
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

  it("garde la glose entière en infobulle, puisqu'elle est tronquée à l'écran", () => {
    // Traitement D (2026-09-01) : la description passe à droite du nom sur
    // UNE ligne, donc elle est coupée à l'ellipse dès qu'elle est longue.
    // Sans le `title`, une consigne écrite par l'utilisateur avec une
    // description bavarde perdrait son explication pour de bon.
    const bavarde = {
      id: "mienne",
      nom: "Ma règle",
      description: "une description délibérément trop longue pour la rangée du menu",
      texte: "peu importe",
    };
    render(<ConsigneMenu {...base} consignes={[bavarde]} actif={null} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    const glose = document.querySelector(".consigne-desc");
    expect(glose?.getAttribute("title")).toBe(bavarde.description);
  });

  it("marque la rangée active — et « Aucune » quand le fil n'a pas de consigne", () => {
    // Spec 2026-09-01 : fond plein + coche, AUCUN accent. Sans ce marquage,
    // ouvrir le menu ne disait pas laquelle des consignes est en vigueur.
    const { rerender } = render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    const actives = () => [...document.querySelectorAll(".consigne-item.on")];
    expect(actives()).toHaveLength(1);
    expect(actives()[0].textContent).toContain("Aucune");
    expect(actives()[0].querySelector(".consigne-coche")).toBeTruthy();

    rerender(<ConsigneMenu {...base} actif={{ id: "rigueur", texte: "x" }} />);
    expect(actives()).toHaveLength(1);
    expect(actives()[0].textContent).toContain("Rigueur scientifique");
    expect(actives()[0]).toHaveAttribute("aria-checked", "true");
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


describe("consignes combinées dans le menu existant", () => {
  it("ajoute une langue sans perdre la consigne active", () => {
    const onChoisir = vi.fn();
    render(<ConsigneMenu {...base} actif={{id:"concis",texte:"Mon texte édité"}} onChoisir={onChoisir}/>);
    fireEvent.click(screen.getByLabelText("Consigne du fil"));
    expect(screen.queryByText("Composer les consignes…")).toBeNull();
    fireEvent.click(screen.getByText("Français québécois"));
    expect(screen.getByRole("menuitemcheckbox", {name:/Français québécois/})).toBeTruthy();
    expect(onChoisir.mock.calls[0][0].selection).toEqual([
      {id:"concis",texte:"Mon texte édité"},
      {id:"quebecois",texte:CONSIGNES_LIVREES[3].texte},
    ]);
  });
  it("retire une règle sans retirer les autres", () => {
    const combined = basculerConsigne({id:"concis",texte:"Concis"}, CONSIGNES_LIVREES[3]);
    expect(basculerConsigne(combined, CONSIGNES_LIVREES[0])?.selection).toEqual([{id:"quebecois",texte:CONSIGNES_LIVREES[3].texte}]);
  });
  it("évite les deux styles contradictoires", () => {
    expect(basculerConsigne({id:"concis",texte:"Concis"}, CONSIGNES_LIVREES[1])).toEqual({id:"pedagogique",texte:CONSIGNES_LIVREES[1].texte});
  });
  it("conserve une règle partielle quand elle reste seule", () => {
    const composed = composerConsigne({...COMPOSITION_VIDE,langue:"quebecois",citer:true});
    const remaining = basculerConsigne(composed, CONSIGNES_LIVREES[3]);
    expect(remaining?.selection).toEqual([{id:"rigueur",texte:"Cite les sources utilisées et indique les passages qui soutiennent tes affirmations."}]);
    expect(remaining?.texte).not.toContain("corrélation");
  });
  it("reprend sans perte les choix faits dans l'ancien panneau", () => {
    const composed = composerConsigne({...COMPOSITION_VIDE,style:"concis",langue:"quebecois",citer:true,personnel:"Conserver ma règle"});
    const selected = consignesSelectionnees(composed);
    expect(selected.map(c => c.id)).toEqual(["concis","quebecois","rigueur","atelier-personnelle"]);
    expect(selected.map(c => c.texte).join("\n")).toBe(composed?.texte);
  });
});
