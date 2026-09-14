import type { AgentEvent } from "../ws";

/**
 * A small, provider-neutral lifecycle projection for one Atelier turn.
 *
 * Synara keeps a work item alive by `(turnId, itemId)` and folds every later
 * lifecycle observation into that item.  The Atelier wire format exposes the
 * same information on `AgentEvent.meta` (with `tool_update.id` as the legacy
 * item id), so this module applies that rule before deriving a visible state.
 * It deliberately contains no React or provider adapter code: the timeline,
 * the active tail, and replay all consume this one projection.
 */

export type LifecycleToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;

export type LifecycleToolGroup = {
  key: string;
  index: number;
  indexes: number[];
  actions: LifecycleToolAction[];
};

export type LifecycleActiveState =
  | { kind: "waiting"; eventIndex: number }
  | { kind: "activity"; eventIndex: number; live: boolean }
  | { kind: "reasoning"; texts: string[]; live: boolean }
  | { kind: "answering"; eventIndex: number }
  | { kind: "processing" }
  | { kind: "thinking" };

export type LifecycleTerminal = {
  status: "completed" | "failed" | "stopped";
  eventIndex: number;
};

export type LifecycleAgent = {
  id: string;
  status: string;
  message?: string | null;
  eventIndex: number;
};

export type TurnLifecycleState =
  | { kind: "idle" }
  | LifecycleActiveState
  | { kind: "terminal"; status: LifecycleTerminal["status"]; eventIndex: number };

export type TurnLifecyclePhase =
  | "idle"
  | "prework"
  | "waiting"
  | "final_answer"
  | "completed"
  | "stopped"
  | "failed";

export type TurnLifecycle = {
  turnId: string | null;
  provider: string | null;
  active: boolean;
  phase: TurnLifecyclePhase;
  /** Complete state, including a terminal marker for settled turns. */
  state: TurnLifecycleState;
  /** Active-only compatibility view used by existing timeline components. */
  activeState: LifecycleActiveState | null;
  terminal: LifecycleTerminal | null;
  terminalIndex: number | null;
  latestEventIndex: number | null;
  latestMeaningfulIndex: number | null;
  latestAssistantIndex: number | null;
  latestReasoningIndex: number | null;
  latestToolIndex: number | null;
  latestActivityIndex: number | null;
  latestAgentIndex: number | null;
  pendingInteractionIndex: number | null;
  reasoningTexts: string[];
  actionGroups: LifecycleToolGroup[];
  activeActionGroups: LifecycleToolGroup[];
  runningTools: LifecycleToolAction[];
  runningAgents: LifecycleAgent[];
  failedAgents: LifecycleAgent[];
  latestToolAction: LifecycleToolAction | null;
  latestActivity: Extract<AgentEvent, { kind: "activity" }> | null;
  /** Transport observation, never an action or evidence of model progress. */
  supervision: Extract<AgentEvent, { kind: "activity" }> | null;
  /** Indices retained after exact event-id de-duplication. */
  dedupedIndexes: number[];
};

const REASONING_TOOL = "__thinking";
const TERMINAL_KINDS = new Set<AgentEvent["kind"]>(["done", "error"]);
const RUNNING_STATUS = new Set([
  "running",
  "pending",
  "queued",
  "started",
  "executing",
  "in-progress",
  "inprogress",
]);
const FAILED_STATUS = new Set([
  "failed",
  "error",
  "errored",
  "interrupted",
  "cancelled",
  "canceled",
  "denied",
  "declined",
  "stopped",
]);
const COMPLETED_STATUS = new Set(["completed", "complete", "succeeded", "success", "done"]);

function metaOf(event: AgentEvent) {
  const meta = event.meta;
  return meta && "eventId" in meta ? meta : null;
}

function timestampOf(event: AgentEvent): number | null {
  const bodyTs = "ts" in event ? event.ts : undefined;
  return bodyTs ?? metaOf(event)?.ts ?? null;
}

function sequenceOf(event: AgentEvent): number | null {
  return metaOf(event)?.sequence ?? null;
}

