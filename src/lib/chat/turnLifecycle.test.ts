import { describe, expect, it } from "vitest";
import type { AgentEvent, HarnessEventMeta } from "../ws";
import {
  dedupeLifecycleIndexes,
  deriveTurnLifecycle,
  lifecycleEventIdentity,
} from "./turnLifecycle";

const T0 = 1_800_000_000_000;

function meta(eventId: string, turnId: string, sequence: number, itemId?: string, provider = "codex"): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId,
    provider,
    threadId: "thread-a",
    turnId,
    ...(itemId ? { itemId } : {}),
    sequence,
    ts: T0 + sequence * 10,
    durable: true,
    origin: "provider",
  };
}

function update(
  eventId: string,
  turnId: string,
  itemId: string,
  sequence: number,
  status: string,
  over: Partial<Extract<AgentEvent, { kind: "tool_update" }>> = {},
): AgentEvent {
  return {
    kind: "tool_update",
    id: itemId,
    name: "Bash",
    output: "",
    status,
    meta: meta(eventId, turnId, sequence, itemId),
    ...over,
  };
}

describe("turn lifecycle projection", () => {
  it("scopes an item by turn and de-duplicates only the authoritative event id", () => {
    const first = update("event-1", "turn-a", "call-1", 1, "running");
    const second = update("event-2", "turn-b", "call-1", 2, "completed");
    expect(lifecycleEventIdentity(first, 0)).toBe("turn-a:call-1");
    expect(lifecycleEventIdentity(second, 1)).toBe("turn-b:call-1");
    expect(dedupeLifecycleIndexes([first, { ...first }, second], [0, 1, 2])).toEqual([0, 2]);
  });

  it("collapses running and completed snapshots into one lifecycle group", () => {
    const events: AgentEvent[] = [
      update("start", "turn-a", "call-1", 1, "running"),
      update("done", "turn-a", "call-1", 2, "completed", { output: "ok" }),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.actionGroups).toHaveLength(1);
    expect(lifecycle.actionGroups[0]?.indexes).toEqual([0, 1]);
    expect(lifecycle.runningTools).toHaveLength(0);
    expect(lifecycle.activeState).toEqual({ kind: "thinking" });
  });

  it("keeps explicit background tools alive after an assistant narration", () => {
    const events: AgentEvent[] = [
      { kind: "text", text: "Je lance la commande.", meta: meta("text", "turn-a", 1) },
      update("running", "turn-a", "call-1", 2, "inProgress"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toMatchObject({ kind: "activity", eventIndex: 1, live: true });
    expect(lifecycle.runningTools).toHaveLength(1);
  });

  it("orders parallel live candidates by provider sequence, not array position", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Travaille", meta: meta("user", "turn-a", 1) },
      update("newer", "turn-a", "call-newer", 4, "running"),
      update("older", "turn-a", "call-older", 3, "running"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.runningTools
      .filter((action): action is Extract<AgentEvent, { kind: "tool_update" }> => action.kind === "tool_update")
      .map((action) => action.id)).toEqual(["call-newer", "call-older"]);
    expect(lifecycle.activeState).toMatchObject({ kind: "activity", eventIndex: 1 });
  });

  it("does not let an older completion regress a newer running snapshot", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Travaille", meta: meta("user", "turn-a", 1) },
      update("newer-running", "turn-a", "call-1", 4, "running"),
      update("older-done", "turn-a", "call-1", 2, "completed"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.runningTools
      .filter((action): action is Extract<AgentEvent, { kind: "tool_update" }> => action.kind === "tool_update")
      .map((action) => action.id)).toEqual(["call-1"]);
    expect(lifecycle.activeState).toMatchObject({ kind: "activity", eventIndex: 1 });
  });

  it("returns to thinking after a completed tool even without provider reasoning", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Inspecte", meta: meta("user", "turn-a", 1) },
      update("done", "turn-a", "call-1", 2, "completed"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.phase).toBe("prework");
    expect(lifecycle.activeState).toEqual({ kind: "thinking" });
  });

  it("counts parallel tools and child agents in one activity state", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Travaille", meta: meta("user", "turn-a", 1) },
      update("tool-a", "turn-a", "call-a", 2, "running"),
      update("tool-b", "turn-a", "call-b", 3, "running"),
      update("spawn", "turn-a", "spawn", 4, "completed", {
        name: "spawn_agent",
        agentActivity: {
          tool: "spawn_agent",
          receiverThreadIds: ["child-1"],
          agentsStates: { "child-1": { status: "running" } },
        },
      }),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2, 3], { turnId: "turn-a", active: true });
    expect(lifecycle.runningTools).toHaveLength(2);
    expect(lifecycle.runningAgents.map((agent) => agent.id)).toEqual(["child-1"]);
    expect(lifecycle.activeState).toMatchObject({ kind: "activity" });
  });

  it("keeps a coordination call live when child states are not supplied", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Délègue", meta: meta("user", "turn-a", 1) },
      update("spawn", "turn-a", "spawn", 2, "running", {
        name: "spawn_agent",
        agentActivity: {
          tool: "spawn_agent",
          receiverThreadIds: ["child-1"],
          agentsStates: {},
        },
      }),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.runningTools.map((action) => action.name)).toEqual(["spawn_agent"]);
    expect(lifecycle.runningAgents).toEqual([]);
    expect(lifecycle.activeState).toMatchObject({ kind: "activity" });
  });

  it("treats a running generic activity and image action as live work", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Prépare", meta: meta("user", "turn-a", 1) },
      { kind: "activity", id: "search-1", title: "Recherche", status: "running", meta: meta("activity", "turn-a", 2, "search-1") },
      update("image", "turn-a", "image-1", 3, "running", { name: "image_generation" }),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toMatchObject({ kind: "activity" });
    expect(lifecycle.runningTools.map((action) => action.name)).toEqual(["image_generation"]);
  });

  it("keeps a status-bearing activity alive after later narration", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Prépare", meta: meta("user", "turn-a", 1) },
      { kind: "activity", id: "search-1", title: "Recherche", status: "running", meta: meta("activity", "turn-a", 2, "search-1") },
      { kind: "text", text: "Je poursuis pendant la recherche.", meta: meta("text", "turn-a", 3) },
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toMatchObject({ kind: "activity", eventIndex: 1 });
  });

  it("reduces activity snapshots so a completed item cannot leave stale running work", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Prépare", meta: meta("user", "turn-a", 1) },
      { kind: "activity", id: "search-1", title: "Recherche", status: "running", meta: meta("activity-running", "turn-a", 2, "search-1") },
      { kind: "activity", id: "search-1", title: "Recherche", status: "completed", meta: meta("activity-completed", "turn-a", 4, "search-1") },
      // Replayed frames can arrive after the settled snapshot in the array;
      // provider sequence still keeps the completed item authoritative.
      { kind: "activity", id: "search-1", title: "Recherche", status: "running", meta: meta("activity-replayed", "turn-a", 3, "search-1") },
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2, 3], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toEqual({ kind: "thinking" });
    expect(lifecycle.runningTools).toEqual([]);
    expect(lifecycle.latestActivityIndex).toBe(2);
  });

  it("keeps the newer running activity when a completion snapshot is stale", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Prépare", meta: meta("user", "turn-a", 1) },
      { kind: "activity", id: "search-1", title: "Recherche", status: "running", meta: meta("activity-running", "turn-a", 4, "search-1") },
      { kind: "activity", id: "search-1", title: "Recherche", status: "completed", meta: meta("activity-stale", "turn-a", 2, "search-1") },
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toMatchObject({ kind: "activity", eventIndex: 1 });
    expect(lifecycle.latestActivityIndex).toBe(1);
  });

  it("waits for a current interaction and clears it when answered", () => {
    const pending: AgentEvent = {
      kind: "permission", requestId: "approval", toolName: "Bash", answered: null,
      meta: meta("pending", "turn-a", 2, "approval"),
    };
    const answered: AgentEvent = { ...pending, answered: true, meta: meta("answered", "turn-a", 3, "approval") };
    const waiting = deriveTurnLifecycle([pending], [0], { turnId: "turn-a", active: true });
    const resumed = deriveTurnLifecycle([pending, answered], [0, 1], { turnId: "turn-a", active: true });
    expect(waiting.activeState).toMatchObject({ kind: "waiting", eventIndex: 0 });
    expect(resumed.activeState).toEqual({ kind: "thinking" });
  });

  it("settles a turn and does not expose stale running tools or agents", () => {
    const events: AgentEvent[] = [
      update("running", "turn-a", "call-1", 1, "running"),
      update("spawn", "turn-a", "spawn", 2, "completed", {
        name: "spawn_agent",
        agentActivity: {
          tool: "spawn_agent",
          receiverThreadIds: ["child-1"],
          agentsStates: { "child-1": { status: "running" } },
        },
      }),
      { kind: "done", ok: true, result: "ok", meta: meta("done", "turn-a", 3) },
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.state).toMatchObject({ kind: "terminal", status: "completed" });
    expect(lifecycle.activeState).toBeNull();
    expect(lifecycle.runningTools).toEqual([]);
    expect(lifecycle.runningAgents).toEqual([]);
  });

  it("keeps a failed tool in the active turn without turning the turn failed", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Teste", meta: meta("user", "turn-a", 1) },
      update("failed", "turn-a", "call-1", 2, "failed", { exitCode: 1 }),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.phase).toBe("prework");
    expect(lifecycle.activeState).toEqual({ kind: "thinking" });
  });

  it("uses streaming as the writing state", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Réponds", meta: meta("user", "turn-a", 1) },
      { kind: "streaming", text: "Réponse", meta: meta("stream", "turn-a", 2) },
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1], { turnId: "turn-a", active: true });
    expect(lifecycle.phase).toBe("final_answer");
    expect(lifecycle.activeState).toEqual({ kind: "answering", eventIndex: 1 });
  });

  it("returns to thinking after a completed tool even when an earlier item streamed", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Réponds", meta: meta("user", "turn-a", 1) },
      { kind: "streaming", text: "Je commence", meta: meta("stream", "turn-a", 2) },
      update("done", "turn-a", "call-1", 3, "completed"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toEqual({ kind: "thinking" });
  });

  it("uses processing for an unknown current tool status after narration", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Inspecte", meta: meta("user", "turn-a", 1) },
      { kind: "text", text: "Je vérifie.", meta: meta("text", "turn-a", 2) },
      update("unknown", "turn-a", "call-1", 3, "awaiting-provider"),
    ];
    const lifecycle = deriveTurnLifecycle(events, [0, 1, 2], { turnId: "turn-a", active: true });
    expect(lifecycle.activeState).toEqual({ kind: "processing" });
  });

  it.each(["stopped", "interrupted", "cancelled", "aborted"])(
    "maps a done status %s to a stopped terminal",
    (status) => {
      const done = { kind: "done", ok: false, result: "", status, meta: meta(`done-${status}`, "turn-a", 2) } as AgentEvent;
      const lifecycle = deriveTurnLifecycle(
        [{ kind: "user", text: "Arrête", meta: meta("user", "turn-a", 1) }, done],
        [0, 1],
        { turnId: "turn-a", active: true },
      );
      expect(lifecycle.terminal?.status).toBe("stopped");
      expect(lifecycle.activeState).toBeNull();
    },
  );
});
