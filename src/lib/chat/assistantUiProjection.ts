import type { ThreadMessageLike } from "@assistant-ui/react";

import type { AgentEvent, HarnessEventMeta, InteractionResponse } from "../ws";
import {
  deriveTurnLifecycle,
  isLifecycleCompletedStatus,
  isLifecycleFailedStatus,
  isLifecycleRunningStatus,
  type LifecycleToolAction,
  type LifecycleToolGroup,
  type TurnLifecycle,
} from "./turnLifecycle";

/**
 * The assistant-ui adapter deliberately stops at `ThreadMessageLike`.
 *
 * Atelier's event reducer remains the authority for `(turnId,itemId)` identity
 * and terminal ordering.  This module only projects that canonical event log
 * into assistant-ui's native message parts; it does not own a second stream
 * state machine or a renderer-specific fold.
 */

export type AssistantUiProjectionOptions = {
  /** The active run clock maintained by the Atelier transport. */
  workingSince?: number | null;
  /** Optional thread scope used to avoid message-id collisions across chats. */
  threadId?: string | null;
};

export type AssistantUiProjection = {
  messages: readonly ThreadMessageLike[];
  isRunning: boolean;
  activeTurnId: string | null;
  lifecycle: readonly TurnLifecycle[];
};

/**
 * Stable source mapping carried by each projected message.
 *
 * The values are zero-based offsets into the exact `AgentEvent[]` supplied to
 * the projection.  Hosts can use the offsets to dispatch edit/revert/fork/pin
 * actions without reverse-matching rendered text.  `eventIndexes` keeps the
 * complete turn bucket (including duplicate transport observations); it is
 * intentionally a raw-log mapping rather than a renderer position.
 */
export type AtelierMessageSourceMetadata = {
  sourceEventIndex: number | null;
  eventIndexes: readonly number[];
};

/** Runtime-facing approval decision used by the ExternalStore adapter. */
export type AssistantUiApprovalDecision = {
  approvalId: string;
  /**
   * The external-store runtime normally fills this in even for a bare
   * free-form `{text}` response. Keep it optional because official
   * `ToolFallback` can invoke the renderer callback with that bare shape
   * before the runtime resolves it.
   */
  approved?: boolean;
  optionId?: string;
  text?: string;
  reason?: string;
  /** Full field-id keyed answers, when the host has a multi-field response. */
  answers?: Record<string, string>;
  /** Field id for a single free-form answer. */
  fieldId?: string;
  scope?: "once" | "session";
  cancelTurn?: boolean;
};

/** Exact wire envelope used by `interaction-answer` in `ws.ts`. */
export type AtelierInteractionAnswer = {
  requestId: string;
  response: InteractionResponse;
};

/**
 * The event-side field ids are deliberately kept separate from the
 * assistant-ui approval id. A request id addresses the pending interaction;
 * a field id addresses one answer inside `{answers: ...}`.
 */
export type AssistantUiApprovalField = {
  id: string;
  allowOther?: boolean;
  options?: readonly { label: string; value?: string }[];
};

export type AssistantUiApprovalContext = {
  fields?: readonly AssistantUiApprovalField[];
} | readonly AgentEvent[];

function fieldsForApproval(
  context: AssistantUiApprovalContext | undefined,
  requestId: string,
): readonly AssistantUiApprovalField[] | undefined {
  if (!context) return undefined;
  if ("fields" in context) return context.fields;
  const events = context as readonly AgentEvent[];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === "interaction" && event.requestId === requestId) {
      return event.fields;
    }
  }
  return undefined;
}

/**
 * Convert assistant-ui's approval callback payload to the Atelier wire shape.
 * Opaque option ids are passed through unchanged. A free-form response uses
 * the multi-input `answers` envelope because Atelier never treats answer text
 * as an implicit approval.
 */
export function assistantUiApprovalToInteractionResponse(
  decision: AssistantUiApprovalDecision,
  context?: AssistantUiApprovalContext,
): AtelierInteractionAnswer {
  if (decision.answers !== undefined) {
    return { requestId: decision.approvalId, response: { answers: { ...decision.answers } } };
  }
  const fields = fieldsForApproval(context, decision.approvalId);
  if (decision.optionId !== undefined) {
    // ToolFallback sends `{optionId, text}` for an "Other" choice. The
    // Atelier wire contract represents that answer under its field id; do not
    // lose the text or incorrectly key it by the request id.
    if (decision.text !== undefined && fields?.length === 1 && fields[0]?.allowOther) {
      return {
        requestId: decision.approvalId,
        response: { answers: { [fields[0].id]: decision.text } },
      };
    }
    if (decision.text !== undefined && fields && fields.length > 1) {
      throw new Error(
        `La réponse texte de l'interaction ${decision.approvalId} nécessite answers pour ses plusieurs champs.`,
      );
    }
    return {
      requestId: decision.approvalId,
      response: {
        optionId: decision.optionId,
        ...(decision.cancelTurn !== undefined ? { cancelTurn: decision.cancelTurn } : {}),
      },
    };
  }
  if (decision.text !== undefined) {
    const fieldId = decision.fieldId
      ?? (fields?.length === 1 ? fields[0]?.id : undefined);
    if (!fieldId) {
      const reason = fields && fields.length > 1
        ? "plusieurs champs"
        : "aucun champ";
      throw new Error(
        `La réponse texte de l'interaction ${decision.approvalId} nécessite un fieldId ou answers (${reason}).`,
      );
    }
    return {
      requestId: decision.approvalId,
      response: { answers: { [fieldId]: decision.text } },
    };
  }
  if (typeof decision.approved !== "boolean") {
    throw new Error(
      `La décision d'approbation ${decision.approvalId} ne contient ni approved, ni optionId, ni réponse texte.`,
    );
  }
  return {
    requestId: decision.approvalId,
    response: {
      allow: decision.approved,
      ...(decision.scope !== undefined ? { scope: decision.scope } : {}),
      ...(decision.cancelTurn !== undefined ? { cancelTurn: decision.cancelTurn } : {}),
    },
  };
}

