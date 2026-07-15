import type { AgentEvent } from "../ws";

export type TurnPhase =
  | "idle"
  | "prework"
  | "waiting"
  | "final_answer"
  | "completed"
  | "stopped"
  | "failed";

export type ActiveTurnState =
  | { kind: "waiting"; eventIndex: number }
  | { kind: "activity"; eventIndex: number }
  | { kind: "reasoning"; texts: string[]; live: boolean }
  | { kind: "answering"; eventIndex: number }
  | { kind: "thinking" };

export type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;

export type ToolActionGroup = {
  key: string;
  index: number;
  actions: ToolAction[];
};

export type ChatTurnViewModel = {
  key: string;
  turnId: string | null;
  provider: string | null;
  startIndex: number;
  endIndex: number;
  userIndex: number | null;
  terminalIndex: number | null;
  finalAssistantIndex: number | null;
  phase: TurnPhase;
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number | null;
  fold: {
    key: string;
    start: number;
    end: number;
    hasDetail: boolean;
    ms: number | null;
    status: "worked" | "stopped" | "failed";
  } | null;
  activeInsertIndex: number | null;
  activeWorkIndexes: Set<number>;
  actionGroups: ToolActionGroup[];
  activityIndexes: number[];
  reasoningTexts: string[];
  activeState: ActiveTurnState | null;
};

export type ProjectedTimelineItem =
  | { type: "event"; key: string; event: AgentEvent; index: number }
  | { type: "fold"; key: string; fold: NonNullable<ChatTurnViewModel["fold"]>; open: boolean }
  | { type: "active-turn"; key: string; turn: ChatTurnViewModel };

const TERMINAL_KINDS = new Set<AgentEvent["kind"]>(["done", "error"]);
const REASONING_TOOL = "__thinking";

function metaOf(event: AgentEvent) {
  const meta = event.meta;
  return meta && "eventId" in meta ? meta : null;
}

function timestampOf(event: AgentEvent): number | null {
  const bodyTs = "ts" in event ? event.ts : undefined;
  return bodyTs ?? metaOf(event)?.ts ?? null;
}

function isTerminal(event: AgentEvent) {
  return TERMINAL_KINDS.has(event.kind);
}

function isAssistantText(event: AgentEvent) {
  return event.kind === "text" || event.kind === "streaming";
}

function isReasoning(event: AgentEvent) {
  return event.kind === "thinking" || event.kind === "thinking_live" ||
    (event.kind === "tool" && event.name === REASONING_TOOL);
}

function reasoningText(event: AgentEvent): string | null {
  if (event.kind !== "thinking" && event.kind !== "thinking_live") return null;
  const text = event.text.trim();
  return text || null;
}

function isToolAction(event: AgentEvent): event is ToolAction {
  if (event.kind === "tool_update") return true;
  return event.kind === "tool" && (event.name.startsWith("__edits:") || !event.name.startsWith("__"));
}

function itemIdentity(event: ToolAction, index: number) {
  const meta = metaOf(event);
  const item = meta?.itemId ?? ("id" in event ? event.id : null);
  return `${meta?.turnId ?? "legacy"}:${item || `event-${index}`}`;
}

function isRunningTool(event: ToolAction) {
  if (event.kind !== "tool_update") return false;
  const status = event.status?.toLowerCase().replace(/_/g, "-") ?? "";
  return status === "running" || status === "pending" || status === "in-progress";
}

function isRunningActivity(event: AgentEvent) {
  return event.kind === "activity" && (!event.status || event.status === "running");
}

function isPendingInteraction(event: AgentEvent) {
  return (event.kind === "interaction" && event.state === "pending") ||
    (event.kind === "permission" && event.answered == null);
}

function isStoppedTerminal(event: AgentEvent) {
  if (event.kind === "done") {
    const status = (event as Extract<AgentEvent, { kind: "done" }> & { status?: string }).status;
    if (status === "stopped") return true;
    return event.ok === false && /\b(stop|stopped|interrupt|interromp|cancel|annul)/iu.test(event.result ?? "");
  }
  return event.kind === "error" && /\b(stop|stopped|interrupt|interromp|cancel|annul)/iu.test(event.message);
}

function eventKey(event: AgentEvent, index: number) {
  return metaOf(event)?.eventId ?? `legacy-${index}`;
}

type TurnBuilder = {
  key: string;
  turnId: string | null;
  provider: string | null;
  indexes: number[];
};

/**
 * Groupe les événements en tours stables. Les événements canoniques utilisent
 * `meta.turnId`; les journaux historiques suivent la frontière user → terminal.
 * Cette projection est pure et partagée par le rendu actif et le replay.
 */
