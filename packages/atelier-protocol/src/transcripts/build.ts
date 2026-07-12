import type { HarnessEventMeta } from "../meta.ts";
import type { WireAgentEvent } from "../envelopes.ts";

/** Fixed epoch for deterministic transcripts (2026-07-09T12:00:00.000Z). */
export const FIXED_TS = 1_783_684_800_000;

export type TranscriptBundle = {
  id: string;
  threadId: string;
  projectId: string;
  title: string;
  provider: string;
  /** Full ordered journal (live + durable shapes as on the wire). */
  events: WireAgentEvent[];
  /** Last contiguous sequence. */
  lastSequence: number;
};

type MetaOver = Partial<HarnessEventMeta> & { sequence: number; eventId: string };

function meta(base: {
  threadId: string;
  provider: string;
  turnId: string;
  over: MetaOver;
}): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId: base.over.eventId,
    provider: base.provider,
    threadId: base.threadId,
    turnId: base.over.turnId ?? base.turnId,
    sequence: base.over.sequence,
    ts: base.over.ts ?? FIXED_TS + base.over.sequence * 10,
    durable: base.over.durable ?? true,
    origin: base.over.origin ?? "provider",
    messageId: base.over.messageId,
    itemId: base.over.itemId,
  };
}

/** One complete turn: user → thinking → tool → deltas → text → done. */
export function buildTurn(opts: {
  threadId: string;
  provider?: string;
  turnIndex: number;
  startSequence: number;
  userText?: string;
  assistantText?: string;
}): { events: WireAgentEvent[]; nextSequence: number } {
  const provider = opts.provider ?? "claude";
  const turnId = `turn-${opts.turnIndex}`;
  const threadId = opts.threadId;
  let s = opts.startSequence;
  const mk = (eventId: string, sequence: number, extra: Partial<HarnessEventMeta> = {}) =>
    meta({ threadId, provider, turnId, over: { eventId, sequence, ...extra } });

  const userText = opts.userText ?? `Message utilisateur ${opts.turnIndex}`;
  const assistantText = opts.assistantText ?? `Réponse assistant pour le tour ${opts.turnIndex}.`;
  const messageId = `msg-${opts.turnIndex}`;

  const events: WireAgentEvent[] = [
    {
      kind: "user",
      text: userText,
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-u-${opts.turnIndex}`, s++, { messageId, origin: "atelier" }),
    },
    {
      kind: "thinking",
      text: `Raisonnement tour ${opts.turnIndex}`,
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-th-${opts.turnIndex}`, s++, { durable: true }),
    },
    {
      kind: "tool_update",
      id: `tool-${opts.turnIndex}`,
      name: "Read",
      output: `fichier-${opts.turnIndex}.txt`,
      status: "completed",
      detail: `path-${opts.turnIndex}`,
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-tool-${opts.turnIndex}`, s++, { itemId: `tool-${opts.turnIndex}` }),
    },
    {
      kind: "delta",
      text: assistantText.slice(0, Math.max(1, Math.floor(assistantText.length / 2))),
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-d1-${opts.turnIndex}`, s++, { durable: false }),
    },
    {
      kind: "delta",
      text: assistantText.slice(Math.floor(assistantText.length / 2)),
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-d2-${opts.turnIndex}`, s++, { durable: false }),
    },
    {
      kind: "text",
      text: assistantText,
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-t-${opts.turnIndex}`, s++, { durable: true }),
    },
    {
      kind: "done",
      ok: true,
      result: "ok",
      ts: FIXED_TS + s * 10,
      meta: mk(`ev-done-${opts.turnIndex}`, s++, { durable: true }),
    },
  ];

  return { events, nextSequence: s };
}

export function buildTranscript(opts: {
  id: string;
  threadId: string;
  turns: number;
  title?: string;
  projectId?: string;
}): TranscriptBundle {
  const events: WireAgentEvent[] = [];
  let seq = 1;
  for (let t = 1; t <= opts.turns; t++) {
    const chunk = buildTurn({
      threadId: opts.threadId,
      turnIndex: t,
      startSequence: seq,
    });
    events.push(...chunk.events);
    seq = chunk.nextSequence;
  }
  return {
    id: opts.id,
    threadId: opts.threadId,
    projectId: opts.projectId ?? "proj-fixture",
    title: opts.title ?? opts.id,
    provider: "claude",
    events,
    lastSequence: seq - 1,
  };
}

