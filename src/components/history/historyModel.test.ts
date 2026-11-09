import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../lib/i18n";
import {
  churn, compareSha, entryMeta, entryTitle, filterEntries, groupByDay, historyPaths, providerName, restoreTarget,
  type HistoryEntry,
} from "./historyModel";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 9, 15);

const file = (path: string, add: number | null = 1, del: number | null = 0) => ({
  path, add, del, before: { git: "aaaa" }, after: { git: "bbbb" },
});

const entries: HistoryEntry[] = [
  { id: "turn:1", kind: "turn", ts: at(2026, 11, 9, 14, 32), title: "Corrige le chiffre de 40 %", provider: "codex",
    threadId: "t1", threadTitle: "Relire la discussion", snapshot: "abcd1234", files: [file("results.tex", 2, 3)] },
  { id: "edit:1", kind: "edit", ts: at(2026, 11, 9, 14, 20), start: at(2026, 11, 9, 13, 50), saves: 9, title: "",
    files: [file("results.tex", 31, 8), file("references.bib", 11, 3)] },
  { id: "version:1", kind: "version", ts: at(2026, 11, 9, 11, 5), title: "Envoyé à Christophe", sha: "feed1234",
    fileCount: 4, files: [file("a.tex"), file("b.tex"), file("c.tex"), file("d.tex")] },
  { id: "commit:1", kind: "commit", ts: at(2026, 11, 8, 17, 12), title: "Chapitre 1 : méthodes", sha: "a3f91c2aa",
    shortSha: "a3f91c2", files: [file("methods.tex", 188, 40)] },
  { id: "restore:1", kind: "restore", ts: at(2026, 10, 30, 9), title: "Tes modifications, hier 16:41", sha: "cafe1234",
    files: [{ path: "methods.tex", add: null, del: null, before: { git: "1111" }, after: { git: "2222" } }] },
];

describe("historique du projet : modèle", () => {
  beforeEach(() => setLanguage("fr"));

  it("regroupe par jour : aujourd'hui, hier, puis la date", () => {
    const days = groupByDay(entries, NOW);
    expect(days.map(([label, list]) => [label, list.length])).toEqual([
      ["Aujourd’hui", 3], ["Hier", 1], ["Vendredi 30 octobre", 1],
    ]);
  });

  it("filtre par sorte d'entrée et par fichier", () => {
    expect(filterEntries(entries, "agent", "").map((e) => e.id)).toEqual(["turn:1"]);
    expect(filterEntries(entries, "me", "").map((e) => e.id)).toEqual(["edit:1", "restore:1"]);
    expect(filterEntries(entries, "versions", "").map((e) => e.id)).toEqual(["version:1"]);
    expect(filterEntries(entries, "commits", "").map((e) => e.id)).toEqual(["commit:1"]);
    expect(filterEntries(entries, "all", "results.tex").map((e) => e.id)).toEqual(["turn:1", "edit:1"]);
  });

  it("propose les fichiers touchés par toi et l'agent, du plus fréquent au moins", () => {
    expect(historyPaths(entries)).toEqual(["results.tex", "methods.tex", "references.bib"]);
  });

  it("dit qui a fait quoi, en clair", () => {
    expect(entryTitle(entries[1])).toBe("Tes modifications");
    expect(entryTitle(entries[4])).toBe("Restauration de methods.tex");
    expect(entryMeta(entries[0])).toBe("Codex · conversation « Relire la discussion » · results.tex");
    expect(entryMeta(entries[1])).toMatch(/^results\.tex, references\.bib · 9 sauvegardes, 13 h 50 à 14 h 20$/);
    expect(entryMeta(entries[2])).toBe("Version · 4 fichiers depuis la précédente");
    expect(entryMeta(entries[3])).toBe("Commit a3f91c2 · 1 fichier");
    expect(providerName("claude")).toBe("Claude");
    expect(providerName("")).toBe("Agent");
  });

  it("additionne les lignes et ignore les ± inconnus", () => {
    expect(churn(entries[1].files)).toEqual({ add: 42, del: 11, known: true });
    expect(churn(entries[4].files).known).toBe(false);
  });

  it("restaurer une restauration remet son avant ; les autres remettent leur après", () => {
    expect(restoreTarget(entries[4], entries[4].files[0])).toEqual({ git: "1111" });
    expect(restoreTarget(entries[0], entries[0].files[0])).toEqual({ git: "bbbb" });
  });

  it("compare depuis une version, un commit ou l'avant d'un tour, jamais depuis une séance", () => {
    expect(entries.map(compareSha)).toEqual(["abcd1234", null, "feed1234", "a3f91c2aa", null]);
  });
});