function groupTurns(events: AgentEvent[]): TurnBuilder[] {
  const turns: TurnBuilder[] = [];
  const canonical = new Map<string, TurnBuilder>();
  let legacy: TurnBuilder | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const meta = metaOf(event);
    if (meta?.turnId) {
      let turn = canonical.get(meta.turnId);
      if (!turn) {
        turn = {
          key: `turn:${meta.turnId}`,
          turnId: meta.turnId,
          provider: meta.provider || null,
          indexes: [],
        };
        canonical.set(meta.turnId, turn);
        turns.push(turn);
      }
      turn.indexes.push(index);
      continue;
    }

    if (event.kind === "user" || legacy == null || (legacy.indexes.some((i) => isTerminal(events[i])) && event.kind !== "goal")) {
      legacy = {
        key: `legacy:${event.kind === "user" ? index : `orphan-${index}`}`,
        turnId: null,
        provider: null,
        indexes: [],
      };
      turns.push(legacy);
    }
    legacy.indexes.push(index);
  }

  return turns.sort((a, b) => (a.indexes[0] ?? 0) - (b.indexes[0] ?? 0));
}

function actionGroups(events: AgentEvent[], indexes: number[]): ToolActionGroup[] {
  const groups: ToolActionGroup[] = [];
  const byIdentity = new Map<string, ToolActionGroup>();
  for (const index of indexes) {
    const event = events[index];
    if (!isToolAction(event)) continue;
    const identity = itemIdentity(event, index);
    let group = byIdentity.get(identity);
    if (!group) {
      group = { key: `tools:${identity}`, index, actions: [] };
      byIdentity.set(identity, group);
      groups.push(group);
    }
    group.actions.push(event);
  }
  return groups;
}

function activeStateFor(
  events: AgentEvent[],
  indexes: number[],
  groups: ToolActionGroup[],
  reasoningTexts: string[],
  finalAssistantIndex: number | null,
): ActiveTurnState {
  for (let offset = indexes.length - 1; offset >= 0; offset -= 1) {
    const index = indexes[offset];
    if (isPendingInteraction(events[index])) return { kind: "waiting", eventIndex: index };
  }
  for (let offset = indexes.length - 1; offset >= 0; offset -= 1) {
    const index = indexes[offset];
    const event = events[index];
    if (isRunningActivity(event)) return { kind: "activity", eventIndex: index };
  }
  for (let offset = groups.length - 1; offset >= 0; offset -= 1) {
    const group = groups[offset];
    const latest = group.actions[group.actions.length - 1];
    // Un appel `tool` est le début de l'action. Une mise à jour terminale le
    // ferme; une mise à jour running/pending le garde comme activité courante.
    if (latest.kind === "tool" || isRunningTool(latest)) {
      return { kind: "activity", eventIndex: group.index };
    }
  }
  const hasLiveReasoning = indexes.some((index) => events[index].kind === "thinking_live");
  if (reasoningTexts.length > 0 && hasLiveReasoning) {
    return { kind: "reasoning", texts: reasoningTexts, live: true };
  }
  if (finalAssistantIndex != null) return { kind: "answering", eventIndex: finalAssistantIndex };
  if (reasoningTexts.length > 0 && groups.length === 0) {
    return { kind: "reasoning", texts: reasoningTexts, live: false };
  }
  return { kind: "thinking" };
}

