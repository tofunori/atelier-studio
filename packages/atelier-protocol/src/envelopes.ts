import type { HarnessEventMeta } from "./meta.ts";
import {
  MAX_PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "./version.ts";

/** Client kinds for diagnostics (not authorization). */
export type ClientKind = "desktop" | "mobile" | "fixture" | "test";

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

export type ClientHelloMessage = {
  type: "clientHello";
  protocolVersion: number;
  clientInstanceId: string;
  clientKind?: ClientKind;
};

export type ServerHelloMessage = {
  type: "serverHello";
  protocolVersion: number;
  minProtocolVersion: number;
  maxProtocolVersion: number;
  backend?: string;
  service?: string;
};

export function makeServerHello(over: Partial<ServerHelloMessage> = {}): ServerHelloMessage {
  return {
    type: "serverHello",
    protocolVersion: PROTOCOL_VERSION,
    minProtocolVersion: MIN_PROTOCOL_VERSION,
    maxProtocolVersion: MAX_PROTOCOL_VERSION,
    backend: "fixture",
    service: "atelier-fixture",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Structured errors (no path/secret leakage)
// ---------------------------------------------------------------------------

export type ProtocolErrorCode =
  | "protocol_version_unsupported"
  | "invalid_payload"
  | "missing_field"
  | "unknown_type"
  | "sequence_gap"
  | "snapshot_required"
  | "thread_not_found"
  | "unauthorized"
  | "rate_limited";

export type ProtocolErrorMessage = {
  type: "error";
  code: ProtocolErrorCode;
  message: string;
  threadId?: string;
  /** Present when version negotiation fails. */
  minProtocolVersion?: number;
  maxProtocolVersion?: number;
  clientVersion?: number;
};

export function protocolError(
  code: ProtocolErrorCode,
  message: string,
  extra: Partial<ProtocolErrorMessage> = {},
): ProtocolErrorMessage {
  return { type: "error", code, message, ...extra };
}

// ---------------------------------------------------------------------------
// History / resume
// ---------------------------------------------------------------------------

/** Client → server: load history, optionally only after lastSequence (exclusive). */
export type GetHistoryMessage = {
  type: "getHistory";
  threadId: string;
  /** Exclusive lower bound: return events with meta.sequence > afterSequence. */
  afterSequence?: number;
};

export type HistoryMessage = {
  type: "history";
  threadId: string;
  events: WireAgentEvent[];
  /** Min sequence in this batch (0 if empty). */
  fromSequence: number;
  /** Max sequence in this batch (0 if empty). */
  toSequence: number;
  /**
   * true when the server believes the client can catch up from afterSequence
   * with this batch alone. false when a full snapshot is required (window expired).
   */
  complete: boolean;
  snapshotRequired?: boolean;
};

// ---------------------------------------------------------------------------
// Live stream framing (same AgentEvent body as desktop journal)
// ---------------------------------------------------------------------------

/**
 * Minimal agent event body kinds used by mobile + fixtures.
 * Full desktop union may grow; unknown kinds must be tolerated by clients
 * that only need chat fidelity (stored as opaque if needed later).
 */
export type WireAgentEventBody =
  | { kind: "user"; text: string; ts?: number; label?: string }
  | { kind: "text"; text: string; ts?: number }
  | { kind: "delta"; text: string; ts?: number }
  | { kind: "stream_set"; text: string; ts?: number }
  | { kind: "streaming"; text: string; ts?: number }
  | { kind: "thinking"; text: string; ts?: number }
  | { kind: "thinking_delta"; text: string; ts?: number }
  | { kind: "thinking_live"; text: string; ts?: number }
  | { kind: "started"; ts?: number }
  | { kind: "heartbeat"; elapsedMs?: number; ts?: number }
  | {
      kind: "tool_update";
      id: string;
      name: string;
      output: string;
      status?: string;
      detail?: string;
      ts?: number;
    }
  | {
      kind: "interaction";
      requestId: string;
      interactionType: "approval" | "user_input" | "mcp_elicitation";
      title: string;
      detail?: string;
      state: "pending" | "answered" | "declined" | "expired";
      answerSummary?: string;
      ts?: number;
    }
  | {
      kind: "done";
      ok: boolean;
      result: string;
      ts?: number;
    }
  | { kind: "error"; message: string; ts?: number }
  | { kind: "usage"; usage: { context: number | null; output: number | null; cost: number | null; turns: number | null }; ts?: number };

export type WireAgentEvent = WireAgentEventBody & {
  meta?: HarnessEventMeta;
  /** Unknown extra fields from newer servers are tolerated at parse time. */
  [key: string]: unknown;
};

export type EventMessage = {
  type: "event";
  threadId: string;
  event: WireAgentEvent;
};

// ---------------------------------------------------------------------------
// Threads list (minimal)
// ---------------------------------------------------------------------------

export type ThreadSummary = {
  id: string;
  projectId: string;
  title: string;
  provider: string;
  status: "idle" | "running" | "done";
  updatedAt: string;
  lastSequence: number;
};

export type ThreadsMessage = {
  type: "threads";
  threads: ThreadSummary[];
};

export type ListThreadsMessage = { type: "listThreads" };

// ---------------------------------------------------------------------------
// Send / interrupt (client → server; fixture accepts, full gateway later)
// ---------------------------------------------------------------------------

export type SendMessage = {
  type: "send";
  threadId: string;
  prompt: string;
  clientRequestId: string;
  clientMessageId?: string;
  provider?: string;
};

export type InterruptMessage = {
  type: "interrupt";
  threadId: string;
  clientRequestId?: string;
};

export type InteractionResponseMessage = {
  type: "interactionResponse";
  threadId: string;
  requestId: string;
  response: { allow: boolean } | { answers: Record<string, string> } | { action: "accept" | "decline" };
  clientRequestId?: string;
};

export type PingMessage = { type: "ping" };
export type PongMessage = { type: "pong" };

export type ClientWireMessage =
  | ClientHelloMessage
  | ListThreadsMessage
  | GetHistoryMessage
  | SendMessage
  | InterruptMessage
  | InteractionResponseMessage
  | PingMessage
  | { type: string; [key: string]: unknown };

export type ServerWireMessage =
  | ServerHelloMessage
  | ProtocolErrorMessage
  | ThreadsMessage
  | HistoryMessage
  | EventMessage
  | PongMessage
  | { type: string; [key: string]: unknown };
