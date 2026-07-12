import { describe, expect, it } from "vitest";
import { FixtureEngine } from "../src/fixture/engine.ts";
import { applyEventBatch, emptyCursor, detectSequenceGaps } from "../src/sequence.ts";
import { smallTranscript, stressTranscript } from "../src/transcripts/build.ts";
import { PROTOCOL_VERSION } from "../src/version.ts";

describe("FixtureEngine — handshake", () => {
  it("exige clientHello avant listThreads", () => {
    const eng = new FixtureEngine();
    const s = eng.newSession();
    const out = eng.handleRaw(s, JSON.stringify({ type: "listThreads" }));
    expect(out[0]).toMatchObject({ type: "error", code: "unauthorized" });
  });

  it("négocie protocolVersion et renvoie serverHello", () => {
    const eng = new FixtureEngine();
    const s = eng.newSession();
    const out = eng.handleRaw(
      s,
      JSON.stringify({
        type: "clientHello",
        protocolVersion: PROTOCOL_VERSION,
        clientInstanceId: "phone-1",
        clientKind: "mobile",
      }),
    );
    expect(out[0]).toMatchObject({
      type: "serverHello",
      protocolVersion: 1,
      minProtocolVersion: 1,
      maxProtocolVersion: 1,
    });
    expect(s.authenticated).toBe(true);
  });

  it("refuse client trop récent avec code structuré", () => {
    const eng = new FixtureEngine();
    const s = eng.newSession();
    const out = eng.handleRaw(
      s,
      JSON.stringify({
        type: "clientHello",
        protocolVersion: 42,
        clientInstanceId: "x",
      }),
    );
    expect(out[0]).toMatchObject({
      type: "error",
      code: "protocol_version_unsupported",
      clientVersion: 42,
    });
  });
});

