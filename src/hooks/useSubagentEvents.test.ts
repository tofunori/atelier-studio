import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../lib/ws";
import { createThreadEventStore } from "../lib/threadEventStore";
import { subagentHistoryInternals, useSubagentEvents } from "./useSubagentEvents";

const childId = "child-1";

function activity(status: string, ts: number): AgentEvent {
  return {
    kind: "tool_update",
    id: `activity-${ts}`,
    name: "agent:activity",
    output: "",
    status,
    ts,
    agentActivity: {
      tool: "spawn_agent",
      receiverThreadIds: [childId],
      agentsStates: { [childId]: { status } },
      agentThreadId: childId,
      agentPath: "/root/research",
    },
  };
}

describe("useSubagentEvents", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the parent group synchronized while no detail panel is mounted", () => {
    vi.useFakeTimers();
    const store = createThreadEventStore({ parent: [], [childId]: [] });
    const send = vi.fn();
    const ws = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    const parentEvents = [activity("running", 10)];
    const { result } = renderHook(() => useSubagentEvents({
      store,
      ws,
      parentThreadId: "parent",
      parentEvents,
      parentWorkingSince: 10,
    }));

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: "getAgentHistory",
      parentThreadId: "parent",
      agentThreadId: childId,
    });
    expect(result.current.get(childId)).toEqual([]);

    act(() => vi.advanceTimersByTime(5_000));
    expect(send).toHaveBeenCalledTimes(3);

    act(() => store.update((previous) => ({
      ...previous,
      [childId]: [{ kind: "done", ok: true, result: "finished", ts: 20 }],
    })));
    expect(result.current.get(childId)).toEqual([
      expect.objectContaining({ kind: "done", result: "finished" }),
    ]);
    const afterTerminal = send.mock.calls.length;
    act(() => vi.advanceTimersByTime(10_000));
    expect(send).toHaveBeenCalledTimes(afterTerminal);
  });

  it("gets one final snapshot when the parent settles, then stops", () => {
    vi.useFakeTimers();
    const store = createThreadEventStore({ parent: [], [childId]: [] });
    const send = vi.fn();
    const ws = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    const { rerender } = renderHook(
      ({ parentEvents }: { parentEvents: AgentEvent[] }) => useSubagentEvents({
        store,
        ws,
        parentThreadId: "parent",
        parentEvents,
        parentWorkingSince: 10,
      }),
      { initialProps: { parentEvents: [activity("running", 10)] } },
    );
    const afterStart = send.mock.calls.length;
    act(() => store.update((previous) => ({
      ...previous,
      [childId]: [{ kind: "started", ts: 20 }],
    })));
    rerender({ parentEvents: [activity("completed", 30)] });
    const afterSettled = send.mock.calls.length;
    act(() => vi.advanceTimersByTime(2_500));
    expect(afterSettled).toBeGreaterThan(afterStart);
    expect(send.mock.calls.length).toBe(afterSettled);
  });

  it("does not keep polling after an explicit parent failure", () => {
    vi.useFakeTimers();
    const store = createThreadEventStore({ parent: [], [childId]: [] });
    const send = vi.fn();
    const ws = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    const { result, rerender } = renderHook(
      ({ parentEvents }: { parentEvents: AgentEvent[] }) => useSubagentEvents({
        store,
        ws,
        parentThreadId: "parent",
        parentEvents,
        parentWorkingSince: 10,
      }),
      { initialProps: { parentEvents: [activity("running", 10)] } },
    );
    expect(result.current.get(childId)).toEqual([]);
    rerender({ parentEvents: [activity("failed", 30)] });
    const afterFailure = send.mock.calls.length;
    act(() => vi.advanceTimersByTime(10_000));
    expect(send.mock.calls.length).toBe(afterFailure);
  });

  it("stops polling when the parent turn ends, even if the child still looks working", () => {
    // Fuite au repos (App.agentHistory « interroge pendant le tour parent puis
    // s'arrête au done ») : le done d'un enfant peut être manqué — son dernier
    // état observé reste « running ». Le tour PARENT terminé fait autorité :
    // un dernier instantané, puis plus aucune requête.
    vi.useFakeTimers();
    const store = createThreadEventStore({ parent: [], [childId]: [] });
    const send = vi.fn();
    const ws = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    const parentEvents = [activity("running", 10)];
    const { rerender } = renderHook(
      ({ parentWorkingSince }: { parentWorkingSince: number | null }) => useSubagentEvents({
        store,
        ws,
        parentThreadId: "parent",
        parentEvents,
        parentWorkingSince,
      }),
      { initialProps: { parentWorkingSince: 10 as number | null } },
    );
    act(() => vi.advanceTimersByTime(5_000));
    const duringTurn = send.mock.calls.length;
    expect(duringTurn).toBeGreaterThanOrEqual(3);
    rerender({ parentWorkingSince: null });
    const afterDone = send.mock.calls.length;
    expect(afterDone).toBe(duringTurn + 1);
    act(() => vi.advanceTimersByTime(10_000));
    expect(send.mock.calls.length).toBe(afterDone);
  });

  it("reopens a completed child only when both lifecycle timestamps prove a newer turn", () => {
    const done = [{ kind: "done" as const, ok: true, result: "old", ts: 10 }];
    expect(subagentHistoryInternals.childNeedsPolling(done, { status: "running", ts: null })).toBe(false);
    expect(subagentHistoryInternals.childNeedsPolling(done, { status: "running", ts: 9 })).toBe(false);
    expect(subagentHistoryInternals.childNeedsPolling(done, { status: "running", ts: 11 })).toBe(true);
  });
});