type ThreadMessagePart = Exclude<ThreadMessageLike["content"], string>[number];
type ToolCallPart = Extract<ThreadMessagePart, { type: "tool-call" }>;
type TextPart = Extract<ThreadMessagePart, { type: "text" }>;

type TurnBucket = {
  key: string;
  turnId: string | null;
  provider: string | null;
  threadId: string | null;
  indexes: number[];
};

type Meta = HarnessEventMeta;

const TERMINAL_KINDS = new Set<AgentEvent["kind"]>(["done", "error"]);
const REASONING_SENTINELS = new Set(["__thinking", "__thinking-step"]);

function metaOf(event: AgentEvent): Meta | null {
  const meta = event.meta;
  return meta && "eventId" in meta ? meta : null;
}

function timestampOf(event: AgentEvent): number | null {
  const bodyTs = "ts" in event ? event.ts : undefined;
  const value = bodyTs ?? metaOf(event)?.ts ?? null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sequenceOf(event: AgentEvent): number | null {
  const sequence = metaOf(event)?.sequence;
  return typeof sequence === "number" && Number.isFinite(sequence) ? sequence : null;
}

function compareEvents(events: readonly AgentEvent[], left: number, right: number): number {
  const a = events[left];
  const b = events[right];
  if (!a || !b) return left - right;
  return (sequenceOf(a) ?? -1) - (sequenceOf(b) ?? -1)
    || (timestampOf(a) ?? -1) - (timestampOf(b) ?? -1)
    || left - right;
}

function orderedIndexes(events: readonly AgentEvent[], indexes: readonly number[]): number[] {
  return [...indexes].sort((left, right) => compareEvents(events, left, right));
}

function stableHash(value: string): string {
  let hash = 5381;
  for (const char of value.slice(0, 240)) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}

function eventHint(event: AgentEvent): string {
  switch (event.kind) {
    case "user":
    case "text":
    case "delta":
    case "thinking_delta":
    case "thinking":
    case "thinking_live":
    case "stream_set":
    case "streaming":
      return event.text;
    case "tool":
      return event.name;
    case "tool_update":
      return `${event.id}:${event.name}`;
    case "activity":
      return `${event.id}:${event.title}`;
    case "permission":
    case "interaction":
      return event.requestId;
    case "error":
      return event.message ?? "";
    case "done":
      return event.result ?? "";
    case "edit":
      return event.files.map((file) => file.path).join("|");
    default:
      return event.kind;
  }
}

function turnScope(
  event: AgentEvent | undefined,
  fallback: string,
  threadId: string | null,
): string {
  const meta = event ? metaOf(event) : null;
  const thread = threadId ?? meta?.threadId ?? "thread";
  const turn = meta?.turnId ?? fallback;
  return `${thread}:${turn}`;
}

function eventIdentity(event: AgentEvent, index: number, bucket: TurnBucket): string {
  const meta = metaOf(event);
  if (meta?.messageId) return `${bucket.key}:message:${meta.messageId}`;
  if (meta?.eventId) return `${bucket.key}:event:${meta.eventId}`;
  if (event.kind === "tool_update") return `${bucket.key}:item:${meta?.itemId ?? event.id}`;
  if (event.kind === "interaction" || event.kind === "permission") {
    return `${bucket.key}:request:${meta?.itemId ?? event.requestId}`;
  }
  const stamp = timestampOf(event) ?? 0;
  return `${bucket.key}:legacy:${event.kind}:${stamp}:${stableHash(eventHint(event))}:${index}`;
}

function eventMessageId(event: AgentEvent, index: number, bucket: TurnBucket): string {
  return `atelier:user:${eventIdentity(event, index, bucket)}`;
}

function assistantMessageId(bucket: TurnBucket): string {
  return `atelier:assistant:${bucket.key}`;
}

function dateOf(event: AgentEvent | undefined): Date | undefined {
  const stamp = event ? timestampOf(event) : null;
  return stamp == null ? undefined : new Date(stamp);
}

function eventIsTerminal(event: AgentEvent | undefined): boolean {
  return !!event && TERMINAL_KINDS.has(event.kind);
}

function latestIndex(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  predicate: (event: AgentEvent) => boolean,
): number | null {
  let latest: number | null = null;
  for (const index of indexes) {
    const event = events[index];
    if (!event || !predicate(event)) continue;
    if (latest == null || compareEvents(events, latest, index) <= 0) latest = index;
  }
  return latest;
}

function latestAssistantContentIndex(
  events: readonly AgentEvent[],
  indexes: readonly number[],
): number | null {
  return latestIndex(events, indexes, (event) => (
    event.kind === "text"
      || event.kind === "streaming"
      || event.kind === "delta"
      || event.kind === "stream_set"
  ));
}

function groupTurns(events: readonly AgentEvent[], threadId: string | null): TurnBucket[] {
  const turns: TurnBucket[] = [];
  const canonical = new Map<string, TurnBucket>();
  let legacy: TurnBucket | null = null;
  let lastCanonical: TurnBucket | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const meta = metaOf(event);
    if (meta?.turnId) {
      let bucket = canonical.get(meta.turnId);
      if (!bucket) {
        bucket = {
          key: turnScope(event, `turn-${meta.turnId}`, threadId),
          turnId: meta.turnId,
          provider: meta.provider || null,
          threadId: threadId ?? meta.threadId ?? null,
          indexes: [],
        };
        canonical.set(meta.turnId, bucket);
        turns.push(bucket);
      }
      bucket.indexes.push(index);
      lastCanonical = bucket;
      continue;
    }

    // A legacy widget belongs to the preceding canonical turn. This mirrors
    // the historical timeline repair without introducing a phantom message.
    if (event.kind === "widget" && lastCanonical) {
      lastCanonical.indexes.push(index);
      continue;
    }

    if (
      event.kind === "user"
      || legacy == null
      || (legacy.indexes.some((item) => eventIsTerminal(events[item])) && event.kind !== "goal")
    ) {
      const hint = `${event.kind}:${timestampOf(event) ?? 0}:${stableHash(eventHint(event))}`;
      legacy = {
        key: turnScope(event, `legacy-${hint}`, threadId),
        turnId: null,
        provider: null,
        threadId: threadId ?? meta?.threadId ?? null,
        indexes: [],
      };
      turns.push(legacy);
    }
    legacy.indexes.push(index);
  }

  return turns.sort((left, right) => (left.indexes[0] ?? 0) - (right.indexes[0] ?? 0));
}

