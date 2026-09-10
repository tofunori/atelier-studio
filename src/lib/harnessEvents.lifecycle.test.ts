import { describe, expect, it } from "vitest";
import type { AgentEvent, HarnessEventMeta } from "./ws";
import { mergeHarnessHistory, reduceHarnessEvent } from "./harnessEvents";

const T0 = 1_800_000_000_000;

function meta(
  eventId: string,
  sequence: number,
  turnId = "turn-1",
  itemId?: string,
): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId,
    provider: "codex",
    threadId: "thread-replay-fixture",
    turnId,
    ...(itemId ? { itemId } : {}),
    sequence,
    ts: T0 + sequence,
    durable: true,
    origin: "provider",
  };
}

function tool(
  eventId: string,
  sequence: number,
  status: string,
  turnId = "turn-1",
  itemId = "item-1",
): AgentEvent {
  return {
    kind: "tool_update",
    id: itemId,
    name: "Read",
    output: status === "completed" ? "fixture output" : "",
    status,
    meta: meta(eventId, sequence, turnId, itemId),
  };
}

function interaction(
  eventId: string,
  sequence: number,
  state: "pending" | "answered",
  turnId = "turn-1",
): AgentEvent {
  return {
    kind: "interaction",
    requestId: "request-1",
    interactionType: "approval",
    title: "Fixture approval",
    state,
    ...(state === "answered" ? { answerSummary: "fixture answer" } : {}),
    meta: meta(eventId, sequence, turnId, "request-1"),
  };
}

function activity(
  eventId: string,
  sequence: number,
  status: "running" | "completed" | "failed",
  turnId = "turn-1",
  itemId = "activity-1",
): AgentEvent {
  return {
    kind: "activity",
    id: itemId,
    phase: "tool",
    title: "Fixture activity",
    status,
    meta: meta(eventId, sequence, turnId, itemId),
  };
}

describe("reduceHarnessEvent — snapshots en retard", () => {
  it("ignore un running plus ancien après le completed du même (turnId, itemId)", () => {
    let list = reduceHarnessEvent([], tool("tool-running", 8, "running"));
    list = reduceHarnessEvent(list, tool("tool-completed", 10, "completed"));
    const before = list;
    const after = reduceHarnessEvent(list, tool("tool-running-replayed", 8, "running"));

    expect(after).toBe(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: "tool_update", status: "completed", output: "fixture output" });
  });

  it("ignore un pending plus ancien après la réponse d’une interaction", () => {
    let list = reduceHarnessEvent([], interaction("approval-pending", 8, "pending"));
    list = reduceHarnessEvent(list, interaction("approval-answered", 10, "answered"));
    const before = list;
    const after = reduceHarnessEvent(list, interaction("approval-pending-replayed", 8, "pending"));

    expect(after).toBe(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: "interaction", state: "answered", answerSummary: "fixture answer" });
  });

  it("ignore une activité running plus ancienne après son completed", () => {
    let list = reduceHarnessEvent([], activity("activity-running", 8, "running"));
    list = reduceHarnessEvent(list, activity("activity-completed", 10, "completed"));
    const before = list;
    const after = reduceHarnessEvent(list, activity("activity-running-replayed", 8, "running"));

    expect(after).toBe(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: "activity", status: "completed" });
  });

  it("applique une mise à jour plus récente et garde les identités bornées au tour", () => {
    let list = reduceHarnessEvent([], tool("tool-1", 4, "completed", "turn-1", "shared-item"));
    list = reduceHarnessEvent(list, tool("tool-2", 5, "running", "turn-2", "shared-item"));
    expect(list).toHaveLength(2);

    const newer = reduceHarnessEvent(list, tool("tool-3", 7, "completed", "turn-2", "shared-item"));
    expect(newer).toHaveLength(2);
    expect(newer[1]).toMatchObject({ status: "completed", meta: { eventId: "tool-3" } });
  });

  it("conserve le remplacement historique pour les journaux sans metadata", () => {
    const running: AgentEvent = {
      kind: "tool_update", id: "legacy-item", name: "Read", output: "", status: "running",
    };
    const completed: AgentEvent = {
      kind: "tool_update", id: "legacy-item", name: "Read", output: "ok", status: "completed",
    };
    let list = reduceHarnessEvent([], running);
    list = reduceHarnessEvent(list, completed);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "completed", output: "ok" });
  });

  it("ne supprime pas une pensée manquante lorsqu’une réponse tardive est déjà matérialisée", () => {
    const current: AgentEvent[] = [
      { kind: "user", text: "fixture prompt", meta: meta("user", 1) },
      { kind: "text", text: "fixture final", meta: meta("answer", 20) },
    ];
    const incoming: AgentEvent[] = [
      { kind: "user", text: "fixture prompt", meta: meta("user", 1) },
      { kind: "thinking_delta", text: "fixture earlier reasoning", meta: meta("reasoning", 3) },
      tool("read", 4, "completed"),
      { kind: "text", text: "fixture final", meta: meta("answer", 20) },
      { kind: "done", ok: true, result: "", meta: meta("done", 21) },
    ];

    const merged = mergeHarnessHistory(current, incoming);
    // `done` closes the restored live block, so the observable replay kind is
    // `thinking` even though the missing source event was `thinking_delta`.
    expect(merged.some((event) => event.kind === "thinking" && event.text.includes("earlier reasoning"))).toBe(true);
    expect(merged.some((event) => event.kind === "tool_update")).toBe(true);
    expect(merged.some((event) => event.kind === "done")).toBe(true);
  });

  it("conserve une pensée ancienne séparée d’un bloc live plus récent", () => {
    const current: AgentEvent[] = [
      { kind: "user", text: "fixture prompt", meta: meta("user", 1) },
      { kind: "thinking_live", text: "fixture late reasoning", meta: meta("late-reasoning", 19) },
      { kind: "text", text: "fixture final", meta: meta("answer", 20) },
    ];
    const incoming: AgentEvent[] = [
      { kind: "user", text: "fixture prompt", meta: meta("user", 1) },
      { kind: "thinking_delta", text: "fixture earlier reasoning", meta: meta("early-reasoning", 3) },
      tool("read", 4, "completed"),
      { kind: "text", text: "fixture final", meta: meta("answer", 20) },
      { kind: "done", ok: true, result: "", meta: meta("done", 21) },
    ];

    const merged = mergeHarnessHistory(current, incoming);
    expect(merged.some((event) => event.kind === "thinking" && event.text.includes("earlier reasoning"))).toBe(true);
    expect(merged.some((event) => event.kind === "thinking" && event.text.includes("late reasoning"))).toBe(true);
    expect(merged.some((event) => event.kind === "thinking_live")).toBe(false);
    expect(merged.some((event) => event.kind === "tool_update")).toBe(true);
  });
});
