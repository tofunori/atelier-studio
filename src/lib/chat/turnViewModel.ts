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
  | { kind: "activity"; eventIndex: number; live: boolean }
  | { kind: "reasoning"; texts: string[]; live: boolean }
  | { kind: "answering"; eventIndex: number }
  | { kind: "thinking" };

export type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;

export type ToolActionGroup = {
  key: string;
  index: number;
  indexes: number[];
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
  latestAssistantIndex: number | null;
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
  activeHeaderIndex: number | null;
  activeTailIndex: number | null;
  activeWorkIndexes: Set<number>;
  /** Actions du segment courant seulement. Un texte assistant ou un nouveau
   * reasoning ferme le segment précédent, qui reste rendu dans la timeline. */
  activeActionGroups: ToolActionGroup[];
  actionGroups: ToolActionGroup[];
  activityIndexes: number[];
  reasoningTexts: string[];
  activeState: ActiveTurnState | null;
};

export type ProjectedTimelineItem =
  | { type: "event"; key: string; event: AgentEvent; index: number }
  | { type: "fold"; key: string; fold: NonNullable<ChatTurnViewModel["fold"]>; open: boolean }
  | { type: "active-turn-header"; key: string; turn: ChatTurnViewModel }
  | { type: "active-turn-tail"; key: string; turn: ChatTurnViewModel };

const TERMINAL_KINDS = new Set<AgentEvent["kind"]>(["done", "error"]);
const REASONING_TOOL = "__thinking";
const NON_VISUAL_TIMELINE_KINDS = new Set<AgentEvent["kind"]>([
  "delta",
  "thinking_delta",
  "stream_set",
  "started",
  "heartbeat",
  "usage",
  "goal",
]);

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
  return event.kind === "tool" && (
    event.name === "__compacted" || event.name.startsWith("__edits:") || !event.name.startsWith("__")
  );
}

function isStandaloneToolAction(event: ToolAction) {
  const name = event.name.toLowerCase();
  if (event.kind === "tool_update" && event.agentActivity != null) return true;
  return name.includes("view_image") || name.includes("image_view") ||
    name.includes("open_image") || name === "image" || name.startsWith("image ");
}

function isStandaloneToolGroup(group: ToolActionGroup) {
  return group.actions.some(isStandaloneToolAction);
}

function itemIdentity(event: ToolAction, index: number) {
  const meta = metaOf(event);
  const item = meta?.itemId ?? ("id" in event ? event.id : null);
  return `${meta?.turnId ?? "legacy"}:${item || `event-${index}`}`;
}

function isRunningTool(event: ToolAction) {
  if (event.kind !== "tool_update") return false;
  const status = event.status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? "";
  return status === "running" || status === "pending" || status === "in-progress";
}

function isRunningToolGroup(group: ToolActionGroup) {
  const latest = group.actions[group.actions.length - 1];
  return latest?.kind === "tool" || (latest != null && isRunningTool(latest));
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
      group = { key: `tools:${identity}`, index, indexes: [], actions: [] };
      byIdentity.set(identity, group);
      groups.push(group);
    }
    group.indexes.push(index);
    group.actions.push(event);
  }
  return groups;
}

