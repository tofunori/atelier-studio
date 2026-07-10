// deriveResearchHomeModel (plan 017) — les neuf cas exigés : zéro projet,
// projet sans thread, dernier terminé, running prioritaire, erreur récente,
// artefacts/threads du mauvais projet exclus, historique incomplet, dates
// invalides/futures, plafonds + tri stable.
import { describe, it, expect } from "vitest";
import {
  deriveResearchHomeModel,
  HOME_MAX_ARTEFACTS,
  HOME_MAX_ATTENTION,
  artefactKind,
  type ResearchHomeInputs,
} from "./researchHome";
import type { Thread } from "./ws";

const NOW = Date.parse("2026-07-09T18:00:00Z");
const PROJ = "/Users/tofunori/thesis";

function thread(partial: Partial<Thread> & { id: string }): Thread {
  return {
    projectRoot: PROJ,
    title: `Thread ${partial.id}`,
    provider: "claude",
    sessionId: null,
    status: "idle",
    updatedAt: "2026-07-09T17:00:00Z",
    ...partial,
  };
}

function inputs(partial: Partial<ResearchHomeInputs> = {}): ResearchHomeInputs {
  return {
    activeProject: PROJ,
    projectName: "thesis",
    threads: [],
    events: {},
    workingSince: {},
    usageByThread: {},
    recentFiles: [],
    // par défaut, tous les récents appartiennent au projet (files ⊇ recentFiles)
    files: partial.files ?? partial.recentFiles ?? [],
    sidecar: "ready",
    atelierError: null,
    now: NOW,
    ...partial,
  };
}

