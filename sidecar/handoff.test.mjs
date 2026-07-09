import { describe, expect, it } from "vitest";
import { stripHandoff, HANDOFF_END } from "./handoff.mjs";

const HEADER = "Tu reprends une conversation commencée avec un autre agent. " +
  "Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n";

describe("stripHandoff", () => {
  it("texte sans handoff : inchangé", () => {
    expect(stripHandoff("salut, question simple")).toBe("salut, question simple");
  });

  it("nouveau format : sentinelle unique, insensible aux --- du transcript", () => {
    const transcript = "Utilisateur : vois ce tableau\n\nAgent (claude) : | a |\n|---|\n| 1 |\n\n---\n\nAgent (claude) : suite après un séparateur markdown";
    const full = HEADER + "---\n" + transcript + HANDOFF_END + "donc le paragraphe est solide ou pas ?";
    expect(stripHandoff(full)).toBe("donc le paragraphe est solide ou pas ?");
  });

  it("nouveau format : handoff imbriqué (double sentinelle) → dernière occurrence", () => {
    const inner = HEADER + "---\nvieux fil" + HANDOFF_END + "vieille question";
    const full = HEADER + "---\n" + inner + HANDOFF_END + "nouvelle question";
    expect(stripHandoff(full)).toBe("nouvelle question");
  });

  it("legacy : fermeture ---, prompt récupéré", () => {
    const full = HEADER + "---\nUtilisateur : allo\n\nAgent (claude) : allo\n---\n\nma vraie question";
    expect(stripHandoff(full)).toBe("ma vraie question");
  });

  it("legacy dégénéré : pas de fermeture → texte rendu tel quel (pas de crash)", () => {
    const full = HEADER + "---\ntranscript sans fin";
    expect(stripHandoff(full)).toBe(full);
  });
});
