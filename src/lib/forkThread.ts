import type { AgentEvent } from "./ws";

export type ForkThreadPayload = {
  type: "forkThread";
  newThreadId: string;
  fromThreadId: string;
  eventId?: string;
  contextEvents: Array<{ kind: "user" | "text"; text: string }>;
};

/** Construit une bifurcation sans dépendre du provider : le backend choisit
 * ensuite un fork natif (Claude/Node) ou une session neuve contextualisée. */
export function buildForkThreadPayload(
  fromThreadId: string,
  newThreadId: string,
  index: number,
  events: AgentEvent[],
): { forkEvents: AgentEvent[]; payload: ForkThreadPayload } {
  const forkEvents = events.slice(0, index + 1);
  const point = forkEvents[index];
  const eventId = point?.meta && "eventId" in point.meta ? point.meta.eventId : undefined;
  return {
    forkEvents,
    payload: {
      type: "forkThread",
      newThreadId,
      fromThreadId,
      ...(eventId ? { eventId } : {}),
      contextEvents: forkEvents.flatMap((event) =>
        event.kind === "user" || event.kind === "text"
          ? [{ kind: event.kind, text: event.text }]
          : [],
      ),
    },
  };
}
