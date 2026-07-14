import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./ws";
import { buildForkThreadPayload } from "./forkThread";

describe("buildForkThreadPayload", () => {
  it("construit aussi un fork Grok avec le transcript limité au point choisi", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Question Grok" },
      { kind: "thinking", text: "raisonnement interne" },
      {
        kind: "text",
        text: "Réponse Grok",
        meta: {
          schemaVersion: 1,
          eventId: "grok-answer",
          provider: "grok",
          threadId: "grok-source",
          turnId: "turn-1",
          sequence: 3,
          ts: 3,
          durable: true,
          origin: "provider",
        },
      },
      { kind: "user", text: "Après le fork" },
    ];

    const result = buildForkThreadPayload("grok-source", "grok-fork", 2, events);

    expect(result.forkEvents).toHaveLength(3);
    expect(result.payload).toEqual({
      type: "forkThread",
      newThreadId: "grok-fork",
      fromThreadId: "grok-source",
      eventId: "grok-answer",
      contextEvents: [
        { kind: "user", text: "Question Grok" },
        { kind: "text", text: "Réponse Grok" },
      ],
    });
  });
});
