/**
 * Deterministic fixture engine (plan 034 jalon B).
 * In-process first; the HTTP/WS server is a thin wrapper around this.
 *
 * Scenarios:
 * - history replay
 * - streaming (emit events one-by-one)
 * - tools / interactions / error / interrupt (via transcript selection)
 * - sequence gap (omit sequences on purpose)
 * - reconnect + lastSequence resume
 * - snapshot required (min retained window)
 */
import {
  makeServerHello,
  protocolError,
  type ClientWireMessage,
  type EventMessage,
  type HistoryMessage,
  type ServerWireMessage,
  type ThreadSummary,
  type WireAgentEvent,
} from "../envelopes.ts";
import { applyEventBatch, emptyCursor, maxSequence, sliceHistoryAfter, type SequenceCursor } from "../sequence.ts";
import {
  errorTranscript,
  interactionPendingTranscript,
  interruptTranscript,
  mediumTranscript,
  smallTranscript,
  stressTranscript,
  type TranscriptBundle,
} from "../transcripts/build.ts";
import { parseJsonMessage, validateClientHello, validateGetHistory } from "../validate.ts";
import { PROTOCOL_VERSION } from "../version.ts";

export type FixtureScenarioId =
  | "small"
  | "medium"
  | "stress-500"
  | "interaction-pending"
  | "error"
  | "interrupt"
  | "gap"
  | "snapshot-expired";

export type FixtureEngineOptions = {
  /** Default scenario for the primary thread. */
  scenario?: FixtureScenarioId;
  /** Exclusive lower bound the server still retains (for snapshot tests). */
  minRetainedSequence?: number;
  /**
   * When scenario is "gap", drop these sequence numbers from history responses
   * (simulates lossy stream; client must detect gaps).
   */
  dropSequences?: number[];
};

export type FixtureSession = {
  authenticated: boolean;
  protocolVersion: number;
  clientInstanceId: string | null;
  /** Per-thread client cursor for reconnect tests (optional tracking). */
  cursors: Map<string, SequenceCursor>;
};

function loadScenario(id: FixtureScenarioId): TranscriptBundle {
  switch (id) {
    case "small":
      return smallTranscript();
    case "medium":
      return mediumTranscript();
    case "stress-500":
      return stressTranscript();
    case "interaction-pending":
      return interactionPendingTranscript();
    case "error":
      return errorTranscript();
    case "interrupt":
      return interruptTranscript();
    case "gap": {
      const base = smallTranscript();
      // Keep ids but we'll drop sequences at serve time
      return { ...base, id: "gap", title: "Trou de séquence" };
    }
    case "snapshot-expired": {
      const base = mediumTranscript();
      return { ...base, id: "snapshot-expired", title: "Fenêtre replay expirée" };
    }
    default:
      return smallTranscript();
  }
}

export class FixtureEngine {
  readonly threads = new Map<string, TranscriptBundle>();
  readonly minRetainedSequence: number;
  readonly dropSequences: Set<number>;
  private primaryScenario: FixtureScenarioId;

  constructor(opts: FixtureEngineOptions = {}) {
    this.primaryScenario = opts.scenario ?? "small";
    this.minRetainedSequence = opts.minRetainedSequence ?? 0;
    this.dropSequences = new Set(opts.dropSequences ?? (this.primaryScenario === "gap" ? [3, 4] : []));

    const primary = loadScenario(this.primaryScenario);
    this.threads.set(primary.threadId, primary);
    // Always register named library for multi-scenario tests
    for (const t of [
      smallTranscript(),
      mediumTranscript(),
      interactionPendingTranscript(),
      errorTranscript(),
      interruptTranscript(),
    ]) {
      if (!this.threads.has(t.threadId)) this.threads.set(t.threadId, t);
    }
  }

  /** Register or replace a transcript (tests). */
  putTranscript(t: TranscriptBundle): void {
    this.threads.set(t.threadId, t);
  }

  newSession(): FixtureSession {
    return {
      authenticated: false,
      protocolVersion: 0,
      clientInstanceId: null,
      cursors: new Map(),
    };
  }

  handleRaw(session: FixtureSession, raw: string): ServerWireMessage[] {
    const parsed = parseJsonMessage(raw);
    if (!parsed.ok) return [parsed.error];
    return this.handle(session, parsed.value as ClientWireMessage);
  }