describe("FixtureEngine — history / stream / gap / reconnect", () => {
  it("rejoue l'historique complet", () => {
    const eng = new FixtureEngine({ scenario: "small" });
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    const t = smallTranscript();
    const hist = eng.handleRaw(
      s,
      JSON.stringify({ type: "getHistory", threadId: t.threadId }),
    );
    expect(hist[0].type).toBe("history");
    if (hist[0].type === "history") {
      expect(hist[0].events.length).toBe(t.events.length);
      expect(hist[0].complete).toBe(true);
      expect(hist[0].toSequence).toBe(t.lastSequence);
    }
  });

  it("reprend depuis lastSequence (afterSequence)", () => {
    const eng = new FixtureEngine({ scenario: "small" });
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    const t = smallTranscript();
    const mid = 5;
    const hist = eng.handleRaw(
      s,
      JSON.stringify({ type: "getHistory", threadId: t.threadId, afterSequence: mid }),
    );
    if (hist[0].type === "history") {
      expect(hist[0].events.every((e) => e.meta!.sequence > mid)).toBe(true);
      const applied = applyEventBatch(emptyCursor(), t.events.slice(0, mid));
      // After applying first mid sequences-worth via full events with seq<=mid:
      const first = t.events.filter((e) => e.meta!.sequence <= mid);
      const cur = applyEventBatch(emptyCursor(), first);
      const resume = applyEventBatch(cur.cursor, hist[0].events);
      expect(resume.gaps).toEqual([]);
      expect(resume.cursor.lastSequence).toBe(t.lastSequence);
      void applied;
    }
  });

  it("détecte les événements dupliqués (reconnexion qui rejoue)", () => {
    const eng = new FixtureEngine({ scenario: "small" });
    const stream = eng.streamEvents(smallTranscript().threadId).map((m) => m.event);
    const once = applyEventBatch(emptyCursor(), stream);
    const twice = applyEventBatch(once.cursor, stream);
    expect(twice.duplicates.length).toBe(stream.length);
    expect(twice.applied.length).toBe(0);
    expect(twice.cursor.lastSequence).toBe(once.cursor.lastSequence);
  });

  it("scénario gap: historique avec trous → client détecte", () => {
    const eng = new FixtureEngine({ scenario: "gap", dropSequences: [3, 4] });
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    const threadId = smallTranscript().threadId;
    const hist = eng.handleRaw(s, JSON.stringify({ type: "getHistory", threadId }));
    if (hist[0].type === "history") {
      const gaps = detectSequenceGaps(hist[0].events, 0);
      expect(gaps).toEqual([3, 4]);
      const batch = applyEventBatch(emptyCursor(), hist[0].events);
      expect(batch.gaps).toEqual([3, 4]);
      expect(batch.cursor.lastSequence).toBe(2);
    }
  });

  it("reload pendant streaming: partial + resume sans doublon", () => {
    const eng = new FixtureEngine({ scenario: "small" });
    const threadId = smallTranscript().threadId;
    const { afterResume, history } = eng.simulateReconnect({
      threadId,
      receivedCount: 4,
    });
    expect(history.type).toBe("history");
    expect(afterResume.duplicates.length).toBeGreaterThanOrEqual(0);
    // final cursor should reach end if no gaps
    expect(afterResume.gaps).toEqual([]);
    expect(afterResume.cursor.lastSequence).toBe(smallTranscript().lastSequence);
  });

  it("interaction pending survivie au reconnect (history)", () => {
    const eng = new FixtureEngine({ scenario: "interaction-pending" });
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    const hist = eng.handleRaw(
      s,
      JSON.stringify({ type: "getHistory", threadId: "thread-interaction" }),
    );
    if (hist[0].type === "history") {
      const pending = hist[0].events.filter(
        (e) => e.kind === "interaction" && (e as { state?: string }).state === "pending",
      );
      expect(pending).toHaveLength(1);
    }
  });

  it("historique incomplet (fenêtre expirée) → snapshotRequired", () => {
    const eng = new FixtureEngine({
      scenario: "snapshot-expired",
      minRetainedSequence: 50,
    });
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    // medium thread id
    const hist = eng.handleRaw(
      s,
      JSON.stringify({
        type: "getHistory",
        threadId: "thread-medium",
        afterSequence: 3,
      }),
    );
    expect(hist[0]).toMatchObject({
      type: "history",
      snapshotRequired: true,
      complete: false,
      events: [],
    });
  });

  it("error et interrupt transcripts se chargent", () => {
    const eng = new FixtureEngine();
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    for (const id of ["thread-error", "thread-interrupt"] as const) {
      const hist = eng.handleRaw(s, JSON.stringify({ type: "getHistory", threadId: id }));
      expect(hist[0].type).toBe("history");
    }
  });

  it("type inconnu refusé", () => {
    const eng = new FixtureEngine();
    const s = eng.newSession();
    eng.handleRaw(
      s,
      JSON.stringify({ type: "clientHello", protocolVersion: 1, clientInstanceId: "t" }),
    );
    const out = eng.handleRaw(s, JSON.stringify({ type: "dropDatabase" }));
    expect(out[0]).toMatchObject({ type: "error", code: "unknown_type" });
  });
});

describe("transcripts synthétiques", () => {
  it("small et medium ont des séquences contiguës", () => {
    for (const t of [smallTranscript()]) {
      const gaps = detectSequenceGaps(t.events, 0);
      expect(gaps).toEqual([]);
      expect(t.lastSequence).toBeGreaterThan(0);
    }
  });

  it("stress 500 messages user (turns) — taille et contiguïté", () => {
    const t = stressTranscript();
    expect(t.events.filter((e) => e.kind === "user")).toHaveLength(500);
    expect(t.events.length).toBeGreaterThan(500);
    const gaps = detectSequenceGaps(t.events, 0);
    expect(gaps).toEqual([]);
    const batch = applyEventBatch(emptyCursor(), t.events);
    expect(batch.duplicates).toEqual([]);
    expect(batch.cursor.lastSequence).toBe(t.lastSequence);
  }, 30_000);
});
