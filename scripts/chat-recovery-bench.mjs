#!/usr/bin/env node
/**
 * Chat recovery protocol bench.
 *
 * This drives the loopback WS contract with the fake provider.  It deliberately
 * does not delete or recreate APP_DIR: a caller may kill/restart the same
 * `atelier-studio-server` process around this driver to test durable receipts.
 * Provider time is reported as unavailable because the WS contract does not
 * expose provider internals; the measured values are Atelier admission,
 * receipt confirmation, ping and history recovery.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const [key, inline] = token.slice(2).split("=", 2);
  args.set(key, inline ?? process.argv[i + 1] ?? "");
  if (inline == null) i += 1;
}

const url = args.get("url") || process.env.ATELIER_BENCH_WS || "ws://127.0.0.1:8765";
const output = args.get("output") || "docs/benchmarks/chat-recovery-latest.json";
const durationMs = Math.max(0, Number(args.get("duration-ms") || process.env.ATELIER_BENCH_DURATION_MS || 600_000));
const chats = String(args.get("chats") || "1,5,10")
  .split(",")
  .map(Number)
  .filter((value) => Number.isInteger(value) && value > 0);
const reconnectCycles = Number(args.get("reconnect-cycles") || 3);
const historyShape = String(args.get("history") || "short,long").split(",").filter(Boolean);
const maxReceipts = Math.max(1, Number(args.get("max-receipts") || 3000));
const longTurns = Math.max(1, Number(args.get("long-turns") || 12));
const longPromptChars = Math.max(1024, Number(args.get("long-prompt-chars") || 4096));
const pacingMs = Math.max(0, Number(args.get("pacing-ms") || 250));
const token = process.env.ATELIER_TOKEN;
const liveSockets = new Set();
const protocolErrors = [];
const observedTerminalStates = new Map();
const terminalStateConflicts = [];
const execFileAsync = promisify(execFile);

if (typeof WebSocket !== "function") {
  throw new Error("Node WebSocket global is required (Node 22+)");
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
};

function summarize(values) {
  return {
    count: values.length,
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: values.length ? Number(Math.max(...values).toFixed(3)) : null,
  };
}

async function sampleServerRssBytes() {
  const appDir = process.env.ATELIER_APP_DIR;
  if (!appDir) return null;
  try {
    const pid = (await readFile(`${appDir}/sidecar.pid`, "utf8")).trim();
    if (!/^\d+$/.test(pid)) return null;
    if (process.platform === "linux") {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      return match ? Number(match[1]) * 1024 : null;
    }
    const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", pid], { maxBuffer: 16 * 1024 });
    const kib = Number(stdout.trim());
    return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null;
  } catch {
    return null;
  }
}

function summarizeRss(samples) {
  const values = samples.filter((value) => Number.isFinite(value));
  if (!values.length) return { samples: 0, minBytes: null, maxBytes: null, deltaBytes: null };
  return {
    samples: values.length,
    minBytes: Math.min(...values),
    maxBytes: Math.max(...values),
    deltaBytes: values[values.length - 1] - values[0],
  };
}

function authenticatedUrl() {
  const target = new URL(url);
  if (token) target.searchParams.set("token", token);
  return target.toString();
}

function reportUrl() {
  const target = new URL(url);
  if (target.searchParams.has("token")) target.searchParams.set("token", "[redacted]");
  return target.toString();
}

function connect() {
  return new Promise((resolve, reject) => {
    // Node's built-in WebSocket second argument is a subprotocol list, not a
    // fetch options object. The runtime intentionally accepts the fixture
    // token in the WS query, matching the app's sidecar client.
    const ws = new WebSocket(authenticatedUrl());
    const queue = [];
    const waiters = [];
    const receiptEvents = new Map();
    const fail = (error) => {
      while (waiters.length) waiters.shift().reject(error);
      reject(error);
    };
    const deliver = (message) => {
      for (let i = 0; i < waiters.length; i += 1) {
        if (!waiters[i].predicate(message)) continue;
        const waiter = waiters.splice(i, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
      // Streams are intentionally not part of a benchmark response queue. A
      // bounded queue also prevents a busy fake provider from retaining every
      // old event and accidentally changing a later measurement.
      if (message.type !== "event") {
        queue.push(message);
        if (queue.length > 256) queue.splice(0, queue.length - 256);
      }
    };
    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "error") {
          protocolErrors.push({ code: message.code, message: message.message,
            requestId: message.requestId, requestType: message.requestType });
          if (protocolErrors.length > 32) protocolErrors.shift();
        }
        const receivedAt = performance.now();
        Object.defineProperty(message, "__receivedAt", {
          value: receivedAt,
          enumerable: false,
        });
        if (message.type === "sendReceipt" && typeof message.clientMessageId === "string") {
          if (["completed", "failed", "cancelled", "uncertain"].includes(message.status)) {
            const identity = JSON.stringify([message.status, message.turnId, message.threadId, message.provider]);
            const previous = observedTerminalStates.get(message.clientMessageId);
            if (previous != null && previous !== identity && terminalStateConflicts.length < 32) {
              terminalStateConflicts.push({ clientMessageId: message.clientMessageId, previous, identity });
            }
            observedTerminalStates.set(message.clientMessageId, identity);
          }
          const events = receiptEvents.get(message.clientMessageId) ?? [];
          events.push({
            status: message.status,
            receivedAt,
            requestId: message.requestId ?? null,
            threadId: message.threadId ?? null,
            provider: message.provider ?? null,
            turnId: message.turnId ?? null,
          });
          if (events.length > 32) events.splice(0, events.length - 32);
          receiptEvents.set(message.clientMessageId, events);
        }
        deliver(message);
      } catch {
        // Protocol noise is ignored; a request timeout records the failure.
      }
    });
    ws.addEventListener("error", () => fail(new Error("WebSocket error")));
    ws.addEventListener("close", () => {
      liveSockets.delete(ws);
      const error = new Error("WebSocket closed");
      while (waiters.length) waiters.shift().reject(error);
    });
    ws.addEventListener("open", () => {
      const waitFor = (predicate, timeoutMs = 5000) => {
        const queued = queue.findIndex(predicate);
        if (queued >= 0) return Promise.resolve(queue.splice(queued, 1)[0]);
        return new Promise((resolveWaiter, rejectWaiter) => {
          const waiter = {
            predicate,
            resolve: resolveWaiter,
            reject: rejectWaiter,
            timer: setTimeout(() => {
              const index = waiters.indexOf(waiter);
              if (index >= 0) waiters.splice(index, 1);
              rejectWaiter(new Error("WS request timeout"));
            }, timeoutMs),
          };
          waiters.push(waiter);
        });
      };
      ws.waitFor = waitFor;
      ws.receiptEvents = receiptEvents;
      liveSockets.add(ws);
      ws.send(JSON.stringify({ type: "clientHello", clientInstanceId: `bench-${process.pid}` }));
      resolve(ws);
    });
  });
}

async function request(ws, payload, predicate, timeoutMs = 5000) {
  const correlatedError = (message) => message.type === "error" && (
    (payload.requestId != null && message.requestId === payload.requestId)
    || (payload.clientMessageId != null && message.clientMessageId === payload.clientMessageId)
  );
  const pending = ws.waitFor((message) => predicate(message) || correlatedError(message), timeoutMs);
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    throw new Error(`WS send failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const response = await pending;
    if (correlatedError(response)) throw new Error(`WS ${response.code ?? "error"}: ${response.message}`);
    return response;
  } catch (error) {
    const identity = ["requestId", "clientMessageId", "threadId", "type"]
      .map((key) => payload[key] == null ? null : `${key}=${String(payload[key])}`)
      .filter(Boolean)
      .join(" ");
    throw new Error(`${identity || "WS request"} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ping(ws, metrics) {
  const started = performance.now();
  await request(ws, { type: "ping" }, (message) => message.type === "pong");
  metrics.ping.push(performance.now() - started);
}

async function receipt(ws, acceptedReceipt, acceptedAt, metrics) {
  const clientMessageId = acceptedReceipt.clientMessageId;
  const terminal = new Set(["completed", "failed", "cancelled", "uncertain"]);
  const observedTerminal = () => {
    const events = ws.receiptEvents?.get(clientMessageId) ?? [];
    return [...events].reverse().find((event) => terminal.has(event.status)) ?? null;
  };
  const finish = (response, finishedAt) => {
    metrics.confirmation.push(Math.max(0, finishedAt - acceptedAt));
    if (!response || !terminal.has(response.status)) metrics.confirmationTimeouts += 1;
    return response;
  };
  const alreadyObserved = observedTerminal();
  if (alreadyObserved) {
    return finish({
      ...acceptedReceipt,
      type: "sendReceipt",
      clientMessageId,
      status: alreadyObserved.status,
      threadId: alreadyObserved.threadId ?? acceptedReceipt.threadId,
      provider: alreadyObserved.provider ?? acceptedReceipt.provider,
    }, alreadyObserved.receivedAt);
  }
  let response = null;
  let responseAt = performance.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // The runtime echoes requestId on receiptStatus replies. This prevents a
    // queued sendReceipt (for example a completion received during admission)
    // from being mistaken for this probe.
    const requestId = `bench-receipt-${clientMessageId}-${attempt}`;
    response = await request(
      ws,
      { type: "receiptStatus", clientMessageId, requestId },
      (message) => message.type === "sendReceipt"
        && message.clientMessageId === clientMessageId
        && message.requestId === requestId,
    );
    responseAt = response.__receivedAt ?? performance.now();
    if (terminal.has(response.status) || response.status === "unknown") break;
    const afterProbe = observedTerminal();
    if (afterProbe) {
      return finish({
        ...acceptedReceipt,
        type: "sendReceipt",
        clientMessageId,
        status: afterProbe.status,
        threadId: afterProbe.threadId ?? acceptedReceipt.threadId,
        provider: afterProbe.provider ?? acceptedReceipt.provider,
      }, afterProbe.receivedAt);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (attempt + 1), 1000)));
  }
  return finish(response, terminal.has(response?.status) ? responseAt : performance.now());
}

async function history(ws, threadId, cursor, metrics) {
  const started = performance.now();
  const requestId = `bench-history-${threadId}-${Math.random().toString(36).slice(2)}`;
  const response = await request(
    ws,
    { type: "getHistory", threadId, requestId, ...(cursor ? { historyCursor: cursor } : {}) },
    (message) => message.type === "history" && message.threadId === threadId && message.requestId === requestId,
    10_000,
  );
  metrics.recovery.push(performance.now() - started);
  return response;
}

async function runWorkload(ws, count, shape, metrics, iteration) {
  const turnsPerChat = shape === "long" ? longTurns : 1;
  const plannedSends = count * turnsPerChat;
  const ids = [];
  const accepted = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const threadId = `bench-thread-${count}-${shape}-${index}`;
    const threadAccepted = [];
    for (let turn = 0; turn < turnsPerChat; turn += 1) {
      const clientMessageId = `bench-${count}-${shape}-${iteration}-${index}-${turn}`;
      ids.push(clientMessageId);
      const prompt = shape === "long"
        ? `${"long history fragment ".repeat(Math.ceil(longPromptChars / 22)).slice(0, longPromptChars)} [chat ${index} turn ${turn}]`
        : `short ${index}`;
      const started = performance.now();
      const response = await request(
        ws,
        {
          type: "send",
          threadId,
          projectRoot: "",
          provider: "fake",
          prompt,
          clientMessageId,
        },
        (message) => message.type === "sendReceipt" && message.clientMessageId === clientMessageId,
        10_000,
      );
      const acceptedAt = response.__receivedAt ?? performance.now();
      threadAccepted.push({ response, acceptedAt });
      metrics.admission.push(acceptedAt - started);
      if (pacingMs > 0) await new Promise((resolve) => setTimeout(resolve, pacingMs));
    }
    return threadAccepted;
  })).then((rows) => rows.flat());
  if (accepted.length !== plannedSends) throw new Error("benchmark admission count mismatch");
  // Ten concurrent chats do not authorize an unlimited burst of status reads:
  // the WS contract admits eight FastRead requests per connection. Keep probes
  // below that bound without reducing the number of concurrently active chats.
  const confirmed = new Array(accepted.length);
  let nextConfirmation = 0;
  await Promise.all(Array.from({ length: Math.min(4, accepted.length) }, async () => {
    while (nextConfirmation < accepted.length) {
      const index = nextConfirmation++;
      const { response, acceptedAt } = accepted[index];
      confirmed[index] = await receipt(ws, response, acceptedAt, metrics);
    }
  }));
  for (const { response } of accepted) {
    const events = ws.receiptEvents?.get(response.clientMessageId) ?? [];
    const terminalEvents = events.filter((event) =>
      event.requestId == null && ["completed", "failed", "cancelled", "uncertain"].includes(event.status),
    );
    metrics.terminalReceiptFrames += terminalEvents.length;
    metrics.duplicateTerminalFrames += Math.max(0, terminalEvents.length - 1);
    // A late send reply can legitimately repeat the terminal state already
    // broadcast (send.rs reads the current receipt at reply time). Count those
    // repeated frames, but do not equate them with a second provider execution.
    const states = new Set(events.filter((event) => ["completed", "failed", "cancelled", "uncertain"].includes(event.status))
      .map((event) => JSON.stringify([event.status, event.turnId])));
    metrics.conflictingTerminalStates += Math.max(0, states.size - 1);
    // A successful receiptStatus may race ahead of the uncorrelated broadcast.
    // This is an early observation gap, not evidence of missing durable data.
    if (!terminalEvents.length) metrics.terminalFramesNotObservedAtMeasurement += 1;
  }
  const cursors = new Map();
  for (const response of confirmed) {
    if (response.status === "uncertain") metrics.uncertain += 1;
    if (["failed", "cancelled"].includes(response.status)) metrics.failedReceipts += 1;
    const historyResponse = await history(ws, response.threadId, undefined, metrics);
    if (historyResponse.historyCursor) cursors.set(response.threadId, historyResponse.historyCursor);
    if (historyResponse.historyCursor) await history(ws, response.threadId, historyResponse.historyCursor, metrics);
  }
  return { ids, cursors, sends: accepted.length };
}

async function runScenario(count, shape, budgetMs, globalState) {
  const metrics = {
    admission: [], confirmation: [], ping: [], recovery: [], uncertain: 0,
    confirmationTimeouts: 0, terminalReceiptFrames: 0, duplicateTerminalFrames: 0,
    terminalFramesNotObservedAtMeasurement: 0, conflictingTerminalStates: 0, failedReceipts: 0, rssBytes: [],
  };
  const turnsPerChat = shape === "long" ? longTurns : 1;
  const plannedSends = count * turnsPerChat;
  const scenarioQuota = Math.max(plannedSends, Math.floor(maxReceipts / (chats.length * historyShape.length)));
  const targetBatches = Math.max(1, Math.ceil(scenarioQuota / plannedSends));
  const targetBatchMs = budgetMs / targetBatches;
  let scenarioSends = 0;
  const scenarioStarted = performance.now();
  let ws = await connect();
  const rssAtStart = await sampleServerRssBytes();
  if (rssAtStart != null) metrics.rssBytes.push(rssAtStart);
  const cursors = new Map();
  let iteration = 0;
  let cycles = 0;
  while (
    performance.now() - scenarioStarted < budgetMs
    && globalState.sends + plannedSends <= maxReceipts
    && scenarioSends + plannedSends <= scenarioQuota
  ) {
    await ping(ws, metrics);
    const result = await runWorkload(ws, count, shape, metrics, iteration);
    globalState.sends += result.sends;
    scenarioSends += result.sends;
    for (const [threadId, cursor] of result.cursors) cursors.set(threadId, cursor);
    iteration += 1;
    if (iteration === 1 || iteration % Math.max(1, Math.floor(targetBatches / 8)) === 0) {
      const rss = await sampleServerRssBytes();
      if (rss != null) metrics.rssBytes.push(rss);
    }
    if (cycles < reconnectCycles) {
      cycles += 1;
      ws.close();
      ws = await connect();
      const restartStarted = performance.now();
      for (const [threadId, cursor] of cursors) {
        await history(ws, threadId, cursor, metrics);
      }
      metrics.recovery.push(performance.now() - restartStarted);
    }
    const targetElapsed = iteration * targetBatchMs;
    const batchPause = targetElapsed - (performance.now() - scenarioStarted);
    if (batchPause > 0) await new Promise((resolve) => setTimeout(resolve, batchPause));
  }
  const rssAtEnd = await sampleServerRssBytes();
  if (rssAtEnd != null) metrics.rssBytes.push(rssAtEnd);
  const historyCounts = [];
  for (let index = 0; index < count; index++) {
    const threadId = `bench-thread-${count}-${shape}-${index}`;
    const snapshot = await history(ws, threadId, undefined, metrics);
    const users = snapshot.events.filter((event) => event.kind === "user");
    const texts = snapshot.events.filter((event) => event.kind === "text");
    const expected = iteration * turnsPerChat;
    const uniqueMessages = new Set(users.map((event) => event.meta?.messageId)).size;
    if (users.length !== expected || texts.length !== expected || uniqueMessages !== expected) {
      throw new Error(`history count mismatch ${threadId}: expected=${expected} user=${users.length} text=${texts.length} uniqueMessages=${uniqueMessages}`);
    }
    historyCounts.push({ threadId, expected, users: users.length, texts: texts.length, uniqueMessages });
  }
  ws.close();
  return {
    chats: count,
    history: shape,
    iterations: iteration,
    reconnectCycles: cycles,
    budgetMs: Number(budgetMs.toFixed(3)),
    scenarioQuota,
    targetBatchMs: Number(targetBatchMs.toFixed(3)),
    durationMs: Number((performance.now() - scenarioStarted).toFixed(3)),
    historyCounts,
    metrics: {
      admission: summarize(metrics.admission),
      confirmation: summarize(metrics.confirmation),
      ping: summarize(metrics.ping),
      recovery: summarize(metrics.recovery),
      uncertainReceipts: metrics.uncertain,
      confirmationTimeouts: metrics.confirmationTimeouts,
      terminalReceiptFrames: metrics.terminalReceiptFrames,
      duplicateTerminalFrames: metrics.duplicateTerminalFrames,
      conflictingTerminalStates: metrics.conflictingTerminalStates,
      failedReceipts: metrics.failedReceipts,
      terminalFramesNotObservedAtMeasurement: metrics.terminalFramesNotObservedAtMeasurement,
      rssBytes: summarizeRss(metrics.rssBytes),
      receiptsSent: scenarioSends,
      providerTimeMs: null,
      atelierTimeMs: summarize(metrics.confirmation),
    },
  };
}

const startedAt = new Date().toISOString();
const scenarios = [];
const globalState = { sends: 0 };
const scenarioCount = chats.length * historyShape.length;
const benchStarted = performance.now();
const benchDeadline = performance.now() + durationMs;
let failure = null;
try {
  for (const count of chats) {
    for (const shape of historyShape) {
      const remainingScenarios = scenarioCount - scenarios.length;
      const remainingMs = Math.max(0, benchDeadline - performance.now());
      const budgetMs = remainingScenarios > 0 ? Math.floor(remainingMs / remainingScenarios) : 0;
      if (budgetMs <= 0 || globalState.sends >= maxReceipts) break;
      scenarios.push(await runScenario(count, shape, budgetMs, globalState));
    }
    if (performance.now() >= benchDeadline || globalState.sends >= maxReceipts) break;
  }
} catch (error) {
  for (const socket of liveSockets) socket.close();
  failure = {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    scenariosCompleted: scenarios.length,
  };
}
if (!failure && terminalStateConflicts.length) {
  failure = { name: "TerminalStateConflict", message: "Conflicting terminal receipt identities observed", scenariosCompleted: scenarios.length };
}
const report = {
  schemaVersion: 1,
  kind: "chat-recovery-benchmark",
  startedAt,
  finishedAt: new Date().toISOString(),
  url: reportUrl(),
  appDir: process.env.ATELIER_APP_DIR || null,
  profile: process.env.ATELIER_PROFILE || "external-server-profile",
  durationMs,
  actualDurationMs: Number((performance.now() - benchStarted).toFixed(3)),
  maxReceipts,
  receiptsSent: globalState.sends,
  ok: failure === null,
  failure,
  protocolErrors,
  terminalStateConflicts,
  pacingMs,
  longFixture: { turnsPerChat: longTurns, promptChars: longPromptChars },
  provider: "fake",
  providerTime: "unavailable from WS contract; no external provider cost claimed",
  scenarios,
};
await mkdir(output.substring(0, output.lastIndexOf("/") || "."), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failure) process.exitCode = 1;