function normalizeStatus(status: string | undefined): string {
  return status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? "";
}

function isFailedTool(action: LifecycleToolAction): boolean {
  if (action.kind !== "tool_update") return false;
  return (action.exitCode != null && action.exitCode !== 0) || isLifecycleFailedStatus(action.status);
}

function isCompletedTool(action: LifecycleToolAction): boolean {
  if (action.kind !== "tool_update") return false;
  return isLifecycleCompletedStatus(action.status) || isFailedTool(action);
}

function latestAction(
  events: readonly AgentEvent[],
  group: LifecycleToolGroup,
): { action: LifecycleToolAction; index: number } {
  let latest = { action: group.actions[0]!, index: group.indexes[0] ?? group.index };
  for (let offset = 1; offset < group.actions.length; offset += 1) {
    const candidate = { action: group.actions[offset]!, index: group.indexes[offset] ?? group.index };
    if (compareEvents(events, latest.index, candidate.index) <= 0) latest = candidate;
  }
  return latest;
}

function actionKey(action: LifecycleToolAction, index: number, bucket: TurnBucket): string {
  const meta = metaOf(action);
  const item = meta?.itemId ?? (action.kind === "tool_update" ? action.id : null);
  return item
    ? `${bucket.key}:item:${item}`
    : `${bucket.key}:event:${meta?.eventId ?? `${action.kind}-${index}`}`;
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function inputText(input: unknown, args: Record<string, unknown>): string {
  if (typeof input === "string") return input;
  if (input == null) return "";
  try {
    return JSON.stringify(args);
  } catch {
    return String(input);
  }
}

function toolImageReferences(action: LifecycleToolAction): string[] {
  const name = action.name.toLowerCase();
  const imageTool = name.includes("image") || name.includes("visual");
  if (!imageTool) return [];
  if (action.kind === "tool") {
    const legacy = action.name.match(/^image\s+(.+)$/iu)?.[1]?.trim();
    return legacy ? [legacy] : [];
  }
  const input = objectInput(action.input);
  const values: unknown[] = [];
  if (Array.isArray(input.paths)) values.push(...input.paths);
  if (input.path != null) values.push(input.path);
  if (name.includes("generate") && action.output) values.push(action.output);
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, all) => all.indexOf(value) === index);
}

function isRenderableImage(value: string): boolean {
  return /^(?:data:image\/|https:\/\/|blob:)/iu.test(value);
}

function dataPart(name: string, data: unknown): ThreadMessagePart {
  return { type: "data", name, data } as ThreadMessagePart;
}

