/**
 * Pure reducer — same path for live stream and history replay (plan 025/034 E).
 * O(1) / locally bounded updates for deltas (mutate streaming item in place via new refs).
 */
import { parseInteractionFromWire } from "../interactionTypes.ts";
import type {
  ChatItem,
  ChatItemKind,
  DurableThreadState,
  ThreadChatState,
  TurnEntity,
  TurnStatus,
  WireLikeEvent,
} from "./types.ts";
import { emptyThreadState } from "./types.ts";

function kindOf(k: string): ChatItemKind {
  switch (k) {
    case "user":
    case "text":
    case "streaming":
    case "thinking":
    case "thinking_live":
    case "edit":
    case "todos":
    case "goal":
    case "interaction":
    case "done":
    case "error":
      return k;
    case "tool_update":
    case "tool":
      return "tool";
    case "delta":
    case "stream_set":
      return "streaming";
    case "thinking_delta":
      return "thinking_live";
    default:
      return "other";
  }
}

function metaOf(ev: WireLikeEvent) {
  return ev.meta && typeof ev.meta.eventId === "string" ? ev.meta : null;
}

function turnIdOf(ev: WireLikeEvent, fallback = "legacy"): string {
  const m = metaOf(ev);
  return (m?.turnId as string) || fallback;
}

function ensureTurn(d: DurableThreadState, turnId: string): TurnEntity {
  let t = d.turnsById[turnId];
  if (!t) {
    t = { turnId, itemIds: [], status: "running", streamingItemId: null };
    d.turnsById = { ...d.turnsById, [turnId]: t };
    d.turnOrder = [...d.turnOrder, turnId];
  }
  return t;
}

function cloneDurable(d: DurableThreadState): DurableThreadState {
  return {
    threadId: d.threadId,
    itemsById: { ...d.itemsById },
    itemOrder: d.itemOrder.slice(),
    turnsById: { ...d.turnsById },
    turnOrder: d.turnOrder.slice(),
    lastSequence: d.lastSequence,
  };
}

function putItem(d: DurableThreadState, item: ChatItem, turn: TurnEntity): void {
  const isNew = !d.itemsById[item.id];
  d.itemsById[item.id] = item;
  if (isNew) {
    d.itemOrder.push(item.id);
    turn.itemIds = [...turn.itemIds, item.id];
    d.turnsById[turn.turnId] = { ...turn };
  } else {
    d.turnsById[turn.turnId] = { ...turn };
  }
  if (item.sequence && item.sequence > d.lastSequence) {
    d.lastSequence = item.sequence;
  }
}

function findStreamingForTurn(d: DurableThreadState, turnId: string): ChatItem | null {
  const t = d.turnsById[turnId];
  if (t?.streamingItemId) {
    const it = d.itemsById[t.streamingItemId];
    if (it?.kind === "streaming") return it;
  }
  // fallback scan reverse itemOrder for this turn
  for (let i = d.itemOrder.length - 1; i >= 0; i--) {
    const it = d.itemsById[d.itemOrder[i]];
    if (it && it.turnId === turnId && it.kind === "streaming") return it;
  }
  return null;
}

function findThinkingLive(d: DurableThreadState, turnId: string): ChatItem | null {
  for (let i = d.itemOrder.length - 1; i >= 0; i--) {
    const it = d.itemsById[d.itemOrder[i]];
    if (it && it.turnId === turnId && it.kind === "thinking_live") return it;
  }
  return null;
}

function setTurnStatus(d: DurableThreadState, turnId: string, status: TurnStatus, streamingItemId?: string | null) {
  const t = ensureTurn(d, turnId);
  d.turnsById[turnId] = {
    ...t,
    status,
    streamingItemId: streamingItemId === undefined ? t.streamingItemId : streamingItemId,
  };
}

/**
 * Reduce one wire event into durable state. Returns same reference if no-op (dup eventId).
 */