function normalizeStatus(status: string | undefined): string {
  return status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? "";
}

function contentHint(event: AgentEvent): string {
  switch (event.kind) {
    case "error": return event.message;
    case "permission": return event.requestId;
    case "interaction": return event.requestId;
    case "tool_update": return `${event.id}:${event.name}`;
    case "tool": return event.name;
    case "activity": return `${event.id}:${event.title}`;
    case "widget": return event.id;
    case "edit": return event.files.map((file) => file.path).join("|");
    case "todos": return event.items.map((item) => `${item.completed ? "x" : "-"}${item.text}`).join("|");
    case "goal": return event.goal?.objective ?? "";
    case "done": return event.result;
    case "user":
    case "text":
    case "delta":
    case "thinking_delta":
    case "thinking":
    case "thinking_live":
    case "stream_set":
    case "streaming":
      return event.text;
    default:
      return event.kind;
  }
}

function shortHash(value: string): string {
  let hash = 5381;
  for (const char of value.slice(0, 160)) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}

/**
 * Canonical identity for de-duplication and stable rows.
 *
 * A tool update is always scoped by turn.  A request/activity id is scoped in
 * the same way; eventId is the fallback for events that do not expose an item
 * id.  Legacy events get a content-based key rather than a positional index,
 * so inserting a replayed event cannot remount every row below it.
 */
export function lifecycleEventIdentity(event: AgentEvent, index = 0, fallbackTurnId: string | null = null): string {
  const meta = metaOf(event);
  const turnId = meta?.turnId ?? fallbackTurnId ?? "legacy";
  let itemId = meta?.itemId ?? null;
  if (!itemId) {
    switch (event.kind) {
      case "tool_update": itemId = event.id; break;
      case "interaction":
      case "permission": itemId = event.requestId; break;
      case "activity":
      case "widget": itemId = event.id; break;
      // Legacy `tool` starts have no call id. Keep each observation distinct;
      // the following `tool_update` can still join it when a metadata item id
      // is available. Using the tool name here would collapse two sequential
      // `Read` calls into one row.
      case "tool": itemId = null; break;
      default: break;
    }
  }
  if (itemId) return `${turnId}:${itemId}`;
  if (meta?.eventId) return `${turnId}:event:${meta.eventId}`;
  const timestamp = timestampOf(event) ?? 0;
  return `${turnId}:legacy:${event.kind}:${timestamp}:${shortHash(contentHint(event))}:${index}`;
}

