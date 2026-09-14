import type { AgentEvent } from "../ws";
import {
  deriveTurnLifecycle,
  isCodexSupervision,
  type LifecycleActiveState,
  type LifecycleToolAction,
  type LifecycleToolGroup,
  type TurnLifecycle,
} from "./turnLifecycle";

export type TurnPhase =
  | "idle"
  | "prework"
  | "waiting"
  | "final_answer"
  | "completed"
  | "stopped"
  | "failed";

/** Compatibility aliases retained for existing component imports. */
export type ActiveTurnState = LifecycleActiveState;
export type ToolAction = LifecycleToolAction;
export type ToolActionGroup = LifecycleToolGroup;

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
  /** Canonical lifecycle projection shared by active status and replay. */
  lifecycle: TurnLifecycle;
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
  "thinking_progress",
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

function isAssistantText(
  event: AgentEvent,
): event is Extract<AgentEvent, { kind: "text" | "streaming" }> {
  return event.kind === "text" || event.kind === "streaming";
}

function isPendingInteraction(event: AgentEvent) {
  return (event.kind === "interaction" && event.state === "pending") ||
    (event.kind === "permission" && event.answered == null);
}

function isReasoning(event: AgentEvent) {
  return event.kind === "thinking" || event.kind === "thinking_live" ||
    event.kind === "thinking_delta" || event.kind === "thinking_progress" ||
    (event.kind === "tool" && (event.name === REASONING_TOOL || event.name === "__thinking-step"));
}

function isToolAction(event: AgentEvent): event is ToolAction {
  if (event.kind === "tool_update") return true;
  // compat : nom historique du marqueur d'attente (émis 2026-08-13→15 avant
  // `__waiting`) — comme lui, une annotation, pas du travail : il ne doit pas
  // retirer à la réponse finale son statut détaché (elle disparaissait dans
  // le repli du tour).
  if (event.kind === "tool" && event.name.startsWith("en attente : ")) return false;
  return event.kind === "tool" && (
    event.name === "__compacted" || event.name.startsWith("__edits:") || !event.name.startsWith("__")
  );
}

/** Generated images are deliverables, so their tool row stays autonomous and
 * visible after a completed turn instead of being swallowed by the activity
 * fold. */
export function isImageGenerationAction(event: AgentEvent): boolean {
  if (event.kind !== "tool_update") return false;
  const name = event.name.toLowerCase();
  return name.includes("image_generation") || name.includes("image-generation")
    || name.includes("generate_image") || name.includes("generate-image");
}

