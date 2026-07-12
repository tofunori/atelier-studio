import { describe, expect, it } from "vitest";
import {
  applyEventBatch,
  detectSequenceGaps,
  emptyCursor,
  sliceHistoryAfter,
} from "../src/sequence.ts";
import { smallTranscript } from "../src/transcripts/build.ts";
import type { WireAgentEvent } from "../src/envelopes.ts";

function withSeq(seq: number, eventId: string, text = "x"): WireAgentEvent {
  return {
    kind: "text",
    text,
    meta: {
      schemaVersion: 1,
      eventId,
      provider: "claude",
      threadId: "t",
      turnId: "turn-1",
      sequence: seq,
      ts: 1000 + seq,
      durable: true,
      origin: "provider",
    },
  };
}

describe("detectSequenceGaps", () => {
  it("signale les séquences manquantes", () => {
    const gaps = detectSequenceGaps([withSeq(1, "a"), withSeq(2, "b"), withSeq(5, "c")], 0);
    expect(gaps).toEqual([3, 4]);
  });

  it("vide si contigu depuis lastSequence", () => {
    const gaps = detectSequenceGaps([withSeq(3, "a"), withSeq(4, "b")], 2);
    expect(gaps).toEqual([]);
  });
});

describe("applyEventBatch — idempotence et ordre", () => {
  it("ignore les eventId dupliqués", () => {
    const a = withSeq(1, "ev-1");
    const dup = withSeq(1, "ev-1");
    const r = applyEventBatch(emptyCursor(), [a, dup, withSeq(2, "ev-2")]);
    expect(r.duplicates).toEqual(["ev-1"]);
    expect(r.applied.map((e) => e.meta!.eventId)).toEqual(["ev-1", "ev-2"]);
    expect(r.cursor.lastSequence).toBe(2);
    expect(r.gaps).toEqual([]);
  });

  it("détecte out-of-order avec trous", () => {
    const r = applyEventBatch(emptyCursor(), [withSeq(1, "a"), withSeq(4, "d")]);
    expect(r.gaps).toEqual([2, 3]);
    expect(r.cursor.lastSequence).toBe(1);
    expect(r.outOfOrder.length).toBeGreaterThan(0);
  });

  it("n'avance pas lastSequence au-delà d'un trou", () => {
    const r = applyEventBatch(emptyCursor(), [withSeq(2, "b")]);
    expect(r.gaps).toEqual([1]);
    expect(r.cursor.lastSequence).toBe(0);
  });
});

describe("sliceHistoryAfter — reprise lastSequence", () => {
  it("retourne uniquement sequence > afterSequence", () => {
    const t = smallTranscript();
    const slice = sliceHistoryAfter(t.events, 3);
    expect(slice.events.every((e) => e.meta!.sequence > 3)).toBe(true);
    expect(slice.complete).toBe(true);
    expect(slice.snapshotRequired).toBe(false);
  });

  it("snapshotRequired si afterSequence sous la fenêtre retenue", () => {
    const t = smallTranscript();
    const slice = sliceHistoryAfter(t.events, 2, { minRetainedSequence: 5 });
    expect(slice.snapshotRequired).toBe(true);
    expect(slice.events).toEqual([]);
    expect(slice.complete).toBe(false);
  });

  it("batch vide si déjà à jour", () => {
    const t = smallTranscript();
    const slice = sliceHistoryAfter(t.events, t.lastSequence);
    expect(slice.events).toEqual([]);
    expect(slice.complete).toBe(true);
  });
});
