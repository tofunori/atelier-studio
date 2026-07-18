import { describe, expect, it } from "vitest";
import { decorateKbCites } from "./kbCite";
import type { KbSource } from "../../lib/kbSources";

const SRC = (id: string, title: string): KbSource => ({
  id, kind: "web", title, origin: null, chars: 10,
  addedAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
});
const SOURCES = [
  SRC("1d00b498", "Abstract Dos and Don'ts: AGU26 Edition | AGU"),
  SRC("83d59fb1", "So You Want to Write an Abstract - Eos"),
];

describe("decorateKbCites", () => {
  it("remplace l'id par le titre réel, avec la localisation", () => {
    const out = decorateKbCites("Règle X ✓ [kb:1d00b498 · p.4].", SOURCES);
    expect(out).toContain("[Abstract Dos and Don'ts: AGU26 Ed… · p.4](#atelier-kb-src?id=1d00b498&loc=p.4)");
    expect(out).not.toContain("[kb:1d00b498");
  });

  it("plusieurs ids dans une même citation → une pilule chacun", () => {
    const out = decorateKbCites("Logistique [kb:1d00b498, kb:83d59fb1]", SOURCES);
    expect(out).toContain("(#atelier-kb-src?id=1d00b498)");
    expect(out).toContain("(#atelier-kb-src?id=83d59fb1)");
  });

  it("source inconnue : repli lisible, jamais l'hex complet", () => {
    const out = decorateKbCites("Voir [kb:deadbeef]", SOURCES);
    expect(out).toContain("[source deadbe](#atelier-kb-src?id=deadbeef)");
  });

  it("ne touche ni aux crochets ordinaires ni aux textes sans citation", () => {
    expect(decorateKbCites("tableau [1] et [note] classique", SOURCES))
      .toBe("tableau [1] et [note] classique");
    expect(decorateKbCites("aucune citation ici", SOURCES)).toBe("aucune citation ici");
  });

  it("les crochets du titre sont neutralisés (pas de markdown cassé)", () => {
    const out = decorateKbCites("X [kb:aaaa1111]", [SRC("aaaa1111", "Titre [avec] (parenthèses)")]);
    expect(out).toContain("[Titre avec parenthèses](#atelier-kb-src?id=aaaa1111)");
  });
});
