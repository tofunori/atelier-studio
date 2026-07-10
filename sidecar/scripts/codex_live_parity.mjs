// Smoke LIVE Codex (plan 025, Step 10) — parle à `codex app-server` directement
// (via le provider, plus un client JSON-RPC brut pour lire les notifications).
// JAMAIS dans `npm run verify` : dépend d'un compte Codex, de coûts et d'outils
// locaux. Usage :
//   npm --prefix sidecar run test:codex-live              # cas de base
//   npm --prefix sidecar run test:codex-live -- --dry-run # liste les checks, zéro réseau
// Familles additionnelles opt-in : un flag env par famille (ATELIER_CODEX_LIVE_*=1),
// voir FAMILIES ci-dessous. danger-full-access n'est exercé par une famille que
// sous son flag dédié, jamais par défaut.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import * as codex from "../providers/codex.mjs";
import { resolveBin } from "../bin_resolver.mjs";

const GLOBAL_TIMEOUT_MS = Number(process.env.ATELIER_CODEX_LIVE_GLOBAL_TIMEOUT_MS ?? 20 * 60 * 1000);

const BASE_CASES = [
  { name: "command", description: "commande shell simple, sortie visible dans tool_update et texte" },
  { name: "readonly", description: "sandbox read-only explicite : tentative d'écriture, aucun fichier créé" },
  { name: "image-input", description: "image locale en entrée, tour sans erreur" },
  { name: "interrupt", description: "timeout provider → done interrompu" },
  { name: "steer", description: "steering provider pendant un tour puis interruption" },
  { name: "heartbeat", description: "heartbeats émis pendant une commande lente" },
  { name: "goal", description: "set/get/clear goal via provider + notifications goal" },
];

// Une famille = un flag env opt-in (style existant ATELIER_CODEX_LIVE_WEB/MCP).
const FAMILIES = [
  { flag: "ATELIER_CODEX_LIVE_WEB", checks: ["web-search"],
    description: "recherche web native (existant)" },
  { flag: "ATELIER_CODEX_LIVE_MCP", checks: ["mcp-context7"],
    description: "outil MCP context7 (existant)" },
  { flag: "ATELIER_CODEX_LIVE_TURNID", checks: ["turn-id-native"],
    description: "clientUserMessageId accepté par turn/start + turnId natif dans la réponse ET les notifications + états finaux (item/completed, turn/completed)" },
  { flag: "ATELIER_CODEX_LIVE_WORKSPACE", checks: ["workspace-write-containment"],
    description: "politique resolveCodexSafety(acceptEdits) → workspace-write : écrit dans la racine, rien hors racine" },
  { flag: "ATELIER_CODEX_LIVE_READONLY", checks: ["readonly-policy"],
    description: "politique resolveCodexSafety(plan) → read-only : tour d'écriture, aucun fichier créé, aucun fileChange" },
  { flag: "ATELIER_CODEX_LIVE_FULL_ACCESS", checks: ["full-access-explicit"],
    description: "politique resolveCodexSafety(bypassPermissions) → danger-full-access EXPLICITE (jamais par défaut) : écriture hors racine possible" },
  { flag: "ATELIER_CODEX_LIVE_STEER_NATIVE", checks: ["steer-expected-turn"],
    description: "turn/steer conserve le turn natif : expectedTurnId périmé rejeté, courant accepté, aucun nouveau turn" },
  { flag: "ATELIER_CODEX_LIVE_INTERRUPT_NATIVE", checks: ["interrupt-clean"],
    description: "turn/interrupt propre : turn/completed avec status interrupted, un seul terminal" },
  { flag: "ATELIER_CODEX_LIVE_EXERCISE", checks: ["exercise-command", "exercise-patch", "exercise-goal", "exercise-heartbeat-long"],
    description: "exerce commande, apply_patch, goal (si disponible) et heartbeat long, avec états finaux vérifiés" },
];
const familyEnabled = (flag) => process.env[flag] === "1";

