/**
 * Contract plan 034 B: fixtures @atelier/protocol se materialisent via le
 * MÊME reducer desktop (live ≡ replay, plan 025).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { materializeHarnessHistory, reduceHarnessEvent } from "./harnessEvents";
import type { AgentEvent } from "./ws";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../packages/atelier-protocol/fixtures/small-transcript.json",
);

describe("protocol fixture ↔ harnessEvents reducer", () => {
  it("materialize == reduce live pour small-transcript.json", () => {
    const bundle = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      events: AgentEvent[];
    };
    const events = bundle.events;
    let live: AgentEvent[] = [];
    for (const ev of events) live = reduceHarnessEvent(live, ev);
    const replay = materializeHarnessHistory(events);
    expect(replay).toEqual(live);
    // Au moins une bulle user et un texte final (pas seulement deltas)
    expect(replay.some((e) => e.kind === "user")).toBe(true);
    expect(replay.some((e) => e.kind === "text" || e.kind === "done")).toBe(true);
  });
});