export function buildChatTurnViewModels(
  events: AgentEvent[],
  workingSince: number | null,
): ChatTurnViewModel[] {
  const grouped = groupTurns(events);
  return grouped.map((builder, turnIndex) => {
    const indexes = builder.indexes;
    const startIndex = indexes[0] ?? 0;
    const endIndex = (indexes[indexes.length - 1] ?? startIndex) + 1;
    const userIndex = indexes.find((index) => events[index].kind === "user") ?? null;
    const terminalIndex = [...indexes].reverse().find((index) => isTerminal(events[index])) ?? null;
    const isLastTurn = turnIndex === grouped.length - 1;
    const isActive = isLastTurn && workingSince != null && terminalIndex == null;
    const finalAssistantIndex = [...indexes].reverse().find((index) => isAssistantText(events[index])) ?? null;
    const groups = actionGroups(events, indexes);
    const activityIndexes = indexes.filter((index) => events[index].kind === "activity");
    const reasoningTexts = indexes.flatMap((index) => {
      const text = reasoningText(events[index]);
      return text == null ? [] : [text];
    });
    const activeWorkIndexes = new Set(indexes.filter((index) => {
      const event = events[index];
      return isReasoning(event) || isToolAction(event) || event.kind === "activity";
    }));
    const firstTs = (userIndex == null ? null : timestampOf(events[userIndex])) ??
      indexes.map((index) => timestampOf(events[index])).find((value) => value != null) ??
      (isActive ? workingSince : null);
    const completedAtMs = terminalIndex == null ? null : timestampOf(events[terminalIndex]);
    const durationMs = firstTs != null && completedAtMs != null
      ? Math.max(0, completedAtMs - firstTs)
      : null;

    let phase: TurnPhase;
    if (terminalIndex != null) {
      const terminal = events[terminalIndex];
      phase = isStoppedTerminal(terminal)
        ? "stopped"
        : terminal.kind === "error" || (terminal.kind === "done" && terminal.ok === false)
          ? "failed"
          : "completed";
    } else if (!isActive) {
      phase = "idle";
    } else {
      const state = activeStateFor(events, indexes, groups, reasoningTexts, finalAssistantIndex);
      phase = state.kind === "waiting"
        ? "waiting"
        : state.kind === "answering"
          ? "final_answer"
          : state.kind === "thinking" && activeWorkIndexes.size === 0
            ? "idle"
            : "prework";
    }

    const activeState = isActive
      ? activeStateFor(events, indexes, groups, reasoningTexts, finalAssistantIndex)
      : null;
    const activeInsertIndex = isActive
      ? userIndex == null ? startIndex : userIndex + 1
      : null;

    let fold: ChatTurnViewModel["fold"] = null;
    if (terminalIndex != null && userIndex != null) {
      const foldEnd = finalAssistantIndex != null ? finalAssistantIndex : terminalIndex;
      const foldStart = userIndex + 1;
      const containsWork = indexes.some((index) => index >= foldStart && index < foldEnd && (
        activeWorkIndexes.has(index) || isAssistantText(events[index])
      ));
      const terminalStatus = phase === "stopped" || phase === "failed";
      if ((containsWork && foldEnd > foldStart) || terminalStatus) {
        fold = {
          key: `fold:${builder.key}`,
          start: containsWork ? foldStart : terminalIndex,
          end: containsWork ? foldEnd : terminalIndex,
          hasDetail: containsWork && foldEnd > foldStart,
          ms: durationMs,
          status: phase === "stopped" ? "stopped" : phase === "failed" ? "failed" : "worked",
        };
      }
    }

    return {
      key: builder.key,
      turnId: builder.turnId,
      provider: builder.provider,
      startIndex,
      endIndex,
      userIndex,
      terminalIndex,
      finalAssistantIndex,
      phase,
      startedAtMs: firstTs,
      completedAtMs,
      durationMs,
      fold,
      activeInsertIndex,
      activeWorkIndexes,
      actionGroups: groups,
      activityIndexes,
      reasoningTexts,
      activeState,
    };
  });
}

/** Projette les tours en lignes virtualisables, avec des clés canoniques. */
export function projectChatTimeline(
  events: AgentEvent[],
  turns: ChatTurnViewModel[],
  openFolds: ReadonlySet<string>,
): ProjectedTimelineItem[] {
  const rows: ProjectedTimelineItem[] = [];
  const turnByIndex = new Map<number, ChatTurnViewModel>();
  const foldByStart = new Map<number, NonNullable<ChatTurnViewModel["fold"]>>();
  const activeByInsert = new Map<number, ChatTurnViewModel>();
  const hiddenActiveIndexes = new Set<number>();

  for (const turn of turns) {
    for (let index = turn.startIndex; index < turn.endIndex; index += 1) turnByIndex.set(index, turn);
    if (turn.fold) foldByStart.set(turn.fold.start, turn.fold);
    if (turn.activeInsertIndex != null) {
      activeByInsert.set(turn.activeInsertIndex, turn);
      for (const index of turn.activeWorkIndexes) hiddenActiveIndexes.add(index);
    }
  }

  for (let index = 0; index <= events.length; index += 1) {
    const active = activeByInsert.get(index);
    if (active) rows.push({ type: "active-turn", key: `active:${active.key}`, turn: active });
    if (index === events.length) break;

    const fold = foldByStart.get(index);
    if (fold) {
      const open = openFolds.has(fold.key);
      rows.push({ type: "fold", key: fold.key, fold, open });
      if (fold.hasDetail && !open) {
        index = fold.end - 1;
        continue;
      }
    }
    if (hiddenActiveIndexes.has(index)) continue;
    const event = events[index];
    const turn = turnByIndex.get(index);
    rows.push({
      type: "event",
      key: `event:${turn?.key ?? "orphan"}:${eventKey(event, index)}`,
      event,
      index,
    });
  }
  return rows;
}
