import { describe, expect, it, vi, afterEach } from "vitest";
import {
  findSequenceGaps,
  syncThreadHistory,
  syntheticCatchUpEvents,
} from "./syncEngine.ts";
import type { DeviceCredentials } from "./types.ts";

const creds: DeviceCredentials = {
  deviceId: "d",
  token: "t",
  name: "iPhone",
  scopes: ["chat:read"],
  gatewayBaseUrl: "http://127.0.0.1:18765",
  pairedAt: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncEngine", () => {
  it("delta after lastSequence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("afterSequence=10");
        return Response.json({
          events: [
            {
              kind: "text",
              text: "x",
              meta: { eventId: "e11", sequence: 11, turnId: "t1" },
            },
          ],
          fromSequence: 11,
          toSequence: 11,
          complete: true,
        });
      }),
    );
    const r = await syncThreadHistory({
      credentials: creds,
      threadId: "th",
      lastSequence: 10,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mode).toBe("delta");
      expect(r.lastSequence).toBe(11);
    }
  });

  it("snapshotRequired → full reload", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        if (n === 1) {
          return Response.json({
            events: [],
            fromSequence: 0,
            toSequence: 0,
            complete: false,
            snapshotRequired: true,
          });
        }
        return Response.json({
          events: [
            { kind: "user", text: "a", meta: { eventId: "e1", sequence: 1, turnId: "t" } },
            { kind: "text", text: "b", meta: { eventId: "e2", sequence: 2, turnId: "t" } },
          ],
          fromSequence: 1,
          toSequence: 2,
          complete: true,
        });
      }),
    );
    const r = await syncThreadHistory({
      credentials: creds,
      threadId: "th",
      lastSequence: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mode).toBe("snapshot");
      expect(r.events).toHaveLength(2);
    }
  });

  it("1000 events catch-up synthetic has no gaps", () => {
    const events = syntheticCatchUpEvents("th", 0, 1000);
    expect(events).toHaveLength(1000);
    const gaps = findSequenceGaps(events as never, 0);
    expect(gaps).toEqual([]);
  });

  it("detects gaps", () => {
    const events = [
      { kind: "text", meta: { sequence: 1, eventId: "a" } },
      { kind: "text", meta: { sequence: 3, eventId: "c" } },
    ];
    expect(findSequenceGaps(events as never, 0)).toEqual([2]);
  });
});
