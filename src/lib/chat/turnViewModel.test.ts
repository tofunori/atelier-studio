import { describe, expect, it } from "vitest";
import type { AgentEvent, HarnessEventMeta } from "../ws";
import { materializeHarnessHistory, reduceHarnessEvent } from "../harnessEvents";
import {
  buildChatTurnViewModels,
  projectChatTimeline,
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
    expect(projectChatTimeline([user, completed], [afterFastTool], new Set()).map((row) => row.type)).toEqual([
      "event", "active-turn-header", "active-turn-tail",
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
    const visibleWork = rows.filter((row) => row.type === "event" && ["thinking", "thinking_live", "tool"].includes(row.event.kind));
    expect(visibleWork).toHaveLength(0);
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
    expect(projectChatTimeline(base, [betweenActions], new Set()).some((row) => (
      row.type === "event" && row.event.kind === "tool_update" && row.event.id === "read-1"
    ))).toBe(false);

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
    expect(projectChatTimeline(completedGeneration, [afterGeneration], new Set()).some((row) => (
      row.type === "event" && row.event.kind === "tool_update" && row.event.id === "image-1"
    ))).toBe(false);
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
      expect(visibleToolNames).toEqual(["Bash", imageName]);
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
