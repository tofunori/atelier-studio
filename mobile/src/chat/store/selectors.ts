import type { ChatItem, ThreadChatState, TurnEntity } from "./types.ts";

export function selectTurnOrder(s: ThreadChatState): string[] {
  return s.durable.turnOrder;
}

export function selectTurn(s: ThreadChatState, turnId: string): TurnEntity | undefined {
  return s.durable.turnsById[turnId];
}

export function selectTurnItems(s: ThreadChatState, turnId: string): ChatItem[] {
  const t = s.durable.turnsById[turnId];
  if (!t) return [];
  return t.itemIds.map((id) => s.durable.itemsById[id]).filter(Boolean);
}

export function selectItem(s: ThreadChatState, itemId: string): ChatItem | undefined {
  return s.durable.itemsById[itemId];
}

export function selectStreamingItem(s: ThreadChatState): ChatItem | null {
  for (let i = s.durable.turnOrder.length - 1; i >= 0; i--) {
    const tid = s.durable.turnOrder[i];
    const t = s.durable.turnsById[tid];
    if (t?.streamingItemId) {
      return s.durable.itemsById[t.streamingItemId] ?? null;
    }
  }
  return null;
}

export function selectTransport(s: ThreadChatState) {
  return s.transport;
}

export function selectScrollMode(s: ThreadChatState) {
  return s.presentation.scrollMode;
}

export function selectMetrics(s: ThreadChatState) {
  return s.presentation.metrics;
}

export function selectIsBusy(s: ThreadChatState): boolean {
  return (
    s.transport.status === "sending" ||
    s.transport.status === "streaming" ||
    s.transport.status === "stopping"
  );
}

/** Visible window of turn ids for virtualization. */
export function selectVisibleTurns(
  s: ThreadChatState,
  opts: { scrollTop: number; viewportHeight: number; overscan?: number },
): { start: number; end: number; offsetY: number; totalHeight: number; turnIds: string[] } {
  const overscan = opts.overscan ?? 2;
  const est = s.presentation.estimatedTurnHeight;
  const heights = s.presentation.turnHeights;
  const turnIds = s.durable.turnOrder;
  let total = 0;
  const offsets: number[] = [];
  for (const id of turnIds) {
    offsets.push(total);
    total += heights[id] ?? est;
  }
  let start = 0;
  while (start < turnIds.length && offsets[start] + (heights[turnIds[start]] ?? est) < opts.scrollTop) {
    start++;
  }
  start = Math.max(0, start - overscan);
  let end = start;
  const bottom = opts.scrollTop + opts.viewportHeight;
  while (end < turnIds.length && offsets[end] < bottom) end++;
  end = Math.min(turnIds.length, end + overscan);
  return {
    start,
    end,
    offsetY: offsets[start] ?? 0,
    totalHeight: total || est,
    turnIds: turnIds.slice(start, end),
  };
}
