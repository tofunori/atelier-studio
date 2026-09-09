#!/usr/bin/env node
/**
 * Two-phase crash fixture.  Run `accept`, kill only the fixture server, start
 * the same server with the same ATELIER_APP_DIR, then run `reconcile`.
 * Nothing in this helper removes APP_DIR, so the receipt/journal profile is
 * exactly the one used before the crash.
 */

import { readFile, writeFile } from "node:fs/promises";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const [key, inline] = token.slice(2).split("=", 2);
  args.set(key, inline ?? process.argv[i + 1] ?? "");
  if (inline == null) i += 1;
}

const phase = args.get("phase") || "accept";
const url = args.get("url") || process.env.ATELIER_BENCH_WS || "ws://127.0.0.1:8765";
const statePath = args.get("state") || "/tmp/atelier-chat-recovery-fixture.json";
const clientMessageId = args.get("client-message-id") || "chat-recovery-crash-fixture-1";
const threadId = args.get("thread-id") || "chat-recovery-crash-thread";
const token = process.env.ATELIER_TOKEN;

function connect() {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (token) target.searchParams.set("token", token);
    // Node's built-in WebSocket accepts protocols as its second argument, not
    // fetch options. The runtime's WS auth contract is query-token based.
    const ws = new WebSocket(target.toString());
    const queue = [];
    const waiters = [];
    const deliver = (message) => {
      for (let i = 0; i < waiters.length; i += 1) {
        if (!waiters[i].predicate(message)) continue;
        const waiter = waiters.splice(i, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
      if (message.type !== "event") {
        queue.push(message);
        if (queue.length > 256) queue.splice(0, queue.length - 256);
      }
    };
    ws.addEventListener("message", (event) => {
      try { deliver(JSON.parse(String(event.data))); } catch { /* ignore */ }
    });
    ws.addEventListener("error", () => reject(new Error("WebSocket error")));
    ws.addEventListener("open", () => {
      ws.waitFor = (predicate, timeoutMs = 10_000) => {
        const index = queue.findIndex(predicate);
        if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
        return new Promise((resolveWaiter, rejectWaiter) => {
          const waiter = { predicate, resolve: resolveWaiter, reject: rejectWaiter, timer: null };
          waiter.timer = setTimeout(() => rejectWaiter(new Error("fixture timeout")), timeoutMs);
          waiters.push(waiter);
        });
      };
      ws.send(JSON.stringify({ type: "clientHello", clientInstanceId: "chat-recovery-fixture" }));
      resolve(ws);
    });
  });
}

async function request(ws, payload, predicate) {
  const pending = ws.waitFor(predicate);
  ws.send(JSON.stringify(payload));
  return pending;
}

const ws = await connect();
if (phase === "accept") {
  const accepted = await request(
    ws,
    {
      type: "send",
      threadId,
      projectRoot: "",
      provider: "fake",
      prompt: "durable crash fixture",
      clientMessageId,
    },
    (message) => message.type === "sendReceipt" && message.clientMessageId === clientMessageId,
  );
  await writeFile(statePath, `${JSON.stringify({ clientMessageId, threadId, accepted }, null, 2)}\n`);
  console.log(JSON.stringify({ phase, statePath, accepted }, null, 2));
} else if (phase === "reconcile") {
  const fixture = JSON.parse(await readFile(statePath, "utf8"));
  const statusRequestId = `restart-status-${fixture.clientMessageId}`;
  const status = await request(
    ws,
    { type: "receiptStatus", clientMessageId: fixture.clientMessageId, requestId: statusRequestId },
    (message) => message.type === "sendReceipt"
      && message.clientMessageId === fixture.clientMessageId
      && message.requestId === statusRequestId,
  );
  await request(
    ws,
    {
      type: "send",
      threadId: fixture.threadId,
      projectRoot: "",
      provider: "fake",
      prompt: "durable crash fixture",
      clientMessageId: fixture.clientMessageId,
    },
    (message) => message.type === "sendReceipt" && message.clientMessageId === fixture.clientMessageId,
  );
  const retryStatusRequestId = `restart-retry-status-${fixture.clientMessageId}`;
  const retry = await request(
    ws,
    { type: "receiptStatus", clientMessageId: fixture.clientMessageId, requestId: retryStatusRequestId },
    (message) => message.type === "sendReceipt"
      && message.clientMessageId === fixture.clientMessageId
      && message.requestId === retryStatusRequestId,
  );
  const historyRequestId = `restart-history-${fixture.threadId}`;
  const history = await request(
    ws,
    { type: "getHistory", threadId: fixture.threadId, requestId: historyRequestId },
    (message) => message.type === "history"
      && message.threadId === fixture.threadId
      && message.requestId === historyRequestId,
  );
  const result = {
    phase,
    clientMessageId: fixture.clientMessageId,
    statusAfterRestart: status.status,
    retryStatus: retry.status,
    retryReplayedProvider: ["received", "started"].includes(retry.status),
    userEvents: (history.events ?? []).filter((event) => event.kind === "user").length,
    textEvents: (history.events ?? []).filter((event) => event.kind === "text").length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.retryReplayedProvider) process.exitCode = 2;
} else {
  throw new Error(`unknown phase: ${phase}`);
}
ws.close();
