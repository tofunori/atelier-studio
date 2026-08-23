// Registre des sections (lot 1) : source unique consommée par la nav, le
// select compact et le routage.
import { describe, expect, it } from "vitest";
import { SECTIONS, resolveSection } from "./sections";

describe("SECTIONS", () => {
  it("expose les quatre sections du lot 1, dans l'ordre de lecture", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["general", "modeles", "apparence", "atelier"]);
  });

  it("chaque section porte une clé i18n, jamais un libellé en dur", () => {
    for (const section of SECTIONS) {
      expect(section.labelKey.startsWith("settings.")).toBe(true);
    }
  });
});

describe("resolveSection", () => {
  it("retourne la section demandée quand elle existe", () => {
    expect(resolveSection("apparence")).toBe("apparence");
  });

  it("retombe sur « general » pour une section inconnue", () => {
    expect(resolveSection("cette-section-nexiste-pas")).toBe("general");
    expect(resolveSection(undefined)).toBe("general");
  });

  it("fait retomber les anciennes sections fusionnées sur leur héritière", () => {
    // Les sections retirées (setup, providers, review, appsnap, avance) sont
    // encore citées par d'anciens deep-links et par openSettings(App.tsx:1139) ;
    // leur contenu a fusionné ailleurs, pas dans « general ».
    expect(resolveSection("setup")).toBe("modeles");
    expect(resolveSection("providers")).toBe("modeles");
    expect(resolveSection("review")).toBe("atelier");
    expect(resolveSection("appsnap")).toBe("atelier");
    expect(resolveSection("avance")).toBe("general");
  });

  it("retombe sur « general » pour null, la chaîne vide ou un type inattendu, sans lever", () => {
    // Les deep-links (App.tsx) ne garantissent pas `string | undefined` à
    // l'exécution : cast, valeur JSON mal formée, etc.
    expect(() => resolveSection(null as unknown as string | undefined)).not.toThrow();
    expect(resolveSection(null as unknown as string | undefined)).toBe("general");
    expect(resolveSection("")).toBe("general");
    expect(() => resolveSection(42 as unknown as string | undefined)).not.toThrow();
    expect(resolveSection(42 as unknown as string | undefined)).toBe("general");
  });
});