function activeStateFor(
  events: AgentEvent[],
  indexes: number[],
  groups: ToolActionGroup[],
  reasoningTexts: string[],
  latestAssistantIndex: number | null,
): ActiveTurnState {
  for (let offset = indexes.length - 1; offset >= 0; offset -= 1) {
    const index = indexes[offset];
    if (isPendingInteraction(events[index])) return { kind: "waiting", eventIndex: index };
  }
  // Comme Codex, une activité appartient à la tranche ouverte par le dernier
  // message de l'assistant. Le reasoning fait partie de cette tranche; seule
  // une nouvelle narration ferme les outils précédents.
  // Une commande plus ancienne ne doit pas
  // rester « active » après le retour explicite à Thinking.
  const latestReasoningIndex = [...indexes].reverse().find((index) => isReasoning(events[index])) ?? null;
  const activityBoundary = activeSegmentBoundary(groups, latestAssistantIndex);
  const candidates: { eventIndex: number; anchorIndex: number; live: boolean }[] = [];
  for (const index of indexes) {
    const event = events[index];
    if (event.kind === "activity") {
      const live = isRunningActivity(event);
      if (live && index > activityBoundary) candidates.push({ eventIndex: index, anchorIndex: index, live });
    }
  }
  for (const group of groups) {
    if (isStandaloneToolGroup(group)) continue;
    const latest = group.actions[group.actions.length - 1];
    const eventIndex = group.indexes[group.indexes.length - 1] ?? group.index;
    const live = latest.kind === "tool" || isRunningTool(latest);
    // Comme Codex, un message assistant ferme le segment même si le provider
    // n'a pas encore envoyé la terminalisation d'une ancienne commande.
    if (group.index <= activityBoundary || !live) continue;
    candidates.push({
      eventIndex,
      anchorIndex: group.index,
      // Un appel `tool` est le début de l'action. `tool_update` porte son état.
      live,
    });
  }
  // Une action concrète réellement active reste prioritaire même si Codex émet
  // ensuite un petit item de reasoning. Le placeholder Thinking ne reprend que
  // lorsqu'aucune lecture, recherche, génération ou commande n'est en cours.
  candidates.sort((a, b) => a.anchorIndex - b.anchorIndex);
  const latestCandidate = candidates[candidates.length - 1];
  if (latestCandidate) {
    return { kind: "activity", eventIndex: latestCandidate.eventIndex, live: latestCandidate.live };
  }
  if (latestReasoningIndex != null) {
    const latestReasoning = events[latestReasoningIndex];
    return latestReasoning.kind === "thinking_live"
      ? { kind: "reasoning", texts: reasoningTexts, live: true }
      : { kind: "thinking" };
  }

  const workContinuedAfterAssistant = latestAssistantIndex != null && indexes.some((index) => (
    index > latestAssistantIndex && (
      isReasoning(events[index]) || isToolAction(events[index]) || events[index].kind === "activity"
    )
  ));
  if (workContinuedAfterAssistant) return { kind: "thinking" };
  if (latestAssistantIndex != null && events[latestAssistantIndex].kind === "streaming") {
    return { kind: "answering", eventIndex: latestAssistantIndex };
  }
  if (reasoningTexts.length > 0 && groups.length === 0) {
    return { kind: "reasoning", texts: reasoningTexts, live: false };
  }
  return { kind: "thinking" };
}

function activeSegmentBoundary(
  groups: ToolActionGroup[],
  latestAssistantIndex: number | null,
): number {
  const assistantBoundary = latestAssistantIndex ?? -1;
  const latestStandaloneIndex = [...groups].reverse().find((group) => (
    group.index > assistantBoundary && isStandaloneToolGroup(group)
  ))?.index ?? -1;
  return Math.max(assistantBoundary, latestStandaloneIndex);
}

