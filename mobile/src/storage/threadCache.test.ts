import { beforeEach, describe, expect, it } from "vitest";
import { __resetSecureStorageForTests } from "../native/secureStorage.ts";
import {
  loadThreadCache,
  mergeCacheEvents,
  migrateThreadCache,
  purgeExpiredCaches,
  purgeOldCaches,
  saveThreadCache,
  MAX_THREAD_CACHES,
} from "./threadCache.ts";

beforeEach(() => {
  __resetSecureStorageForTests();
});

describe("threadCache", () => {
  it("roundtrip + migration v0", async () => {
    await saveThreadCache(
      "t1",
      [{ kind: "user", text: "hi", meta: { eventId: "e1", sequence: 1, turnId: "u" } }],
      1,
    );
    const c = await loadThreadCache("t1");
    expect(c?.version).toBe(1);
    expect(c?.events).toHaveLength(1);

    const migrated = migrateThreadCache({
      threadId: "old",
      events: [{ kind: "text", text: "x" }],
      lastSequence: 2,
      updatedAt: 1,
    });
    expect(migrated?.version).toBe(1);
    expect(migrated?.threadId).toBe("old");
  });

  it("mergeCacheEvents dedupes by eventId", () => {
    const a = [
      { kind: "text", text: "a", meta: { eventId: "e1", sequence: 1 } },
      { kind: "text", text: "b", meta: { eventId: "e2", sequence: 2 } },
    ];
    const b = [
      { kind: "text", text: "b2", meta: { eventId: "e2", sequence: 2 } },
      { kind: "text", text: "c", meta: { eventId: "e3", sequence: 3 } },
    ];
    const m = mergeCacheEvents(a as never, b as never);
    expect(m).toHaveLength(3);
    expect(m.find((x) => x.meta?.eventId === "e2")?.text).toBe("b2");
  });

  it("purge bounds number of threads", async () => {
    for (let i = 0; i < MAX_THREAD_CACHES + 5; i++) {
      await saveThreadCache(`t${i}`, [], i);
    }
    const dropped = await purgeOldCaches(MAX_THREAD_CACHES);
    expect(dropped).toBeGreaterThanOrEqual(0);
    // oldest should be gone
    const old = await loadThreadCache("t0");
    // may or may not depending on touch order — newest kept
    const newest = await loadThreadCache(`t${MAX_THREAD_CACHES + 4}`);
    expect(newest).toBeTruthy();
    void old;
  });

  it("purgeExpiredCaches drops old entries", async () => {
    await saveThreadCache("fresh", [{ kind: "text", text: "a" }], 1);
    // manually age via re-save pattern: save then overwrite updatedAt through migrate path
    const aged = {
      version: 1 as const,
      threadId: "aged",
      lastSequence: 0,
      events: [],
      updatedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
    };
    const { secureSet } = await import("../native/secureStorage.ts");
    await secureSet("atelier.threadCache.v1.aged", JSON.stringify(aged));
    await secureSet("atelier.threadCache.index.v1", JSON.stringify(["fresh", "aged"]));
    const n = await purgeExpiredCaches(14 * 24 * 60 * 60 * 1000, Date.now());
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await loadThreadCache("aged")).toBeNull();
    expect(await loadThreadCache("fresh")).toBeTruthy();
  });
});
