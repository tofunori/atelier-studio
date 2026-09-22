import type { AgentEvent } from "./ws";

type TurnUsage = Extract<AgentEvent, { kind: "usage" }>["usage"];

/** Dernier usage connu d'un historique rejoué, ou `null` s'il n'en porte aucun.
 *  Replay de l'usage (plan 025) : l'anneau se vidait au reload. Les
 *  providers récents journalisent la fenêtre réelle dans un événement
 *  `usage` séparé (le `done` historique ne porte que context/output),
 *  donc conserver le dernier signal de chaque forme, dans l'ordre du
 *  snapshot, sans jamais inventer une fenêtre quand elle est absente. */
export function usageFromHistory(histEvents: AgentEvent[]): TurnUsage | null {
  let lastUsageIndex = -1;
  let lastUsage: Extract<AgentEvent, { kind: "usage" }> | null = null;
  let lastDoneIndex = -1;
  let lastDone: Extract<AgentEvent, { kind: "done" }> | null = null;
  for (let index = histEvents.length - 1; index >= 0; index -= 1) {
    const event = histEvents[index];
    if (lastUsageIndex < 0 && event?.kind === "usage" && event.usage) {
      lastUsageIndex = index;
      lastUsage = event;
    }
    if (lastDoneIndex < 0 && event?.kind === "done" && event.usage) {
      lastDoneIndex = index;
      lastDone = event;
    }
    if (lastUsageIndex >= 0 && lastDoneIndex >= 0) break;
  }
  const latestUsage = lastUsageIndex >= lastDoneIndex ? lastUsage?.usage : lastDone?.usage;
  // A done with no window can follow a real usage snapshot. Keep the
  // latest context/output while carrying that provider-reported window
  // only when both observations belong to the same turn. A model switch
  // can leave an older window in the journal; in that case the official
  // ring stays hidden instead of assigning it to the newer done.
  const contextUsage = latestUsage ?? lastDone?.usage ?? lastUsage?.usage;
  const usageAndDoneShareTurn = (() => {
    if (!lastUsage || !lastDone) return false;
    const usageMeta = lastUsage.meta && "turnId" in lastUsage.meta ? lastUsage.meta.turnId : null;
    const doneMeta = lastDone.meta && "turnId" in lastDone.meta ? lastDone.meta.turnId : null;
    if (usageMeta || doneMeta) return Boolean(usageMeta && doneMeta && usageMeta === doneMeta);
    const from = Math.min(lastUsageIndex, lastDoneIndex);
    const to = Math.max(lastUsageIndex, lastDoneIndex);
    return !histEvents.slice(from + 1, to).some((event) => (
      event.kind === "user" || event.kind === "started" || event.kind === "done" || event.kind === "error"
    ));
  })();
  const contextWindow = lastUsage?.usage.window != null
    && (!lastDone || usageAndDoneShareTurn)
    ? lastUsage.usage.window
    : null;
  if (!contextUsage) return null;
  return contextWindow == null
    ? contextUsage
    : { ...contextUsage, window: contextWindow };
}
