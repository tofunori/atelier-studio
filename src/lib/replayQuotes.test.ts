import { describe, expect, it } from "vitest";
import { rebuildReplayQuotePastes, splitReplayQuotes } from "./replayQuotes";

// Au rejeu d'un historique natif, les citations (viewer et conversation)
// redeviennent des pastilles — même anatomie de bulle qu'en direct.
describe("splitReplayQuotes", () => {
  it("citation viewer (chemin + p.LX-Y) → paste + texte tapé", () => {
    const text = "/Users/t/Documents/conf/abstract_agu26.tex (p.L83-85) : « $-0.05$ in\nthe most exposed decile »\n\nCa veut dire quoi";
    const split = splitReplayQuotes(text);
    expect(split?.pastes).toHaveLength(1);
    expect(split?.pastes[0].name).toBe("abstract_agu26.tex");
    expect(split?.pastes[0].text).toContain("« $-0.05$ in");
    expect(split?.text).toBe("Ca veut dire quoi");
  });

  it("citation multi-paragraphes : absorbée jusqu'à la fermeture du guillemet", () => {
    const text = "notes.md (p.L2-9) : « premier paragraphe\n\nsecond paragraphe »\n\nrésume";
    const split = splitReplayQuotes(text);
    expect(split?.pastes[0].text).toContain("second paragraphe »");
    expect(split?.text).toBe("résume");
  });

  it("citation de la conversation (> …) → paste dédiée", () => {
    const text = "Citation de la conversation :\n> Méthodes : « …no-fire… » — plus de baptême.\n> Résultats : « … »\n\nexact je préfère ca comme ca";
    const split = splitReplayQuotes(text);
    expect(split?.pastes[0].name).toBe("Citation de la conversation");
    expect(split?.text).toBe("exact je préfère ca comme ca");
  });

  it("message ordinaire : intouché", () => {
    expect(splitReplayQuotes("relance")).toBeNull();
    expect(splitReplayQuotes("regarde le fichier /tmp/x.txt stp")).toBeNull();
  });
});

describe("rebuildReplayQuotePastes", () => {
  it("transforme les user rejoués, laisse le reste et les bulles déjà à pastes", () => {
    const events = [
      { kind: "user", text: "a.tex (p.L1-2) : « x »\n\nquestion" },
      { kind: "text", text: "réponse a.tex (p.L1-2) : « x »" },
      { kind: "user", text: "b.tex (p.L3) : « y »\n\nautre", pastes: [{ name: "déjà-là" }] },
    ];
    const out = rebuildReplayQuotePastes(events as never[]);
    expect(out[0]).toMatchObject({ text: "question", pastes: [{ name: "a.tex" }] });
    expect(out[1]).toEqual(events[1]);
    expect(out[2]).toEqual(events[2]);
  });

  it("aucune citation : renvoie le même tableau (référence stable)", () => {
    const events = [{ kind: "user", text: "salut" }];
    expect(rebuildReplayQuotePastes(events as never[])).toBe(events);
  });
});
