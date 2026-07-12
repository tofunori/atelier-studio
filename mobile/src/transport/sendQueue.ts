/**
 * Idempotent local send queue (plan 034 F).
 * Distinguishes: not sent (pending_local) | inflight | acked (gateway) | durable (journal event) | failed.
 */

export type SendDeliveryStatus =
  | "pending_local" // queued offline, never hit network
  | "inflight" // request in flight
  | "acked" // gateway accepted (not yet durable journal)
  | "durable" // user event seen in journal with matching messageId
  | "failed";

export type QueuedSend = {
  clientRequestId: string;
  clientMessageId: string;
  threadId: string;
  prompt: string;
  status: SendDeliveryStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
};

export type SendQueueState = {
  items: QueuedSend[];
};

export function emptySendQueue(): SendQueueState {
  return { items: [] };
}

export function enqueueSend(
  q: SendQueueState,
  item: Omit<QueuedSend, "status" | "createdAt" | "updatedAt" | "attempts"> & {
    status?: SendDeliveryStatus;
  },
): SendQueueState {
  if (q.items.some((x) => x.clientRequestId === item.clientRequestId)) {
    return q; // idempotent
  }
  const now = Date.now();
  const row: QueuedSend = {
    clientRequestId: item.clientRequestId,
    clientMessageId: item.clientMessageId,
    threadId: item.threadId,
    prompt: item.prompt,
    status: item.status ?? "pending_local",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  return { items: [...q.items, row] };
}

export function updateSend(
  q: SendQueueState,
  clientRequestId: string,
  patch: Partial<Pick<QueuedSend, "status" | "lastError" | "attempts">>,
): SendQueueState {
  return {
    items: q.items.map((x) =>
      x.clientRequestId === clientRequestId
        ? { ...x, ...patch, updatedAt: Date.now() }
        : x,
    ),
  };
}

export function markInflight(q: SendQueueState, clientRequestId: string): SendQueueState {
  const cur = q.items.find((x) => x.clientRequestId === clientRequestId);
  return updateSend(q, clientRequestId, {
    status: "inflight",
    attempts: (cur?.attempts ?? 0) + 1,
    lastError: undefined,
  });
}

export function markAcked(q: SendQueueState, clientRequestId: string): SendQueueState {
  return updateSend(q, clientRequestId, { status: "acked" });
}

export function markDurable(q: SendQueueState, clientRequestId: string): SendQueueState {
  return updateSend(q, clientRequestId, { status: "durable" });
}

export function markDurableByMessageId(q: SendQueueState, messageId: string): SendQueueState {
  const hit = q.items.find((x) => x.clientMessageId === messageId);
  if (!hit) return q;
  return markDurable(q, hit.clientRequestId);
}

export function markFailed(
  q: SendQueueState,
  clientRequestId: string,
  error: string,
): SendQueueState {
  return updateSend(q, clientRequestId, { status: "failed", lastError: error });
}

/** Pending work that may be retried (offline or failed). */
export function listRetryable(q: SendQueueState, threadId?: string): QueuedSend[] {
  return q.items.filter(
    (x) =>
      (x.status === "pending_local" || x.status === "failed") &&
      (threadId == null || x.threadId === threadId),
  );
}

export function listInflight(q: SendQueueState): QueuedSend[] {
  return q.items.filter((x) => x.status === "inflight");
}

/** After kill before ack: inflight without durable → pending_local for retry. */
export function recoverAfterRestart(q: SendQueueState): SendQueueState {
  return {
    items: q.items.map((x) =>
      x.status === "inflight"
        ? { ...x, status: "pending_local" as const, updatedAt: Date.now() }
        : x,
    ),
  };
}

export function purgeDurable(q: SendQueueState, maxKeep = 50): SendQueueState {
  const durable = q.items.filter((x) => x.status === "durable");
  if (durable.length <= maxKeep) return q;
  const drop = new Set(durable.slice(0, durable.length - maxKeep).map((x) => x.clientRequestId));
  return { items: q.items.filter((x) => !drop.has(x.clientRequestId)) };
}

export const SEND_QUEUE_STORAGE_KEY = "atelier.sendQueue.v1";

export function serializeQueue(q: SendQueueState): string {
  return JSON.stringify(q);
}

export function parseQueue(raw: string | null): SendQueueState {
  if (!raw) return emptySendQueue();
  try {
    const v = JSON.parse(raw) as SendQueueState;
    if (!Array.isArray(v.items)) return emptySendQueue();
    return recoverAfterRestart(v);
  } catch {
    return emptySendQueue();
  }
}
