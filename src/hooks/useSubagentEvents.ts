import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "../lib/ws";
import type { ThreadEventStore } from "../lib/threadEventStore";

const OPEN = 1;
const POLL_MS = 2_500;
const EMPTY_IDS: string[] = [];

type ParentAgentState = { status: string; ts: number | null };

function isAgentActivity(event: AgentEvent): event is Extract<AgentEvent, { kind: "tool_update" }> & {
  agentActivity: NonNullable<Extract<AgentEvent, { kind: "tool_update" }>["agentActivity"]>;
} {
  return event.kind === "tool_update" && event.agentActivity != null;
}

function childIdsFromEvents(events: AgentEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (!isAgentActivity(event)) continue;
    for (const id of event.agentActivity.receiverThreadIds) if (id) ids.add(id);
    for (const id of Object.keys(event.agentActivity.agentsStates)) if (id) ids.add(id);
    if (event.agentActivity.agentThreadId) ids.add(event.agentActivity.agentThreadId);
  }
  return [...ids];
}

function parentStatesFromEvents(events: AgentEvent[]): ReadonlyMap<string, ParentAgentState> {
  const states = new Map<string, ParentAgentState>();
  for (const event of events) {
    if (!isAgentActivity(event)) continue;
    const activity = event.agentActivity;
    const ids = new Set([
      ...activity.receiverThreadIds,
      ...Object.keys(activity.agentsStates),
      ...(activity.agentThreadId ? [activity.agentThreadId] : []),
    ]);
    for (const id of ids) {
      const state = activity.agentsStates[id];
      // A receiver id without a state is an observation boundary, not a new
      // working status. Only explicit states (or an explicit interruption)
      // may replace the latest known state.
      if (!state && activity.activityKind !== "interrupted") continue;
      const next = {
        status: state?.status ?? "interrupted",
        ts: event.ts ?? null,
      };
      const previous = states.get(id);
      if (previous && previous.ts != null
          && (next.ts == null || next.ts < previous.ts)) continue;
      states.set(id, next);
    }
  }
  return states;
}

function isWorkingStatus(status: string | null | undefined): boolean {
  return /^(?:working|running|inprogress|started|pending|queued)$/iu.test(
    (status ?? "").replace(/[_-]/g, ""),
  );
}

function parentSettlesChild(status: string | null | undefined): boolean {
  return /^(?:completed?|done|finished|succeeded|success)$/iu.test(
    (status ?? "").replace(/[_-]/g, ""),
  );
}

function parentStopsChildSync(status: string | null | undefined): boolean {
  return /^(?:failed|errored?|error|interrupted|cancel+ed|shutdown|notfound)$/iu.test(
    (status ?? "").replace(/[_-]/g, ""),
  );
}

function latestLifecycle(events: AgentEvent[]): { kind: "started" | "terminal"; ts: number | null } | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const ts = "ts" in event && typeof event.ts === "number" ? event.ts : null;
    if (event.kind === "started") return { kind: "started", ts };
    if (event.kind === "done" || event.kind === "error") return { kind: "terminal", ts };
  }
  return null;
}

function childNeedsPolling(
  events: AgentEvent[],
  parentState: ParentAgentState | undefined,
): boolean {
  const lifecycle = latestLifecycle(events);
  // A failed/interrupted parent is authoritative when the child did not emit
  // its own terminal record. A successful parent completion still receives one
  // final child snapshot, but it must not leave a timer running forever.
  if (parentStopsChildSync(parentState?.status)) return false;
  // A terminal parent observation gets one final history request (the request
  // effect below keys it by status+timestamp), then the interval stops. If
  // that final snapshot contains an explicit child start, the row can still
  // show it, but an absent/ancient transcript must not create an endless poll.
  if (parentSettlesChild(parentState?.status)) return false;
  if (!lifecycle) return Boolean(parentState && isWorkingStatus(parentState.status));
  if (lifecycle.kind === "started") return true;
  // A parent can emit a new working observation after a previous child turn
  // completed. The newer parent timestamp reopens synchronization for that
  // follow-up without treating the old terminal transcript as current.
  if (parentState && isWorkingStatus(parentState.status)
      && lifecycle.ts != null && parentState.ts != null && parentState.ts > lifecycle.ts) return true;
  return false;
}

function childIdsKey(ids: string[]): string {
  return ids.join("\u0000");
}

/**
 * Keeps child transcripts live for the parent activity group, including while
 * the Atelier detail tab is closed. The sidecar already owns the authoritative
 * history; this hook only requests snapshots and reads the shared store.
 */
