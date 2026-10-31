import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsigneMenu } from "./ConsigneMenu";
import { CONSIGNES_LIVREES, composerConsigne, COMPOSITION_VIDE, basculerConsigne, consignesSelectionnees } from "../../lib/consignes";
import { setLanguage } from "../../lib/i18n";

// Sans cleanup explicite, les rendus des `it` précédents restent dans le DOM
// (globals désactivés ici — vitest.config.ts) : "Spécialiste du fil" devenait
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
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    fireEvent.click(screen.getByText("Rigueur scientifique"));
    expect(onChoisir).toHaveBeenCalledWith({
      id: "rigueur",
      texte: CONSIGNES_LIVREES[2].texte,
    });
  });

  it("rend null quand on décoche la seule forme active", () => {
    // Variante C (2026-10-31) : plus de rangée « Aucune » pour les formes ;
    // décocher la dernière pastille revient au même.
    const onChoisir = vi.fn();
    render(
      <ConsigneMenu {...base} actif={{ id: "concis", texte: "x" }} onChoisir={onChoisir} />,
    );
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    expect(screen.queryByText("Aucune")).toBeNull();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Concis" }));
    expect(onChoisir).toHaveBeenCalledWith(null);
  });

  it("montre les formes en pastilles : le nom seul, sans glose ni icône", () => {
    render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    const pastilles = [...document.querySelectorAll(".consigne-pastille")];
    expect(pastilles.map((el) => el.textContent)).toEqual(CONSIGNES_LIVREES.map((c) => c.nom));
    expect(document.querySelector(".consigne-pastilles .consigne-desc")).toBeNull();
    expect(document.querySelector(".consigne-pastille > svg")).toBeNull();
  });

  it("marque les pastilles actives, et aucune quand le fil n'a pas de consigne", () => {
    // Spec 2026-09-01 : remplissage + coche, AUCUN accent.
    const { rerender } = render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    const actives = () => [...document.querySelectorAll('.consigne-pastille[aria-checked="true"]')];
    expect(actives()).toHaveLength(0);

    rerender(<ConsigneMenu {...base} actif={{ id: "rigueur", texte: "x" }} />);
    expect(actives()).toHaveLength(1);
    expect(actives()[0].textContent).toBe("Rigueur scientifique");
  });

  it("garde le fil fonctionnel quand la consigne a disparu du catalogue", () => {
    render(<ConsigneMenu {...base} actif={{ id: "disparue", texte: "x" }} />);
    expect(screen.getByText("(supprimée)")).toBeTruthy();
  });

  it("est éteint sur un CLI sans mécanisme prévu", () => {
    render(<ConsigneMenu {...base} provider="grok" actif={null} />);
    expect(screen.getByLabelText("Spécialiste du fil")).toHaveAttribute("disabled");
  });

  it("dit comment la consigne est appliquée sur le CLI courant", () => {
    const { rerender } = render(<ConsigneMenu {...base} actif={null} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    expect(screen.getByTitle(/invisible dans le fil/)).toBeTruthy();
    rerender(<ConsigneMenu {...base} provider="codex" actif={null} />);
    expect(screen.getByTitle(/en tête de chaque message/)).toBeTruthy();
  });
});


describe("consignes combinées dans le menu existant", () => {
  it("ajoute une langue sans perdre la consigne active", () => {
    const onChoisir = vi.fn();
    render(<ConsigneMenu {...base} actif={{id:"concis",texte:"Mon texte édité"}} onChoisir={onChoisir}/>);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
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

describe("menu Spécialiste (plan specialistes-2026-10-18)", () => {
  const glacio = {
    id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", role: "Albédo des glaciers",
    instructions: "Tu es glaciologue.", skills: [], tousSkills: true, connecteurs: [], visible: true,
  };
  const masque = { ...glacio, id: "sp2", nom: "Paper Writer", nomCourt: "Paper", visible: false };

  it("liste les spécialistes visibles et en choisit un sans perdre la forme", () => {
    const onChoisir = vi.fn();
    render(<ConsigneMenu {...base} specialistes={[glacio, masque]} actif={{ id: "concis", texte: "x" }} onChoisir={onChoisir} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    expect(screen.queryByText("Paper Writer")).toBeNull();
    fireEvent.click(screen.getByText("Glaciologue albédo"));
    const choix = onChoisir.mock.calls[0][0];
    expect(choix.specialiste).toMatchObject({ id: "sp1", nomCourt: "Glaciologue" });
    expect(choix.selection).toEqual([{ id: "concis", texte: "x" }]);
  });

  it("le bouton montre le nom court et le nombre de consignes de forme", () => {
    const actif = {
      id: "specialiste:sp1", texte: "…", selection: [{ id: "concis", texte: "a" }, { id: "rigueur", texte: "b" }],
      specialiste: { id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", texte: "…" },
    };
    render(<ConsigneMenu {...base} specialistes={[glacio]} actif={actif} />);
    const bouton = screen.getByLabelText("Spécialiste du fil");
    expect(bouton.textContent).toBe("Glaciologue+2");
    expect(bouton.getAttribute("title")).toContain("Glaciologue albédo");
  });

  it("un seul lien ouvre les réglages (spécialistes, sinon consignes)", () => {
    const onGerer = vi.fn();
    const onReglages = vi.fn();
    const { rerender } = render(<ConsigneMenu {...base} specialistes={[]} actif={null}
      onOuvrirReglages={onReglages} onGererSpecialistes={onGerer} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    expect(screen.getAllByRole("menuitem").filter((el) => /Gérer|Modifier/.test(el.textContent ?? ""))).toHaveLength(1);
    fireEvent.click(screen.getByText("Gérer les spécialistes et les styles…"));
    expect(onGerer).toHaveBeenCalled();
    expect(onReglages).not.toHaveBeenCalled();

    rerender(<ConsigneMenu {...base} specialistes={[]} actif={null} onOuvrirReglages={onReglages} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    fireEvent.click(screen.getByText("Gérer les spécialistes et les styles…"));
    expect(onReglages).toHaveBeenCalled();
  });

  it("rôle du spécialiste sur une ligne sous le nom, sans icône ni infobulle", () => {
    render(<ConsigneMenu {...base} specialistes={[glacio]} actif={null} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    const rangee = screen.getByRole("menuitem", { name: /Glaciologue albédo/ });
    const role = rangee.querySelector(".consigne-desc");
    expect(role?.textContent).toBe("Albédo des glaciers");
    expect(role?.hasAttribute("title")).toBe(false);
    expect(rangee.querySelector("svg")).toBeNull();
  });

  it("« Aucun » retire le spécialiste et garde les formes", () => {
    const onChoisir = vi.fn();
    const actif = {
      id: "specialiste:sp1", texte: "…", selection: [{ id: "concis", texte: "a" }],
      specialiste: { id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", texte: "…" },
    };
    render(<ConsigneMenu {...base} specialistes={[glacio]} actif={actif} onChoisir={onChoisir} />);
    fireEvent.click(screen.getByLabelText("Spécialiste du fil"));
    fireEvent.click(screen.getByText("Aucun"));
    expect(onChoisir).toHaveBeenCalledWith({ id: "concis", texte: "a" });
  });
});