/** Exact event-id de-duplication used by both live and replay projections. */
export function dedupeLifecycleIndexes(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  fallbackTurnId: string | null = null,
): number[] {
  const seen = new Set<string>();
  return indexes.filter((index) => {
    const event = events[index];
    if (!event) return false;
    const meta = metaOf(event);
    // For authoritative events, eventId is the transport identity.  The item
    // identity still scopes lifecycle snapshots, but must not hide a later
    // update that has a new eventId.
    // Without authoritative eventId there is no safe way to distinguish a
    // duplicate reconnect from a legitimate legacy lifecycle update (the same
    // tool id is reused for running -> completed), so retain the observation.
    const identity = meta?.eventId
      ? `${meta.turnId ?? fallbackTurnId ?? "legacy"}:event:${meta.eventId}`
      : `legacy:index:${index}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function lifecycleOrder(event: AgentEvent, index: number): [number, number, number] {
  return [sequenceOf(event) ?? -1, timestampOf(event) ?? -1, index];
}

function compareOrder(a: AgentEvent, ai: number, b: AgentEvent, bi: number): number {
  const left = lifecycleOrder(a, ai);
  const right = lifecycleOrder(b, bi);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function isAfter(events: readonly AgentEvent[], index: number, boundary: number | null): boolean {
  return boundary == null || compareOrder(events[boundary]!, boundary, events[index]!, index) < 0;
}

function isTerminal(event: AgentEvent): boolean {
  return TERMINAL_KINDS.has(event.kind);
}

function isAssistantText(event: AgentEvent): event is Extract<AgentEvent, { kind: "text" | "streaming" }> {
  return event.kind === "text" || event.kind === "streaming";
}

function isReasoning(event: AgentEvent): boolean {
  return event.kind === "thinking" || event.kind === "thinking_live" ||
    event.kind === "thinking_delta" || event.kind === "thinking_progress" ||
    (event.kind === "tool" && (event.name === REASONING_TOOL || event.name === "__thinking-step"));
}

function reasoningText(event: AgentEvent): string | null {
  if (event.kind !== "thinking" && event.kind !== "thinking_live") return null;
  const text = event.text.trim();
  return text || null;
}

function isToolAction(event: AgentEvent): event is LifecycleToolAction {
  if (event.kind === "tool_update") return true;
  if (event.kind !== "tool") return false;
  if (event.name.startsWith("en attente : ")) return false;
  return event.name === "__compacted" || event.name.startsWith("__edits:") || !event.name.startsWith("__");
}

function itemIdentity(event: LifecycleToolAction, index: number, fallbackTurnId: string | null): string {
  const meta = metaOf(event);
  const turnId = meta?.turnId ?? fallbackTurnId ?? "legacy";
  const item = meta?.itemId ?? (event.kind === "tool_update" ? event.id : null);
  return `${turnId}:${item || `event-${index}`}`;
}

function isStandaloneToolAction(event: LifecycleToolAction): boolean {
  if (event.kind === "tool_update" && event.agentActivity != null) return true;
  const name = event.name.toLowerCase();
  return name.includes("view_image") || name.includes("image_view") ||
    name.includes("open_image") || name === "image" || name.startsWith("image ");
}

function isStandaloneToolGroup(group: LifecycleToolGroup): boolean {
  return group.actions.some(isStandaloneToolAction);
}

function isRunningTool(event: LifecycleToolAction): boolean {
  if (event.kind === "tool") return !event.name.startsWith("__");
  const status = normalizeStatus(event.status);
  if (event.exitCode != null && event.exitCode !== 0) return false;
  return RUNNING_STATUS.has(status);
}

function isPendingInteraction(event: AgentEvent): boolean {
  return (event.kind === "interaction" && event.state === "pending") ||
    (event.kind === "permission" && event.answered == null);
}

function isStoppedTerminal(event: AgentEvent): boolean {
  if (event.kind === "done") {
    const status = (event as Extract<AgentEvent, { kind: "done" }> & { status?: string }).status;
    if (["stopped", "interrupted", "cancelled", "canceled", "aborted"].includes(normalizeStatus(status))) return true;
    return event.ok === false && /\b(stop|stopped|interrupt|interromp|cancel|annul)/iu.test(event.result ?? "");
  }
  return event.kind === "error" && /\b(stop|stopped|interrupt|interromp|cancel|annul)/iu.test(event.message);
}

function actionGroups(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  fallbackTurnId: string | null,
): LifecycleToolGroup[] {
  const groups: LifecycleToolGroup[] = [];
  const byIdentity = new Map<string, LifecycleToolGroup>();
  const seenEvents = new Set<string>();
  for (const index of indexes) {
    const event = events[index];
    if (!event || !isToolAction(event)) continue;
    const meta = metaOf(event);
    const eventIdentity = meta?.eventId
      ? `${meta.turnId ?? fallbackTurnId ?? "legacy"}:event:${meta.eventId}`
      : `legacy:index:${index}`;
    if (seenEvents.has(eventIdentity)) continue;
    seenEvents.add(eventIdentity);
    const identity = itemIdentity(event, index, fallbackTurnId);
    let group = byIdentity.get(identity);
    if (!group) {
      group = { key: `tools:${identity}`, index, indexes: [], actions: [] };
      byIdentity.set(identity, group);
      groups.push(group);
    }
    group.indexes.push(index);
    group.actions.push(event);
  }
  return groups;
}

function latestAction(group: LifecycleToolGroup): { action: LifecycleToolAction; index: number } | null {
  let latest: { action: LifecycleToolAction; index: number } | null = null;
  for (let offset = 0; offset < group.actions.length; offset += 1) {
    const action = group.actions[offset];
    const index = group.indexes[offset] ?? group.index;
    if (!latest || compareOrder(latest.action, latest.index, action, index) <= 0) latest = { action, index };
  }
  return latest;
}

function latestIndex(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  predicate: (event: AgentEvent) => boolean,
): number | null {
  let latest: number | null = null;
  for (const index of indexes) {
    const event = events[index];
    if (event && predicate(event) && (latest == null || compareOrder(events[latest]!, latest, event, index) <= 0)) latest = index;
  }
  return latest;
}

function latestPendingInteraction(
  events: readonly AgentEvent[],
  indexes: readonly number[],
): number | null {
  const byRequest = new Map<string, { index: number; pending: boolean }>();
  for (const index of indexes) {
    const event = events[index];
    if (!event || (event.kind !== "interaction" && event.kind !== "permission")) continue;
    const requestId = event.requestId;
    const previous = byRequest.get(requestId);
    if (!previous || compareOrder(events[previous.index]!, previous.index, event, index) <= 0) {
      byRequest.set(requestId, { index, pending: isPendingInteraction(event) });
    }
  }
  let pending: number | null = null;
  for (const state of byRequest.values()) {
    if (!state.pending || pending == null || compareOrder(events[pending]!, pending, events[state.index]!, state.index) <= 0) pending = state.pending ? state.index : pending;
  }
  return pending;
}

function agentSnapshots(
  events: readonly AgentEvent[],
  groups: readonly LifecycleToolGroup[],
): { all: LifecycleAgent[]; running: LifecycleAgent[]; failed: LifecycleAgent[]; latestIndex: number | null } {
  const byId = new Map<string, LifecycleAgent>();
  for (const group of groups) {
    for (let offset = 0; offset < group.actions.length; offset += 1) {
      const action = group.actions[offset];
      const index = group.indexes[offset] ?? group.index;
      if (action.kind !== "tool_update" || !action.agentActivity) continue;
      for (const [id, state] of Object.entries(action.agentActivity.agentsStates)) {
        const previous = byId.get(id);
        if (!previous || compareOrder(events[previous.eventIndex]!, previous.eventIndex, action, index) <= 0) {
          byId.set(id, { id, status: state.status, message: state.message, eventIndex: index });
        }
      }
    }
  }
  const all = [...byId.values()];
  const running = all.filter((agent) => RUNNING_STATUS.has(normalizeStatus(agent.status)));
  const failed = all.filter((agent) => FAILED_STATUS.has(normalizeStatus(agent.status)));
  const latest = all.reduce<number | null>((current, agent) => (
    current == null || compareOrder(events[current]!, current, events[agent.eventIndex]!, agent.eventIndex) <= 0
      ? agent.eventIndex
      : current
  ), null);
  return { all, running, failed, latestIndex: latest };
}

type ActivityEvent = Extract<AgentEvent, { kind: "activity" }>;

export function isCodexSupervision(event: AgentEvent): event is ActivityEvent {
  return event.kind === "activity" && event.id === "codex-supervision";
}

/**
 * Return one provider snapshot per activity item.  Activity events are
 * replacement updates just like `tool_update`: scanning every raw event would
 * keep an old `running` row alive after a newer `completed` snapshot (and a
 * stale replayed frame could resurrect it again).
 */
function latestActivitySnapshots(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  fallbackTurnId: string | null,
): { event: ActivityEvent; index: number }[] {
  const byIdentity = new Map<string, { event: ActivityEvent; index: number }>();
  for (const index of indexes) {
    const event = events[index];
    if (!event || event.kind !== "activity") continue;
    const meta = metaOf(event);
    const turnId = meta?.turnId ?? fallbackTurnId ?? "legacy";
    const itemId = meta?.itemId ?? event.id;
    const identity = `${turnId}:${itemId}`;
    const previous = byIdentity.get(identity);
    if (!previous || compareOrder(events[previous.index]!, previous.index, event, index) <= 0) {
      byIdentity.set(identity, { event, index });
    }
  }
  return [...byIdentity.values()].sort((a, b) => compareOrder(a.event, a.index, b.event, b.index));
}

function phaseForTerminal(terminal: LifecycleTerminal | null): TurnLifecyclePhase {
  if (!terminal) return "prework";
  return terminal.status;
}

export type DeriveTurnLifecycleOptions = {
  turnId?: string | null;
  provider?: string | null;
  active?: boolean;
  terminalIndex?: number | null;
  latestAssistantIndex?: number | null;
};

/** Derive one turn's complete lifecycle projection. */
export function deriveTurnLifecycle(
  events: readonly AgentEvent[],
  indexes: readonly number[],
  options: DeriveTurnLifecycleOptions = {},
): TurnLifecycle {
  const fallbackTurnId = options.turnId ?? null;
  const dedupedIndexes = dedupeLifecycleIndexes(events, indexes, fallbackTurnId);
  const groups = actionGroups(events, dedupedIndexes, fallbackTurnId);
  const latestAssistantIndex = latestIndex(events, dedupedIndexes, isAssistantText)
    ?? options.latestAssistantIndex
    ?? null;
  const latestReasoningIndex = latestIndex(events, dedupedIndexes, isReasoning);
  const latestToolIndex = latestIndex(events, dedupedIndexes, isToolAction);
  const latestActivityIndex = latestIndex(events, dedupedIndexes, (event) => event.kind === "activity" && !isCodexSupervision(event));
  const supervisionIndex = latestIndex(events, dedupedIndexes, isCodexSupervision);
  const latestEventIndex = latestIndex(events, dedupedIndexes, () => true);
  const latestMeaningfulIndex = latestIndex(events, dedupedIndexes, (event) => (
    isReasoning(event) || isAssistantText(event) || isToolAction(event) ||
    (event.kind === "activity" && !isCodexSupervision(event)) || event.kind === "edit" || event.kind === "drafting"
  ));
  const reasoningTexts = dedupedIndexes.flatMap((index) => {
    const text = reasoningText(events[index]!);
    return text == null ? [] : [text];
  });

  const terminalCandidate = latestIndex(events, dedupedIndexes, isTerminal)
    ?? options.terminalIndex
    ?? null;
  const terminalEvent = terminalCandidate == null ? null : events[terminalCandidate];
  const terminal: LifecycleTerminal | null = terminalEvent && isTerminal(terminalEvent)
    ? {
        eventIndex: terminalCandidate!,
        status: isStoppedTerminal(terminalEvent)
          ? "stopped"
          : terminalEvent.kind === "error" || (terminalEvent.kind === "done" && terminalEvent.ok === false)
            ? "failed"
            : "completed",
      }
    : null;
  const active = Boolean(options.active) && terminal == null;

  const pendingInteractionIndex = active ? latestPendingInteraction(events, dedupedIndexes) : null;
  const agentState = agentSnapshots(events, groups);
  const activitySnapshots = latestActivitySnapshots(events, dedupedIndexes, fallbackTurnId);
  const runningTools: LifecycleToolAction[] = [];
  const activeActionGroups: LifecycleToolGroup[] = [];
  const latestStandaloneIndex = groups.reduce<number | null>((latest, group) => {
    if (!isStandaloneToolGroup(group) || !isAfter(events, group.index, latestAssistantIndex)) return latest;
    return latest == null || compareOrder(events[latest]!, latest, events[group.index]!, group.index) < 0
      ? group.index
      : latest;
  }, null);
  const activityBoundary = latestStandaloneIndex == null
    ? latestAssistantIndex
    : latestAssistantIndex == null || compareOrder(events[latestAssistantIndex]!, latestAssistantIndex, events[latestStandaloneIndex]!, latestStandaloneIndex) < 0
      ? latestStandaloneIndex
      : latestAssistantIndex;
  const runningCandidates: { eventIndex: number; anchorIndex: number; live: boolean }[] = [];
  if (active) {
    for (const group of groups) {
      const latest = latestAction(group);
      if (!latest) continue;
      const running = isRunningTool(latest.action);
      // A provider-owned update has an explicit lifecycle and may continue in
      // the background after an assistant narration. Legacy `tool` starts have
      // no terminal signal, so they expire at the next narration boundary.
      const explicitRunning = latest.action.kind === "tool_update";
      const eligible = explicitRunning || isAfter(events, group.index, activityBoundary);
      if (running && eligible) {
        // A coordination update with child snapshots is represented by the
        // child roster below, avoiding a double count. If the provider gives
        // no child state at all, retain the parent action as the only evidence
        // that the agent call is still running.
        const hasAgentChildren = latest.action.kind === "tool_update" &&
          latest.action.agentActivity != null &&
          Object.keys(latest.action.agentActivity.agentsStates).length > 0;
        if (!hasAgentChildren) {
          runningTools.push(latest.action);
        }
        // Sort live candidates by their latest provider observation. This is
        // distinct from the group's visual anchor (`group.index`), which must
        // stay at the first row for timeline identity.
        runningCandidates.push({ eventIndex: latest.index, anchorIndex: latest.index, live: true });
        if (!isStandaloneToolGroup(group)) activeActionGroups.push(group);
      }
    }
    // `activity` is a first-class lifecycle row in Atelier (search/edit/todo),
    // just as Synara's work-log live activity is. It must participate in the
    // same candidate ordering as tools instead of being silently ignored.
    for (const snapshot of activitySnapshots) {
      if (isCodexSupervision(snapshot.event)) continue;
      const { event, index } = snapshot;
      const status = normalizeStatus(event.status);
      const explicitRunning = status === "running";
      // A status-bearing activity is a provider lifecycle item, so it remains
      // live across later narration just like an explicit tool_update. Older
      // status-less rows use the legacy narration boundary as an inference.
      if ((status === "completed" || status === "failed") || (!explicitRunning && !isAfter(events, index, activityBoundary))) continue;
      runningCandidates.push({ eventIndex: index, anchorIndex: index, live: true });
    }
    if (agentState.running.length > 0 && agentState.latestIndex != null) {
      runningCandidates.push({ eventIndex: agentState.latestIndex, anchorIndex: agentState.latestIndex, live: true });
    }
  }

  const latestTool = groups.reduce<{ action: LifecycleToolAction; index: number } | null>((current, group) => {
    const latest = latestAction(group);
    if (!latest) return current;
    return !current || compareOrder(events[current.index]!, current.index, latest.action, latest.index) <= 0 ? latest : current;
  }, null);

  let activeState: LifecycleActiveState | null = null;
  if (active) {
    if (pendingInteractionIndex != null) {
      activeState = { kind: "waiting", eventIndex: pendingInteractionIndex };
    } else {
      // The transport can append parallel updates out of array order. Use the
      // provider sequence/timestamp comparator here as we do for snapshots;
      // an array index alone would let a late stale frame mask newer work.
      const orderedCandidates = runningCandidates.sort((a, b) => (
        compareOrder(events[a.anchorIndex]!, a.anchorIndex, events[b.anchorIndex]!, b.anchorIndex)
      ));
      const latestCandidate = orderedCandidates[orderedCandidates.length - 1];
      if (latestCandidate) {
        activeState = { kind: "activity", eventIndex: latestCandidate.eventIndex, live: latestCandidate.live };
      } else if (
        latestReasoningIndex != null &&
        latestMeaningfulIndex === latestReasoningIndex &&
        isAfter(events, latestReasoningIndex, latestAssistantIndex)
      ) {
        const latestReasoning = events[latestReasoningIndex];
        const liveReasoning = latestReasoning?.kind === "thinking_live" || latestReasoning?.kind === "thinking_delta";
        activeState = {
          kind: liveReasoning ? "reasoning" : "thinking",
          ...(liveReasoning ? { texts: reasoningTexts, live: true } : {}),
        } as LifecycleActiveState;
      } else if (
        latestAssistantIndex != null &&
        latestMeaningfulIndex === latestAssistantIndex &&
        events[latestAssistantIndex]?.kind === "streaming"
      ) {
        activeState = { kind: "answering", eventIndex: latestAssistantIndex };
      } else if (
        latestTool != null &&
        latestToolIndex != null &&
        latestMeaningfulIndex === latestToolIndex &&
        isUnknownToolStatus(latestTool.action)
      ) {
        // An unrecognised provider status is deliberately neutral: it signals
        // work in transit without certifying that a command is still running.
        activeState = { kind: "processing" };
      } else if (latestAssistantIndex != null && dedupedIndexes.some((index) => (
        isAfter(events, index, latestAssistantIndex) && (
          isReasoning(events[index]!) || isToolAction(events[index]!) || events[index]?.kind === "activity"
        )
      ))) {
        activeState = { kind: "thinking" };
      } else if (reasoningTexts.length > 0 && groups.length === 0) {
        activeState = {
          kind: "reasoning",
          texts: reasoningTexts,
          live: false,
        };
      } else {
        // A settled tool is evidence that work happened, never evidence that
        // the turn ended. Providers may omit a follow-up reasoning event.
        activeState = { kind: "thinking" };
      }
    }
  }

  let phase: TurnLifecyclePhase;
  if (terminal) phase = phaseForTerminal(terminal);
  else if (!active) phase = "idle";
  else if (activeState?.kind === "waiting") phase = "waiting";
  else if (activeState?.kind === "answering") phase = "final_answer";
  else phase = "prework";

  const latestActivity = latestActivityIndex == null || events[latestActivityIndex]?.kind !== "activity"
    ? null
    : events[latestActivityIndex] as Extract<AgentEvent, { kind: "activity" }>;

  return {
    turnId: fallbackTurnId,
    provider: options.provider ?? null,
    active,
    phase,
    state: terminal
      ? { kind: "terminal", status: terminal.status, eventIndex: terminal.eventIndex }
      : activeState ?? { kind: "idle" },
    activeState,
    terminal,
    terminalIndex: terminal?.eventIndex ?? null,
    latestEventIndex,
    latestMeaningfulIndex,
    latestAssistantIndex,
    latestReasoningIndex,
    latestToolIndex,
    latestActivityIndex,
    latestAgentIndex: agentState.latestIndex,
    pendingInteractionIndex,
    reasoningTexts,
    actionGroups: groups,
    activeActionGroups,
    // Never expose in-flight rows after a terminal marker. A late provider
    // snapshot remains in `actionGroups` for replay detail, but cannot revive
    // the active tail or make a settled turn look alive.
    runningTools: active ? runningTools : [],
    runningAgents: active ? agentState.running : [],
    failedAgents: active ? agentState.failed : [],
    latestToolAction: latestTool?.action ?? null,
    latestActivity,
    supervision: active && supervisionIndex != null && isAfter(events, supervisionIndex, latestMeaningfulIndex)
      ? events[supervisionIndex] as ActivityEvent : null,
    dedupedIndexes,
  };
}

function isUnknownToolStatus(action: LifecycleToolAction): boolean {
  if (action.kind !== "tool_update") return false;
  const status = normalizeStatus(action.status);
  return status.length > 0 && !RUNNING_STATUS.has(status) && !FAILED_STATUS.has(status) && !COMPLETED_STATUS.has(status);
}

/** Compatibility alias for callers that prefer a builder verb. */
export const buildTurnLifecycle = deriveTurnLifecycle;

export function isLifecycleRunningStatus(status?: string): boolean {
  return RUNNING_STATUS.has(normalizeStatus(status));
}

export function isLifecycleFailedStatus(status?: string): boolean {
  return FAILED_STATUS.has(normalizeStatus(status));
}

export function isLifecycleCompletedStatus(status?: string): boolean {
  return COMPLETED_STATUS.has(normalizeStatus(status));
}
