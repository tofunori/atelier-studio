// Tests du modèle pur du Research Navigator — les douze règles du plan 024.
import { describe, it, expect } from "vitest";
import {
  CONVERSATIONS_VISIBLE,
  deriveProjectNavigatorModel,
  normalizeQuery,
  recencyBucketAt,
  type NavigatorInput,
} from "./projectNavigatorModel";
import { makeThread, PROJECT_ROOT, OTHER_PROJECT_ROOT, FIXED_TS } from "../../test/fixtures";
import type { Thread } from "../../lib/ws";

const NOW = FIXED_TS; // 2026-07-09T12:00:00Z

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function baseInput(over: Partial<NavigatorInput> = {}): NavigatorInput {
  return {
    activeProject: PROJECT_ROOT,
    activeId: null,
    threads: [],
    favorites: [],
    threadOrder: "recent",
    query: "",
    expanded: false,
    now: NOW,
    ...over,
  };
}

// jeu mixte : projets A et B mélangés + chats sans projet
function mixedThreads(): Thread[] {
  return [
    makeThread({ id: "a1", title: "Analyse albédo", updatedAt: iso(-1 * HOUR) }),
    makeThread({ id: "b1", title: "Chat projet B", projectRoot: OTHER_PROJECT_ROOT, updatedAt: iso(-2 * HOUR) }),
    makeThread({ id: "a2", title: "Révision figure", updatedAt: iso(-1 * DAY) }),
    makeThread({ id: "u1", title: "Chat libre", projectRoot: "", updatedAt: iso(-3 * HOUR) }),
    makeThread({ id: "a3", title: "Notes méthodo", updatedAt: iso(-3 * DAY) }),
  ];
}

describe("règles 1-2 — isolation du contexte", () => {
  it("mode project : seuls les threads du projet actif apparaissent", () => {
    const m = deriveProjectNavigatorModel(baseInput({ threads: mixedThreads() }));
    expect(m.mode).toBe("project");
    expect(m.identity).toEqual({ root: PROJECT_ROOT, name: "albedo-pipeline" });
    expect(m.visibleThreadIds).toEqual(["a1", "a2", "a3"]);
  });

  it("mode unscoped : seuls les chats sans projet apparaissent", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ activeProject: null, threads: mixedThreads() }),
    );
    expect(m.mode).toBe("unscoped");
    expect(m.identity).toBeNull();
    expect(m.visibleThreadIds).toEqual(["u1"]);
  });

  it("zéro thread : modèle vide sans crash", () => {
    const m = deriveProjectNavigatorModel(baseInput());
    expect(m.continueThread).toBeNull();
    expect(m.pinnedThreads).toEqual([]);
    expect(m.conversationSections).toEqual([]);
    expect(m.hiddenCount).toBe(0);
    expect(m.visibleThreadIds).toEqual([]);
  });

  it("ids dupliqués en entrée : un thread n'apparaît qu'une fois", () => {
    const dup = makeThread({ id: "a1", title: "Doublon", updatedAt: iso(-1 * HOUR) });
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: [...mixedThreads(), dup] }),
    );
    expect(m.visibleThreadIds.filter((id) => id === "a1")).toHaveLength(1);
  });
});

describe("règle 3 — priorité du thread Continuer", () => {
  it("activeId du contexte prime", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), activeId: "a2" }),
    );
    expect(m.continueThread?.id).toBe("a2");
  });

  it("activeId hors contexte ignoré (cross-project)", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), activeId: "b1" }),
    );
    expect(m.continueThread?.id).toBe("a1"); // fallback : plus récent
  });

  it("sinon : thread running le plus récent", () => {
    const threads = [
      makeThread({ id: "a1", title: "Idle récent", updatedAt: iso(-1 * HOUR) }),
      makeThread({ id: "a2", title: "Running vieux", status: "running", updatedAt: iso(-2 * DAY) }),
    ];
    const m = deriveProjectNavigatorModel(baseInput({ threads }));
    expect(m.continueThread?.id).toBe("a2");
  });

  it("sinon : thread le plus récent", () => {
    const m = deriveProjectNavigatorModel(baseInput({ threads: mixedThreads() }));
    expect(m.continueThread?.id).toBe("a1");
  });
});

describe("règles 4-5 — Épinglés et déduplication", () => {
  it("chaque thread apparaît une seule fois : Continuer, puis Épinglés, puis Conversations", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), activeId: "a1", favorites: ["a1", "a2"] }),
    );
    expect(m.continueThread?.id).toBe("a1");
    expect(m.pinnedThreads.map((t) => t.id)).toEqual(["a2"]); // a1 déjà en Continuer
    const convIds = m.conversationSections.flatMap((s) => s.threads.map((t) => t.id));
    expect(convIds).toEqual(["a3"]);
    expect(new Set(m.visibleThreadIds).size).toBe(m.visibleThreadIds.length);
  });

  it("favori cross-project exclu ; section vide si aucun favori du contexte", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), favorites: ["b1", "u1"] }),
    );
    expect(m.pinnedThreads).toEqual([]);
  });
});

