import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as codex from "../providers/codex.mjs";

const root = mkdtempSync(join(tmpdir(), "atelier-codex-live-"));
const failures = [];
const results = [];

function summarize(events) {
  return {
    errors: events.filter((e) => e.kind === "error"),
    tools: events.filter((e) => e.kind === "tool").map((e) => e.name),
    toolUpdates: events.filter((e) => e.kind === "tool_update").map((e) => ({
      name: e.name,
      status: e.status,
      exitCode: e.exitCode,
      source: e.source,
      output: String(e.output ?? "").slice(0, 500),
    })),
    heartbeats: events.filter((e) => e.kind === "heartbeat").length,
    goals: events.filter((e) => e.kind === "goal"),
    text: events.filter((e) => e.kind === "text").map((e) => e.text).join("\n").slice(0, 1000),
    done: events.filter((e) => e.kind === "done").at(-1) ?? null,
  };
}

async function runCase(name, args, check) {
  console.error(`[codex-live] ${name}: start`);
  const threadId = `atelier-live-${name}-${Date.now()}`;
  const events = [];
  let result = null;
  let error = null;
  let hardTimer = null;
  try {
    const timeoutMs = args.timeoutMs ?? 180000;
    const runPromise = codex.run({
      threadId,
      cwd: root,
      effort: "low",
      timeoutMs,
      onEvent(event) { events.push(event); },
      ...args,
    });
    const hardTimeout = new Promise((_, reject) => {
      hardTimer = setTimeout(() => {
        codex.interrupt(threadId).catch(() => {});
        codex.stopServer();
        reject(new Error(`live case ${name} timed out after ${timeoutMs + 15000}ms`));
      }, timeoutMs + 15000);
    });
    result = await Promise.race([runPromise, hardTimeout]);
    const summary = summarize(events);
    const ok = Boolean(check({ result, events, summary }));
    console.error(`[codex-live] ${name}: ${ok ? "ok" : "failed"}`);
    results.push({ name, ok, result, summary });
    if (!ok) failures.push(name);
  } catch (e) {
    error = String(e?.stack ?? e);
    console.error(`[codex-live] ${name}: error`);
    results.push({ name, ok: false, result, error, summary: summarize(events) });
    failures.push(name);
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
}

async function runSteeringCase() {
  const name = "steer";
  console.error(`[codex-live] ${name}: start`);
  const threadId = `atelier-live-${name}-${Date.now()}`;
  const events = [];
  let steerAccepted = false;
  let result = null;
  try {
    const runPromise = codex.run({
      threadId,
      cwd: root,
      effort: "low",
      sandbox: "danger-full-access",
      timeoutMs: 10000,
      prompt: "Run exactly this shell command: sleep 20 && printf original-finished. Do not do anything else.",
      onEvent(event) { events.push(event); },
    });
    const startedAt = Date.now();
    while (!events.some((e) => e.kind === "started") && Date.now() - startedAt < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    steerAccepted = await codex.steer({
      threadId,
      prompt: "Steering smoke-test: acknowledge this steering message, then stop as soon as possible.",
    });
    await codex.interrupt(threadId);
    result = await runPromise;
    const summary = summarize(events);
    const ok = steerAccepted && summary.done?.ok === false && summary.done?.result === "interrompu";
    console.error(`[codex-live] ${name}: ${ok ? "ok" : "failed"}`);
    results.push({ name, ok, result, steerAccepted, summary });
    if (!ok) failures.push(name);
  } catch (e) {
    console.error(`[codex-live] ${name}: error`);
    results.push({ name, ok: false, result, steerAccepted, error: String(e?.stack ?? e), summary: summarize(events) });
    failures.push(name);
  }
}

async function runGoalCase() {
  const name = "goal";
  console.error(`[codex-live] ${name}: start`);
  const events = [];
  const goalEvents = [];
  let result = null;
  try {
    codex.onGoal((threadId, event) => {
      goalEvents.push({ threadId, event });
      events.push(event);
    });
    result = await codex.run({
      threadId: `atelier-live-${name}-${Date.now()}`,
      cwd: root,
      effort: "low",
      sandbox: "danger-full-access",
      timeoutMs: 180000,
      prompt: "Reply only: goal-session-ready",
      onEvent(event) { events.push(event); },
    });
    const objective = `atelier-live-goal-${Date.now()}`;
    await codex.setGoal({ sessionId: result.sessionId, cwd: root, objective });
    const got = await codex.getGoal({ sessionId: result.sessionId, cwd: root });
    await codex.clearGoal({ sessionId: result.sessionId, cwd: root });
    const summary = summarize(events);
    const ok = Boolean(got?.objective === objective &&
      summary.goals.some((event) => event.goal?.objective === objective) &&
      summary.goals.some((event) => event.cleared));
    console.error(`[codex-live] ${name}: ${ok ? "ok" : "failed"}`);
    results.push({ name, ok, result, goalEvents, summary });
    if (!ok) failures.push(name);
  } catch (e) {
    console.error(`[codex-live] ${name}: error`);
    results.push({ name, ok: false, result, goalEvents, error: String(e?.stack ?? e), summary: summarize(events) });
    failures.push(name);
  } finally {
    codex.onGoal(null);
  }
}

await runCase("command", {
  sandbox: "danger-full-access",
  effort: "minimal",
  prompt: "Run exactly this shell command: printf atelier-live-command-ok. Then answer with only the command output. Do not modify files.",
}, ({ summary }) => {
  const output = summary.toolUpdates.map((t) => t.output).join("\n");
  return summary.done?.ok === true && output.includes("atelier-live-command-ok") && summary.text.includes("atelier-live-command-ok");
});

const readOnlyTarget = join(root, "forbidden.txt");
await runCase("readonly", {
  sandbox: "read-only",
  prompt: "Attempt to create forbidden.txt containing no-write using a shell command. Then report whether the command succeeded. Do not ask for permission.",
}, ({ summary }) => summary.done?.ok === true && !existsSync(readOnlyTarget));

const imagePath = join(root, "pixel.png");
writeFileSync(
  imagePath,
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lU2nWQAAAABJRU5ErkJggg==", "base64"),
);
await runCase("image-input", {
  sandbox: "danger-full-access",
  prompt: "A local image is attached. Reply briefly that the image input was received.",
  attachments: [{ path: imagePath }],
}, ({ summary }) => summary.done?.ok === true && summary.errors.length === 0);

await runCase("interrupt", {
  sandbox: "danger-full-access",
  timeoutMs: 2500,
  prompt: "Run exactly this shell command: sleep 20 && printf should-not-finish. Do not do anything else.",
}, ({ summary }) => summary.done?.ok === false && summary.done?.result === "interrompu");

await runSteeringCase();

await runCase("heartbeat", {
  sandbox: "danger-full-access",
  timeoutMs: 30000,
  prompt: "Run exactly this shell command: sleep 6 && printf atelier-live-heartbeat-ok. Then answer with only the command output.",
}, ({ summary }) => summary.done?.ok === true && summary.heartbeats >= 1 && summary.text.includes("atelier-live-heartbeat-ok"));

await runGoalCase();

if (process.env.ATELIER_CODEX_LIVE_WEB === "1") {
  await runCase("web-search", {
    sandbox: "danger-full-access",
    timeoutMs: 60000,
    webSearch: true,
    prompt: "Use web search to find the current official OpenAI homepage title or name. Reply with one short sentence. This is a web-search plumbing test.",
  }, ({ summary }) => summary.done?.ok === true && summary.errors.length === 0 && (
    summary.tools.some((name) => name.includes("recherche web")) ||
    summary.text.toLowerCase().includes("openai")
  ));
}

if (process.env.ATELIER_CODEX_LIVE_MCP === "1") {
  await runCase("mcp-context7", {
    sandbox: "danger-full-access",
    prompt: "Use the context7 MCP tool to resolve the library id for React. Reply with the library id you found. This is an MCP plumbing test; do not use shell commands.",
  }, ({ summary }) => summary.done?.ok === true &&
    summary.toolUpdates.some((tool) => tool.source === "mcp" && tool.name.includes("context7")) &&
    summary.text.includes("/reactjs/react.dev"));
}

try {
  codex.stopServer();
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  failures,
  results,
}, null, 2));

if (failures.length) process.exit(1);
