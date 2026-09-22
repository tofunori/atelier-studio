import type { AgentEvent } from "./ws";

export function checkpointAfterUser(events: AgentEvent[], index: number) {
  const userMeta = events[index]?.meta;
  const turnId = userMeta && "turnId" in userMeta ? userMeta.turnId : undefined;
  const done = events.slice(index + 1).find((event): event is Extract<AgentEvent, { kind: "done" }> => {
    if (event.kind !== "done" || !event.checkpoint) return false;
    const meta = event.meta;
    return !turnId || Boolean(meta && "turnId" in meta && meta.turnId === turnId);
  });
  return done?.checkpoint ? { turnId, snapshotSha: done.checkpoint.snapshotSha } : { turnId };
}