function terminalAssistantIndex(
  events: AgentEvent[],
  indexes: number[],
  terminalIndex: number | null,
): number | null {
  if (terminalIndex == null) return null;
  // Codex ne détache comme réponse finale que le dernier item assistant
  // visible. Les reasoning terminaux ne retirent pas ce statut, mais un outil,
  // une édition ou une activité postérieure le fait.
  const lastVisible = [...indexes].reverse().find((index) => {
    if (index >= terminalIndex) return false;
    const event = events[index];
    return isAssistantText(event) || isToolAction(event) || event.kind === "activity" || event.kind === "edit";
  }) ?? null;
  return lastVisible != null && isAssistantText(events[lastVisible]) ? lastVisible : null;
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
    const latestAssistantIndex = [...indexes].reverse().find((index) => isAssistantText(events[index])) ?? null;
    const finalAssistantIndex = terminalAssistantIndex(events, indexes, terminalIndex);
    const groups = actionGroups(events, indexes);
    const activityIndexes = indexes.filter((index) => events[index].kind === "activity");
    const reasoningTexts = indexes.flatMap((index) => {
      const text = reasoningText(events[index]);
      return text == null ? [] : [text];
    });
    const activeBoundary = activeSegmentBoundary(groups, latestAssistantIndex);
    const activeActionGroups = isActive
      ? groups.filter((group) => (
          group.index > activeBoundary && !isStandaloneToolGroup(group) && isRunningToolGroup(group)
        ))
      : [];
    const activeGroupIndexes = new Set(activeActionGroups.flatMap((group) => group.indexes));
    const openSegmentGroupIndexes = new Set(groups.flatMap((group) => (
      group.index > activeBoundary && !isStandaloneToolGroup(group) ? group.indexes : []
    )));
    const activeWorkIndexes = new Set(indexes.filter((index) => {
      const event = events[index];
      // Le reasoning reste une donnée de statut, pas une ligne de transcript.
      // Toutes les actions de la tranche encore ouverte partagent le même slot
      // vivant : Read → Thinking → Search. Elles ne deviennent une ligne
      // durable du transcript qu'une fois fermées par une narration assistant.
      if (!isActive) return isReasoning(event) || isToolAction(event) || event.kind === "activity";
      return isReasoning(event) || openSegmentGroupIndexes.has(index) || activeGroupIndexes.has(index) ||
        (event.kind === "activity" && index > activeBoundary && isRunningActivity(event));
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
      const state = activeStateFor(events, indexes, groups, reasoningTexts, latestAssistantIndex);
      phase = state.kind === "waiting"
        ? "waiting"
        : state.kind === "answering"
          ? "final_answer"
          : "prework";
    }

    const activeState = isActive
      ? activeStateFor(events, indexes, groups, reasoningTexts, latestAssistantIndex)
      : null;
    const activeHeaderIndex = isActive
      ? userIndex == null ? startIndex : userIndex + 1
      : null;
    const activeTailIndex = isActive ? events.length : null;

    let fold: ChatTurnViewModel["fold"] = null;
    if (terminalIndex != null && userIndex != null) {
      const foldEnd = finalAssistantIndex != null ? finalAssistantIndex : terminalIndex;
      const foldStart = userIndex + 1;
      const containsWork = indexes.some((index) => index >= foldStart && index < foldEnd && (
        isReasoning(events[index]) || isToolAction(events[index]) ||
        events[index].kind === "activity" || isAssistantText(events[index])
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
      latestAssistantIndex,
      finalAssistantIndex,
      phase,
      startedAtMs: firstTs,
      completedAtMs,
      durationMs,
      fold,
      activeHeaderIndex,
      activeTailIndex,
      activeWorkIndexes,
      activeActionGroups,
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
  const activeHeaderByInsert = new Map<number, ChatTurnViewModel>();
  const activeTailByInsert = new Map<number, ChatTurnViewModel>();
  const hiddenActiveIndexes = new Set<number>();
  const toolGroupByIndex = new Map<number, ToolActionGroup>();

  for (const turn of turns) {
    for (let index = turn.startIndex; index < turn.endIndex; index += 1) turnByIndex.set(index, turn);
    if (turn.fold) foldByStart.set(turn.fold.start, turn.fold);
    if (turn.activeHeaderIndex != null && turn.activeTailIndex != null) {
      activeHeaderByInsert.set(turn.activeHeaderIndex, turn);
      activeTailByInsert.set(turn.activeTailIndex, turn);
      for (const index of turn.activeWorkIndexes) hiddenActiveIndexes.add(index);
    }
    for (const group of turn.actionGroups) {
      for (const index of group.indexes) toolGroupByIndex.set(index, group);
    }
  }

  for (let index = 0; index <= events.length; index += 1) {
    const activeHeader = activeHeaderByInsert.get(index);
    if (activeHeader) {
      rows.push({ type: "active-turn-header", key: `active-header:${activeHeader.key}`, turn: activeHeader });
    }
    const activeTail = activeTailByInsert.get(index);
    if (activeTail) {
      rows.push({ type: "active-turn-tail", key: `active-tail:${activeTail.key}`, turn: activeTail });
    }
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
    const toolGroup = toolGroupByIndex.get(index);
    if (toolGroup) {
      // Les updates d'un tool remplacent l'item à son ancre initiale dans le
      // reducer Codex. On émet donc le groupe complet à la première apparition
      // et jamais une seconde ligne après une narration plus récente.
      if (index !== toolGroup.index) continue;
      const turn = turnByIndex.get(index);
      toolGroup.actions.forEach((event, offset) => {
        const eventIndex = toolGroup.indexes[offset] ?? index;
        rows.push({
          type: "event",
          key: `event:${turn?.key ?? "orphan"}:${eventKey(event, eventIndex)}`,
          event,
          index: eventIndex,
        });
      });
      continue;
    }
    const event = events[index];
    // Ces événements pilotent le tour mais n'ont aucun rendu propre. Les
    // conserver comme lignes LegendList leur donne malgré tout une hauteur
    // estimée, puis 0 px après mesure — exactement le saut observé au premier
    // `started` reçu du provider.
    if (NON_VISUAL_TIMELINE_KINDS.has(event.kind)) continue;
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
