import { describe, expect, it } from "vitest";
import type { AgentEvent, HarnessEventMeta } from "../ws";
import { materializeHarnessHistory, reduceHarnessEvent } from "../harnessEvents";
import {
  buildChatTurnViewModels,
  projectChatTimeline,
  timelineRowKey,
} from "./turnViewModel";

const T0 = 1_800_000_000_000;

function meta(eventId: string, turnId: string, sequence: number, provider = "codex"): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId,
    provider,
    threadId: "thread-A",
    turnId,
    sequence,
    ts: T0 + sequence * 100,
    durable: true,
    origin: "provider",
  };
}

describe("chat turn view model", () => {
  it("groupe par turnId et conserve des identités stables", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q1", meta: meta("u1", "turn-1", 1) },
      { kind: "text", text: "R1", meta: meta("a1", "turn-1", 2) },
      { kind: "done", ok: true, result: "", meta: meta("d1", "turn-1", 3) },
      { kind: "user", text: "Q2", meta: meta("u2", "turn-2", 4, "claude") },
    ];
    const turns = buildChatTurnViewModels(events, T0 + 400);
    expect(turns.map((turn) => turn.key)).toEqual(["turn:turn-1", "turn:turn-2"]);
    expect(turns[0].phase).toBe("completed");
    expect(turns[1].provider).toBe("claude");
  });

  it("priorise attente, activité running, reasoning live puis Thinking", () => {
    const user: AgentEvent = { kind: "user", text: "Travaille", ts: T0 };
    const pending: AgentEvent[] = [
      user,
      { kind: "interaction", requestId: "r1", interactionType: "approval", title: "Autoriser ?", state: "pending" },
    ];
    expect(buildChatTurnViewModels(pending, T0)[0].activeState).toMatchObject({ kind: "waiting" });

    const running: AgentEvent[] = [
      user,
      { kind: "tool_update", id: "c1", name: "Bash", output: "", status: "running", detail: "rg src" },
    ];
    expect(buildChatTurnViewModels(running, T0)[0].activeState).toMatchObject({ kind: "activity" });

    const reasoning: AgentEvent[] = [user, { kind: "thinking_live", text: "Je vérifie le parser." }];
    expect(buildChatTurnViewModels(reasoning, T0)[0].activeState).toMatchObject({ kind: "reasoning", live: true });

    expect(buildChatTurnViewModels([user], T0)[0].activeState).toEqual({ kind: "thinking" });
  });

  it("remplace l'action terminée par Thinking dans le même slot actif", () => {
    const user: AgentEvent = { kind: "user", text: "Inspecte", ts: T0 };
    const completed: AgentEvent = {
      kind: "tool_update", id: "read-1", name: "Bash", output: "ok",
      status: "completed", detail: "cat src/App.tsx", input: { command: "cat src/App.tsx" },
    };
    const afterFastTool = buildChatTurnViewModels([user, completed], T0)[0];
    expect(afterFastTool.activeState).toEqual({ kind: "thinking" });
    // Progression (parti pris Hermes) : l'action RÉGLÉE devient tout de suite
    // une ligne durable du transcript, en plus du slot vivant.
    expect(projectChatTimeline([user, completed], [afterFastTool], new Set()).map((row) => row.type)).toEqual([
      "event", "active-turn-header", "event", "active-turn-tail",
    ]);

    const backToThinking = buildChatTurnViewModels([
      user,
      completed,
      { kind: "tool", name: "__thinking" },
    ], T0)[0];
    expect(backToThinking.activeState).toEqual({ kind: "thinking" });

    const nextFastTool = buildChatTurnViewModels([
      user,
      completed,
      { kind: "tool", name: "__thinking" },
      { ...completed, id: "read-2", detail: "cat src/Chat.tsx", input: { command: "cat src/Chat.tsx" } },
    ], T0)[0];
    expect(nextFastTool.activeState).toEqual({ kind: "thinking" });
  });

  it("ne produit jamais un fallback Thinking pendant une réponse en streaming", () => {
    const turns = buildChatTurnViewModels([
      { kind: "user", text: "Question", ts: T0 },
      { kind: "streaming", text: "Réponse en cours", ts: T0 + 100 },
    ], T0);
    expect(turns[0].phase).toBe("final_answer");
    expect(turns[0].activeState).toMatchObject({ kind: "answering" });
  });

  it("ne crée aucune ligne virtuelle pour started et les événements techniques", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Premier message", ts: T0 },
      { kind: "started", ts: T0 + 10 },
      { kind: "heartbeat", elapsedMs: 20, tokens: 0, ts: T0 + 20 },
      { kind: "usage", usage: { context: 10, output: 0, cost: null, turns: 1 }, ts: T0 + 30 },
    ];
    const turn = buildChatTurnViewModels(events, T0 + 30)[0];
    const rows = projectChatTimeline(events, [turn], new Set());

    expect(rows.filter((row) => row.type === "event").map((row) => row.event.kind)).toEqual(["user"]);
    expect(rows.map((row) => row.type)).toEqual(["event", "active-turn-header", "active-turn-tail"]);
  });

  it("ferme le segment d'un outil running quand une narration plus récente arrive", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Question", ts: T0 },
      { kind: "tool_update", id: "c1", name: "Bash", output: "", status: "inProgress", detail: "npm test" },
      { kind: "streaming", text: "Je laisse les tests se terminer.", ts: T0 + 100 },
    ];
    const turn = buildChatTurnViewModels(events, T0)[0];
    expect(turn.phase).toBe("final_answer");
    expect(turn.activeState).toEqual({ kind: "answering", eventIndex: 2 });
    expect(turn.activeActionGroups).toHaveLength(0);
    expect(projectChatTimeline(events, [turn], new Set()).map((row) => row.type)).toEqual([
      "event", "active-turn-header", "event", "event", "active-turn-tail",
    ]);
  });

  it("reprend Thinking après une narration intermédiaire et place l'activité courante en bas", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Question", ts: T0 },
      { kind: "text", text: "Je vérifie les données.", ts: T0 + 100 },
      { kind: "tool", name: "__thinking" },
    ];
    const turn = buildChatTurnViewModels(events, T0)[0];
    expect(turn.phase).toBe("prework");
    expect(turn.activeState).toEqual({ kind: "thinking" });
    // La sentinelle `__thinking` (outil sans contenu) reste masquée : elle se
    // lisait « réflexion… » alors que rien n'était dit.
    expect(projectChatTimeline(events, [turn], new Set()).map((row) => row.type)).toEqual([
      "event",
      "active-turn-header",
      "event",
      "active-turn-tail",
    ]);
  });

  it("garde l'action concrète prioritaire sur le reasoning plus récent", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Inspecte", ts: T0 },
      { kind: "thinking", text: "Premier point", ts: T0 + 10 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "thinking_live", text: "Deuxième point", ts: T0 + 20 },
    ];
    const turn = buildChatTurnViewModels(events, T0)[0];
    expect(turn.reasoningTexts).toEqual(["Premier point", "Deuxième point"]);
    const rows = projectChatTimeline(events, [turn], new Set());
    expect(rows.filter((row) => row.type === "active-turn-header")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "active-turn-tail")).toHaveLength(1);
    // Le raisonnement reste à sa place chronologique dans le fil (il précède
    // la réponse et se lit au-dessus d'elle) ; seule l'action EN COURS est
    // hissée dans la queue du tour.
    // Tout se dépose à sa place chronologique — y compris l'action en cours,
    // dont la LIGNE tique (elle n'est plus hissée dans une queue).
    const visibleWork = rows.filter((row) => row.type === "event" && ["thinking", "thinking_live", "tool"].includes(row.event.kind));
    expect(visibleWork.map((row) => (row as { event: { kind: string } }).event.kind))
      .toEqual(["thinking", "tool", "thinking_live"]);
    expect(turn.activeActionGroups).toHaveLength(1);
    expect(turn.activeState).toMatchObject({ kind: "activity", eventIndex: 2, live: true });
  });

  it("garde une seule activité vivante puis fixe les actions à la prochaine narration", () => {
    const base: AgentEvent[] = [
      { kind: "user", text: "Analyse", ts: T0 },
      { kind: "text", text: "Je lis les sources puis je produis une figure.", ts: T0 + 10 },
      {
        kind: "tool_update", id: "read-1", name: "Bash", output: "", status: "completed",
        detail: "sed -n '1,80p' src/App.tsx", input: { command: "sed -n '1,80p' src/App.tsx" },
      },
      { kind: "tool", name: "__thinking" },
    ];
    const betweenActions = buildChatTurnViewModels(base, T0)[0];
    expect(betweenActions.activeState).toEqual({ kind: "thinking" });
    // Progression (parti pris Hermes) : l'action réglée est déjà une ligne du
    // transcript, sans attendre la narration suivante.
    expect(projectChatTimeline(base, [betweenActions], new Set()).some((row) => (
      row.type === "event" && row.event.kind === "tool_update" && row.event.id === "read-1"
    ))).toBe(true);

    const narrated: AgentEvent[] = [
      ...base,
      { kind: "text", text: "La lecture est terminée; je passe à la figure.", ts: T0 + 20 },
      { kind: "tool", name: "__thinking" },
    ];
    const afterNarration = buildChatTurnViewModels(narrated, T0)[0];
    expect(projectChatTimeline(narrated, [afterNarration], new Set()).some((row) => (
      row.type === "event" && row.event.kind === "tool_update" && row.event.id === "read-1"
    ))).toBe(true);

    const generating: AgentEvent[] = [
      ...base,
      {
        kind: "tool_update", id: "image-1", name: "image_generation", output: "",
        status: "inProgress", detail: "Scientific map", source: "codex",
      },
      { kind: "thinking_live", text: "Je prépare aussi la légende." },
    ];
    const whileGenerating = buildChatTurnViewModels(generating, T0)[0];
    expect(whileGenerating.activeState).toMatchObject({ kind: "activity", eventIndex: 4, live: true });
    expect(whileGenerating.activeActionGroups).toHaveLength(1);

    const completedGeneration: AgentEvent[] = [
      ...base,
      {
        kind: "tool_update", id: "image-1", name: "image_generation", output: "/tmp/map.png",
        status: "completed", detail: "Scientific map", source: "codex",
      },
      { kind: "tool", name: "__thinking" },
    ];
    const afterGeneration = buildChatTurnViewModels(completedGeneration, T0)[0];
    expect(afterGeneration.activeState).toEqual({ kind: "thinking" });
    // Progression : la génération terminée se dépose immédiatement (l'image
    // est visible sans attendre la narration suivante).
    expect(projectChatTimeline(completedGeneration, [afterGeneration], new Set()).some((row) => (
      row.type === "event" && row.event.kind === "tool_update" && row.event.id === "image-1"
    ))).toBe(true);
  });

  it("ancre les updates d'un outil avant la narration qui ferme son segment", () => {
    const start: AgentEvent = {
      kind: "tool", name: "Bash", detail: "npm test",
      meta: { ...meta("tool-start", "turn-1", 2), itemId: "call-1" },
    };
    const update: AgentEvent = {
      kind: "tool_update", name: "Bash", id: "call-1", detail: "npm test",
      output: "ok", status: "completed",
      meta: { ...meta("tool-done", "turn-1", 4), itemId: "call-1" },
    };
    const events: AgentEvent[] = [
      { kind: "user", text: "Teste", meta: meta("user", "turn-1", 1) },
      start,
      { kind: "text", text: "Les tests sont lancés.", meta: meta("commentary", "turn-1", 3) },
      update,
    ];
    const turn = buildChatTurnViewModels(events, T0)[0];
    const rows = projectChatTimeline(events, [turn], new Set());
    const eventRows = rows.filter((row) => row.type === "event");
    expect(eventRows.map((row) => row.event.kind)).toEqual(["user", "tool", "tool_update", "text"]);
    expect(turn.activeActionGroups).toHaveLength(0);
    expect(turn.activeState).toEqual({ kind: "thinking" });
  });

  it.each(["view_image", "open_image", "image /tmp/legacy.png"])(
    "traite %s comme une unité image autonome dans le tour actif",
    (imageName) => {
      const events: AgentEvent[] = [
        { kind: "user", text: "Inspecte", ts: T0 },
        { kind: "tool", name: "Bash", detail: "pwd" },
        { kind: "tool", name: imageName, detail: "/tmp/legacy.png" },
        { kind: "tool", name: "Bash", detail: "npm test" },
      ];
      const turn = buildChatTurnViewModels(events, T0)[0];
      expect(turn.activeActionGroups).toHaveLength(1);
      expect(turn.activeActionGroups[0].actions[0]).toMatchObject({ name: "Bash", detail: "npm test" });
      const visibleToolNames = projectChatTimeline(events, [turn], new Set()).flatMap((row) => {
        if (row.type !== "event") return [];
        return row.event.kind === "tool" || row.event.kind === "tool_update" ? [row.event.name] : [];
      });
      // L'unité image reste autonome ; l'outil en cours se dépose lui aussi
      // dans le fil (sa ligne tique) au lieu d'être hissé dans une queue.
      expect(visibleToolNames).toEqual(["Bash", imageName, "Bash"]);
    },
  );

  it("garde les agents parallèles visibles hors du Thinking actif", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Recherche", ts: T0 },
      { kind: "text", text: "Je lance deux axes en parallèle.", ts: T0 + 10 },
      {
        kind: "tool_update", id: "spawn-1", name: "agent:spawnAgent", output: "", status: "completed",
        agentActivity: {
          tool: "spawnAgent", receiverThreadIds: ["child-1"],
          agentsStates: { "child-1": { status: "running", message: null } },
        },
      },
      { kind: "tool", name: "__thinking" },
    ];
    const turn = buildChatTurnViewModels(events, T0)[0];
    const rows = projectChatTimeline(events, [turn], new Set());
    expect(rows.some((row) => row.type === "event" && row.event.kind === "tool_update" && row.event.agentActivity != null)).toBe(true);
    expect(turn.activeActionGroups).toHaveLength(0);
    expect(turn.activeState).toEqual({ kind: "thinking" });
  });

  it("distingue commentary et réponse finale pour le pli terminé", () => {
    const commentaryThenTool: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "text", text: "Je commence.", ts: T0 + 100 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const first = buildChatTurnViewModels(commentaryThenTool, null)[0];
    expect(first.finalAssistantIndex).toBeNull();
    expect(first.fold).toMatchObject({ start: 1, end: 3 });

    const toolThenFinal: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: "Terminé.", ts: T0 + 400 },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const second = buildChatTurnViewModels(toolThenFinal, null)[0];
    expect(second.finalAssistantIndex).toBe(2);
    expect(second.fold).toMatchObject({ start: 1, end: 2 });
    expect(projectChatTimeline(toolThenFinal, [second], new Set()).map((row) => row.type)).toEqual([
      "event", "fold", "event", "event",
    ]);
  });

  // Réponse longue enterrée par un outil traînant (analyse gooey-pi, 2026-08-25).
  // La règle « dernier item visible » déclasse la réponse dès qu'un outil la
  // suit : un TodoWrite de fin de tour faisait disparaître un livrable entier
  // derrière « A travaillé pendant Ns ». Le repli pèse désormais les runs
  // narratifs au lieu d'entretenir une liste d'exceptions par nom d'outil.
  const LONGUE = "Voici la réponse complète. ".repeat(40);

  it("une réponse longue survit à un outil traînant", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: LONGUE, ts: T0 + 400 },
      { kind: "tool", name: "TodoWrite", detail: "3 tâches" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const turn = buildChatTurnViewModels(events, null)[0];
    expect(turn.finalAssistantIndex).toBe(2);
    expect(turn.fold).toMatchObject({ start: 1, end: 2 });
    // pli fermé : la réponse est bien projetée, pas avalée
    const rows = projectChatTimeline(events, [turn], new Set());
    expect(rows.some((row) => row.type === "event" && row.event.kind === "text")).toBe(true);
  });

  it("un commentaire court reste avalé par le pli", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "text", text: "Je regarde.", ts: T0 + 100 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const turn = buildChatTurnViewModels(events, null)[0];
    expect(turn.finalAssistantIndex).toBeNull();
  });

  it("à poids égal, le run narratif le plus tardif est la réponse", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "text", text: LONGUE, ts: T0 + 100 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: LONGUE, ts: T0 + 200 },
      { kind: "tool", name: "TodoWrite", detail: "3 tâches" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const turn = buildChatTurnViewModels(events, null)[0];
    expect(turn.finalAssistantIndex).toBe(3);
  });

  it("le raisonnement ne coupe pas le run narratif", () => {
    // Claude intercale des résumés de raisonnement au milieu de sa réponse :
    // les deux moitiés sont UN propos, commencé avant la pensée — pas deux
    // runs dont le second enterrerait le premier dans le pli.
    const moitie = "Voici la moitié de la réponse. ".repeat(8);
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: moitie, ts: T0 + 100 },
      { kind: "thinking", text: "je réfléchis", ts: T0 + 150 },
      { kind: "text", text: moitie, ts: T0 + 200 },
      { kind: "tool", name: "TodoWrite", detail: "3 tâches" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const turn = buildChatTurnViewModels(events, null)[0];
    expect(turn.finalAssistantIndex).toBe(2);
  });

  it("un outil au milieu coupe le run narratif au lieu de l'agréger", () => {
    // deux morceaux sous le plancher ; leur somme le dépasse, mais ce sont deux
    // runs distincts — aucun ne devient la réponse finale.
    const morceau = "x".repeat(130);
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "text", text: morceau, ts: T0 + 100 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: morceau, ts: T0 + 200 },
      { kind: "tool", name: "TodoWrite", detail: "3 tâches" },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ];
    const turn = buildChatTurnViewModels(events, null)[0];
    expect(turn.finalAssistantIndex).toBeNull();
  });

  // Finition checklist (2026-08-22) : le plan `todos` est l'état du travail,
  // pas un détail d'exécution — il doit rester visible sous un pli fermé.
  it("la checklist `todos` survit au pli fermé d'un tour terminé", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "todos", items: [
        { text: "lire", completed: true },
        { text: "corriger", completed: false, active: true },
      ] },
      { kind: "text", text: "Terminé.", ts: T0 + 400 },
      { kind: "done", ok: true, result: "", ts: T0 + 500 },
    ] as AgentEvent[];
    const turn = buildChatTurnViewModels(events, null)[0];
    // pli fermé (openFolds vide) : la ligne todos est quand même projetée
    const rows = projectChatTimeline(events, [turn], new Set());
    const kinds = rows.map((row) => (row.type === "event" ? (row.event as AgentEvent).kind : row.type));
    expect(kinds).toContain("todos");
    // et une seule fois — pas de doublon quand le pli est OUVERT
    const openKinds = projectChatTimeline(events, [turn], new Set([turn.fold!.key]))
      .map((row) => (row.type === "event" ? (row.event as AgentEvent).kind : row.type));
    expect(openKinds.filter((kind) => kind === "todos")).toHaveLength(1);
  });

  it("une annotation d'attente après le texte ne l'avale pas dans le repli", () => {
    // Régression vécue (2026-08-15) : le marqueur « tour bloqué, attend une
    // précision » émis APRÈS le texte final le déclassait en texte
    // intermédiaire — la réponse disparaissait dans « A travaillé pendant Ns ».
    for (const marqueur of [
      { kind: "tool" as const, name: "__waiting", detail: "quelle heure ?" },
      // nom historique (2026-08-13→15), présent dans les journaux de l'époque
      { kind: "tool" as const, name: "en attente : quelle heure ?" },
    ]) {
      const events: AgentEvent[] = [
        { kind: "user", text: "allo", ts: T0 },
        { kind: "tool", name: "Read", detail: "a.ts" },
        { kind: "text", text: "Allo ! Que puis-je faire ?", ts: T0 + 400 },
        marqueur,
        { kind: "done", ok: true, result: "", ts: T0 + 500 },
      ];
      const turn = buildChatTurnViewModels(events, null)[0];
      expect(turn.finalAssistantIndex).toBe(2);
      expect(turn.fold).toMatchObject({ start: 1, end: 2 });
    }
  });

  it("produit Worked/Stopped/Failed depuis le terminal et sa durée", () => {
    const completed = buildChatTurnViewModels([
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: "R", ts: T0 + 800 },
      { kind: "done", ok: true, result: "", ts: T0 + 1_000 },
    ], null)[0];
    expect(completed.phase).toBe("completed");
    expect(completed.durationMs).toBe(1_000);
    expect(completed.fold).toMatchObject({ start: 1, end: 2, ms: 1_000 });

    const stopped = buildChatTurnViewModels([
      { kind: "user", text: "Q", ts: T0 },
      { kind: "done", ok: false, result: "interrupted by user", ts: T0 + 500 },
    ], null)[0];
    expect(stopped.phase).toBe("stopped");
    expect(stopped.fold).toMatchObject({
      start: 1, end: 1, hasDetail: false, ms: 500, status: "stopped",
    });
    expect(projectChatTimeline([
      { kind: "user", text: "Q", ts: T0 },
      { kind: "done", ok: false, result: "interrupted by user", ts: T0 + 500 },
    ], [stopped], new Set()).map((row) => row.type)).toEqual(["event", "fold", "event"]);

    const failed = buildChatTurnViewModels([
      { kind: "user", text: "Q", ts: T0 },
      { kind: "error", message: "provider unavailable" },
    ], null)[0];
    expect(failed.phase).toBe("failed");
  });

  it("la projection ferme le pli sans supprimer la réponse finale", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Q", ts: T0 },
      { kind: "tool", name: "Read", detail: "a.ts" },
      { kind: "text", text: "R", ts: T0 + 800 },
      { kind: "done", ok: true, result: "", ts: T0 + 1_000 },
    ];
    const turns = buildChatTurnViewModels(events, null);
    const rows = projectChatTimeline(events, turns, new Set());
    expect(rows.map((row) => row.type)).toEqual(["event", "fold", "event", "event"]);
    expect(rows.find((row) => row.type === "event" && row.event.kind === "text")).toBeTruthy();
  });

  it("projette pareil en live et replay avec livraison hors ordre et itemId réutilisé", () => {
    const tool = (
      eventId: string,
      turnId: string,
      sequence: number,
      status: "running" | "completed",
      output: string,
    ): AgentEvent => ({
      kind: "tool_update",
      id: "call-1",
      name: "Bash",
      detail: "npx vitest run",
      status,
      output,
      meta: { ...meta(eventId, turnId, sequence), itemId: "call-1" },
    });
    const wire: AgentEvent[] = [
      { kind: "user", text: "Tour 1", meta: meta("u1", "turn-1", 1) },
      tool("t1-running", "turn-1", 2, "running", ""),
      { kind: "done", ok: true, result: "", meta: meta("d1", "turn-1", 4) },
      // État terminal de l'outil livré après done, mais portant sa sequence 3.
      tool("t1-done", "turn-1", 3, "completed", "ok"),
      { kind: "user", text: "Tour 2", meta: meta("u2", "turn-2", 5) },
      tool("t2-done", "turn-2", 6, "completed", "ok"),
      { kind: "done", ok: true, result: "", meta: meta("d2", "turn-2", 7) },
    ];
    const live = wire.reduce<AgentEvent[]>((current, event) => reduceHarnessEvent(current, event), []);
    const replay = materializeHarnessHistory(wire);
    expect(replay).toEqual(live);

    const liveTurns = buildChatTurnViewModels(live, null);
    const replayTurns = buildChatTurnViewModels(replay, null);
    expect(replayTurns).toEqual(liveTurns);
    expect(liveTurns.map((turn) => turn.key)).toEqual(["turn:turn-1", "turn:turn-2"]);
    expect(liveTurns.map((turn) => turn.actionGroups[0]?.key)).toEqual([
      "tools:turn-1:call-1",
      "tools:turn-2:call-1",
    ]);
  });
});