export function useSubagentEvents({
  store,
  ws,
  parentThreadId,
  parentEvents,
  parentWorkingSince,
}: {
  store: ThreadEventStore;
  ws: WebSocket | null;
  parentThreadId: string | null;
  parentEvents: AgentEvent[];
  /** Tour parent en cours (App.workingSince) ; null = parent au repos. Le
   * transcript ne suffit pas : `started` n'y est pas conservé, et un `done`
   * d'enfant manqué laisse son dernier état observé à « running » pour
   * toujours — sans cette garde, le timer de 2,5 s survivait au tour. */
  parentWorkingSince: number | null;
}): ReadonlyMap<string, AgentEvent[]> {
  const childIds = useMemo(() => childIdsFromEvents(parentEvents), [parentEvents]);
  const idsKey = childIdsKey(childIds);
  const parentStates = useMemo(() => parentStatesFromEvents(parentEvents), [parentEvents]);
  const [revision, setRevision] = useState(0);
  const requested = useRef(new Map<string, string>());
  const requestScope = useRef<{ ws: WebSocket | null; parentThreadId: string | null; readyState: number }>({
    ws: null,
    parentThreadId: null,
    readyState: 0,
  });
  const readyState = ws?.readyState ?? 0;

  // Subscribe only to the child threads represented by the current parent
  // transcript. A panel being hidden must not disable these subscriptions.
  useEffect(() => {
    const unsubs = childIds.map((id) => store.subscribe(id, () => setRevision((value) => value + 1)));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [store, idsKey]);

  const eventsByThreadId = useMemo(() => {
    const next = new Map<string, AgentEvent[]>();
    for (const id of childIds) next.set(id, store.getThread(id));
    return next;
  }, [store, idsKey, revision]);

  const liveIds = useMemo(
    () => childIds.filter((id) => childNeedsPolling(eventsByThreadId.get(id) ?? [], parentStates.get(id))),
    [childIds, eventsByThreadId, parentStates],
  );
  // Only a running parent turn keeps a timer alive; the same rule gates the
  // detail panel (ThreadAgent). A parent at rest never polls, whatever the
  // children's last observed states.
  const parentActive = parentWorkingSince != null;
  const activeIds = parentActive ? liveIds : EMPTY_IDS;
  const activeIdsKey = childIdsKey(activeIds);

  useEffect(() => {
    if (requestScope.current.ws !== ws
        || requestScope.current.parentThreadId !== parentThreadId
        || requestScope.current.readyState !== readyState) {
      requestScope.current = { ws, parentThreadId, readyState };
      requested.current.clear();
    }
    if (!parentThreadId || !ws || readyState !== OPEN) return;
    const request = (agentThreadId: string) => {
      if (ws.readyState !== OPEN) return;
      ws.send(JSON.stringify({ type: "getAgentHistory", parentThreadId, agentThreadId }));
    };
    for (const id of childIds) {
      const state = parentStates.get(id);
      const parentKey = state ? `${state.status}:${state.ts ?? ""}` : "no-state";
      // Every explicit state transition gets one authoritative snapshot. This
      // includes a successful/failed parent terminal: it closes the loop once
      // without keeping a timer alive for an empty or stale child transcript.
      if (requested.current.get(id) !== parentKey) {
        request(id);
        requested.current.set(id, parentKey);
      }
    }
  }, [ws, parentThreadId, readyState, idsKey, parentStates]);

  useEffect(() => {
    if (!parentThreadId || !ws || readyState !== OPEN || !activeIds.length) return;
    const request = () => {
      if (ws.readyState !== OPEN) return;
      for (const agentThreadId of activeIds) {
        ws.send(JSON.stringify({ type: "getAgentHistory", parentThreadId, agentThreadId }));
      }
    };
    const timer = window.setInterval(request, POLL_MS);
    return () => window.clearInterval(timer);
  }, [ws, parentThreadId, readyState, activeIdsKey]);

  // End of the parent turn: one final snapshot for each child that was still
  // being polled (its own done may have been missed), then silence.
  const wasParentActive = useRef(parentActive);
  useEffect(() => {
    const ended = wasParentActive.current && !parentActive;
    wasParentActive.current = parentActive;
    if (!ended || !parentThreadId || !ws || ws.readyState !== OPEN) return;
    for (const agentThreadId of liveIds) {
      ws.send(JSON.stringify({ type: "getAgentHistory", parentThreadId, agentThreadId }));
    }
  }, [parentActive, parentThreadId, ws, liveIds]);

  return eventsByThreadId;
}

export const subagentHistoryInternals = {
  childIdsFromEvents,
  childNeedsPolling,
  latestLifecycle,
  parentStatesFromEvents,
};