if (process.argv.includes("--dry-run") || process.argv.includes("--help")) {
  console.error("[codex-live] --dry-run : liste des checks, aucun réseau, aucun process codex lancé");
  console.log(JSON.stringify({
    dryRun: true,
    script: "sidecar/scripts/codex_live_parity.mjs",
    usage: "npm --prefix sidecar run test:codex-live [-- --dry-run] ; familles opt-in via FLAG=1",
    note: "smoke LIVE (compte Codex, coûts) — jamais dans npm run verify",
    globalTimeoutMs: GLOBAL_TIMEOUT_MS,
    baseCases: BASE_CASES,
    families: FAMILIES.map((f) => ({ ...f, enabled: familyEnabled(f.flag) })),
  }, null, 2));
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), "atelier-codex-live-"));
// Témoin hors racine ET hors $TMPDIR : le sandbox workspace-write de Codex rend
// $TMPDIR//tmp écrivables, un témoin sous tmpdir() ne prouverait donc rien.
const escapeRoot = join(homedir(), `.atelier-codex-live-escape-${Date.now()}`);
const failures = [];
const results = [];

function buildChecks() {
  const checks = {};
  for (const r of results) {
    checks[r.name] = {
      ok: r.ok,
      ...(r.skipped ? { skipped: true } : {}),
      ...(r.detail !== undefined ? { detail: r.detail } : {}),
      ...(r.summary ? { detail: { done: r.summary.done, errors: r.summary.errors?.length ?? 0, heartbeats: r.summary.heartbeats } } : {}),
      ...(r.error ? { error: String(r.error).slice(0, 400) } : {}),
    };
  }
  return checks;
}

function printSummary() {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    failures,
    checks: buildChecks(),
    results,
  }, null, 2));
}

// Timeout global : le smoke ne doit jamais rester suspendu (comptes/réseau).
const globalTimer = setTimeout(() => {
  console.error(`[codex-live] timeout global après ${GLOBAL_TIMEOUT_MS}ms — arrêt`);
  failures.push("global-timeout");
  try { codex.stopServer(); } catch {}
  try { rawClientRef?.close(); } catch {}
  printSummary();
  process.exit(1);
}, GLOBAL_TIMEOUT_MS);

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

// ---------------------------------------------------------------------------
// Client JSON-RPC brut vers `codex app-server` (familles opt-in) : permet de
// vérifier les NOTIFICATIONS réelles (turn/started, item/completed,
// turn/completed…) que le provider ne réémet que sous forme d'événements
// Atelier. Le journal canonique du sidecar n'est pas impliqué ici.
// ---------------------------------------------------------------------------
function startRawAppServer() {
  const bin = resolveBin("codex") ?? "codex";
  const proc = spawn(bin, codex.buildCodexAppServerArgs(), {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  const pending = new Map(); // id -> { resolve, reject, timer }
  const notifications = []; // { method, params } (+ marqueurs client:<method> répondus)
  const waiters = []; // { predicate, resolve, reject, timer }
  const sandboxByThread = new Map(); // threadId -> sandbox (même règle que le provider)
  let nextId = 1;
  let dead = null;
  const notifThreadId = (msg) => msg.params?.threadId ?? msg.params?.thread?.id ?? null;
  const requestThreadId = (msg) => msg.params?.threadId ?? msg.params?.conversationId ?? null;
  const fail = (err) => {
    dead = err;
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(err); }
    pending.clear();
    for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.reject(err); }
  };
  proc.on("error", (e) => fail(e));
  proc.on("exit", () => fail(new Error("codex app-server (client brut) a quitté")));
  proc.stderr.on("data", () => {});
  const rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && msg.method) {
      // Requête serveur→client : MÊME politique sûre que le provider —
      // approbation seulement pour un thread danger-full-access, sinon refus
      // structuré (buildApprovalResponse/buildServerRequestFallback importés).
      const full = sandboxByThread.get(requestThreadId(msg)) === "danger-full-access";
      const approval = codex.buildApprovalResponse(msg.method, full, msg.params ?? {});
      const result = Object.keys(approval).length ? approval : codex.buildServerRequestFallback(msg.method);
      notifications.push({ method: `client:${msg.method}`, params: msg.params ?? {}, answered: result });
      try { proc.stdin.write(JSON.stringify({ id: msg.id, result }) + "\n"); } catch {}
      return;
    }
    if (msg.id != null) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message ?? "erreur app-server"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      notifications.push({ method: msg.method, params: msg.params ?? {} });
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.predicate(msg)) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(msg);
        }
      }
    }
  });
  const request = (method, params, timeoutMs = 60000) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC ${method} sans réponse après ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  const waitFor = (predicate, timeoutMs = 180000, label = "notification") => {
    const seen = notifications.find(predicate);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      if (dead) return reject(dead);
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`${label} non reçue après ${timeoutMs}ms`));
      }, timeoutMs);
      waiters.push({ predicate, resolve, reject, timer });
    });
  };
  return {
    request,
    waitFor,
    notifications,
    notify: (method, params) => {
      try { proc.stdin.write(JSON.stringify({ method, ...(params ? { params } : {}) }) + "\n"); } catch {}
    },
    setThreadSandbox: (threadId, sandbox) => sandboxByThread.set(threadId, sandbox ?? "danger-full-access"),
    notificationsFor: (threadId) => notifications.filter((n) => notifThreadId(n) === threadId),
    close: () => { try { if (!proc.killed) proc.kill("SIGTERM"); } catch {} },
  };
}