// Clés de rangées virtuelles (2026-08-25). LegendList consomme `row.key` : si
// elle dérive de la POSITION, les deux `splice` que `reduceHarnessEvent` fait
// à chaque done/error (bulle streaming vide, thinking_live vide) décalent tout
// ce qui suit, remontent les rangées et referment les panneaux d'outils
// dépliés. Même piège que `partKey` chez gooey-pi.
describe("clés de rangées de la timeline", () => {
  const reponse: AgentEvent = { kind: "text", text: "La réponse.", meta: meta("a1", "turn-1", 3) };
  const question: AgentEvent = { kind: "user", text: "Q", meta: meta("u1", "turn-1", 1) };
  const fin: AgentEvent = { kind: "done", ok: true, result: "", meta: meta("d1", "turn-1", 4) };

  const cleDeLaReponse = (events: AgentEvent[]) => {
    const turns = buildChatTurnViewModels(events, null);
    const plisOuverts = new Set(turns.flatMap((turn) => (turn.fold ? [turn.fold.key] : [])));
    const row = projectChatTimeline(events, turns, plisOuverts)
      .find((candidate) => candidate.type === "event" && candidate.event === reponse);
    return row ? timelineRowKey(row) : null;
  };

  it("la clé d'une rangée suit l'identité de l'événement, pas sa position", () => {
    // le MÊME événement, une fois en position 1, une fois en position 2
    const court = cleDeLaReponse([question, reponse, fin]);
    const long = cleDeLaReponse([
      question,
      { kind: "thinking", text: "je réfléchis", meta: meta("t1", "turn-1", 2) },
      reponse,
      fin,
    ]);
    expect(court).toBeTruthy();
    expect(court).toBe(long);
  });

  it("aucune collision de clés sur un fil réaliste", () => {
    const events: AgentEvent[] = [
      question,
      { kind: "thinking", text: "je réfléchis", meta: meta("t1", "turn-1", 2) },
      { kind: "tool_update", id: "r1", name: "Read", detail: "a.ts", input: {}, output: "ok", status: "completed", meta: meta("k1", "turn-1", 3) },
      { kind: "tool_update", id: "r2", name: "Bash", detail: "ls", input: {}, output: "ok", status: "completed", meta: meta("k2", "turn-1", 4) },
      { kind: "todos", items: [{ text: "lire", completed: true }], meta: meta("td1", "turn-1", 5) },
      reponse,
      fin,
      { kind: "user", text: "Q2", meta: meta("u2", "turn-2", 6) },
      { kind: "text", text: "R2", meta: meta("a2", "turn-2", 7) },
      { kind: "done", ok: true, result: "", meta: meta("d2", "turn-2", 8) },
    ] as AgentEvent[];
    const turns = buildChatTurnViewModels(events, null);
    for (const plis of [new Set<string>(), new Set(turns.flatMap((t) => (t.fold ? [t.fold.key] : [])))]) {
      const cles = projectChatTimeline(events, turns, plis).map(timelineRowKey);
      expect(new Set(cles).size, `collision parmi ${cles.length} rangées`).toBe(cles.length);
    }
  });
});
