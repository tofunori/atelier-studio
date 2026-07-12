/**
 * Contract: JSON fixtures on disk must match live builders and stay loadable
 * by Rust (`remote::tests::shared_fixture_small_transcript_if_present`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyEventBatch, emptyCursor } from "../src/sequence.ts";
import {
  errorTranscript,
  interactionPendingTranscript,
  interruptTranscript,
  mediumTranscript,
  smallTranscript,
} from "../src/transcripts/build.ts";
import { validateWireAgentEvent } from "../src/validate.ts";
import type { TranscriptBundle } from "../src/transcripts/build.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function load(name: string): TranscriptBundle {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as TranscriptBundle;
}

describe("fixtures JSON ↔ builders", () => {
  const pairs: [string, () => TranscriptBundle][] = [
    ["small-transcript.json", smallTranscript],
    ["medium-transcript.json", mediumTranscript],
    ["interaction-pending-transcript.json", interactionPendingTranscript],
    ["error-transcript.json", errorTranscript],
    ["interrupt-transcript.json", interruptTranscript],
  ];

  for (const [file, build] of pairs) {
    it(`${file} matches builder and validates`, () => {
      const disk = load(file);
      const live = build();
      expect(disk.threadId).toBe(live.threadId);
      expect(disk.lastSequence).toBe(live.lastSequence);
      expect(disk.events.length).toBe(live.events.length);
      for (const ev of disk.events) {
        const r = validateWireAgentEvent(ev);
        expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
      }
      const batch = applyEventBatch(emptyCursor(), disk.events);
      expect(batch.duplicates).toEqual([]);
      expect(batch.gaps).toEqual([]);
      expect(batch.cursor.lastSequence).toBe(disk.lastSequence);
    });
  }
});

describe("adversarial sequences (Grok baseline — Codex en ajoutera)", () => {
  it("out-of-order then fill gap advances cursor only when contiguous", () => {
    const t = smallTranscript();
    // Drop seq 2 from first batch
    const batch1 = t.events.filter((e) => e.meta!.sequence !== 2);
    const r1 = applyEventBatch(emptyCursor(), batch1);
    expect(r1.gaps).toContain(2);
    expect(r1.cursor.lastSequence).toBe(1);
    // Fill gap
    const missing = t.events.filter((e) => e.meta!.sequence === 2);
    const r2 = applyEventBatch(r1.cursor, missing);
    // After fill, re-apply remaining? already have higher seqs in seen set from batch1
    // lastSequence should advance through contiguous seen sequences
    // We need to re-process or walk: our cursor only advances on new apply of contiguous next
    // Applying only seq 2 should set lastSequence to 2, not jump to end
    expect(r2.cursor.lastSequence).toBe(2);
  });

  it("reload mid-stream does not invent done", () => {
    const t = smallTranscript();
    const mid = t.events.findIndex((e) => e.kind === "delta");
    const partial = t.events.slice(0, mid + 1);
    const r = applyEventBatch(emptyCursor(), partial);
    const kinds = r.applied.map((e) => e.kind);
    expect(kinds).not.toContain("done");
    expect(r.cursor.lastSequence).toBeLessThan(t.lastSequence);
  });

  it("incomplete legacy history (no meta) does not move sequence cursor", () => {
    const legacy = [{ kind: "text" as const, text: "legacy" }];
    const r = applyEventBatch(emptyCursor(), legacy);
    expect(r.cursor.lastSequence).toBe(0);
    expect(r.applied).toHaveLength(1);
  });
});
