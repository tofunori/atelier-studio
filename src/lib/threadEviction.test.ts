import { describe, expect, it } from "vitest";
import { selectEvictableThreads } from "./threadEviction";

// Session ouverte plusieurs jours (cf. App.tsx ~538) : `events` grossit sans
// borne, un fil visité une fois gardant tout son historique en RAM pour
// toujours. `selectEvictableThreads` décide QUELS fils peuvent perdre leur
// tableau d'événements — rechargés par getHistory + rejeu (mergeHarnessHistory)
// à la prochaine visite, cf. App.tsx:2376-2384.
describe("selectEvictableThreads", () => {
  it("garde le fil actif", () => {
    const evicted = selectEvictableThreads({
      events: { a: [1] },
      activeId: "a",
      mru: [],
      running: new Set(),
    });
    expect(evicted).toEqual([]);
  });

  it("garde les fils de la MRU (3 derniers visités)", () => {
    const evicted = selectEvictableThreads({
      events: { a: [1], b: [1], c: [1] },
      activeId: "a",
      mru: ["a", "b", "c"],
      running: new Set(),
    });
    expect(evicted).toEqual([]);
  });

  it("garde un fil avec un tour en cours, même hors MRU", () => {
    const evicted = selectEvictableThreads({
      events: { a: [1], running: [1] },
      activeId: "a",
      mru: ["a"],
      running: new Set(["running"]),
    });
    expect(evicted).toEqual([]);
  });

  it("évince les fils avec des événements, hors actif/MRU/en cours", () => {
    const evicted = selectEvictableThreads({
      events: { a: [1], stale1: [1], stale2: [1] },
      activeId: "a",
      mru: ["a"],
      running: new Set(),
    });
    expect(evicted.sort()).toEqual(["stale1", "stale2"]);
  });

  it("ignore les fils déjà vides (rien à évincer)", () => {
    const evicted = selectEvictableThreads({
      events: { a: [1], empty: [] },
      activeId: "a",
      mru: ["a"],
      running: new Set(),
    });
    expect(evicted).toEqual([]);
  });

  it("accepte activeId=null (aucun fil actif) sans planter", () => {
    const evicted = selectEvictableThreads({
      events: { stale: [1] },
      activeId: null,
      mru: [],
      running: new Set(),
    });
    expect(evicted).toEqual(["stale"]);
  });
});
