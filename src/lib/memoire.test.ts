import { beforeEach, describe, expect, it } from "vitest";
import { cibleParDefaut, libelleOrigine, messageErreur, nomDeProjet, type ProjetClaudeScience } from "./memoire";
import { setLanguage } from "./i18n";

beforeEach(() => setLanguage("fr"));

const projet = (over: Partial<ProjetClaudeScience>): ProjetClaudeScience => ({
  id: "p1", name: "Analyses Feux-Albédo", count: 10, imported: 0, projectRoot: null, ...over,
});

describe("mémoire", () => {
  it("propose le projet d'Atelier qui partage un mot avec celui de Claude Science", () => {
    const projets = ["/Users/t/Documents/Demande-bourse", "/Users/t/Documents/Chapitre1-Albedo"];
    expect(cibleParDefaut(projet({}), projets)).toBe("/Users/t/Documents/Chapitre1-Albedo");
    expect(cibleParDefaut(projet({ name: "Demande de bourse" }), projets)).toBe("/Users/t/Documents/Demande-bourse");
    expect(cibleParDefaut(projet({ name: "Rien" }), projets)).toBeNull();
    expect(cibleParDefaut(projet({ name: "" }), projets)).toBeNull();
  });

  it("garde la cible de l'import précédent, même « tous les projets »", () => {
    expect(cibleParDefaut(projet({ projectRoot: "/a" }), [])).toBe("/a");
    expect(cibleParDefaut(projet({ projectRoot: "" }), ["/x/Albedo"])).toBe("");
  });

  it("nomme projets, origines et erreurs", () => {
    expect(nomDeProjet("/Users/t/Chapitre1-Albedo/")).toBe("Chapitre1-Albedo");
    expect(nomDeProjet("")).toBe("Tous les projets");
    expect(libelleOrigine({ kind: "claude-science", sourceProject: "Analyses" })).toBe("Claude Science · Analyses");
    expect(libelleOrigine({ kind: "extraction" })).toBe("Extrait d'un tour");
    expect(messageErreur("memory_too_long")).toBe("Le souvenir dépasse 2 000 caractères.");
    expect(messageErreur("autre chose")).toBe("autre chose");
  });
});
