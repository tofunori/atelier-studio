import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n";
import type { AgentEvent } from "../ws";
import {
  materializeHarnessHistory,
  mergeHarnessHistory,
  reduceHarnessEvent,
  reduceHarnessEvents,
} from "../harnessEvents";
import {
  buildChatTurnViewModels,
  projectChatTimeline,
} from "./turnViewModel";
import { activeTurnStatus } from "../../components/chat/activeTurnStatus";
import {
  codexComposite,
  codexFailure,
  codexObservedLive,
  codexObservedRich,
  streamReplayFixtures,
  claudeObservedLive,
  type StreamReplayFixture,
} from "./streamReplayFixtures";

const ACTIVE_SINCE = 1_799_999_999_999;

function reduceSequential(events: readonly AgentEvent[], initial: AgentEvent[] = []): AgentEvent[] {
  return events.reduce((list, event) => reduceHarnessEvent(list, event), initial);
}

function reducedAt(fixture: StreamReplayFixture, after: number): AgentEvent[] {
  return reduceSequential(fixture.events.slice(0, after));
}

function currentTurn(fixture: StreamReplayFixture, after: number) {
  const events = reducedAt(fixture, after);
  const terminal = events.some((event) => event.kind === "done" || event.kind === "error");
  const turns = buildChatTurnViewModels(events, terminal ? null : ACTIVE_SINCE);
  return { events, turn: turns[turns.length - 1]!, turns };
}

describe("replay fixtures — provenance", () => {
  it("expose deux captures Codex et déclarent le scénario composé comme dérivé", () => {
    expect(codexObservedLive.provenance).toBe("observed");
    expect(codexObservedRich.provenance).toBe("observed");
    expect(codexComposite.provenance).toBe("derived");
    expect(codexFailure.provenance).toBe("derived");
    expect(streamReplayFixtures.filter((fixture) => fixture.provenance === "observed").map((fixture) => fixture.provider))
      .toEqual(["codex", "codex", "claude"]);
    expect(claudeObservedLive.provider).toBe("claude");
  });

  it("ne conserve pas de texte, chemin ou identifiant de la capture source", () => {
    for (const fixture of streamReplayFixtures) {
      expect(fixture.sourceTrace).toMatch(/\.jsonl/);
      for (const event of fixture.events) {
        const metadata = event.meta && "eventId" in event.meta ? event.meta : null;
        expect(metadata?.threadId).toBe("thread-replay-fixture");
        expect(metadata?.eventId).toMatch(/^(live|rich|composite|failure|claude)-/);
        expect(JSON.stringify(event)).not.toContain("/Users/tofunori/");
      }
    }
  });
});

describe("replay fixtures — live/replay parity", () => {
  beforeEach(() => setLanguage("fr"));

  it.each(streamReplayFixtures.map((fixture) => [fixture.id, fixture] as const))(
    "%s réduit les frames comme un flux événement par événement",
    (_id, fixture) => {
      const live = fixture.frames.reduce<AgentEvent[]>(
        (events, frame) => reduceHarnessEvents(events, [...frame]),
        [] as AgentEvent[],
      );
      const sequential = reduceSequential(fixture.events);
      const replay = materializeHarnessHistory([...fixture.events]);
      expect(live).toEqual(sequential);
      expect(replay).toEqual(sequential);
    },
  );

  it("fusionne un history reçu après une coupure sans perdre le flux local", () => {
    const prefix = reduceSequential(codexObservedLive.events.slice(0, 5));
    const merged = mergeHarnessHistory(prefix, [...codexObservedLive.events]);
    expect(merged).toEqual(reduceSequential(codexObservedLive.events));
    expect(merged[merged.length - 1]?.kind).toBe("done");
  });

  it("recharge le composite en gardant les blocs de pensée séparés par un outil", () => {
    const prefix = reduceSequential(codexComposite.events.slice(0, 8));
    const merged = mergeHarnessHistory(prefix, [...codexComposite.events]);
    expect(merged).toEqual(reduceSequential(codexComposite.events));
    expect(merged.filter((event) => event.kind === "thinking")).toHaveLength(2);
    expect(merged.some((event) => event.kind === "thinking_live")).toBe(false);
  });
});