/** Small: 2 turns (~14 events). */
export function smallTranscript(): TranscriptBundle {
  return buildTranscript({
    id: "small",
    threadId: "thread-small",
    turns: 2,
    title: "Transcript petit",
  });
}

/** Medium: 20 turns. */
export function mediumTranscript(): TranscriptBundle {
  return buildTranscript({
    id: "medium",
    threadId: "thread-medium",
    turns: 20,
    title: "Transcript moyen",
  });
}

/**
 * Stress: 500 *user messages* as turns — plan 034 asks 500 messages.
 * Each turn is one user bubble + assistant path; total events >> 500.
 */
export function stressTranscript(): TranscriptBundle {
  return buildTranscript({
    id: "stress-500",
    threadId: "thread-stress",
    turns: 500,
    title: "Transcript stress 500 messages",
  });
}

/** Scenario: interaction pending in the middle of a turn (no done yet). */
export function interactionPendingTranscript(): TranscriptBundle {
  const threadId = "thread-interaction";
  const provider = "codex";
  let s = 1;
  const turnId = "turn-1";
  const m = (eventId: string, sequence: number, extra: Partial<HarnessEventMeta> = {}): HarnessEventMeta =>
    meta({ threadId, provider, turnId, over: { eventId, sequence, ...extra } });

  const events: WireAgentEvent[] = [
    {
      kind: "user",
      text: "Modifie le fichier",
      meta: m("ev-u-1", s++, { messageId: "msg-1", origin: "atelier" }),
    },
    {
      kind: "interaction",
      requestId: "req-appr-1",
      interactionType: "approval",
      title: "Autoriser l'écriture ?",
      detail: "src/main.rs",
      state: "pending",
      meta: m("ev-int-1", s++, { itemId: "req-appr-1" }),
    },
  ];
  return {
    id: "interaction-pending",
    threadId,
    projectId: "proj-fixture",
    title: "Interaction en attente",
    provider,
    events,
    lastSequence: s - 1,
  };
}

/** Scenario: ends with error after partial stream. */
export function errorTranscript(): TranscriptBundle {
  const threadId = "thread-error";
  let s = 1;
  const turnId = "turn-1";
  const provider = "claude";
  const m = (eventId: string, sequence: number, extra: Partial<HarnessEventMeta> = {}): HarnessEventMeta =>
    meta({ threadId, provider, turnId, over: { eventId, sequence, ...extra } });
  const events: WireAgentEvent[] = [
    { kind: "user", text: "Lance le job", meta: m("ev-u-1", s++, { messageId: "msg-1", origin: "atelier" }) },
    { kind: "delta", text: "Je démarre…", meta: m("ev-d-1", s++, { durable: false }) },
    { kind: "error", message: "provider indisponible", meta: m("ev-err-1", s++) },
  ];
  return {
    id: "error",
    threadId,
    projectId: "proj-fixture",
    title: "Erreur provider",
    provider,
    events,
    lastSequence: s - 1,
  };
}

/** Scenario: interrupt — streaming then done ok:false style terminal. */
export function interruptTranscript(): TranscriptBundle {
  const threadId = "thread-interrupt";
  let s = 1;
  const turnId = "turn-1";
  const provider = "claude";
  const m = (eventId: string, sequence: number, extra: Partial<HarnessEventMeta> = {}): HarnessEventMeta =>
    meta({ threadId, provider, turnId, over: { eventId, sequence, ...extra } });
  const events: WireAgentEvent[] = [
    { kind: "user", text: "Long travail", meta: m("ev-u-1", s++, { messageId: "msg-1", origin: "atelier" }) },
    { kind: "delta", text: "En cours", meta: m("ev-d-1", s++, { durable: false }) },
    { kind: "done", ok: false, result: "interrupted", meta: m("ev-done-1", s++) },
  ];
  return {
    id: "interrupt",
    threadId,
    projectId: "proj-fixture",
    title: "Interruption",
    provider,
    events,
    lastSequence: s - 1,
  };
}

export function allNamedTranscripts(): TranscriptBundle[] {
  return [
    smallTranscript(),
    mediumTranscript(),
    interactionPendingTranscript(),
    errorTranscript(),
    interruptTranscript(),
    // stress omitted from default list — generate on demand (large)
  ];
}
