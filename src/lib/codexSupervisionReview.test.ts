import { describe, expect, it } from "vitest";
import type { AgentEvent, HarnessEventMeta } from "./ws";
import { reconcileWorkingSince, reduceHarnessEvent, threadIsSettled } from "./harnessEvents";

const meta = (sequence: number, turnId = "turn-a"): HarnessEventMeta => ({
  schemaVersion: 1, eventId: `event-${sequence}`, provider: "codex", threadId: "review",
  turnId, sequence, ts: 1000 + sequence, durable: false, origin: "provider",
});
const activity = (sequence: number, title: string, status: "running" | "completed" | "failed" = "running", turnId = "turn-a"): AgentEvent => ({
  kind: "activity", id: "codex-supervision", title, status, meta: meta(sequence, turnId),
});

describe("independent Codex supervision reception", () => {
  it("keeps an uncertain but live turn active and retains its visible explanation", () => {
    const events = reduceHarnessEvent([], activity(1, "Statut Codex incertain : lecture native indisponible.", "failed"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "activity", title: expect.stringContaining("incertain") });
    expect(threadIsSettled(events)).toBe(false);
    expect(reconcileWorkingSince(events, 1000)).toBe(1000);
  });

  it("replaces the same supervision row on recovery without treating that row as turn completion", () => {
    let events = reduceHarnessEvent([], activity(1, "Statut incertain"));
    events = reduceHarnessEvent(events, activity(2, "Activité Codex reprise.", "completed"));
    events = reduceHarnessEvent(events, activity(1, "Statut incertain"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: "Activité Codex reprise.", status: "completed" });
    expect(threadIsSettled(events)).toBe(false);
  });

  it("keeps activity identities scoped to their native-facing Atelier turn", () => {
    let events = reduceHarnessEvent([], activity(1, "Premier tour"));
    events = reduceHarnessEvent(events, activity(2, "Second tour", "running", "turn-b"));
    expect(events).toHaveLength(2);
  });

  it("does not mistake a damaged-history activity for a terminal provider error", () => {
    const fault: AgentEvent = {
      kind: "activity", id: "journal-fault-event-3", title: "Historique Atelier incomplet : payload absent",
      status: "failed", meta: { ...meta(3), durable: true },
    };
    const events = reduceHarnessEvent([], fault);
    expect(threadIsSettled(events)).toBe(false);
    expect(reconcileWorkingSince(events, 1000)).toBe(1000);
  });
});