let rawClientRef = null;
let rawClientPromise = null;
function ensureRawClient() {
  if (!rawClientPromise) {
    rawClientPromise = (async () => {
      const client = startRawAppServer();
      rawClientRef = client;
      await client.request("initialize", {
        clientInfo: { name: "atelier-studio", title: "Atelier Studio", version: "0.1.0" },
        capabilities: null,
      });
      client.notify("initialized");
      return client;
    })();
  }
  return rawClientPromise;
}

/** Options RPC réelles depuis buildThreadOptions du provider (cohérence prod) ;
 * les hints internes sont retirés exactement comme openThread() le fait. */
function rpcThreadOptions(permissionMode) {
  const { effortHint, collaborationModeHint, safetyDiagnosticHint, ...opts } =
    codex.buildThreadOptions({ cwd: root, permissionMode });
  return opts;
}

async function startRawThread(client, permissionMode) {
  const opts = rpcThreadOptions(permissionMode);
  const resp = await client.request("thread/start", opts);
  const threadId = resp?.thread?.id;
  if (!threadId) throw new Error("thread/start sans id");
  client.setThreadSandbox(threadId, opts.sandbox);
  return { threadId, opts };
}

async function startRawTurn(client, threadId, opts, prompt, extra = {}) {
  const resp = await client.request("turn/start", {
    threadId,
    input: codex.buildCodexInput({ prompt }),
    approvalPolicy: opts.approvalPolicy ?? "never",
    ...extra,
  });
  return resp?.turn?.id ?? null;
}

const isThread = (threadId) => (m) => (m.params?.threadId ?? m.params?.thread?.id) === threadId;
const waitTurnStarted = (client, threadId, timeoutMs = 20000) =>
  client.waitFor((m) => m.method === "turn/started" && isThread(threadId)(m), timeoutMs, "turn/started");
const waitTurnCompleted = (client, threadId, timeoutMs = 180000) =>
  client.waitFor((m) => m.method === "turn/completed" && isThread(threadId)(m), timeoutMs, "turn/completed");
const finalStates = (client, threadId) => {
  const notes = client.notificationsFor(threadId);
  return {
    itemCompletedTypes: notes.filter((m) => m.method === "item/completed").map((m) => m.params?.item?.type ?? "?"),
    turnCompletedCount: notes.filter((m) => m.method === "turn/completed").length,
    serverRequests: notes.filter((m) => m.method.startsWith("client:")).map((m) => m.method),
  };
};

