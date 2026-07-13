/** Normalized chat entities — plan 034 jalon E. */

export type TurnStatus = "pending" | "running" | "done" | "error" | "interrupted";

export type ChatItemKind =
  | "user"
  | "text"
  | "streaming"
  | "thinking"
  | "thinking_live"
  | "tool"
  | "edit"
  | "todos"
  | "goal"
  | "interaction"
  | "done"
  | "error"
  | "other";

export type ChatItem = {
  id: string;
  turnId: string;
  kind: ChatItemKind;
  text: string;
  sequence?: number;
  eventId?: string;
  durable: boolean;
  provisional?: boolean;
  /** Rich markdown deferred until promote (stream = plain). */
  promoted: boolean;
  ts?: number;
  toolName?: string;
  toolInput?: unknown;
  toolStatus?: "running" | "completed" | "failed" | string;
  toolDetail?: string;
  toolExitCode?: number;
  toolDurationMs?: number;
  toolTruncated?: boolean;
  files?: Array<{ path: string; add?: number | null; del?: number | null }>;
  todos?: Array<{ content?: string; status?: string; activeForm?: string }>;
  goal?: Record<string, unknown> | null;
  interactionTitle?: string;
  /** Full plan 025 interaction payload when kind === interaction */
  interaction?: import("../interactionTypes.ts").InteractionPayload;
  ok?: boolean;
};

export type TurnEntity = {
  turnId: string;
  itemIds: string[];
  status: TurnStatus;
  /** Active streaming bubble id if any. */
  streamingItemId: string | null;
};

export type ScrollMode = "pinned" | "reading" | "catch-up";

export type TransportStatus =
  | "idle"
  | "sending"
  | "streaming"
  | "stopping"
  | "error"
  | "disconnected";

/** Durable projection of a thread (journal). */
export type DurableThreadState = {
  threadId: string;
  itemsById: Record<string, ChatItem>;
  itemOrder: string[];
  turnsById: Record<string, TurnEntity>;
  turnOrder: string[];
  lastSequence: number;
};

/** Transport / network-facing. */
export type TransportThreadState = {
  status: TransportStatus;
  pendingClientRequestId: string | null;
  pendingMessageId: string | null;
  lastError: string | null;
};

/** Ephemeral UI (not journal). */
export type PresentationThreadState = {
  scrollMode: ScrollMode;
  /** turnId → measured height px */
  turnHeights: Record<string, number>;
  estimatedTurnHeight: number;
  newItemCount: number;
  /** Rerender instrumentation */
  metrics: ChatMetrics;
};

export type ChatMetrics = {
  reduceCount: number;
  visualFlushCount: number;
  lastFlushAt: number;
  itemsUpdatedLastFlush: number;
};

export type ThreadChatState = {
  durable: DurableThreadState;
  transport: TransportThreadState;
  presentation: PresentationThreadState;
};

export type WireLikeEvent = {
  kind: string;
  text?: string;
  message?: string;
  result?: string;
  name?: string;
  title?: string;
  ok?: boolean;
  meta?: {
    eventId?: string;
    sequence?: number;
    turnId?: string;
    messageId?: string;
    itemId?: string;
    durable?: boolean;
    ts?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function emptyMetrics(): ChatMetrics {
  return {
    reduceCount: 0,
    visualFlushCount: 0,
    lastFlushAt: 0,
    itemsUpdatedLastFlush: 0,
  };
}

export function emptyThreadState(threadId: string): ThreadChatState {
  return {
    durable: {
      threadId,
      itemsById: {},
      itemOrder: [],
      turnsById: {},
      turnOrder: [],
      lastSequence: 0,
    },
    transport: {
      status: "idle",
      pendingClientRequestId: null,
      pendingMessageId: null,
      lastError: null,
    },
    presentation: {
      scrollMode: "pinned",
      turnHeights: {},
      estimatedTurnHeight: 96,
      newItemCount: 0,
      metrics: emptyMetrics(),
    },
  };
}
