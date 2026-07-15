// Anatomie du tour : modèle Synara — un seul état actif, journal humain
// dépliable et, une fois terminé, pli compact « Worked for… ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { ThinkingShimmer } from "./turnParts";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
import { setLanguage, t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-A",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...over,
  };
}

// tour terminé avec 2 outils : produit un pli d'activité
function finishedTurn(): AgentEvent[] {
  return [
    events.user("Analyse l'albédo.", FIXED_TS),
    events.tool({ id: "t1", ts: FIXED_TS + 100 }),
    events.tool({ id: "t2", name: "Grep", detail: "albedo", ts: FIXED_TS + 200 }),
    events.text("Voici l'analyse.", FIXED_TS + 500),
    events.done({ ts: FIXED_TS + 700 }),
  ];
}

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(cleanup);

describe("anatomie du tour — header d'activité", () => {
  it("cadence le reflet Thinking : délai de 600 ms, passage de 650 ms, puis toutes les 4 s", () => {
    vi.useFakeTimers();
    try {
      renderUi(<ThinkingShimmer text="Thinking" />);
      const shimmer = document.querySelector(".thinking-shimmer") as HTMLElement;
      expect(shimmer.classList.contains("is-sweeping")).toBe(false);

      act(() => vi.advanceTimersByTime(600));
      expect(shimmer.classList.contains("is-sweeping")).toBe(true);

      act(() => vi.advanceTimersByTime(650));
      expect(shimmer.classList.contains("is-sweeping")).toBe(false);

      act(() => vi.advanceTimersByTime(3_350));
      expect(shimmer.classList.contains("is-sweeping")).toBe(true);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("tour terminé : header « A travaillé pendant… », replié par défaut", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    expect(fold).toBeTruthy();
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.textContent).toContain(t("chat.worked-for", { duration: "1s" }));
    expect(fold.textContent).toContain("1s"); // durée user→done (600 ms → ≥1s)
    expect(fold.textContent).not.toContain(t("chat.activity-steps", { n: 2 }));
    // replié : le détail des outils n'est pas rendu
    expect(document.querySelector(".ui-activity:not(.is-summary)")).toBeNull();
  });

  it("clic déplie le détail des outils ; aria-expanded suit", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(1);
    expect(document.querySelectorAll(".ui-activity.is-completed:not(.is-summary)")).toHaveLength(1);
    expect(document.querySelectorAll(".ui-activity-label")[1]?.textContent?.toLowerCase())
      .toContain(t("tools.summary.exploration-n").toLowerCase());
  });

  it("tour actif : une seule activité sémantique, reasoning consolidé et aucun Thinking doublé", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte puis corrige.", FIXED_TS),
      { kind: "tool", name: "__thinking" },
      events.thinking("Je localise les fichiers utiles.", FIXED_TS + 50),
      { kind: "thinking_live", text: "Running: Je confirme le chemin utile.", ts: FIXED_TS + 75 },
      events.tool({ id: "search-1", name: "Bash", detail: "rg -n albedo src", input: { command: "rg -n albedo src" } }),
      { kind: "tool", name: "__thinking" },
      events.tool({ id: "read-1", name: "Bash", detail: "cat src/albedo.ts", input: { command: "cat src/albedo.ts" } }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const working = document.querySelector(".working-header") as HTMLElement;
    expect(working).toBeTruthy();
    expect(document.querySelectorAll(".working-header")).toHaveLength(1);
    expect(working.textContent).toContain("Travaille depuis");
    expect(working.querySelector(".working-spin")).toBeNull();
    expect(working.querySelector(".working-divider")).toBeTruthy();
    expect(document.querySelectorAll(".thinking-live-indicator")).toHaveLength(0);
    expect(document.querySelector(".thinking-shimmer")).toBeNull();
    expect(document.querySelector(".thinking")).toBeNull();
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(1);
    const activity = document.querySelector(".ui-activity:not(.is-summary) .ui-activity-trigger") as HTMLButtonElement;
    expect(activity.textContent).toContain("Je confirme le chemin utile.");
    expect(screen.queryByText("Bash")).toBeNull();
    fireEvent.click(activity);
    expect(document.querySelectorAll(".reasoning-trace")).toHaveLength(1);
    expect(screen.getAllByText("Je confirme le chemin utile.")).toHaveLength(2);
    expect(screen.getAllByText("Bash")).toHaveLength(2);
  });

  it("tour actif : consolide huit actions dans une seule activité dépliable", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      ...Array.from({ length: 8 }, (_, index) => events.tool({
        id: `tool-${index}`,
        name: "Read",
        detail: `file-${index}.ts`,
      })),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const activity = document.querySelector(".active-turn-tail .ui-activity") as HTMLElement;
    expect(activity).toBeTruthy();
    expect(document.querySelectorAll(".active-turn-tail .ui-activity")).toHaveLength(1);
    expect(activity.textContent).toContain(t("chat.active-action-n", { n: 8 }));
    fireEvent.click(activity.querySelector(".ui-activity-trigger") as HTMLButtonElement);
    expect(document.querySelectorAll(".active-work-detail .tool-output")).toHaveLength(8);
  });

  it("tour actif : l'icône suit l'appel réellement en cours, pas les actions précédentes", () => {
    const evs: AgentEvent[] = [
      events.user("Lis puis teste.", FIXED_TS),
      events.tool({ id: "read", name: "Read", detail: "src/App.tsx", status: "completed" }),
      events.tool({ id: "test", name: "Bash", detail: "npm test", status: "inProgress" }),
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const activity = document.querySelector(".active-turn-tail .ui-activity") as HTMLElement;
    expect(activity.querySelector("[data-activity-icon='command']")).toBeTruthy();
    expect(activity.textContent).toContain(t("chat.activity-running-tests"));
    expect(activity.querySelector("[data-activity-icon='read']")).toBeNull();
    expect(activity.querySelector(".ui-activity-label.is-shimmering")).toBeTruthy();
    expect(activity.querySelector(".ui-activity-icon.is-shimmering")).toBeNull();
    expect(activity.querySelector(".ui-activity-meta.is-shimmering")).toBeNull();
  });

  it("garde l'activité visible sous une narration intermédiaire tant que le tour travaille", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.text("Je vérifie les données locales.", FIXED_TS + 100),
      { kind: "tool", name: "__thinking" },
    ];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);

    const header = document.querySelector(".active-turn-header") as HTMLElement;
    const message = screen.getByText("Je vérifie les données locales.");
    const tail = document.querySelector(".active-turn-tail") as HTMLElement;
    expect(header).toBeTruthy();
    expect(tail).toBeTruthy();
    expect(tail.querySelector(".thinking-shimmer")).toBeTruthy();
    expect(tail.querySelector(".thinking-shimmer-sweep[aria-hidden='true']")).toBeTruthy();
    expect(tail.querySelector(".thinking-shimmer-highlight")?.textContent).toBe(t("chat.thinking"));
    expect(header.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(message.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tour terminé : résumé ordonné comme Codex et icône de la première partie", () => {
    const evs: AgentEvent[] = [
      events.user("Inspecte.", FIXED_TS),
      events.tool({ id: "cmd", name: "Bash", detail: "npm test" }),
      events.tool({ id: "search", name: "Bash", detail: "rg -n albedo src" }),
      events.text("Terminé.", FIXED_TS + 500),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);

    const activity = document.querySelector(".ui-activity:not(.is-summary)") as HTMLElement;
    expect(activity.textContent).toContain("Fichiers consultés, commande exécutée");
    expect(activity.querySelector("[data-activity-icon='search']")).toBeTruthy();
    expect(activity.querySelector("[data-activity-icon='command']")).toBeNull();
    expect(activity.querySelector(".ui-activity-label.is-shimmering")).toBeNull();
  });

  it("rattache les narrations intermédiaires au pli du message final", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.tool({ id: "read-1" }),
      events.text("Je vérifie encore.", FIXED_TS + 300),
      events.tool({ id: "read-2", detail: "second.csv" }),
      events.text("Voici la réponse finale.", FIXED_TS + 600),
      events.done({ ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);

    expect(screen.queryByText("Je vérifie encore.")).toBeNull();
    expect(screen.getByText("Voici la réponse finale.")).toBeTruthy();
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);
    expect(screen.getByText("Je vérifie encore.")).toBeTruthy();
  });

  it("ne rend jamais une réflexion vide", () => {
    renderUi(<Chat {...chatProps({ events: [
      events.user("Inspecte."),
      { kind: "thinking", text: "   " } as AgentEvent,
    ] })} />);
    expect(document.querySelector(".thinking")).toBeNull();
  });

  it("l'erreur d'un tour reste visible même pli fermé", () => {
    const evs: AgentEvent[] = [
      events.user("Analyse.", FIXED_TS),
      events.tool({ id: "t1" }),
      events.tool({ id: "t2", name: "Bash" }),
      events.error("provider indisponible"),
      events.done({ ok: false, ts: FIXED_TS + 700 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    expect(document.querySelector(".ui-activity.is-summary")).toBeTruthy(); // pli présent
    expect(screen.getByText(/provider indisponible/)).toBeTruthy(); // erreur hors pli
  });

  it("fusionne les appels Edit et les éditions répétées du même fichier", () => {
    const evs: AgentEvent[] = [
      events.user("Améliore la figure.", FIXED_TS),
      { kind: "tool_update", id: "edit-1", name: "Edit", output: "", status: "completed", durationMs: 117 },
      { kind: "edit", files: [{ path: "scripts/plot.py", add: 2, del: 1 }] },
      { kind: "tool_update", id: "edit-2", name: "Edit", output: "", status: "completed", durationMs: 140 },
      { kind: "edit", files: [{ path: "scripts/plot.py", add: 3, del: 2 }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
    expect(document.querySelectorAll(".edit-line")).toHaveLength(1);
    expect(document.querySelector(".edit-line")?.textContent).toContain("plot.py");
    expect(document.querySelector(".edit-line")?.textContent).toContain("+5");
    expect(document.querySelector(".edit-line")?.textContent).toContain("-3");
    expect(document.querySelectorAll(".ui-activity:not(.is-summary)")).toHaveLength(1);
    expect(document.querySelector(".thinking-shimmer")?.textContent).toContain(t("chat.thinking"));
  });

  it("ouvre un fichier édité dans l'IDE avec le diff exact du tour", () => {
    const onOpen = vi.fn();
    window.addEventListener("chat-open-file", onOpen);
    try {
      const baseSha = "a".repeat(40);
      const evs: AgentEvent[] = [
        events.user("Corrige le tracé.", FIXED_TS),
        {
          kind: "edit",
          projectRoot: "/tmp/fixtures/albedo-pipeline",
          baseSha,
          files: [{ path: "scripts/plot.py", add: 4, del: 1 }],
        },
      ];
      renderUi(<Chat {...chatProps({ events: evs, workingSince: FIXED_TS })} />);
      fireEvent.click(document.querySelector(".edit-line-open") as HTMLButtonElement);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect((onOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({
        rel: "scripts/plot.py",
        line: null,
        diff: true,
        baseSha,
      });
    } finally {
      window.removeEventListener("chat-open-file", onOpen);
    }
  });

  it("sort du chargement et montre l'erreur quand gitDiff échoue", () => {
    const evs: AgentEvent[] = [
      events.user("Modifie.", FIXED_TS),
      { kind: "edit", projectRoot: "/tmp/fixtures/albedo-pipeline", files: [{ path: "scripts/plot.py", add: 1, del: 0 }] },
    ] as AgentEvent[];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    fireEvent.click(document.querySelector(".edit-line-difftoggle") as HTMLButtonElement);
    act(() => window.dispatchEvent(new CustomEvent("git-diff", { detail: {
      type: "gitDiff", projectRoot: "/tmp/fixtures/albedo-pipeline",
      path: "scripts/plot.py", diff: "", error: "diff indisponible",
    } })));
    expect(screen.getByText("diff indisponible")).toBeTruthy();
    expect(screen.queryByText(t("common.loading"))).toBeNull();
  });

  it("aucun chevron texte ▸/▾ dans le fil", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    fireEvent.click(document.querySelector(".ui-activity.is-summary .ui-activity-trigger") as HTMLButtonElement);
    expect(document.body.textContent).not.toMatch(/[▸▾]/);
  });
});

describe("capsule résultat — honnêteté et actions", () => {
  it("tour ok : « Tour terminé » + usage enregistré (tokens)", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const capsule = document.querySelector(".result-capsule") as HTMLElement;
    expect(capsule).toBeTruthy();
    expect(capsule.textContent).toContain(t("chat.turn-done"));
    expect(capsule.textContent).toContain("512 tokens"); // done.usage.output du fixture
  });

  it("done sans usage : « Usage indisponible », jamais de valeur inventée", () => {
    const evs: AgentEvent[] = [
      events.user("Question.", FIXED_TS),
      { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/fixtures/albedo-pipeline",
        filesChanged: [], ts: FIXED_TS + 100 } as unknown as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    expect(document.querySelector(".result-capsule")!.textContent)
      .toContain(t("chat.usage-unavailable"));
  });

  it("tour ok:false : « Tour interrompu » en ton warning", () => {
    const evs: AgentEvent[] = [
      events.user("Question.", FIXED_TS),
      events.done({ ok: false, ts: FIXED_TS + 100 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    const capsule = document.querySelector(".result-capsule.warn") as HTMLElement;
    expect(capsule).toBeTruthy();
    expect(capsule.textContent).toContain(t("chat.turn-interrupted"));
  });

  it("« Annuler le tour » appelle onRevert avec le message user du tour", () => {
    const onRevert = vi.fn();
    renderUi(<Chat {...chatProps({ events: finishedTurn(), onRevert })} />);
    fireEvent.click(screen.getByText(t("chat.revert-turn")));
    expect(onRevert).toHaveBeenCalledWith(0, "Analyse l'albédo.", false);
  });

  it("fichiers modifiés : le libellé honnête compte les fichiers, le diff est à la demande", () => {
    const evs: AgentEvent[] = [
      events.user("Corrige.", FIXED_TS),
      events.done({ filesChanged: ["a.py", "b.py"], ts: FIXED_TS + 100 }),
    ];
    renderUi(<Chat {...chatProps({ events: evs })} />);
    const toggle = document.querySelector(".turn-diff-toggle") as HTMLButtonElement;
    expect(toggle.textContent).toContain(t("chat.files-modified", { count: 2 }));
    expect(document.querySelector(".turn-diff-body")).toBeNull(); // à la demande
  });

  it("aucune section « tests » n'existe sans événement qui la porte", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const capsule = document.querySelector(".result-capsule") as HTMLElement;
    expect(capsule.textContent!.toLowerCase()).not.toMatch(/test|réussi|validé/);
  });
});

// Demandes Thierry (2026-07-10) : pas de badge permanent après un tour ;
// la pastille goal se ferme immédiatement au clic corbeille.
describe("en-tête et goal — retours utilisateur", () => {
  it("aucun badge de statut dans l'en-tête après un tour terminé", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    expect(document.querySelector(".chat-surface-header .ui-badge")).toBeNull();
  });

  it("aucun badge non plus pendant un run (le fil porte le running)", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn().slice(0, 2), workingSince: FIXED_TS })} />);
    expect(document.querySelector(".chat-surface-header .ui-badge")).toBeNull();
  });

  it("goal bloqué : état humain et actions rares seulement dans le détail", () => {
    const onGoal = vi.fn();
    const onStop = vi.fn();
    const evs: AgentEvent[] = [
      events.user("Fais X.", FIXED_TS),
      { kind: "goal", goal: { objective: "est un goal avec une tache précise", status: "blocked" }, ts: FIXED_TS + 10 } as unknown as AgentEvent,
    ];
    renderUi(<Chat {...chatProps({ events: evs, onGoal, onStop })} />);
    expect(document.querySelector(".goal-bar")).toBeTruthy();
    expect(screen.getByText(t("goal.status.awaiting"))).toBeTruthy();
    expect(screen.queryByText(t("goal.status.blocked"))).toBeNull();
    expect(screen.queryByTitle(t("goal.stop"))).toBeNull();
    fireEvent.click(screen.getByTitle(t("goal.expand")));
    fireEvent.click(screen.getByTitle(t("goal.stop")));
    expect(onGoal).toHaveBeenCalledWith("clear", undefined, undefined);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".goal-bar")).toBeNull();
  });
});