describe("deriveResearchHomeModel", () => {
  it("zéro projet → état no-project, aucune section", () => {
    const m = deriveResearchHomeModel(inputs({ activeProject: null }));
    expect(m).toEqual({ state: "no-project" });
  });

  it("projet sans thread → hasThreads false, continue null, pas d'attention", () => {
    const m = deriveResearchHomeModel(inputs());
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.hasThreads).toBe(false);
    expect(m.continueItem).toBeNull();
    expect(m.attention).toEqual([]);
    expect(m.projectName).toBe("thesis");
    expect(m.projectPath).toBe("~/thesis");
  });

  it("dernier thread terminé → statut « terminé » (record), résultat en dernière action, usage enregistré", () => {
    const m = deriveResearchHomeModel(
      inputs({
        threads: [thread({ id: "a", status: "done", updatedAt: "2026-07-09T17:30:00Z" })],
        events: { a: [{ kind: "user", text: "q" }, { kind: "done", ok: true, result: "Figure corrigée\ndétails…" }] },
        usageByThread: { a: { context: 1000, output: 200, cost: 0.1, turns: 2 } },
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.continueItem).toMatchObject({
      threadId: "a",
      status: "done",
      lastAction: "Figure corrigée",
      hasUsage: true,
      relative: { kind: "minutes", n: 30 },
      updatedAtIso: "2026-07-09T17:30:00Z",
    });
  });

  it("thread running plus ancien mais prioritaire devant un terminé plus récent", () => {
    const m = deriveResearchHomeModel(
      inputs({
        threads: [
          thread({ id: "old-running", status: "running", updatedAt: "2026-07-09T10:00:00Z" }),
          thread({ id: "new-done", status: "done", updatedAt: "2026-07-09T17:55:00Z" }),
        ],
        workingSince: { "old-running": NOW - 125_000 },
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.continueItem?.threadId).toBe("old-running");
    expect(m.continueItem?.status).toBe("running");
    expect(m.continueItem?.runningForMs).toBe(125_000);
  });

  it("erreur enregistrée → À traiter, avec le message du record ; jamais de doublon avec Continuer", () => {
    // cas 1 : le thread interrompu est AUSSI le plus récent → il vit dans
    // Continuer (statut interrompu) et n'occupe PAS un emplacement À traiter
    const solo = deriveResearchHomeModel(
      inputs({
        threads: [thread({ id: "err", updatedAt: "2026-07-09T17:59:00Z" })],
        events: { err: [{ kind: "user", text: "q" }, { kind: "error", message: "CLI manquant : codex\nstack…" }] },
      }),
    );
    if (solo.state !== "project") throw new Error("attendu project");
    expect(solo.continueItem?.status).toBe("interrupted");
    expect(solo.attention).toEqual([]);

    // cas 2 : un thread terminé plus récent occupe Continuer → l'interrompu
    // plus ancien apparaît dans À traiter avec le message du record
    const dual = deriveResearchHomeModel(
      inputs({
        threads: [
          thread({ id: "ok", status: "done", updatedAt: "2026-07-09T17:59:00Z" }),
          thread({ id: "err", updatedAt: "2026-07-09T16:00:00Z" }),
        ],
        events: { err: [{ kind: "error", message: "CLI manquant : codex\nstack…" }] },
      }),
    );
    if (dual.state !== "project") throw new Error("attendu project");
    expect(dual.continueItem?.threadId).toBe("ok");
    expect(dual.attention).toHaveLength(1);
    expect(dual.attention[0]).toMatchObject({
      kind: "thread",
      severity: 1,
      threadId: "err",
      detail: "CLI manquant : codex",
    });
  });

  it("démarrage à froid (connecting) : loading, pas d'alerte sidecar ; menace réelle seulement si disconnected", () => {
    const cold = deriveResearchHomeModel(inputs({ sidecar: "connecting" }));
    if (cold.state !== "project") throw new Error("attendu project");
    expect(cold.loading).toBe(true);
    expect(cold.degraded).toBe(false);
    expect(cold.attention).toEqual([]);

    // threads déjà en mémoire → plus un chargement, même si la socket se refait
    const warm = deriveResearchHomeModel(
      inputs({ sidecar: "connecting", threads: [thread({ id: "a" })] }),
    );
    if (warm.state !== "project") throw new Error("attendu project");
    expect(warm.loading).toBe(false);

    const lost = deriveResearchHomeModel(inputs({ sidecar: "disconnected" }));
    if (lost.state !== "project") throw new Error("attendu project");
    expect(lost.loading).toBe(false);
    expect(lost.degraded).toBe(true);
    expect(lost.attention[0]).toMatchObject({ kind: "sidecar", severity: 3 });
  });

  it("artefacts du mauvais projet exclus (chemin absent de files)", () => {
    const m = deriveResearchHomeModel(
      inputs({
        recentFiles: ["figs/mienne.pdf", "autre-projet/etrangere.png", "notes.md"],
        files: ["figs/mienne.pdf", "notes.md"],
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.artefacts.map((a) => a.rel)).toEqual(["figs/mienne.pdf", "notes.md"]);
  });

  it("threads d'un autre projet exclus de Continuer et d'À traiter", () => {
    const m = deriveResearchHomeModel(
      inputs({
        threads: [
          thread({ id: "foreign", projectRoot: "/autre", status: "running", updatedAt: "2026-07-09T17:59:00Z" }),
          thread({ id: "foreign-err", projectRoot: "/autre" }),
        ],
        workingSince: { foreign: NOW - 1000 },
        events: { "foreign-err": [{ kind: "error", message: "boom" }] },
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.hasThreads).toBe(false);
    expect(m.continueItem).toBeNull();
    expect(m.attention).toEqual([]);
  });

  it("historique incomplet (aucun event, usage absent) → aucune invention, pas de crash", () => {
    const m = deriveResearchHomeModel(
      inputs({ threads: [thread({ id: "bare", title: "" })] }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.continueItem).toMatchObject({
      threadId: "bare",
      title: "bare",       // repli : préfixe d'id, jamais de titre inventé
      status: "idle",
      lastAction: null,
      hasUsage: false,
    });
  });

  it("dates invalides ou futures : jamais de crash, relatif borné ou absent", () => {
    const m = deriveResearchHomeModel(
      inputs({
        threads: [
          thread({ id: "future", updatedAt: "2026-07-09T19:30:00Z" }), // +1 h 30
          thread({ id: "invalid", updatedAt: "pas-une-date" }),
        ],
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    // future clampée « à l'instant » → passe devant la date invalide
    expect(m.continueItem?.threadId).toBe("future");
    expect(m.continueItem?.relative).toEqual({ kind: "now" });
    const invalid = deriveResearchHomeModel(inputs({ threads: [thread({ id: "invalid", updatedAt: "n/a" })] }));
    if (invalid.state !== "project") throw new Error("attendu project");
    expect(invalid.continueItem?.relative).toBeNull();
    expect(invalid.continueItem?.updatedAtIso).toBe("n/a"); // record brut, pas de date inventée
  });

  it("plafonds : 3 éléments À traiter (sévérité puis récence), 6 artefacts, tri stable", () => {
    const errThreads = ["e1", "e2", "e3", "e4"].map((id, i) =>
      thread({ id, updatedAt: `2026-07-09T17:0${i}:00Z` }),
    );
    const events = Object.fromEntries(
      errThreads.map((t) => [t.id, [{ kind: "error", message: `échec ${t.id}` } as const]]),
    );
    const m = deriveResearchHomeModel(
      inputs({
        threads: errThreads,
        events,
        sidecar: "disconnected",
        atelierError: "start_atelier: port occupé",
        recentFiles: ["a.pdf", "b.py", "c.md", "d.csv", "e.png", "f.tex", "g.txt", "h.svg"],
      }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.attention).toHaveLength(HOME_MAX_ATTENTION);
    expect(m.attention[0].kind).toBe("sidecar");   // sévérité 3
    expect(m.attention[1].kind).toBe("atelier");   // sévérité 2
    // e4 (le plus récent) occupe Continuer → exclu d'À traiter ; e3 suit
    expect(m.continueItem?.threadId).toBe("e4");
    expect(m.attention[2]).toMatchObject({ kind: "thread", threadId: "e3" });
    expect(m.degraded).toBe(true);
    expect(m.artefacts).toHaveLength(HOME_MAX_ARTEFACTS);
    expect(m.artefacts.map((a) => a.rel)).toEqual(["a.pdf", "b.py", "c.md", "d.csv", "e.png", "f.tex"]);
    // tri stable : mêmes entrées → même sortie
    const again = deriveResearchHomeModel(
      inputs({ threads: errThreads, events, sidecar: "disconnected", atelierError: "start_atelier: port occupé", recentFiles: ["a.pdf"] }),
    );
    if (again.state !== "project") throw new Error("attendu project");
    expect(again.attention.map((a) => a.key)).toEqual(m.attention.map((a) => a.key));
  });

  it("types d'artefacts depuis l'extension, source = dossier parent", () => {
    const m = deriveResearchHomeModel(
      inputs({ recentFiles: ["figs/albedo_2024.pdf", "scripts/extract.py", "notes/ch3.md", "data/mod10a1.csv", "LICENCE"] }),
    );
    if (m.state !== "project") throw new Error("attendu project");
    expect(m.artefacts.map((a) => a.kind)).toEqual(["figure", "code", "document", "data", "other"]);
    expect(m.artefacts[0]).toMatchObject({ name: "albedo_2024.pdf", dir: "figs" });
    expect(artefactKind("x.TIF")).toBe("figure");
  });
});