function providerMetadata(value: Record<string, unknown>) {
  return { atelier: value } as ToolCallPart["providerMetadata"];
}

function toolApproval(event: Extract<AgentEvent, { kind: "permission" | "interaction" }>) {
  if (event.kind === "permission") {
    return {
      id: event.requestId,
      prompt: event.toolName,
      approved: event.answered == null ? undefined : event.answered,
      ...(event.answered === false ? { reason: "declined" } : {}),
    };
  }
  if (event.interactionType !== "approval") return undefined;
  const options = event.choices?.map((choice) => ({
    id: choice.optionId,
    kind: choice.kind?.replace(/_/g, "-") ?? "_atelier",
    label: choice.label,
    ...(choice.description ? { description: choice.description } : {}),
  }));
  return {
    id: event.requestId,
    prompt: event.detail ? `${event.title}\n${event.detail}` : event.title,
    display: options?.length ? "select" as const : "decision" as const,
    ...(options?.length ? { options } : {}),
    ...(event.fields?.some((field) => field.allowOther) ? { allowFreeform: true } : {}),
    ...(event.state === "answered" ? { approved: true } : {}),
    ...(event.state === "declined" ? { approved: false, reason: event.answerSummary ?? "declined" } : {}),
    ...(event.state === "expired" ? { resolution: "expired" as const } : {}),
  };
}

function interactionMatches(
  action: LifecycleToolAction,
  actionIndex: number,
  event: Extract<AgentEvent, { kind: "permission" | "interaction" }>,
  events: readonly AgentEvent[],
): boolean {
  const actionMeta = metaOf(action);
  const interactionMeta = metaOf(event);
  if (actionMeta?.itemId && interactionMeta?.itemId && actionMeta.itemId === interactionMeta.itemId) return true;
  if (action.kind === "tool_update" && action.id === event.requestId) return true;
  if (event.kind === "permission" && action.name === event.toolName) {
    const interactionIndex = events.indexOf(event);
    return Math.abs(actionIndex - interactionIndex) <= 2;
  }
  return false;
}

function toolCallPart(
  action: LifecycleToolAction,
  actionIndex: number,
  bucket: TurnBucket,
  interaction: Extract<AgentEvent, { kind: "permission" | "interaction" }> | null,
  lifecycle: TurnLifecycle,
): ToolCallPart {
  const input = action.kind === "tool_update" ? action.input : undefined;
  // `detail` is the provider's human-readable command/file summary.  It is
  // separate from `input` on `tool_update` (unlike legacy `tool` starts), so
  // dropping it here made the official fallback show only opaque JSON and
  // hid the distinction between two reused item ids during replay.  Keep the
  // provider input untouched; append the summary only to the display string.
  const detail = action.detail?.trim();
  const args = action.kind === "tool" && action.detail
    ? { detail: action.detail }
    : objectInput(input);
  const rawArgsText = inputText(input, args);
  const argsText = detail && action.kind === "tool_update"
    ? rawArgsText ? `${rawArgsText}\n${action.detail}` : action.detail
    : rawArgsText;
  const status = action.kind === "tool_update" ? normalizeStatus(action.status) : "";
  const failed = isFailedTool(action);
  const completed = isCompletedTool(action);
  const output = action.kind === "tool_update" ? action.output : "";
  const hasOutput = action.kind === "tool_update" && output.length > 0;
  const result = action.kind === "tool_update" && (completed || hasOutput) ? output : undefined;
  const imageRefs = toolImageReferences(action);
  const timing = action.kind === "tool_update" && (timestampOf(action) != null || action.durationMs != null)
    ? {
        startedAt: Math.max(0, (timestampOf(action) ?? Date.now()) - (action.durationMs ?? 0)),
        ...(completed && timestampOf(action) != null ? { completedAt: timestampOf(action)! } : {}),
      }
    : undefined;
  const agent = action.kind === "tool_update" ? action.agentActivity : undefined;
  const id = actionKey(action, actionIndex, bucket);
  const part: ToolCallPart = {
    type: "tool-call",
    toolCallId: id,
    toolName: action.name,
    args: args as ToolCallPart["args"],
    argsText,
    ...(result !== undefined ? { result } : {}),
    ...(failed ? { isError: true } : completed ? { isError: false } : {}),
    ...(timing ? { timing } : {}),
    ...(interaction?.kind === "permission" || interaction?.kind === "interaction"
      ? {
          ...(interaction.kind === "interaction" && interaction.state === "pending"
            ? { interrupt: { type: "human" as const, payload: interaction } }
            : {}),
          ...(toolApproval(interaction) ? { approval: toolApproval(interaction) } : {}),
        }
      : {}),
    providerMetadata: providerMetadata({
      eventId: metaOf(action)?.eventId ?? null,
      itemId: metaOf(action)?.itemId ?? (action.kind === "tool_update" ? action.id : null),
      status: status || null,
      lifecycle: lifecycle.active ? lifecycle.phase : lifecycle.terminal?.status ?? "idle",
      ...(action.kind === "tool_update" && action.source ? { source: action.source } : {}),
      ...(action.kind === "tool_update" && action.truncated != null ? { truncated: action.truncated } : {}),
      ...(action.kind === "tool_update" && action.outputLength != null ? { outputLength: action.outputLength } : {}),
      ...(imageRefs.length ? { imageRefs } : {}),
      ...(agent ? { agentActivity: agent } : {}),
    }),
  };
  return part;
}

