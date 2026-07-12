/**
 * Journal resync: lastSequence resume + snapshot fallback (plan 034 F).
 */
import type { WireLikeEvent } from "../chat/store/types.ts";
import { getHistory } from "./gatewayClient.ts";
import type { DeviceCredentials, HistoryResponse, WireEvent } from "./types.ts";

export type SyncResult =
  | {
      ok: true;
      mode: "delta" | "snapshot" | "empty";
      events: WireLikeEvent[];
      fromSequence: number;
      toSequence: number;
      lastSequence: number;
    }
  | { ok: false; reason: "snapshot_required" | "network" | "auth"; detail: string };

export async function syncThreadHistory(opts: {
  credentials: DeviceCredentials;
  threadId: string;
  /** Exclusive lower bound already applied locally. */
  lastSequence: number;
  signal?: AbortSignal;
}): Promise<SyncResult> {
  try {
    const hist: HistoryResponse = await getHistory(
      opts.credentials,
      opts.threadId,
      opts.lastSequence,
      opts.signal,
    );
    if (hist.snapshotRequired) {
      // full reload
      const full = await getHistory(opts.credentials, opts.threadId, 0, opts.signal);
      const events = full.events as WireLikeEvent[];
      const last = maxSeq(events);
      return {
        ok: true,
        mode: "snapshot",
        events,
        fromSequence: full.fromSequence,
        toSequence: full.toSequence,
        lastSequence: last,
      };
    }
    const events = hist.events as WireLikeEvent[];
    if (!events.length) {
      return {
        ok: true,
        mode: "empty",
        events: [],
        fromSequence: 0,
        toSequence: 0,
        lastSequence: opts.lastSequence,
      };
    }
    return {
      ok: true,
      mode: "delta",
      events,
      fromSequence: hist.fromSequence,
      toSequence: hist.toSequence,
      lastSequence: Math.max(opts.lastSequence, maxSeq(events)),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 0;
    if (status === 401) return { ok: false, reason: "auth", detail: msg };
    return { ok: false, reason: "network", detail: msg };
  }
}

function maxSeq(events: WireLikeEvent[]): number {
  let m = 0;
  for (const ev of events) {
    const s = ev.meta?.sequence;
    if (typeof s === "number" && s > m) m = s;
  }
  return m;
}

/** Detect gaps in a batch relative to lastSequence (exclusive contiguous next). */
export function findSequenceGaps(events: WireLikeEvent[], lastSequence: number): number[] {
  const seqs = new Set<number>();
  for (const ev of events) {
    const s = ev.meta?.sequence;
    if (typeof s === "number") seqs.add(s);
  }
  if (!seqs.size) return [];
  const max = Math.max(...seqs);
  const gaps: number[] = [];
  for (let s = lastSequence + 1; s <= max; s++) {
    if (!seqs.has(s)) gaps.push(s);
  }
  return gaps;
}

/** Build synthetic batch of N events for stress tests (1000 catch-up). */
export function syntheticCatchUpEvents(
  threadId: string,
  fromSeq: number,
  count: number,
): WireEvent[] {
  const out: WireEvent[] = [];
  for (let i = 0; i < count; i++) {
    const sequence = fromSeq + 1 + i;
    out.push({
      kind: i % 5 === 0 ? "user" : "text",
      text: `catchup-${sequence}`,
      meta: {
        eventId: `catch-${threadId}-${sequence}`,
        sequence,
        turnId: `turn-c-${Math.floor(sequence / 5)}`,
        schemaVersion: 1,
        provider: "fixture",
        threadId,
        durable: true,
        origin: "provider",
        ts: Date.now() + sequence,
      },
    });
  }
  return out;
}
