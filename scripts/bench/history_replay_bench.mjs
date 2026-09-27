#!/usr/bin/env node
// CPU only, synthetic data: no app, provider, disk history or DOM.
// node scripts/bench/history_replay_bench.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { transform } from "esbuild";

const { code } = await transform(readFileSync(new URL("../../src/lib/harnessEvents.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" });
const { materializeHarnessHistory, reduceHarnessEvent } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const sequential = (events) => events.reduce(reduceHarnessEvent, []);
function fixture(n, tools) {
  return Array.from({ length: n }, (_, i) => {
    const width = tools ? 4 : 3;
    const turn = Math.floor(i / width);
    const meta = { schemaVersion: 1, eventId: `e${i}`, threadId: "synthetic", turnId: `t${turn}`, sequence: i + 1, durable: true, origin: "provider", provider: "codex", ts: i };
    const position = i % width;
    return position === 0 ? { kind: "user", text: "Question", ts: i, meta }
      : tools && position === 1 ? { kind: "tool_update", id: "reused-tool", name: "read", status: "completed", output: "ok", ts: i, meta }
      : position === width - 2 ? { kind: "text", text: "Réponse synthétique.", ts: i, meta }
      : { kind: "done", ok: true, result: "", ts: i, meta };
  });
}
function measure(fn, events) {
  const samples = [];
  let result;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    result = fn(events);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { result, medianMs: samples[2] };
}
for (const tools of [false, true]) {
  materializeHarnessHistory(fixture(300, tools));
  sequential(fixture(300, tools));
  for (const events of [1000, 4000, 12000]) {
    const trace = fixture(events, tools);
    const before = measure(sequential, trace);
    const after = measure(materializeHarnessHistory, trace);
    assert.deepEqual(after.result, before.result);
    console.log(JSON.stringify({ events, tools, sequentialMs: +before.medianMs.toFixed(2), indexedMs: +after.medianMs.toFixed(2), speedup: +(before.medianMs / after.medianMs).toFixed(1) }));
  }
}