/** Un check brut échoue en ok:false + détail — jamais en throw non capturé. */
async function runRawCheck(name, fn) {
  console.error(`[codex-live] ${name}: start`);
  try {
    const { ok, skipped = false, ...detail } = await fn();
    console.error(`[codex-live] ${name}: ${skipped ? "skipped" : ok ? "ok" : "failed"}`);
    results.push({ name, ok: Boolean(ok), ...(skipped ? { skipped: true } : {}), detail });
    if (!ok) failures.push(name);
  } catch (e) {
    console.error(`[codex-live] ${name}: error`);
    results.push({ name, ok: false, error: String(e?.stack ?? e) });
    failures.push(name);
  }
}

// ---------------------------------------------------------------------------
// Cas de base (toujours exécutés, comportement historique du smoke)
// ---------------------------------------------------------------------------
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

if (familyEnabled("ATELIER_CODEX_LIVE_WEB")) {
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

if (familyEnabled("ATELIER_CODEX_LIVE_MCP")) {
  await runCase("mcp-context7", {
    sandbox: "danger-full-access",
    prompt: "Use the context7 MCP tool to resolve the library id for React. Reply with the library id you found. This is an MCP plumbing test; do not use shell commands.",
  }, ({ summary }) => summary.done?.ok === true &&
    summary.toolUpdates.some((tool) => tool.source === "mcp" && tool.name.includes("context7")) &&
    summary.text.includes("/reactjs/react.dev"));
}

// ---------------------------------------------------------------------------
// Familles opt-in Step 10 (client brut : notifications app-server réelles)
// ---------------------------------------------------------------------------
if (familyEnabled("ATELIER_CODEX_LIVE_TURNID")) {
  await runRawCheck("turn-id-native", async () => {
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "plan"); // read-only : aucun accès disque requis
    const clientUserMessageId = `atelier-live-cmid-${Date.now()}`;
    const turnId = await startRawTurn(client, threadId, opts, "Reply with only: turnid-ok", { clientUserMessageId });
    const completed = await waitTurnCompleted(client, threadId);
    const notes = client.notificationsFor(threadId);
    const startedTurnId = notes.find((m) => m.method === "turn/started")?.params?.turn?.id ?? null;
    const states = finalStates(client, threadId);
    const finalStatus = completed?.params?.turn?.status ?? null;
    return {
      ok: Boolean(turnId) && startedTurnId === turnId &&
        (completed?.params?.turn?.id ?? null) === turnId &&
        finalStatus === "completed" && states.itemCompletedTypes.length > 0,
      clientUserMessageId,
      turnId,
      startedTurnId,
      finalStatus,
      userMessageItemId: notes.map((m) => m.params?.item).find((it) => it?.type === "userMessage")?.id ?? null,
      ...states,
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_WORKSPACE")) {
  await runRawCheck("workspace-write-containment", async () => {
    mkdirSync(escapeRoot, { recursive: true });
    const insidePath = join(root, "workspace-inside.txt");
    const escapePath = join(escapeRoot, "workspace-escape.txt");
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "acceptEdits"); // → workspace-write via resolveCodexSafety
    const turnId = await startRawTurn(client, threadId, opts,
      "Run exactly these two shell commands, one after the other, then report each outcome in one short line:\n" +
      `1. printf inside > ${insidePath}\n` +
      `2. printf escaped > ${escapePath}\n` +
      "If a command is blocked or fails, just report it. Do not retry another way, do not ask questions.");
    const completed = await waitTurnCompleted(client, threadId);
    return {
      ok: Boolean(turnId) && existsSync(insidePath) && !existsSync(escapePath),
      sandbox: opts.sandbox,
      insideCreated: existsSync(insidePath),
      escapeCreated: existsSync(escapePath),
      finalStatus: completed?.params?.turn?.status ?? null,
      ...finalStates(client, threadId),
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_READONLY")) {
  await runRawCheck("readonly-policy", async () => {
    const target = join(root, "readonly-policy-blocked.txt");
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "plan"); // → read-only via resolveCodexSafety
    const turnId = await startRawTurn(client, threadId, opts,
      `Run exactly this shell command and report its outcome in one short line: printf no-write > ${target}\n` +
      "If it is blocked or fails, just report it. Do not retry another way, do not ask for permission.");
    const completed = await waitTurnCompleted(client, threadId);
    const states = finalStates(client, threadId);
    return {
      ok: Boolean(turnId) && !existsSync(target) && !states.itemCompletedTypes.includes("fileChange"),
      sandbox: opts.sandbox,
      targetCreated: existsSync(target),
      finalStatus: completed?.params?.turn?.status ?? null,
      ...states,
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_FULL_ACCESS")) {
  await runRawCheck("full-access-explicit", async () => {
    mkdirSync(escapeRoot, { recursive: true });
    const target = join(escapeRoot, "full-access.txt");
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "bypassPermissions"); // seul chemin vers danger-full-access
    const turnId = await startRawTurn(client, threadId, opts,
      `Run exactly this shell command, then reply with only the file content: printf full-access-ok > ${target} && cat ${target}`);
    const completed = await waitTurnCompleted(client, threadId);
    const content = existsSync(target) ? readFileSync(target, "utf8") : null;
    return {
      ok: Boolean(turnId) && content === "full-access-ok" &&
        (completed?.params?.turn?.status ?? null) === "completed",
      sandbox: opts.sandbox,
      escapeWriteContent: content,
      finalStatus: completed?.params?.turn?.status ?? null,
      ...finalStates(client, threadId),
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_STEER_NATIVE")) {
  await runRawCheck("steer-expected-turn", async () => {
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "acceptEdits");
    const turnId = await startRawTurn(client, threadId, opts,
      "Run exactly this shell command: sleep 20 && printf steer-native-not-finished. Do not do anything else.");
    if (!turnId) return { ok: false, reason: "turn/start sans turn.id" };
    await waitTurnStarted(client, threadId);
    const steerInput = codex.buildCodexInput({ prompt: "Steering smoke-test: acknowledge this steering message, then stop as soon as possible." });
    let staleRejected = false;
    try {
      await client.request("turn/steer", { threadId, input: steerInput, expectedTurnId: `${turnId}-stale` });
    } catch { staleRejected = true; }
    let steerAccepted = false;
    try {
      await client.request("turn/steer", { threadId, input: steerInput, expectedTurnId: turnId });
      steerAccepted = true;
    } catch {}
    try { await client.request("turn/interrupt", { threadId, turnId }); } catch {}
    const completed = await waitTurnCompleted(client, threadId, 60000);
    const startedCount = client.notificationsFor(threadId).filter((m) => m.method === "turn/started").length;
    const finalStatus = completed?.params?.turn?.status ?? null;
    return {
      ok: staleRejected && steerAccepted && startedCount === 1 &&
        (finalStatus === "interrupted" || finalStatus === "completed"),
      staleRejected,
      steerAccepted,
      startedCount,
      finalStatus,
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_INTERRUPT_NATIVE")) {
  await runRawCheck("interrupt-clean", async () => {
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "acceptEdits");
    const turnId = await startRawTurn(client, threadId, opts,
      "Run exactly this shell command: sleep 30 && printf interrupt-not-finished. Do not do anything else.");
    if (!turnId) return { ok: false, reason: "turn/start sans turn.id" };
    await waitTurnStarted(client, threadId);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // laisser la commande démarrer
    await client.request("turn/interrupt", { threadId, turnId });
    const completed = await waitTurnCompleted(client, threadId, 60000);
    await new Promise((resolve) => setTimeout(resolve, 500)); // fenêtre pour détecter un double terminal
    const states = finalStates(client, threadId);
    const finalStatus = completed?.params?.turn?.status ?? null;
    return {
      ok: finalStatus === "interrupted" && states.turnCompletedCount === 1,
      finalStatus,
      ...states,
    };
  });
}

if (familyEnabled("ATELIER_CODEX_LIVE_EXERCISE")) {
  await runRawCheck("exercise-command", async () => {
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "acceptEdits");
    const turnId = await startRawTurn(client, threadId, opts,
      "Run exactly this shell command: printf atelier-exercise-command-ok. Then reply with only the command output.");
    const completed = await waitTurnCompleted(client, threadId);
    const commands = client.notificationsFor(threadId)
      .filter((m) => m.method === "item/completed" && m.params?.item?.type === "commandExecution")
      .map((m) => ({
        exitCode: m.params.item.exitCode ?? null,
        output: String(m.params.item.aggregatedOutput ?? "").slice(0, 200),
      }));
    return {
      ok: Boolean(turnId) && (completed?.params?.turn?.status ?? null) === "completed" &&
        commands.some((c) => c.exitCode === 0 && c.output.includes("atelier-exercise-command-ok")),
      commands,
      finalStatus: completed?.params?.turn?.status ?? null,
      ...finalStates(client, threadId),
    };
  });

  await runRawCheck("exercise-patch", async () => {
    const target = join(root, "exercise-patched.txt");
    const client = await ensureRawClient();
    const { threadId, opts } = await startRawThread(client, "acceptEdits");
    const turnId = await startRawTurn(client, threadId, opts,
      `Use apply_patch (not shell redirection) to create a new file at ${target} containing exactly one line: atelier-patch-ok\n` +
      "Then reply with only: done.");
    const completed = await waitTurnCompleted(client, threadId);
    const fileChanges = client.notificationsFor(threadId)
      .filter((m) => m.method === "item/completed" && m.params?.item?.type === "fileChange")
      .map((m) => ({
        status: m.params.item.status ?? null,
        paths: (m.params.item.changes ?? []).map((c) => c.path),
      }));
    const content = existsSync(target) ? readFileSync(target, "utf8") : null;
    return {
      ok: Boolean(turnId) && (completed?.params?.turn?.status ?? null) === "completed" &&
        content !== null && content.includes("atelier-patch-ok") &&
        fileChanges.some((f) => f.status === "completed"),
      fileChanges,
      contentOk: content?.includes("atelier-patch-ok") ?? false,
      finalStatus: completed?.params?.turn?.status ?? null,
      ...finalStates(client, threadId),
    };
  });

  await runRawCheck("exercise-goal", async () => {
    const client = await ensureRawClient();
    const { threadId } = await startRawThread(client, "plan"); // goals : lecture seule suffit
    const objective = `atelier-exercise-goal-${Date.now()}`;
    let set;
    try {
      set = await client.request("thread/goal/set", { threadId, objective });
    } catch (e) {
      const msg = String(e?.message ?? e).toLowerCase();
      if (msg.includes("not found") || msg.includes("unknown method") || msg.includes("unsupported")) {
        return { ok: true, skipped: true, reason: `goals indisponibles : ${String(e?.message ?? e).slice(0, 200)}` };
      }
      throw e;
    }
    const got = await client.request("thread/goal/get", { threadId });
    await client.request("thread/goal/clear", { threadId });
    const goalNotifications = client.notificationsFor(threadId)
      .filter((m) => m.method.startsWith("thread/goal/")).map((m) => m.method);
    return {
      ok: (got?.goal?.objective ?? set?.goal?.objective ?? null) === objective,
      objectiveEcho: got?.goal?.objective ?? null,
      goalNotifications,
    };
  });

  // Le heartbeat est un événement construit par le provider (pas une
  // notification app-server) : ce sous-check passe donc par codex.run, avec la
  // politique dérivée de resolveCodexSafety (jamais full access par défaut).
  await runCase("exercise-heartbeat-long", {
    sandbox: codex.resolveCodexSafety("acceptEdits").sandbox,
    timeoutMs: 60000,
    prompt: "Run exactly this shell command: sleep 12 && printf atelier-exercise-heartbeat-ok. Then reply with only the command output.",
  }, ({ summary }) => summary.done?.ok === true && summary.heartbeats >= 2 && summary.text.includes("atelier-exercise-heartbeat-ok"));
}

try {
  codex.stopServer();
  try { rawClientRef?.close(); } catch {}
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(escapeRoot, { recursive: true, force: true });
}

clearTimeout(globalTimer);
printSummary();

if (failures.length) process.exit(1);