export function isStoppedTerminal(event: AgentEvent) {
  if (event.kind === "done") {
    const status = (event as Extract<AgentEvent, { kind: "done" }> & { status?: string }).status;
    const normalizedStatus = status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-");
    if (["stopped", "interrupted", "cancelled", "canceled", "aborted"].includes(normalizedStatus ?? "")) return true;
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
  let lastCanonical: TurnBuilder | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const meta = metaOf(event);
    // Filet de rejeu : un `widget` journalisé avant que le grant de capacité
    // ne porte le turnId (branche feat/widgets-chat, avant 2026-08-28) n'en a
    // pas. Le laisser tomber dans la branche « legacy » ouvrait un tour
    // fantôme APRÈS le vrai — le tour en cours cessait d'être le dernier, et
    // spinner, compteur de jetons et pensée live se ré-ancraient sous le
    // panneau. Il adopte donc le tour de l'event qui le précède.
    if (!meta?.turnId && event.kind === "widget" && lastCanonical) {
      lastCanonical.indexes.push(index);
      continue;
    }
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
      lastCanonical = turn;
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

/** Plancher de la réponse finale, en caractères de prose utile.
 *
 * La règle du « dernier item visible » ci-dessous déclasse la réponse dès
 * qu'un outil la suit. C'est juste pour « Je commence. », faux pour un
 * livrable de mille caractères suivi d'un TodoWrite de fin de tour : la
 * réponse disparaissait alors derrière « A travaillé pendant Ns ». On
 * départage par le poids plutôt que par une liste d'exceptions par nom
 * d'outil — sous ce plancher un texte est une transition et retourne dans le
 * pli, au-dessus c'est la réponse et elle reste visible. 240 ≈ trois lignes
 * pleines ; « Je commence. » (12) et « Terminé. » (9) restent loin dessous. */
const REPONSE_FINALE_MIN_CARS = 240;

/** Début du run narratif le plus lourd du tour.
 *
 * Un run est une suite de textes assistants que rien n'interrompt : un outil
 * coupe, le raisonnement non — Claude intercale ses résumés au milieu d'une
 * même réponse. À poids égal le plus tardif gagne (une reprise après outil
 * prolonge le propos, elle ne le répète pas). `null` si aucun run n'atteint
 * le plancher. */
function heaviestNarrativeStart(
  events: AgentEvent[],
  indexes: number[],
  before: number,
): number | null {
  let bestStart: number | null = null;
  let bestPoids = 0;
  let runStart: number | null = null;
  let runPoids = 0;
  const clore = () => {
    if (runStart != null && runPoids >= bestPoids) {
      bestStart = runStart;
      bestPoids = runPoids;
    }
    runStart = null;
    runPoids = 0;
  };
  for (const index of indexes) {
    if (index >= before) break;
    const event = events[index];
    if (isAssistantText(event)) {
      if (runStart == null) runStart = index;
      runPoids += event.text.trim().length;
    } else if (!isReasoning(event)) {
      clore();
    }
  }
  clore();
  return bestPoids >= REPONSE_FINALE_MIN_CARS ? bestStart : null;
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
    if (isCodexSupervision(event)) return false;
    return isAssistantText(event) || isToolAction(event) || event.kind === "activity" || event.kind === "edit";
  }) ?? null;
  if (lastVisible != null && isAssistantText(events[lastVisible])) return lastVisible;
  // Repli : le dernier item visible est du travail, mais un propos substantiel
  // peut le précéder. Le pli s'arrête alors à son début au lieu de l'avaler.
  return heaviestNarrativeStart(events, indexes, terminalIndex);
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
    // One lifecycle pass owns activity state, tool identity, child-agent
    // snapshots, and terminal settlement. The active tail reads this object
    // directly; replay uses the same projection, so a completed tool cannot
    // make one surface say “processing” while another says “thinking”.
    const lifecycle = deriveTurnLifecycle(events, indexes, {
      turnId: builder.turnId,
      provider: builder.provider,
      active: isActive,
      terminalIndex,
      latestAssistantIndex,
    });
    const groups = lifecycle.actionGroups;
    const activityIndexes = indexes.filter((index) => events[index].kind === "activity" && !isCodexSupervision(events[index]));
    const reasoningTexts = lifecycle.reasoningTexts;
    const activeActionGroups = lifecycle.activeActionGroups;
    const activeWorkIndexes = new Set(indexes.filter((index) => {
      const event = events[index];
      // Le reasoning reste une donnée de statut, pas une ligne de transcript.
      if (!isActive) return isReasoning(event) || isToolAction(event) || event.kind === "activity";
      // Pendant le tour, TOUT se dépose à sa place chronologique : le
      // raisonnement au-dessus de la réponse qu'il a servi à écrire, et le
      // travail à mesure qu'il arrive. La ligne du run EN COURS n'est pas
      // hissée ailleurs : c'est elle qui tique sur place (parti pris Hermes,
      // Thierry 2026-08-21) — sans quoi, avec des outils qui se terminent
      // instantanément, plus rien ne bougeait à l'écran.
      //
      // Seule exception : la SENTINELLE `__thinking` (outil sans contenu), qui
      // n'apprend rien et se lisait « réflexion… » alors que rien n'était dit.
      return event.kind === "tool" && (event.name === REASONING_TOOL || event.name === "__thinking-step");
    }));
    const firstTs = (userIndex == null ? null : timestampOf(events[userIndex])) ??
      indexes.map((index) => timestampOf(events[index])).find((value) => value != null) ??
      (isActive ? workingSince : null);
    const completedAtMs = terminalIndex == null ? null : timestampOf(events[terminalIndex]);
    const durationMs = firstTs != null && completedAtMs != null
      ? Math.max(0, completedAtMs - firstTs)
      : null;

    const phase: TurnPhase = lifecycle.phase;
    const activeState = lifecycle.activeState;
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
        (events[index].kind === "activity" && !isCodexSupervision(events[index])) || isAssistantText(events[index])
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
      lifecycle,
    };
  });
}

