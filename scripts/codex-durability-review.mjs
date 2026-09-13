#!/usr/bin/env node
/** Independent WS/restart fixture. Uses a fresh profile and only the fake provider.
 * Stops only children it spawns; keeps the profile and report for inspection.
 * Usage: node scripts/codex-durability-review.mjs --server /absolute/server
 *        [--endurance-ms 600000]
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const executable = args.get("--server");
assert(executable && isAbsolute(executable), "--server must be an explicit absolute binary path");
const enduranceMs = Number(args.get("--endurance-ms") ?? 0);
assert(Number.isFinite(enduranceMs) && enduranceMs >= 0, "invalid endurance duration");
const profile = await mkdtemp(join(tmpdir(), "atelier-durability-review-"));
const token = randomUUID();
const report = { server: executable, profile, startedAt: new Date().toISOString(), checks: {} };
let server;
let socket;
let benchmark;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    report.interrupted = signal;
    socket?.close();
    benchmark?.kill("SIGTERM");
    server?.kill("SIGTERM");
  });
}

async function startServer() {
  assert(!report.interrupted, "fixture interrupted");
  const child = spawn(executable, [], {
    env: { ...process.env, ATELIER_APP_DIR: profile, ATELIER_TOKEN: token,
      ATELIER_SKIP_SINGLE_INSTANCE: "1", ATELIER_WRITE_LOCK: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server = child;
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-16000); });
  return await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("server startup timed out")), 20000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited at startup (${code}): ${stderr}`));
    });
    child.stdout.on("data", (data) => {
      output += data;
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      try {
        const health = JSON.parse(output.slice(0, newline));
        assert(health.ok && Number.isInteger(health.port), "invalid startup health");
        clearTimeout(timer);
        resolve(`ws://127.0.0.1:${health.port}`);
      } catch (error) { clearTimeout(timer); reject(error); }
    });
  });
}

async function stopServer(signal = "SIGTERM") {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("fixture child did not stop within five seconds"));
    }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill(signal);
  });
}

async function connect(url) {
  assert(!report.interrupted, "fixture interrupted");
  const target = new URL(url);
  target.searchParams.set("token", token);
  const ws = new WebSocket(target);
  const inbox = [];
  const waiters = new Set();
  let protocolError;
  ws.addEventListener("message", ({ data }) => {
    let message;
    try { message = JSON.parse(String(data)); } catch (error) {
      protocolError = error;
      ws.close();
      return;
    }
    for (const waiter of waiters) {
      if (!waiter.predicate(message)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    if (message.type !== "event") {
      inbox.push(message);
      if (inbox.length > 256) inbox.shift();
    }
  });
  ws.waitFor = (predicate) => {
    if (protocolError) return Promise.reject(protocolError);
    if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("WS is not open"));
    const index = inbox.findIndex(predicate);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error("WS fixture response timed out"));
      }, 15000);
      waiters.add(waiter);
    });
  };
  ws.addEventListener("close", () => {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("WS closed while awaiting response"));
    }
    waiters.clear();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("WS open timed out")); }, 15000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", (error) => { clearTimeout(timer); reject(error); }, { once: true });
    ws.addEventListener("close", () => { clearTimeout(timer); reject(new Error("WS closed before open")); }, { once: true });
  });
  ws.send(JSON.stringify({ type: "clientHello", clientInstanceId: "durability-review" }));
  return ws;
}

async function request(payload, predicate) {
  assert(!report.interrupted, "fixture interrupted");
  const pending = socket.waitFor(predicate);
  socket.send(JSON.stringify(payload));
  return pending;
}
async function history(threadId) {
  const requestId = randomUUID();
  return request({ type: "getHistory", threadId, requestId },
    (m) => m.type === "history" && m.requestId === requestId);
}
async function receipt(clientMessageId) {
  const requestId = randomUUID();
  return request({ type: "receiptStatus", clientMessageId, requestId },
    (m) => m.type === "sendReceipt" && m.requestId === requestId);
}
async function completed(clientMessageId) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await receipt(clientMessageId);
    if (result.status === "completed") return result;
    assert(["received", "started"].includes(result.status), JSON.stringify(result));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("fake turn never completed");
}
const digest = (value) => createHash("sha256").update(value).digest("hex");

try {
  let url = await startServer();
  socket = await connect(url);
  const threadId = "durability-large-unicode";
  const clientMessageId = "durability-once";
  const prompt = "Début scientifique — αβγ 🧊\n" + "Observation été : Δalbédo = −0.125 🧊\n".repeat(18000) + "FIN EXACTE";
  assert(Buffer.byteLength(prompt) > 512 * 1024);
  const send = { type: "send", provider: "fake", projectRoot: "", threadId, clientMessageId, prompt };
  await request(send, (m) => m.type === "sendReceipt" && m.clientMessageId === clientMessageId);
  await completed(clientMessageId);
  const before = await history(threadId);
  assert.equal(before.events.filter((e) => e.kind === "user").length, 1);
  assert.equal(before.events.find((e) => e.kind === "user").text, prompt);
  report.checks.largePayloadBeforeRestart = { bytes: Buffer.byteLength(prompt), sha256: digest(prompt) };
  socket.close();
  await stopServer("SIGKILL");
  url = await startServer();
  socket = await connect(url);
  const after = await history(threadId);
  assert.equal(after.events.find((e) => e.kind === "user")?.text, prompt);
  assert.equal(after.events.filter((e) => e.kind === "text").length, 1);
  report.checks.largePayloadAfterProcessKill = true;
  const status = await receipt(clientMessageId);
  assert.equal(status.status, "completed");
  const retry = await request(send, (m) => m.type === "sendReceipt" && m.clientMessageId === clientMessageId);
  assert.equal(retry.status, "completed");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await history(threadId)).events, after.events);
  report.checks.duplicateSendDidNotReplay = true;
  await request({ type: "forkThread", fromThreadId: threadId, newThreadId: "durability-fork" },
    (m) => m.type === "threads" && m.threads?.some((thread) => thread.id === "durability-fork"));
  const fork = await history("durability-fork");
  assert.equal(fork.events.find((e) => e.kind === "user")?.text, prompt);
  report.checks.forkRetainsLargePayload = true;
  const journalPath = join(profile, "harness-history", `${digest(threadId)}.jsonl`);
  const lines = (await readFile(journalPath, "utf8")).trim().split("\n").map(JSON.parse);
  const reference = lines.find((line) => line.payloadRef);
  assert(reference, "large event must use a bounded payload reference");
  assert.match(reference.payloadRef.sha256, /^[a-f0-9]{64}$/);
  const payloadPath = join(profile, "harness-history", "payloads", `${reference.payloadRef.sha256}.json`);
  const original = await readFile(payloadPath);
  const damaged = Buffer.from(original);
  const contentOffset = damaged.indexOf(Buffer.from("scientifique"));
  assert(contentOffset >= 0);
  damaged[contentOffset] = "x".charCodeAt(0);
  JSON.parse(damaged.toString("utf8")); // valid JSON of identical size: only integrity changed
  try {
    await writeFile(payloadPath, damaged);
    const corrupt = await history(threadId);
    assert(corrupt.events.some((event) => event.storageFault), "corrupt payload must be explicit");
    assert(!corrupt.events.some((event) => event.kind === "user" && event.text === prompt));
    report.checks.sameLengthCorruptionDetected = true;
  } finally { await writeFile(payloadPath, original); }
  await rename(payloadPath, `${payloadPath}.review-hidden`);
  try {
    const missing = await history(threadId);
    assert(missing.events.some((event) => event.storageFault), "missing payload must be explicit");
    report.checks.missingPayloadDetected = true;
  } finally { await rename(`${payloadPath}.review-hidden`, payloadPath); }
  assert.deepEqual((await history(threadId)).events, after.events);
  const inFlightSend = { type: "send", provider: "fake", projectRoot: "", threadId: "durability-in-flight",
    clientMessageId: "durability-in-flight-once", prompt: "Interrupt only the fixture process after admission." };
  const admitted = await request(inFlightSend,
    (m) => m.type === "sendReceipt" && m.clientMessageId === inFlightSend.clientMessageId);
  assert(["received", "started"].includes(admitted.status));
  await stopServer("SIGKILL");
  socket.close();
  url = await startServer();
  socket = await connect(url);
  const interruptedReceipt = await receipt(inFlightSend.clientMessageId);
  assert.equal(interruptedReceipt.status, "uncertain", "fixture must hit the in-flight window, not a completed turn");
  const interruptedHistory = await history(inFlightSend.threadId);
  const interruptedRetry = await request(inFlightSend,
    (m) => m.type === "sendReceipt" && m.clientMessageId === inFlightSend.clientMessageId);
  assert.equal(interruptedRetry.status, "uncertain");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await history(inFlightSend.threadId)).events, interruptedHistory.events);
  report.checks.inFlightCrashUncertainAndNotReplayed = true;
  const blockedThread = "durability-unwritable-journal";
  const blockedMessage = "durability-unwritable-once";
  const blockedJournal = join(profile, "harness-history", `${digest(blockedThread)}.jsonl`);
  // A directory at this fresh test thread's exact journal path reliably denies
  // file appends even when tests run with elevated filesystem privileges.
  await mkdir(blockedJournal);
  try {
    const visibleFault = socket.waitFor((message) => message.type === "event"
      && message.event?.storageFault && message.event?.meta?.threadId === blockedThread);
    await request({ type: "send", provider: "fake", projectRoot: "", threadId: blockedThread,
      clientMessageId: blockedMessage, prompt: "Must fail before provider execution." },
    (message) => message.type === "sendReceipt" && message.clientMessageId === blockedMessage);
    const fault = await visibleFault;
    assert.equal(fault.event.meta.durable, false);
    assert.equal((await receipt(blockedMessage)).status, "failed");
    assert.equal((await history(blockedThread)).events.length, 0);
    report.checks.appendFailureVisibleAndNotAcknowledgedAsSuccess = true;
  } finally { await rmdir(blockedJournal); }
  const readBurst = await Promise.all(Array.from({ length: 64 }, (_, index) => {
    const requestId = `admission-probe-${index}`;
    return request({ type: "receiptStatus", clientMessageId, requestId }, (m) => m.requestId === requestId);
  }));
  assert(readBurst.every((response) => response.type === "sendReceipt" || response.code === "REQUEST_BUSY"));
  const busy = readBurst.filter((response) => response.code === "REQUEST_BUSY").length;
  assert(busy > 0, "read burst must exercise explicit admission backpressure");
  assert(readBurst.some((response) => response.type === "sendReceipt" && response.status === "completed"));
  const recoveredRead = await receipt(clientMessageId);
  assert.equal(recoveredRead.status, "completed");
  assert.equal(recoveredRead.threadId, threadId);
  report.checks.readAdmissionBackpressure = { requests: 64, explicitlyBusy: busy };
  if (enduranceMs > 0) {
    const output = join(profile, "endurance.json");
    console.log(JSON.stringify({ phase: "endurance", profile, durationMs: enduranceMs }));
    benchmark = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "chat-recovery-bench.mjs"),
      "--url", url, "--output", output, "--duration-ms", String(enduranceMs), "--max-receipts", "7200"], {
      env: { ...process.env, ATELIER_TOKEN: token, ATELIER_APP_DIR: profile }, stdio: "inherit",
    });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        benchmark.kill("SIGKILL");
        reject(new Error("endurance exceeded duration plus 60 seconds"));
      }, enduranceMs + 60000);
      benchmark.once("exit", (code) => { clearTimeout(timer); resolve(code); });
      benchmark.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    assert.equal(code, 0, "endurance benchmark failed");
    const endurance = JSON.parse(await readFile(output, "utf8"));
    assert.equal(endurance.ok, true);
    assert.deepEqual(endurance.terminalStateConflicts, []);
    assert.equal(endurance.scenarios.length, 6, "all chat/history scenarios must run");
    assert(endurance.actualDurationMs >= enduranceMs, "benchmark ended before requested duration");
    assert(endurance.receiptsSent > 0);
    for (const scenario of endurance.scenarios) {
      assert(scenario.metrics.receiptsSent > 0 && scenario.reconnectCycles > 0);
      for (const key of ["confirmationTimeouts", "conflictingTerminalStates", "failedReceipts", "uncertainReceipts"]) {
        assert.equal(scenario.metrics[key], 0, `unexpected ${key} in ${scenario.chats}/${scenario.history}`);
      }
    }
    report.checks.endurance = { durationMs: enduranceMs, actualDurationMs: endurance.actualDurationMs,
      receiptsSent: endurance.receiptsSent, scenarios: endurance.scenarios.length,
      terminalFramesNotObservedAtMeasurement: endurance.scenarios.reduce((sum, scenario) =>
        sum + scenario.metrics.terminalFramesNotObservedAtMeasurement, 0), output };
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  socket?.close();
  if (benchmark && benchmark.exitCode === null && benchmark.signalCode === null) {
    await new Promise((resolve) => { benchmark.once("exit", resolve); benchmark.kill("SIGKILL"); });
  }
  try { await stopServer(); } catch (error) { report.cleanupError = String(error); process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const reportPath = join(profile, "review.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}
