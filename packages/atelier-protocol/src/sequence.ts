import type { HarnessEventMeta } from "./meta.ts";
import type { WireAgentEvent } from "./envelopes.ts";

export type SequenceCursor = {
  /** Highest contiguous sequence applied (0 = nothing). */
  lastSequence: number;
  /** eventIds already applied (idempotence). */
  seenEventIds: Set<string>;
};

export function emptyCursor(): SequenceCursor {
  return { lastSequence: 0, seenEventIds: new Set() };
}

export function metaOf(ev: WireAgentEvent): HarnessEventMeta | null {
  const m = ev.meta;
  if (!m || typeof m !== "object") return null;
  if (!("eventId" in m) || typeof (m as HarnessEventMeta).eventId !== "string") return null;
  return m as HarnessEventMeta;
}

/**
 * Detect missing sequence numbers in a sorted-or-unsorted batch relative to
 * expected next = lastSequence + 1. Returns gap sequence numbers (missing).
 */
export function detectSequenceGaps(
  events: WireAgentEvent[],
  lastSequence: number,
): number[] {
  const seqs = new Set<number>();
  for (const ev of events) {
    const m = metaOf(ev);
    if (m) seqs.add(m.sequence);
  }
  if (seqs.size === 0) return [];
  const max = Math.max(...seqs);
  const gaps: number[] = [];
  for (let s = lastSequence + 1; s <= max; s++) {
    if (!seqs.has(s)) gaps.push(s);
  }
  return gaps;
}

export type ApplyBatchResult = {
  cursor: SequenceCursor;
  /** Events newly accepted (not duplicates). Order: by sequence then arrival. */
  applied: WireAgentEvent[];
  /** Duplicates ignored (same eventId). */
  duplicates: string[];
  /** Sequence numbers missing before max in batch — client must rattrapage. */
  gaps: number[];
  /**
   * Events that arrived out-of-order (sequence > lastSequence+1) when gaps
   * policy is strict — still applied if present, but gaps reported.
   */
  outOfOrder: WireAgentEvent[];
};

/**
 * Apply a batch of journal events with:
 * - idempotence by eventId
 * - gap detection vs lastSequence
 * - stable ordering by sequence for applied output
 *
 * Does NOT invent missing events. Gaps mean: request history after lastSequence
 * or full snapshot if the server says so.
 */
export function applyEventBatch(
  cursor: SequenceCursor,
  incoming: WireAgentEvent[],
): ApplyBatchResult {
  const seen = new Set(cursor.seenEventIds);
  const duplicates: string[] = [];
  const candidates: WireAgentEvent[] = [];

  for (const ev of incoming) {
    const m = metaOf(ev);
    if (m) {
      if (seen.has(m.eventId)) {
        duplicates.push(m.eventId);
        continue;
      }
      seen.add(m.eventId);
    }
    candidates.push(ev);
  }

  const withSeq = candidates
    .map((ev) => ({ ev, seq: metaOf(ev)?.sequence }))
    .filter((x) => x.seq !== undefined) as { ev: WireAgentEvent; seq: number }[];
  const withoutSeq = candidates.filter((ev) => !metaOf(ev));

  withSeq.sort((a, b) => a.seq - b.seq || 0);

  const gaps = detectSequenceGaps(
    withSeq.map((x) => x.ev),
    cursor.lastSequence,
  );

  const outOfOrder: WireAgentEvent[] = [];
  for (const { ev, seq } of withSeq) {
    if (seq > cursor.lastSequence + 1 && gaps.length > 0) {
      outOfOrder.push(ev);
    }
  }

  const applied = [...withSeq.map((x) => x.ev), ...withoutSeq];
  let lastSequence = cursor.lastSequence;
  // Advance lastSequence only for contiguous prefix from lastSequence+1
  for (const { seq } of withSeq) {
    if (seq === lastSequence + 1) lastSequence = seq;
    else if (seq <= lastSequence) {
      // already covered / duplicate sequence different id — still keep event
      // but do not move cursor backward
    } else {
      // gap: stop contiguous advance; higher seq may still be in applied
      break;
    }
  }
  // If no gaps, take max
  if (gaps.length === 0 && withSeq.length) {
    lastSequence = Math.max(lastSequence, withSeq[withSeq.length - 1].seq);
  } else if (gaps.length > 0) {
    // contiguous advance already stopped; lastSequence is end of contiguous prefix
  }

  return {
    cursor: { lastSequence, seenEventIds: seen },
    applied,
    duplicates,
    gaps,
    outOfOrder,
  };
}

/**
 * Slice journal events for resume: sequence > afterSequence.
 * If afterSequence is beyond retained window, return snapshotRequired.
 */
export function sliceHistoryAfter(
  all: WireAgentEvent[],
  afterSequence: number,
  opts: { minRetainedSequence?: number } = {},
): {
  events: WireAgentEvent[];
  fromSequence: number;
  toSequence: number;
  complete: boolean;
  snapshotRequired: boolean;
} {
  const minRetained = opts.minRetainedSequence ?? 0;
  if (afterSequence > 0 && afterSequence < minRetained) {
    return {
      events: [],
      fromSequence: 0,
      toSequence: 0,
      complete: false,
      snapshotRequired: true,
    };
  }

  const events = all
    .filter((ev) => {
      const m = metaOf(ev);
      return m != null && m.sequence > afterSequence;
    })
    .sort((a, b) => (metaOf(a)!.sequence - metaOf(b)!.sequence));

  if (!events.length) {
    return {
      events: [],
      fromSequence: 0,
      toSequence: 0,
      complete: true,
      snapshotRequired: false,
    };
  }

  const fromSequence = metaOf(events[0])!.sequence;
  const toSequence = metaOf(events[events.length - 1])!.sequence;
  // complete if contiguous from afterSequence+1
  const gaps = detectSequenceGaps(events, afterSequence);
  return {
    events,
    fromSequence,
    toSequence,
    complete: gaps.length === 0,
    snapshotRequired: false,
  };
}

/** Max sequence present in a transcript. */
export function maxSequence(events: WireAgentEvent[]): number {
  let max = 0;
  for (const ev of events) {
    const m = metaOf(ev);
    if (m && m.sequence > max) max = m.sequence;
  }
  return max;
}