describe("règles 6-7 — ordre récent (buckets) et ordre manuel", () => {
  it("recent : buckets Aujourd'hui/Hier/7 jours dans l'ordre", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), activeId: "a1" }),
    );
    // a1 en Continuer ; conversations = a2 (hier), a3 (7 jours)
    expect(m.conversationSections.map((s) => s.bucket)).toEqual(["yesterday", "last7"]);
  });

  it("manual : une seule section sans label temporel, ordre createdAt", () => {
    const threads = [
      makeThread({ id: "a1", title: "Un", updatedAt: iso(-1 * HOUR) }),
      makeThread({ id: "a2", title: "Deux", updatedAt: iso(-2 * DAY) }),
      makeThread({ id: "a3", title: "Trois", updatedAt: iso(-3 * HOUR) }),
    ];
    (threads[0] as Thread & { createdAt?: string }).createdAt = "2026-01-03";
    (threads[1] as Thread & { createdAt?: string }).createdAt = "2026-01-01";
    (threads[2] as Thread & { createdAt?: string }).createdAt = "2026-01-02";
    const m = deriveProjectNavigatorModel(
      baseInput({ threads, threadOrder: "manual", activeId: "a1" }),
    );
    expect(m.conversationSections).toHaveLength(1);
    expect(m.conversationSections[0].bucket).toBeNull();
    expect(m.conversationSections[0].threads.map((t) => t.id)).toEqual(["a2", "a3"]);
  });
});

describe("règles 8-9 — recherche", () => {
  it("query non vide : une section Résultats unique, Continuer/Épinglés ignorés", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), favorites: ["a2"], query: "figure" }),
    );
    expect(m.searching).toBe(true);
    expect(m.continueThread).toBeNull();
    expect(m.pinnedThreads).toEqual([]);
    expect(m.conversationSections).toHaveLength(1);
    expect(m.conversationSections[0].key).toBe("results");
    expect(m.conversationSections[0].threads.map((t) => t.id)).toEqual(["a2"]);
  });

  it("insensible à la casse et aux accents", () => {
    expect(normalizeQuery("Révision MÉTHODO")).toBe("revision methodo");
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), query: "REVISION" }),
    );
    expect(m.conversationSections[0].threads.map((t) => t.id)).toEqual(["a2"]);
  });

  it("zéro résultat : section vide, visibleThreadIds vide", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), query: "zzz-introuvable" }),
    );
    expect(m.conversationSections[0].threads).toEqual([]);
    expect(m.visibleThreadIds).toEqual([]);
  });

  it("la recherche ne matche que le contexte courant", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), query: "chat" }),
    );
    // "Chat projet B" et "Chat libre" sont hors contexte
    expect(m.conversationSections[0].threads).toEqual([]);
  });
});

describe("règles 10-12 — ordre visible, dates invalides, limite", () => {
  it("visibleThreadIds suit l'ordre DOM : Continuer, Épinglés, Conversations", () => {
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: mixedThreads(), activeId: "a2", favorites: ["a3"] }),
    );
    expect(m.visibleThreadIds).toEqual(["a2", "a3", "a1"]);
  });

  it("date invalide : bucket older, sans crash", () => {
    const bad = makeThread({ id: "bad", title: "Date cassée", updatedAt: "n'importe quoi" });
    expect(recencyBucketAt(bad, NOW)).toBe("older");
    const m = deriveProjectNavigatorModel(
      baseInput({ threads: [bad, ...mixedThreads()], activeId: "a1" }),
    );
    const older = m.conversationSections.find((s) => s.bucket === "older");
    expect(older?.threads.map((t) => t.id)).toContain("bad");
  });

  it("hiddenCount décrit les conversations au-delà de la limite ; expanded les révèle", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeThread({ id: `t${i}`, title: `Conv ${i}`, updatedAt: iso(-i * HOUR) }),
    );
    const collapsed = deriveProjectNavigatorModel(baseInput({ threads: many, activeId: "t0" }));
    // t0 en Continuer ; 8 restants, 5 visibles, 3 masqués
    expect(collapsed.hiddenCount).toBe(8 - CONVERSATIONS_VISIBLE);
    expect(collapsed.visibleThreadIds).toHaveLength(1 + CONVERSATIONS_VISIBLE);

    const expanded = deriveProjectNavigatorModel(
      baseInput({ threads: many, activeId: "t0", expanded: true }),
    );
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.visibleThreadIds).toHaveLength(9);
  });
});
