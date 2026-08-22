// Dédoublonnage des pensées d'un tour (2026-08-22) — cf. thinkingDedup.ts.
// Cas réel à l'origine : le même raisonnement affiché trois fois dans un tour
// Claude (capture Thierry), parce que le bloc recollé « T1+T2 » cohabitait avec
// « T1 » et « T2 » — que l'égalité stricte ne pouvait pas rapprocher.
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../ws";
import { doublonsDePensee } from "./thinkingDedup";

const user = (text: string) => ({ kind: "user", text } as AgentEvent);
const pensee = (text: string) => ({ kind: "thinking", text } as AgentEvent);
const penseeLive = (text: string) => ({ kind: "thinking_live", text } as AgentEvent);
const texte = (text: string) => ({ kind: "text", text } as AgentEvent);
const outil = () => ({ kind: "tool", name: "Read" } as AgentEvent);
const fin = () => ({ kind: "done" } as AgentEvent);

const T1 = "The user is asking about the aerosol flag.";
const T2 = "Let me read the semantic layer references.";

describe("doublonsDePensee", () => {
  it("ne garde que le bloc le plus complet quand un autre le contient", () => {
    const events = [
      user("Que penses-tu du flag aérosol ?"),   // 0
      pensee(T1),                                 // 1 — contenu dans 3
      texte("Je lis le passage."),                // 2
      pensee(`${T1}\n\n${T2}`),                   // 3 — le plus complet
      outil(),                                    // 4
      pensee(T2),                                 // 5 — contenu dans 3
      fin(),                                      // 6
    ];
    expect([...doublonsDePensee(events)].sort()).toEqual([1, 5]);
  });

  it("garde deux raisonnements réellement distincts", () => {
    const events = [
      user("Analyse."),
      pensee("D'abord je lis les méthodes."),
      outil(),
      pensee("Ensuite je vérifie les seuils."),
      fin(),
    ];
    expect(doublonsDePensee(events).size).toBe(0);
  });

  it("à texte identique, garde le PREMIER (sa place logique, avant la réponse)", () => {
    const events = [
      user("Q ?"),
      pensee(T1),          // 1 — gardé
      texte("Réponse."),
      pensee(T1),          // 3 — redite
    ];
    expect([...doublonsDePensee(events)]).toEqual([3]);
  });

  it("compare aussi les blocs vivants aux blocs déposés", () => {
    const events = [
      user("Q ?"),
      pensee(`${T1} ${T2}`),  // 1 — le plus complet
      penseeLive(T2),         // 2 — redite en direct
    ];
    expect([...doublonsDePensee(events)]).toEqual([2]);
  });

  it("ne franchit jamais une frontière de tour", () => {
    // deux tours peuvent légitimement penser la même chose
    const events = [
      user("Q1 ?"), pensee(T1), fin(),
      user("Q2 ?"), pensee(T1), fin(),
    ];
    expect(doublonsDePensee(events).size).toBe(0);
  });

  it("ignore les blocs vides et les espaces de bord", () => {
    const events = [user("Q ?"), pensee("   "), pensee(`  ${T1}  `), pensee(T1)];
    // le bloc vide n'est pas compté ; la redite trimée l'est
    expect([...doublonsDePensee(events)]).toEqual([3]);
  });

  it("un fil sans pensée ne produit aucun doublon", () => {
    expect(doublonsDePensee([user("Q ?"), texte("R."), fin()]).size).toBe(0);
  });
});