  handle(session: FixtureSession, msg: ClientWireMessage): ServerWireMessage[] {
    const type = msg.type;
    if (type === "ping") return [{ type: "pong" }];

    if (type === "clientHello") {
      const v = validateClientHello(msg as Record<string, unknown>);
      if (!v.ok) return [v.error];
      session.authenticated = true;
      session.protocolVersion = v.value.protocolVersion;
      session.clientInstanceId = v.value.clientInstanceId;
      return [
        makeServerHello({
          protocolVersion: PROTOCOL_VERSION,
          backend: "fixture",
        }),
      ];
    }

    if (!session.authenticated) {
      return [
        protocolError("unauthorized", "clientHello requis avant toute autre commande"),
      ];
    }

    if (type === "listThreads") {
      const threads: ThreadSummary[] = [...this.threads.values()].map((t) => ({
        id: t.threadId,
        projectId: t.projectId,
        title: t.title,
        provider: t.provider,
        status: "idle",
        updatedAt: new Date(0).toISOString(),
        lastSequence: t.lastSequence,
      }));
      return [{ type: "threads", threads }];
    }

    if (type === "getHistory") {
      const v = validateGetHistory(msg as Record<string, unknown>);
      if (!v.ok) return [v.error];
      const bundle = this.threads.get(v.value.threadId);
      if (!bundle) {
        return [protocolError("thread_not_found", "thread inconnu", { threadId: v.value.threadId })];
      }
      return [this.historyResponse(bundle, v.value.afterSequence ?? 0)];
    }

    if (type === "send" || type === "interrupt" || type === "interactionResponse") {
      // Fixture acknowledges shape only — streaming is driven by streamEvents()
      return [];
    }

    return [protocolError("unknown_type", `type non déclaré: ${String(type)}`)];
  }

  historyResponse(bundle: TranscriptBundle, afterSequence: number): HistoryMessage {
    let events = bundle.events;
    if (this.dropSequences.size) {
      events = events.filter((ev) => {
        const seq = ev.meta && typeof ev.meta === "object" && "sequence" in ev.meta
          ? (ev.meta as { sequence: number }).sequence
          : null;
        return seq == null || !this.dropSequences.has(seq);
      });
    }

    const minRetained =
      bundle.id === "snapshot-expired" || this.primaryScenario === "snapshot-expired"
        ? Math.max(this.minRetainedSequence, 50)
        : this.minRetainedSequence;

    const sliced = sliceHistoryAfter(events, afterSequence, {
      minRetainedSequence: minRetained,
    });

    if (sliced.snapshotRequired) {
      return {
        type: "history",
        threadId: bundle.threadId,
        events: [],
        fromSequence: 0,
        toSequence: 0,
        complete: false,
        snapshotRequired: true,
      };
    }

    return {
      type: "history",
      threadId: bundle.threadId,
      events: sliced.events,
      fromSequence: sliced.fromSequence,
      toSequence: sliced.toSequence,
      complete: sliced.complete,
      snapshotRequired: false,
    };
  }

  /**
   * Stream all events as discrete EventMessages (deterministic order).
   * Optionally skip dropped sequences for gap simulation mid-stream.
   */
  streamEvents(threadId: string): EventMessage[] {
    const bundle = this.threads.get(threadId);
    if (!bundle) return [];
    const out: EventMessage[] = [];
    for (const event of bundle.events) {
      const seq = event.meta && "sequence" in event.meta ? event.meta.sequence : null;
      if (seq != null && this.dropSequences.has(seq)) continue;
      out.push({ type: "event", threadId, event });
    }
    return out;
  }

  /** Simulate reconnect: client applies live stream partially then resumes. */
  simulateReconnect(opts: {
    threadId: string;
    /** How many stream events the client received before disconnect. */
    receivedCount: number;
  }): {
    before: SequenceCursor;
    afterResume: ReturnType<typeof applyEventBatch>;
    history: HistoryMessage;
  } {
    const stream = this.streamEvents(opts.threadId);
    const partial = stream.slice(0, opts.receivedCount).map((m) => m.event);
    const before = applyEventBatch(emptyCursor(), partial);
    const history = this.historyResponse(
      this.threads.get(opts.threadId)!,
      before.cursor.lastSequence,
    );
    const afterResume = applyEventBatch(before.cursor, history.events);
    return { before: before.cursor, afterResume, history };
  }
}

/** Export stress size helper for tests without always building 500 turns in every suite. */
export function stressEventCount(): number {
  return stressTranscript().events.length;
}

export function transcriptLastSequence(events: WireAgentEvent[]): number {
  return maxSequence(events);
}
