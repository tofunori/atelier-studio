/**
 * Versioned local projection cache (plan 034 F).
 * Replaceable — never concurrent source of truth vs journal.
 */

import type { WireLikeEvent } from "../chat/store/types.ts";
import { secureGet, secureRemove, secureSet } from "../native/secureStorage.ts";

export const THREAD_CACHE_VERSION = 1 as const;
export const MAX_CACHED_EVENTS = 800;
export const MAX_THREAD_CACHES = 20;
/** 14 days — see docs/mobile/DATA_RETENTION.md */
export const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type ThreadCacheV1 = {
  version: 1;
  threadId: string;
  lastSequence: number;
  events: WireLikeEvent[];
  updatedAt: number;
};

export type ThreadCacheAny = ThreadCacheV1;

const indexKey = "atelier.threadCache.index.v1";

function cacheKey(threadId: string): string {
  return `atelier.threadCache.v1.${threadId}`;
}

export function migrateThreadCache(raw: unknown): ThreadCacheV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // v0 legacy without version
  if (o.version == null && typeof o.threadId === "string" && Array.isArray(o.events)) {
    return {
      version: 1,
      threadId: o.threadId,
      lastSequence: Number(o.lastSequence) || 0,
      events: o.events as WireLikeEvent[],
      updatedAt: Number(o.updatedAt) || Date.now(),
    };
  }
  if (o.version === 1 && typeof o.threadId === "string" && Array.isArray(o.events)) {
    return {
      version: 1,
      threadId: o.threadId,
      lastSequence: Number(o.lastSequence) || 0,
      events: o.events as WireLikeEvent[],
      updatedAt: Number(o.updatedAt) || Date.now(),
    };
  }
  return null;
}

export async function loadThreadCache(threadId: string): Promise<ThreadCacheV1 | null> {
  const raw = await secureGet(cacheKey(threadId));
  if (!raw) return null;
  try {
    return migrateThreadCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveThreadCache(
  threadId: string,
  events: WireLikeEvent[],
  lastSequence: number,
): Promise<void> {
  const bounded = events.length > MAX_CACHED_EVENTS ? events.slice(-MAX_CACHED_EVENTS) : events;
  const entry: ThreadCacheV1 = {
    version: THREAD_CACHE_VERSION,
    threadId,
    lastSequence,
    events: bounded,
    updatedAt: Date.now(),
  };
  await secureSet(cacheKey(threadId), JSON.stringify(entry));
  await touchIndex(threadId);
  await purgeOldCaches();
}

async function loadIndex(): Promise<string[]> {
  const raw = await secureGet(indexKey);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as string[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function touchIndex(threadId: string): Promise<void> {
  let idx = await loadIndex();
  idx = [threadId, ...idx.filter((id) => id !== threadId)];
  await secureSet(indexKey, JSON.stringify(idx));
}

export async function purgeOldCaches(max = MAX_THREAD_CACHES): Promise<number> {
  const idx = await loadIndex();
  if (idx.length <= max) return 0;
  const drop = idx.slice(max);
  for (const id of drop) {
    await secureRemove(cacheKey(id));
  }
  await secureSet(indexKey, JSON.stringify(idx.slice(0, max)));
  return drop.length;
}

/** Drop caches older than maxAgeMs (default 14d). */
export async function purgeExpiredCaches(
  maxAgeMs = CACHE_MAX_AGE_MS,
  now = Date.now(),
): Promise<number> {
  const idx = await loadIndex();
  let dropped = 0;
  const keep: string[] = [];
  for (const id of idx) {
    const c = await loadThreadCache(id);
    if (!c || now - c.updatedAt > maxAgeMs) {
      await secureRemove(cacheKey(id));
      dropped++;
    } else {
      keep.push(id);
    }
  }
  await secureSet(indexKey, JSON.stringify(keep));
  return dropped;
}

export async function countCachedThreads(): Promise<number> {
  return (await loadIndex()).length;
}

export async function clearThreadCache(threadId: string): Promise<void> {
  await secureRemove(cacheKey(threadId));
  const idx = (await loadIndex()).filter((id) => id !== threadId);
  await secureSet(indexKey, JSON.stringify(idx));
}

/**
 * Merge remote delta into cache events by eventId; prefer higher sequence.
 */
export function mergeCacheEvents(
  current: WireLikeEvent[],
  incoming: WireLikeEvent[],
): WireLikeEvent[] {
  const byId = new Map<string, WireLikeEvent>();
  const order: string[] = [];
  const keyOf = (ev: WireLikeEvent, i: number) =>
    (ev.meta && typeof ev.meta.eventId === "string" ? ev.meta.eventId : null) ?? `anon-${i}`;

  current.forEach((ev, i) => {
    const k = keyOf(ev, i);
    byId.set(k, ev);
    order.push(k);
  });
  for (const ev of incoming) {
    const k =
      ev.meta && typeof ev.meta.eventId === "string"
        ? ev.meta.eventId
        : `anon-in-${order.length}`;
    if (!byId.has(k)) order.push(k);
    byId.set(k, ev);
  }
  const merged = order.map((k) => byId.get(k)!).filter(Boolean);
  merged.sort((a, b) => {
    const sa = (a.meta?.sequence as number) ?? 0;
    const sb = (b.meta?.sequence as number) ?? 0;
    return sa - sb;
  });
  return merged.length > MAX_CACHED_EVENTS ? merged.slice(-MAX_CACHED_EVENTS) : merged;
}