export function reduceDurable(d: DurableThreadState, ev: WireLikeEvent): DurableThreadState {
  const kind = ev.kind;
  // ephemeral never displayed
  if (kind === "started" || kind === "heartbeat" || kind === "usage") return d;

  const meta = metaOf(ev);
  if (meta?.eventId && d.itemsById[meta.eventId]) {
    return d; // idempotent
  }

  const next = cloneDurable(d);
  const turnId = turnIdOf(ev);
  const turn = ensureTurn(next, turnId);
  const seq = meta?.sequence as number | undefined;
  const eventId = meta?.eventId as string | undefined;
  const id = eventId || `prov-${turnId}-${next.itemOrder.length}`;
  const durable = meta?.durable !== false && kind !== "delta" && kind !== "thinking_delta" && kind !== "stream_set";

  // optimistic user ack by messageId
  if (kind === "user" && meta?.messageId) {
    const mid = meta.messageId as string;
    const existing = Object.values(next.itemsById).find(
      (it) => it.kind === "user" && it.provisional && it.id === `msg:${mid}`,
    );
    if (existing) {
      const updated: ChatItem = {
        ...existing,
        id: eventId || existing.id,
        eventId,
        sequence: seq,
        provisional: false,
        durable: true,
        text: textOf(ev) || existing.text,
      };
      // re-key if eventId different
      if (updated.id !== existing.id) {
        delete next.itemsById[existing.id];
        next.itemOrder = next.itemOrder.map((x) => (x === existing.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === existing.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      return next;
    }
  }

  if (kind === "delta" || kind === "stream_set") {
    const stream = findStreamingForTurn(next, turnId);
    if (stream) {
      const text = kind === "delta" ? stream.text + textOf(ev) : textOf(ev);
      const updated: ChatItem = {
        ...stream,
        text,
        eventId: eventId || stream.eventId,
        sequence: seq ?? stream.sequence,
        // adopt eventId for dedup of last delta
        id: eventId && !stream.provisional ? eventId : stream.id,
        promoted: false,
      };
      if (updated.id !== stream.id) {
        delete next.itemsById[stream.id];
        next.itemOrder = next.itemOrder.map((x) => (x === stream.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === stream.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      setTurnStatus(next, turnId, "running", updated.id);
      return next;
    }
    const item: ChatItem = {
      id,
      turnId,
      kind: "streaming",
      text: textOf(ev),
      sequence: seq,
      eventId,
      durable: false,
      promoted: false,
      ts: meta?.ts as number | undefined,
    };
    putItem(next, item, turn);
    setTurnStatus(next, turnId, "running", item.id);
    return next;
  }

  if (kind === "thinking_delta") {
    const live = findThinkingLive(next, turnId);
    if (live) {
      const updated: ChatItem = {
        ...live,
        text: live.text + textOf(ev),
        eventId: eventId || live.eventId,
        sequence: seq ?? live.sequence,
        id: eventId || live.id,
        promoted: false,
      };
      if (updated.id !== live.id) {
        delete next.itemsById[live.id];
        next.itemOrder = next.itemOrder.map((x) => (x === live.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === live.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      return next;
    }
    putItem(
      next,
      {
        id,
        turnId,
        kind: "thinking_live",
        text: textOf(ev),
        sequence: seq,
        eventId,
        durable: false,
        promoted: false,
      },
      turn,
    );
    return next;
  }

  if (kind === "thinking") {
    const live = findThinkingLive(next, turnId);
    if (live) {
      const updated: ChatItem = {
        ...live,
        kind: "thinking",
        text: textOf(ev),
        durable: true,
        promoted: true,
        eventId,
        sequence: seq,
        id: eventId || live.id,
      };
      if (updated.id !== live.id) {
        delete next.itemsById[live.id];
        next.itemOrder = next.itemOrder.map((x) => (x === live.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === live.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      return next;
    }
  }

  if (kind === "text") {
    const stream = findStreamingForTurn(next, turnId);
    if (stream) {
      const updated: ChatItem = {
        ...stream,
        kind: "text",
        text: textOf(ev),
        durable: true,
        promoted: true,
        eventId,
        sequence: seq,
        id: eventId || stream.id,
      };
      if (updated.id !== stream.id) {
        delete next.itemsById[stream.id];
        next.itemOrder = next.itemOrder.map((x) => (x === stream.id ? updated.id : x));
        turn.itemIds = turn.itemIds.map((x) => (x === stream.id ? updated.id : x));
      }
      putItem(next, updated, turn);
      setTurnStatus(next, turnId, "running", null);
      return next;
    }
  }

  if (kind === "done" || kind === "error") {
    const stream = findStreamingForTurn(next, turnId);
    if (stream) {
      if (stream.text.trim()) {
        const frozen: ChatItem = {
          ...stream,
          kind: "text",
          durable: true,
          promoted: true,
        };
        putItem(next, frozen, turn);
      } else {
        delete next.itemsById[stream.id];
        next.itemOrder = next.itemOrder.filter((x) => x !== stream.id);
        turn.itemIds = turn.itemIds.filter((x) => x !== stream.id);
      }
      setTurnStatus(next, turnId, kind === "error" ? "error" : "done", null);
    } else {
      setTurnStatus(
        next,
        turnId,
        kind === "error" ? "error" : textOf(ev) === "interrupted" ? "interrupted" : "done",
        null,
      );
    }
  }

  if (kind === "tool_update") {
    const itemId = (meta?.itemId as string) || (ev as { id?: string }).id || id;
    const existing = Object.values(next.itemsById).find(
      (it) => it.kind === "tool" && it.turnId === turnId && it.toolName && it.id.includes(itemId),
    );
    // identity (turnId, itemId)
    const toolKey = `tool:${turnId}:${itemId}`;
    const prev = next.itemsById[toolKey] || existing;
    const exitCode = ev.exitCode;
    const durationMs = ev.durationMs;
    const item: ChatItem = {
      id: toolKey,
      turnId,
      kind: "tool",
      text: textOf(ev) || String((ev as { output?: string }).output ?? ""),
      toolName: String((ev as { name?: string }).name ?? "tool"),
      toolInput: (ev as { input?: unknown }).input,
      toolStatus: String((ev as { status?: string; state?: string }).status ?? (ev as { state?: string }).state ?? "completed"),
      toolDetail: String((ev as { detail?: string }).detail ?? ""),
      toolExitCode: typeof exitCode === "number" ? exitCode : undefined,
      toolDurationMs: typeof durationMs === "number" ? durationMs : undefined,
      toolTruncated: Boolean((ev as { truncated?: boolean }).truncated),
      sequence: seq,
      eventId,
      durable: true,
      promoted: true,
    };
    if (prev && prev.id !== toolKey) {
      delete next.itemsById[prev.id];
      next.itemOrder = next.itemOrder.map((x) => (x === prev.id ? toolKey : x));
      turn.itemIds = turn.itemIds.map((x) => (x === prev.id ? toolKey : x));
    }
    putItem(next, item, turn);
    return next;
  }

  if (kind === "edit") {
    const files = ev.files;
    putItem(next, {
      id, turnId, kind: "edit", text: textOf(ev), sequence: seq, eventId,
      durable: true, promoted: true,
      files: Array.isArray(files)
        ? (files as Array<{ path?: unknown; add?: unknown; del?: unknown }>)
            .map((file) => ({
              path: String(file.path ?? ""),
              add: typeof file.add === "number" ? file.add : null,
              del: typeof file.del === "number" ? file.del : null,
            }))
            .filter((file) => file.path)
        : [],
    }, turn);
    return next;
  }

  if (kind === "todos") {
    const todos = ev.todos;
    putItem(next, {
      id, turnId, kind: "todos", text: textOf(ev), sequence: seq, eventId,
      durable: true, promoted: true,
      todos: Array.isArray(todos)
        ? todos as Array<{ content?: string; status?: string; activeForm?: string }>
        : [],
    }, turn);
    return next;
  }

  if (kind === "goal") {
    putItem(next, {
      id, turnId, kind: "goal", text: textOf(ev), sequence: seq, eventId,
      durable: true, promoted: true,
      goal: (ev as { goal?: Record<string, unknown> | null }).goal ?? null,
    }, turn);
    return next;
  }

  // interaction: replace in place by requestId
  if (kind === "interaction") {
    const payload = parseInteractionFromWire(ev as never);
    if (payload) {
      const existingId = Object.values(next.itemsById).find(
        (it) => it.kind === "interaction" && it.interaction?.requestId === payload.requestId,
      )?.id;
      const itemId = existingId || id;
      const item: ChatItem = {
        id: itemId,
        turnId,
        kind: "interaction",
        text: payload.title,
        sequence: seq,
        eventId,
        durable: true,
        promoted: true,
        interactionTitle: payload.title,
        interaction: payload,
        ts: meta?.ts as number | undefined,
      };
      if (existingId && existingId !== itemId) {
        /* same */
      }
      putItem(next, item, turn);
      return next;
    }
  }

  const item: ChatItem = {
    id,
    turnId,
    kind: kindOf(kind),
    text: textOf(ev),
    sequence: seq,
    eventId,
    durable,
    promoted: kind !== "streaming" && kind !== "thinking_live",
    provisional: false,
    ts: meta?.ts as number | undefined,
    toolName: kind === "tool" || kind === "tool_update" ? String((ev as { name?: string }).name ?? "") : undefined,
    interactionTitle: kind === "interaction" ? String((ev as { title?: string }).title ?? "") : undefined,
    ok: kind === "done" ? Boolean((ev as { ok?: boolean }).ok) : undefined,
  };
  putItem(next, item, turn);
  if (kind === "done") setTurnStatus(next, turnId, "done", null);
  if (kind === "error") setTurnStatus(next, turnId, "error", null);
  if (kind === "user") setTurnStatus(next, turnId, turn.status === "done" ? "done" : "pending", turn.streamingItemId);
  return next;
}

export function materializeHistory(threadId: string, events: WireLikeEvent[]): DurableThreadState {
  let d = emptyThreadState(threadId).durable;
  for (const ev of events) d = reduceDurable(d, ev);
  return d;
}

export type ChatAction =
  | { type: "load_history"; threadId: string; events: WireLikeEvent[] }
  | { type: "event"; event: WireLikeEvent }
  | { type: "optimistic_user"; messageId: string; text: string; clientRequestId: string }
  | { type: "send_accepted"; clientRequestId: string }
  | { type: "send_failed"; error: string }
  | { type: "stop_requested" }
  | { type: "set_scroll_mode"; mode: ThreadChatState["presentation"]["scrollMode"] }
  | { type: "set_turn_height"; turnId: string; height: number }
  | { type: "clear_new_items" }
  | { type: "mark_new_items"; count: number }
  | { type: "visual_flush"; itemsUpdated: number }
  | { type: "promote_item"; itemId: string };

export function reduceChat(state: ThreadChatState, action: ChatAction): ThreadChatState {
  switch (action.type) {
    case "load_history": {
      const durable = materializeHistory(action.threadId, action.events);
      return {
        ...emptyThreadState(action.threadId),
        durable,
        transport: { ...state.transport, status: "idle", lastError: null },
        presentation: {
          ...state.presentation,
          scrollMode: "pinned",
          newItemCount: 0,
          metrics: {
            ...state.presentation.metrics,
            reduceCount: state.presentation.metrics.reduceCount + 1,
          },
        },
      };
    }
    case "event": {
      const durable = reduceDurable(state.durable, action.event);
      if (durable === state.durable) return state;
      const kind = action.event.kind;
      let status = state.transport.status;
      if (kind === "delta" || kind === "stream_set" || kind === "thinking_delta") status = "streaming";
      if (kind === "done") status = "idle";
      if (kind === "error") status = "error";
      const reading = state.presentation.scrollMode === "reading";
      return {
        ...state,
        durable,
        transport: {
          ...state.transport,
          status,
          lastError: kind === "error" ? textOf(action.event) : state.transport.lastError,
        },
        presentation: {
          ...state.presentation,
          newItemCount: reading
            ? state.presentation.newItemCount + 1
            : state.presentation.newItemCount,
          metrics: {
            ...state.presentation.metrics,
            reduceCount: state.presentation.metrics.reduceCount + 1,
          },
        },
      };
    }
    case "optimistic_user": {
      const turnId = `turn-local-${action.messageId}`;
      const item: ChatItem = {
        id: `msg:${action.messageId}`,
        turnId,
        kind: "user",
        text: action.text,
        durable: false,
        provisional: true,
        promoted: true,
        ts: Date.now(),
      };
      const d = cloneDurable(state.durable);
      const turn = ensureTurn(d, turnId);
      putItem(d, item, turn);
      setTurnStatus(d, turnId, "pending", null);
      return {
        ...state,
        durable: d,
        transport: {
          status: "sending",
          pendingClientRequestId: action.clientRequestId,
          pendingMessageId: action.messageId,
          lastError: null,
        },
        presentation: {
          ...state.presentation,
          scrollMode: "pinned",
          metrics: {
            ...state.presentation.metrics,
            reduceCount: state.presentation.metrics.reduceCount + 1,
          },
        },
      };
    }
    case "send_accepted":
      return {
        ...state,
        transport: {
          ...state.transport,
          status: state.transport.status === "sending" ? "streaming" : state.transport.status,
        },
      };
    case "send_failed":
      return {
        ...state,
        transport: {
          ...state.transport,
          status: "error",
          lastError: action.error,
          pendingClientRequestId: null,
        },
      };
    case "stop_requested":
      return {
        ...state,
        transport: { ...state.transport, status: "stopping" },
      };
    case "set_scroll_mode":
      return {
        ...state,
        presentation: {
          ...state.presentation,
          scrollMode: action.mode,
          newItemCount: action.mode === "pinned" ? 0 : state.presentation.newItemCount,
        },
      };
    case "set_turn_height":
      return {
        ...state,
        presentation: {
          ...state.presentation,
          turnHeights: {
            ...state.presentation.turnHeights,
            [action.turnId]: action.height,
          },
        },
      };
    case "clear_new_items":
      return {
        ...state,
        presentation: { ...state.presentation, newItemCount: 0, scrollMode: "pinned" },
      };
    case "mark_new_items":
      return {
        ...state,
        presentation: {
          ...state.presentation,
          newItemCount: state.presentation.newItemCount + action.count,
        },
      };
    case "visual_flush":
      return {
        ...state,
        presentation: {
          ...state.presentation,
          metrics: {
            ...state.presentation.metrics,
            visualFlushCount: state.presentation.metrics.visualFlushCount + 1,
            lastFlushAt: Date.now(),
            itemsUpdatedLastFlush: action.itemsUpdated,
          },
        },
      };
    case "promote_item": {
      const it = state.durable.itemsById[action.itemId];
      if (!it || it.promoted) return state;
      const d = cloneDurable(state.durable);
      d.itemsById[action.itemId] = { ...it, promoted: true };
      return { ...state, durable: d };
    }
    default:
      return state;
  }
}

function textOf(ev: WireLikeEvent): string {
  if (typeof ev.text === "string") return ev.text;
  if (typeof ev.message === "string") return ev.message;
  if (typeof ev.result === "string") return ev.result;
  const out = ev.output;
  if (typeof out === "string") return out;
  return "";
}