function messageStatus(
  lifecycle: TurnLifecycle,
  pendingInteractions: readonly AgentEvent[],
  unresolvedTools: boolean,
): ThreadMessageLike["status"] {
  const pendingPermission = pendingInteractions.some((event) => event.kind === "permission");
  if (pendingInteractions.length > 0) {
    return { type: "requires-action", reason: pendingPermission ? "tool-calls" : "interrupt" };
  }
  if (lifecycle.active) return { type: "running" };
  if (lifecycle.terminal?.status === "stopped") return { type: "incomplete", reason: "cancelled" };
  if (lifecycle.terminal?.status === "failed") {
    const event = lifecycle.terminal.eventIndex;
    const failure = event >= 0 ? "turn failed" : "turn failed";
    return { type: "incomplete", reason: "error", error: failure };
  }
  if (lifecycle.terminal?.status === "completed") return { type: "complete", reason: "stop" };
  if (unresolvedTools) return { type: "incomplete", reason: "tool-calls" };
  return { type: "complete", reason: "unknown" };
}

function assistantTextPart(
  text: string,
  event: AgentEvent,
  lifecycle: TurnLifecycle,
  channel: "commentary" | "final",
  streaming: boolean,
): TextPart {
  return {
    type: "text",
    text,
    ...(streaming && lifecycle.active ? { status: { type: "running" as const } } : {}),
    providerMetadata: providerMetadata({
      channel,
      eventId: metaOf(event)?.eventId ?? null,
      itemId: metaOf(event)?.itemId ?? null,
    }),
  };
}

function reasoningPart(
  text: string,
  event: AgentEvent,
  lifecycle: TurnLifecycle,
): ThreadMessagePart {
  return {
    type: "reasoning",
    text,
    ...(lifecycle.active && (event.kind === "thinking_live" || event.kind === "thinking_delta")
      ? { status: { type: "running" as const } }
      : {}),
    // The official external-store converter drops empty text without a
    // summary. This is an activity label, never fabricated reasoning content.
    ...(!text.trim() ? { unstable_summary: "Réflexion en cours" } : {}),
    providerMetadata: providerMetadata({
      eventId: metaOf(event)?.eventId ?? null,
      signal: text.trim() ? "text" : "empty",
    }),
  } as ThreadMessagePart;
}

function latestInteractionEvents(
  events: readonly AgentEvent[],
  indexes: readonly number[],
): { event: Extract<AgentEvent, { kind: "permission" | "interaction" }>; index: number }[] {
  const latest = new Map<string, { event: Extract<AgentEvent, { kind: "permission" | "interaction" }>; index: number }>();
  for (const index of indexes) {
    const event = events[index];
    if (!event || (event.kind !== "permission" && event.kind !== "interaction")) continue;
    const previous = latest.get(event.requestId);
    if (!previous || compareEvents(events, previous.index, index) <= 0) latest.set(event.requestId, { event, index });
  }
  return [...latest.values()].sort((left, right) => compareEvents(events, left.index, right.index));
}

function pendingInteraction(
  event: Extract<AgentEvent, { kind: "permission" | "interaction" }>,
): boolean {
  return event.kind === "permission" ? event.answered == null : event.state === "pending";
}

function hasLiveEvidence(events: readonly AgentEvent[], indexes: readonly number[]): boolean {
  for (const index of indexes) {
    const event = events[index];
    if (!event) continue;
    if (event.kind === "streaming" || event.kind === "delta" || event.kind === "stream_set"
      || event.kind === "thinking_live" || event.kind === "thinking_delta") return true;
    if (event.kind === "tool_update" && isLifecycleRunningStatus(event.status)) return true;
    if (event.kind === "activity" && normalizeStatus(event.status) === "running") return true;
    if ((event.kind === "permission" && event.answered == null)
      || (event.kind === "interaction" && event.state === "pending")) return true;
  }
  return false;
}

function userParts(event: Extract<AgentEvent, { kind: "user" }>): ThreadMessagePart[] {
  const parts: ThreadMessagePart[] = [];
  if (event.text.trim()) parts.push({ type: "text", text: event.text });
  if (event.imageUrl) {
    if (isRenderableImage(event.imageUrl)) {
      parts.push({ type: "image", image: event.imageUrl, ...(event.label ? { filename: event.label } : {}) } as ThreadMessagePart);
    } else {
      parts.push(dataPart("atelier-image", { ref: event.imageUrl, label: event.label ?? null }));
    }
  }
  if (event.label || event.pastes?.length || event.kb) {
    parts.push(dataPart("atelier-attachments", {
      label: event.label ?? null,
      pastes: event.pastes ?? [],
      kb: event.kb ?? null,
    }));
  }
  if (event.notes?.length) parts.push(dataPart("atelier-annotations", event.notes));
  return parts;
}

