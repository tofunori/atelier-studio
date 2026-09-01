import { describe, expect, it } from "vitest";
import { CONSIGNES_LIVREES, NOM_MAX, normaliserNom, nouvelId } from "./consignes";
import { DEFAULT_SETTINGS } from "./settings";

describe("consignes", () => {
  it("livre quatre consignes, toutes marquées livree", () => {
    expect(CONSIGNES_LIVREES).toHaveLength(4);
    expect(CONSIGNES_LIVREES.every((c) => c.livree)).toBe(true);
    expect(CONSIGNES_LIVREES.map((c) => c.id)).toEqual([
      "concis",
      "pedagogique",
      "rigueur",
      "quebecois",
    ]);
  });

  it("garde les noms sous le plafond d'affichage de la pilule", () => {
    for (const c of CONSIGNES_LIVREES) {
      expect(c.nom.length).toBeLessThanOrEqual(NOM_MAX);
      expect(c.texte.trim()).not.toBe("");
      expect(c.description.trim()).not.toBe("");
    }
  });

  it("coupe un nom trop long au lieu de le refuser", () => {
    expect(normaliserNom("  Rigueur scientifique appliquée  ")).toBe(
      "Rigueur scientifique app",
    );
    expect(normaliserNom("Concis")).toBe("Concis");
  });

  it("choisit un identifiant libre", () => {
    expect(nouvelId([])).toBe("c1");
    expect(nouvelId([{ id: "c1", nom: "a", description: "", texte: "x" }])).toBe("c2");
  });

  it("expose les consignes livrées comme défaut des réglages", () => {
    expect(DEFAULT_SETTINGS.consignes).toEqual(CONSIGNES_LIVREES);
  });
});