/** Clé de rangée virtuelle, consommée par le `keyExtractor` de LegendList.
 *
 * L'IDENTITÉ de la ligne, jamais sa position. `reduceHarnessEvent` retire par
 * `splice` la bulle streaming vide et le `thinking_live` vide à chaque
 * done/error : tout ce qui suit se décale. Une clé indexée changerait alors
 * pour ces rangées — LegendList les remonterait, remesurerait leurs hauteurs
 * et refermerait les panneaux d'outils dépliés.
 *
 * `projectChatTimeline` a déjà posé la bonne clé sur chaque rangée
 * (`meta.eventId` quand il existe) : il suffit de ne pas la jeter. Les
 * journaux historiques sans meta retombent sur `legacy-<index>`, indexé faute
 * de mieux — pas pire qu'avant, pas mieux non plus. */
export function timelineRowKey(item: { key: string }): string {
  return item.key;
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
  const duplicateIndexes = new Set<number>();
  const toolGroupByIndex = new Map<number, ToolActionGroup>();

  for (const turn of turns) {
    for (let index = turn.startIndex; index < turn.endIndex; index += 1) turnByIndex.set(index, turn);
    const retained = new Set(turn.lifecycle.dedupedIndexes);
    for (let index = turn.startIndex; index < turn.endIndex; index += 1) {
      if (!retained.has(index)) duplicateIndexes.add(index);
    }
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

  // Ordinal des blocs de texte par tour : la bulle streaming est REMPLACÉE en
  // place par le texte final avec un AUTRE eventId — une clé par identité
  // démonterait la rangée pile à l'arrivée de la réponse (flash, 2026-08-25).
  // Le n-ième bloc texte d'un tour garde donc la même clé de la frappe au
  // final. Les autres kinds gardent l'identité d'événement (stable aux splices).
  const textOrdinals = new Map<string, number>();
  const thinkingOrdinals = new Map<string, number>();
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

    // Reconnection can replay the same authoritative event. The lifecycle
    // projection keeps the first row and the timeline must apply that same
    // de-duplication to non-tool events as well.
    if (duplicateIndexes.has(index)) continue;

    const fold = foldByStart.get(index);
    if (fold) {
      const open = openFolds.has(fold.key);
      rows.push({ type: "fold", key: fold.key, fold, open });
      if (fold.hasDetail && !open) {
        // La checklist du plan (`todos`, singleton mis à jour en place) reste
        // VISIBLE même quand le tour est replié : c'est l'état du travail, pas
        // un détail d'exécution — l'avaler dans le pli la faisait disparaître
        // dès la fin du tour (finition checklist, 2026-08-22).
        //
        // Même raison pour `widget` : le panneau est un LIVRABLE du tour, pas
        // une trace d'exécution. Avalé par le pli, il s'évaporait dès que le
        // tour se terminait — et au rechargement de session aussi
        // (relecture finale 2026-08-28).
        for (let inner = index; inner < fold.end; inner += 1) {
          const innerEvent = events[inner];
          const innerKind = innerEvent?.kind;
          // Settled tool failures belong to the execution details, including
          // their output and exit code. Only actual interactions escape the fold.
          const needsAttention = isPendingInteraction(innerEvent) || (innerEvent.kind === "permission" && innerEvent.answered === false) || isImageGenerationAction(innerEvent);
          if (innerKind !== "todos" && innerKind !== "widget" && !needsAttention) continue;
          const innerTurn = turnByIndex.get(inner);
          rows.push({
            type: "event",
            key: `event:${innerTurn?.key ?? "orphan"}:${eventKey(events[inner], inner)}`,
            event: events[inner],
            index: inner,
          });
        }
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
    if (NON_VISUAL_TIMELINE_KINDS.has(event.kind) || isCodexSupervision(event)) continue;
    const turn = turnByIndex.get(index);
    const turnKey = turn?.key ?? "orphan";
    let suffix: string;
    if (event.kind === "text" || event.kind === "streaming") {
      const ordinal = textOrdinals.get(turnKey) ?? 0;
      textOrdinals.set(turnKey, ordinal + 1);
      suffix = `txt:${ordinal}`;
    } else if (event.kind === "thinking" || event.kind === "thinking_live") {
      const ordinal = thinkingOrdinals.get(turnKey) ?? 0;
      thinkingOrdinals.set(turnKey, ordinal + 1);
      suffix = `thinking:${ordinal}`;
    } else {
      suffix = eventKey(event, index);
    }
    rows.push({
      type: "event",
      key: `event:${turnKey}:${suffix}`,
      event,
      index,
    });
  }
  return rows;
}
