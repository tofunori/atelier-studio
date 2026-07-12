// Anatomie du tour (plan 020, étape 3) : le pli de tour est un header
// d'activité structuré — « Activité · N étapes · durée » — dépliable, avec
// les erreurs toujours hors du pli.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
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
  it("tour terminé : header « Activité · 2 étapes · durée », replié par défaut", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".turn-fold") as HTMLButtonElement;
    expect(fold).toBeTruthy();
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.textContent).toContain(t("chat.activity"));
    expect(fold.textContent).toContain(t("chat.activity-steps", { n: 2 }));
    expect(fold.textContent).toContain("1s"); // durée user→done (600 ms → ≥1s)
    // replié : le détail des outils n'est pas rendu
    expect(document.querySelector(".tool-group-row")).toBeNull();
  });

  it("clic déplie le détail des outils ; aria-expanded suit", () => {
    renderUi(<Chat {...chatProps({ events: finishedTurn() })} />);
    const fold = document.querySelector(".turn-fold") as HTMLButtonElement;
    fireEvent.click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".tool-group-row")).toHaveLength(2);
    expect(document.querySelectorAll(".tool-group.worklog.completed")).toHaveLength(2);
    expect(document.querySelectorAll(".worklog-summary")[0]?.textContent).toContain("Read");
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
    expect(document.querySelector(".turn-fold")).toBeTruthy(); // pli présent
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
    expect(document.querySelector(".tool-group.worklog")).toBeNull();
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
    fireEvent.click(document.querySelector(".turn-fold") as HTMLButtonElement);
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