describe("replay fixtures — projection observable du tour", () => {
  beforeEach(() => setLanguage("fr"));

  it.each(codexComposite.checkpoints.map((checkpoint) => [checkpoint.label, checkpoint] as const))(
    "composite: %s",
    (_label, checkpoint) => {
      const { turn, events } = currentTurn(codexComposite, checkpoint.after);
      expect(turn.phase).toBe(checkpoint.phase);
      expect(turn.activeState?.kind ?? null).toBe(checkpoint.activeState);
      if (checkpoint.statusKind) {
        expect(activeTurnStatus(turn, events).kind).toBe(checkpoint.statusKind);
      }
    },
  );

  it("rejoue le flux réel avec les deux cycles Bash observés", () => {
    const { events, turn } = currentTurn(codexObservedLive, codexObservedLive.events.length);
    expect(events.filter((event) => event.kind === "tool_update")).toHaveLength(2);
    expect(events.filter((event) => event.kind === "text").map((event) => event.kind)).toEqual(["text", "text"]);
    expect(turn.phase).toBe("completed");
    expect(turn.actionGroups).toHaveLength(2);
  });

  it("rejoue l’historique réel avec un agent en parallèle et une commande échouée", () => {
    const { events, turn } = currentTurn(codexObservedRich, codexObservedRich.events.length);
    const agent = events.find((event) => event.kind === "tool_update" && event.agentActivity);
    const failed = events.find((event) => event.kind === "tool_update" && event.status === "failed");
    expect(agent?.kind).toBe("tool_update");
    expect(failed).toMatchObject({ kind: "tool_update", exitCode: 2 });
    expect(turn.phase).toBe("completed");
    expect(turn.fold?.status).toBe("worked");
  });

  it("conserve l’état plié et expose les détails lorsqu’on ouvre le pli", () => {
    const { events, turn } = currentTurn(codexComposite, codexComposite.events.length);
    expect(turn.fold).toBeTruthy();
    const closed = projectChatTimeline(events, [turn], new Set());
    const open = projectChatTimeline(events, [turn], new Set([turn.fold!.key]));
    expect(closed.some((row) => row.type === "fold" && !row.open)).toBe(true);
    expect(open.some((row) => row.type === "fold" && row.open)).toBe(true);
    expect(closed.some((row) => row.type === "event" && row.event.kind === "tool_update")).toBe(false);
    expect(open.filter((row) => row.type === "event" && row.event.kind === "tool_update")).toHaveLength(2);
    expect(open.some((row) => row.type === "event" && row.event.kind === "text")).toBe(true);
  });

  it("retourne à Thinking après les outils terminés, puis passe à Writing pendant les deltas", () => {
    const afterTools = currentTurn(codexComposite, 9);
    expect(activeTurnStatus(afterTools.turn, afterTools.events)).toMatchObject({ kind: "thinking" });
    const streaming = currentTurn(codexComposite, 11);
    expect(streaming.turn.activeState).toMatchObject({ kind: "answering" });
    expect(activeTurnStatus(streaming.turn, streaming.events)).toMatchObject({ kind: "writing" });
  });

  it("fige la réponse partielle et signale le terminal d’échec", () => {
    const { events, turn } = currentTurn(codexFailure, codexFailure.events.length);
    expect(events.map((event) => event.kind)).toEqual(["user", "thinking", "text", "error"]);
    expect(events[2]).toMatchObject({ kind: "text", text: "fixture partial answer" });
    expect(turn.phase).toBe("failed");
    expect(turn.fold?.status).toBe("failed");
  });
});