function assistantData(event: AgentEvent): { name: string; data: unknown } | null {
  switch (event.kind) {
    case "activity":
      return { name: "atelier-activity", data: event };
    case "edit":
      return { name: "atelier-edit", data: event };
    case "widget":
      return { name: "atelier-widget", data: event };
    case "todos":
      return { name: "atelier-todos", data: event.items };
    case "proposed_plan":
      return { name: "atelier-plan", data: event };
    case "goal":
      return { name: "atelier-goal", data: event };
    case "agent_message":
      return { name: "atelier-agent-message", data: event };
    case "error":
      return { name: "atelier-error", data: { message: event.message } };
    default:
      return null;
  }
}

function projectedAssistantMessage(
  events: readonly AgentEvent[],
  bucket: TurnBucket,
  lifecycle: TurnLifecycle,
  isActive: boolean,
): ThreadMessageLike {
  const retained = new Set(lifecycle.dedupedIndexes);
  const indexes = orderedIndexes(events, bucket.indexes.filter((index) => retained.has(index)));
  const eventIndexes = orderedIndexes(events, bucket.indexes);
  const groups = lifecycle.actionGroups;
  const groupByIndex = new Map<number, LifecycleToolGroup>();
  for (const group of groups) {
    const anchor = group.index;
    for (const index of group.indexes) groupByIndex.set(index, group);
    groupByIndex.set(anchor, group);
  }
  const emittedGroups = new Set<string>();
  const interactions = latestInteractionEvents(events, indexes);
  const usedInteractions = new Set<string>();
  const parts: ThreadMessagePart[] = [];
  const streamPositions = new Map<string, number>();
  const metadataEvents: unknown[] = [];
  const toolHistory: Record<string, unknown[]> = {};
  const latestAssistant = lifecycle.latestAssistantIndex;

  const appendText = (event: AgentEvent, index: number, text: string, streaming: boolean) => {
    if (!text) return;
    const streamKey = bucket.key;
    const openPosition = streamPositions.get(streamKey);
    if ((event.kind === "delta" || event.kind === "stream_set" || event.kind === "streaming") && openPosition != null) {
      const previous = parts[openPosition];
      if (previous?.type === "text") {
        const nextText = event.kind === "delta" ? previous.text + text : text;
        parts[openPosition] = assistantTextPart(nextText, event, lifecycle, "commentary", streaming);
        return;
      }
    }
    if (event.kind === "text" && openPosition != null) {
      const previous = parts[openPosition];
      if (previous?.type === "text") {
        parts[openPosition] = assistantTextPart(text, event, lifecycle, latestAssistant === index ? "final" : "commentary", false);
        streamPositions.delete(streamKey);
        return;
      }
    }
    const channel = latestAssistant === index && (lifecycle.terminal != null || lifecycle.phase === "final_answer")
      ? "final"
      : "commentary";
    const position = parts.length;
    parts.push(assistantTextPart(text, event, lifecycle, channel, streaming));
    if (streaming || event.kind === "delta" || event.kind === "stream_set") streamPositions.set(streamKey, position);
  };

  const appendReasoning = (event: AgentEvent, text: string) => {
    // Only adjacent reasoning belongs to the same phase. A tool or answer
    // between two deltas must not pull later reasoning above that action.
    const position = parts.length - 1;
    const previous = parts[position];
    if (previous?.type === "reasoning" &&
      (!text || !previous.text || event.kind === "thinking_delta" || event.kind === "thinking_live")) {
      parts[position] = reasoningPart(previous.text + text, event, lifecycle);
    } else {
      parts.push(reasoningPart(text, event, lifecycle));
    }
  };

  for (const index of indexes) {
    const event = events[index]!;
    const group = groupByIndex.get(index);
    if (group && !emittedGroups.has(group.key) && index === group.index) {
      const latest = latestAction(events, group);
      const matching = interactions.find(({ event: candidate }) => interactionMatches(latest.action, latest.index, candidate, events));
      if (matching) usedInteractions.add(matching.event.requestId);
      const part = toolCallPart(latest.action, latest.index, bucket, matching?.event ?? null, lifecycle);
      parts.push(part);
      emittedGroups.add(group.key);
      const toolHistoryKey = part.toolCallId ?? actionKey(latest.action, latest.index, bucket);
      toolHistory[toolHistoryKey] = group.actions.map((action, offset) => {
        const actionIndex = group.indexes[offset] ?? group.index;
        return {
          eventId: metaOf(action)?.eventId ?? null,
          sequence: sequenceOf(action),
          status: action.kind === "tool_update" ? action.status ?? null : "started",
          index: actionIndex,
        };
      });
      for (const ref of toolImageReferences(latest.action)) {
        parts.push(isRenderableImage(ref)
          ? ({ type: "image", image: ref } as ThreadMessagePart)
          : dataPart("atelier-image", { ref, toolCallId: part.toolCallId }));
      }
      continue;
    }
    if (group) continue;

    switch (event.kind) {
      case "user":
      case "done":
      case "started":
      case "heartbeat":
      case "usage":
      case "drafting":
        break;
      case "text":
      case "streaming":
      case "delta":
      case "stream_set":
        appendText(event, index, event.text, event.kind !== "text");
        break;
      case "thinking":
      case "thinking_live":
      case "thinking_delta":
        appendReasoning(event, event.text);
        break;
      case "thinking_progress":
        appendReasoning(event, "");
        break;
      case "permission":
      case "interaction": {
        // Unmatched requests are emitted below as native synthetic tool-call
        // parts. A raw data row would hide the approval/interrupt primitive.
        break;
      }
      case "activity":
      case "edit":
      case "widget":
      case "todos":
      case "proposed_plan":
      case "goal":
      case "agent_message":
      case "error": {
        const data = assistantData(event);
        if (data) {
          parts.push(dataPart(data.name, data.data));
          metadataEvents.push(data.data);
        }
        break;
      }
      case "tool": {
        if (REASONING_SENTINELS.has(event.name)) appendReasoning(event, "");
        break;
      }
    }
  }

  // A permission may arrive before its tool call, or the provider may expose a
  // generic interaction with no tool at all. Preserve it as a native tool-call
  // part so assistant-ui's approval/interrupt primitives remain actionable.
  for (const { event, index } of interactions) {
    if (usedInteractions.has(event.requestId)) continue;
    const name = event.kind === "permission" ? event.toolName : `interaction:${event.interactionType}`;
    const synthetic: LifecycleToolAction = event.kind === "permission"
      ? {
          kind: "tool_update",
          id: event.requestId,
          name,
          input: event.input,
          output: "",
          status: pendingInteraction(event) ? "running" : "completed",
          meta: event.meta,
          ts: event.ts,
        }
      : {
          kind: "tool_update",
          id: event.requestId,
          name,
          // Generic interactions have no provider tool input.  Preserve the
          // user-facing question and its bounded detail as the synthetic
          // tool's args so a resolved row remains inspectable when opened;
          // answerSummary is the only safe output available after replay.
          input: {
            question: event.title,
            ...(event.detail ? { detail: event.detail } : {}),
          },
          output: event.answerSummary ?? "",
          status: pendingInteraction(event) ? "running" : "completed",
          meta: event.meta,
          ts: event.ts,
        };
    parts.push(toolCallPart(synthetic, index, bucket, event, lifecycle));
    usedInteractions.add(event.requestId);
  }

  // A replayed pending snapshot may remain before a terminal marker.  Keep
  // the row in history, but only expose it as an actionable interrupt while
  // this bucket is still active.
  const pending = lifecycle.active
    ? interactions.filter(({ event }) => pendingInteraction(event)).map(({ event }) => event)
    : [];
  const unresolvedTools = groups.some((group) => {
    const latest = latestAction(events, group).action;
    return latest.kind === "tool" || !isCompletedTool(latest);
  });
  const status = messageStatus(lifecycle, pending, unresolvedTools);
  const first = events[bucket.indexes[0]];
  const terminalEvent = lifecycle.terminal ? events[lifecycle.terminal.eventIndex] : undefined;
  const sourceEventIndex = latestAssistantContentIndex(events, indexes)
    ?? lifecycle.latestEventIndex
    ?? eventIndexes[eventIndexes.length - 1]
    ?? null;
  const custom = {
    atelier: {
      /** Zero-based offset in the raw AgentEvent[] supplied to the projection. */
      sourceEventIndex,
      /** Complete raw turn bucket, kept for host edit/revert/fork/pin callbacks. */
      eventIndexes,
      turnId: bucket.turnId,
      provider: bucket.provider,
      threadId: bucket.threadId,
      phase: lifecycle.phase,
      active: isActive,
      terminal: lifecycle.terminal
        ? { status: lifecycle.terminal.status, eventIndex: lifecycle.terminal.eventIndex }
        : null,
      eventIds: indexes.map((index) => metaOf(events[index]!)?.eventId).filter((id): id is string => !!id),
      pendingInteractionIds: pending.map((event) => event.requestId),
      reasoningSignals: indexes
        .map((index) => events[index]!)
        .filter((event) => event.kind === "thinking_progress" || (event.kind === "tool" && REASONING_SENTINELS.has(event.name)))
        .map((event) => event.kind === "thinking_progress"
          ? { count: event.count }
          : event.kind === "tool"
            ? { name: event.name }
            : {}),
      toolHistory,
      annotations: metadataEvents,
      ...(terminalEvent?.kind === "done" ? { result: terminalEvent.result, ok: terminalEvent.ok } : {}),
      ...(terminalEvent?.kind === "error" ? { error: terminalEvent.message } : {}),
    },
  };

  return {
    role: "assistant",
    id: assistantMessageId(bucket),
    ...(dateOf(first) ? { createdAt: dateOf(first) } : {}),
    // Explicit phase status is required by the external-store runtime. A
    // completed tool does not complete the turn, but does end prior reasoning.
    // Signal-only phases carry no inspectable model text once they are over.
    content: parts.flatMap((part, index): ThreadMessagePart[] => {
      if (part.type !== "reasoning") return [part];
      const running = status?.type === "running" && index === parts.length - 1;
      if (!running && !part.text.trim()) return [];
      return [{ ...part, status: running ? { type: "running" } : { type: "complete" } }];
    }),
    status,
    // unstable_annotations/unstable_data are left unset: nothing in this
    // codebase reads them, and metadataEvents (raw AgentEvent payloads,
    // possibly containing Dates/undefined) is not assignable to
    // ReadonlyJSONValue[] without an unsafe cast. The same events are
    // already exposed, typed, via custom.atelier.annotations.
    metadata: { custom },
  };
}

function projectInternal(
  events: readonly AgentEvent[],
  options: AssistantUiProjectionOptions,
): AssistantUiProjection {
  const buckets = groupTurns(events, options.threadId ?? null);
  const lifecycles: TurnLifecycle[] = [];
  const lastBucket = buckets[buckets.length - 1] ?? null;
  const projected: ThreadMessageLike[] = [];

  // The transport clock is authoritative before the first event is flushed.
  // Keep the native stop/cancel affordance available for that short window;
  // once a bucket exists, terminal ordering below still wins over a stale
  // `workingSince` value.
  if (!lastBucket && options.workingSince != null) {
    return { messages: projected, isRunning: true, activeTurnId: null, lifecycle: lifecycles };
  }

  for (const bucket of buckets) {
    const firstUser = bucket.indexes.find((index) => events[index]?.kind === "user");
    if (firstUser != null) {
      const user = events[firstUser];
      if (user?.kind === "user") {
        const userMessage: ThreadMessageLike = {
          role: "user",
          id: eventMessageId(user, firstUser, bucket),
          ...(dateOf(user) ? { createdAt: dateOf(user) } : {}),
          content: userParts(user),
          metadata: {
            custom: {
              atelier: {
                /** Zero-based offset in the raw AgentEvent[] supplied to the projection. */
                sourceEventIndex: firstUser,
                /** Complete raw turn bucket, kept for host edit/revert/fork/pin callbacks. */
                eventIndexes: orderedIndexes(events, bucket.indexes),
                turnId: bucket.turnId,
                provider: bucket.provider,
                threadId: bucket.threadId,
                label: user.label ?? null,
                pastes: user.pastes ?? [],
                kb: user.kb ?? null,
                context: user.context ?? null,
                notes: user.notes ?? [],
              },
            },
          },
        };
        projected.push(userMessage);
      }
    }

    const terminalIndex = latestIndex(events, bucket.indexes, eventIsTerminal);
    // A history reload can restore a still-pending interaction without the
    // ephemeral working clock.  Keep that explicit waiter actionable, while
    // requiring it to be newer than any terminal marker so a stale pending
    // snapshot cannot resurrect a settled turn.
    const pendingInteractionIndex = latestIndex(events, bucket.indexes, (event) => (
      (event.kind === "interaction" && event.state === "pending")
      || (event.kind === "permission" && event.answered == null)
    ));
    const pendingInteractionIsFresh = terminalIndex == null && pendingInteractionIndex != null;
    const explicitlyActive = options.workingSince !== undefined
      ? (options.workingSince != null && terminalIndex == null) || pendingInteractionIsFresh
      : terminalIndex == null && (hasLiveEvidence(events, bucket.indexes) || pendingInteractionIsFresh);
    const active = bucket === lastBucket && explicitlyActive;
    const lifecycle = deriveTurnLifecycle(events, bucket.indexes, {
      turnId: bucket.turnId,
      provider: bucket.provider,
      active,
      terminalIndex,
    });
    lifecycles.push(lifecycle);
    projected.push(projectedAssistantMessage(events, bucket, lifecycle, active));
  }

  return {
    messages: projected,
    isRunning: lifecycles.some((lifecycle) => lifecycle.active),
    activeTurnId: lifecycles.find((lifecycle) => lifecycle.active)?.turnId ?? null,
    lifecycle: lifecycles,
  };
}

/** Return the native assistant-ui message-like list for an Atelier event log. */
export function projectAgentEventsToThreadMessages(
  events: readonly AgentEvent[],
  options: AssistantUiProjectionOptions = {},
): AssistantUiProjection {
  return projectInternal(events, options);
}

/** Message-list-only form for `messages` props and repository adapters. */
export function projectAgentEventsToThreadMessageList(
  events: readonly AgentEvent[],
  options: AssistantUiProjectionOptions = {},
): ThreadMessageLike[] {
  return [...projectInternal(events, options).messages];
}

/** Return messages and the canonical run flag for `ExternalStoreAdapter`. */
export function deriveAssistantUiProjection(
  events: readonly AgentEvent[],
  options: AssistantUiProjectionOptions = {},
): AssistantUiProjection {
  return projectInternal(events, options);
}

/** Short alias for adapter call sites. */
export const projectAgentEvents = deriveAssistantUiProjection;
