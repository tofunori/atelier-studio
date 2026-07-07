// Provider Codex via `codex app-server` (JSON-RPC stdio, JSONL).
// Remplace l'ancien pont SDK (`codex exec`) : threads persistants côté serveur,
// steering natif possible plus tard, et surtout accès aux GOALS
// (thread/goal/set|get|clear + notifications thread/goal/updated).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveBin } from "./../bin_resolver.mjs";
const CODEX_BIN = resolveBin("codex") ?? "codex";
const HEARTBEAT_MS = 5000;
const CODEX_EFFORT_ALIASES = new Map([
  // Codex app-server accepts arbitrary strings at the protocol level, but the
  // backend rejects `minimal` when tool families like web_search/image_gen are
  // available. Codex App does not need this broken state exposed here.
  ["minimal", "low"],
]);

export function normalizeCodexEffort(effort) {
  const value = String(effort ?? "").trim();
  if (!value) return null;
  return CODEX_EFFORT_ALIASES.get(value) ?? value;
}

export function buildCodexAppServerArgs() {
  return ["app-server"];
}

export function buildApprovalResponse(method, fullAccess, params = {}) {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: fullAccess ? "approved" : "denied" };
  }
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    return { decision: fullAccess ? "accept" : "decline" };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      permissions: fullAccess
        ? {
            ...(params.permissions?.network ? { network: params.permissions.network } : {}),
            ...(params.permissions?.fileSystem ? { fileSystem: params.permissions.fileSystem } : {}),
          }
        : {},
      scope: "turn",
      strictAutoReview: !fullAccess,
    };
  }
  return {};
}

export function buildServerRequestFallback(method) {
  if (method === "item/tool/call") {
    return { contentItems: [{ type: "inputText", text: "Unsupported client-side dynamic tool in Atelier." }], success: false };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline", content: null, _meta: null };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Client JSON-RPC (une instance app-server partagée par tout le sidecar)
// ---------------------------------------------------------------------------
let server = null; // { proc, request(method, params), nextId }
const pendingRpc = new Map(); // id -> { resolve, reject }
const threadHandlers = new Map(); // codexThreadId -> (method, params) => void
const threadOwners = new Map(); // codexThreadId -> atelier threadId
const loadedThreads = new Set(); // codexThreadIds déjà démarrés/répris dans CE serveur
const threadSandbox = new Map(); // codexThreadId -> sandbox du thread
let goalEmitter = null; // (atelierThreadId|null, event) => void

/** index.mjs enregistre ici le broadcast des événements goal hors-tour. */
export function onGoal(cb) {
  goalEmitter = cb;
}

function resetServerState(err) {
  const e = err ?? new Error("codex app-server terminé");
  for (const { reject } of pendingRpc.values()) reject(e);
  pendingRpc.clear();
  loadedThreads.clear();
  threadSandbox.clear();
  server = null;
  // tours en cours : les terminer proprement, sinon le thread reste "running"
  // et la file d'attente du router n'est jamais dépilée
  for (const handler of [...threadHandlers.values()]) {
    try {
      handler("turn/completed", { turn: { status: "failed", error: { message: String(e.message ?? e) } } });
    } catch {}
  }
  threadHandlers.clear();
}

// réponses automatiques aux demandes serveur : la politique d'approbation est
// "never" et la sécurité vient du sandbox — on approuve donc ce qui passe.
function answerServerRequest(msg) {
  const m = msg.method ?? "";
  if (m === "execCommandApproval" || m === "applyPatchApproval" ||
      m === "item/commandExecution/requestApproval" ||
      m === "item/fileChange/requestApproval" ||
      m === "item/permissions/requestApproval") {
    // n'approuver que les threads full-access ; un thread read-only (reviewer)
    // ne doit pas pouvoir escalader hors sandbox
    const tid = msg.params?.threadId ?? msg.params?.conversationId ?? null;
    const full = tid ? threadSandbox.get(tid) === "danger-full-access" : false;
    return buildApprovalResponse(m, full, msg.params ?? {});
  }
  return buildServerRequestFallback(m); // réponse structurée si le protocole en fournit une
}

function requestThreadId(msg) {
  return msg.params?.threadId ?? msg.params?.conversationId ?? null;
}

function notifyServerRequest(msg, result) {
  const tid = requestThreadId(msg);
  if (!tid) return;
  try {
    threadHandlers.get(tid)?.("atelier/serverRequest/resolved", {
      method: msg.method ?? "",
      params: msg.params ?? {},
      result,
    });
  } catch {}
}

function dispatchNotification(msg) {
  const params = msg.params ?? {};
  const codexThreadId = params.threadId ?? params.thread?.id ?? null;
  // goals : relayés aussi hors-tour (le front suit l'objectif en continu)
  if (msg.method === "thread/goal/updated" || msg.method === "thread/goal/cleared") {
    const ev = {
      kind: "goal",
      cleared: msg.method === "thread/goal/cleared",
      goal: params.goal ?? null,
    };
    const owner = codexThreadId ? threadOwners.get(codexThreadId) : null;
    goalEmitter?.(owner ?? null, ev);
  }
  if (!codexThreadId) return;
  threadHandlers.get(codexThreadId)?.(msg.method, params);
}

async function ensureServer() {
  if (server) return server;
  const proc = spawn(CODEX_BIN, buildCodexAppServerArgs(), {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  proc.on("exit", () => resetServerState(new Error("codex app-server a quitté")));
  proc.on("error", (e) => resetServerState(e));
  proc.stderr.on("data", () => {}); // logs serveur ignorés (bruyants)
  const rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && msg.method) {
      // requête serveur → client (approbations)
      const result = answerServerRequest(msg);
      notifyServerRequest(msg, result);
      proc.stdin.write(JSON.stringify({ id: msg.id, result }) + "\n");
      return;
    }
    if (msg.id != null) {
      const p = pendingRpc.get(msg.id);
      if (!p) return;
      pendingRpc.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "erreur app-server"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) dispatchNotification(msg);
  });
  let nextId = 1;
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pendingRpc.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  server = { proc, request };
  await request("initialize", {
    clientInfo: { name: "atelier-studio", title: "Atelier Studio", version: "0.1.0" },
    capabilities: null,
  });
  proc.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  return server;
}

export function stopServer() {
  const proc = server?.proc;
  if (proc && !proc.killed) {
    try { proc.kill("SIGTERM"); } catch {}
  }
  resetServerState(new Error("codex app-server arrêté"));
}

// ---------------------------------------------------------------------------
// Helpers d'entrée / options (testés)
// ---------------------------------------------------------------------------
export function buildCodexInput({ prompt, inputs, imagePath, attachments }) {
  const text = (t) => ({ type: "text", text: String(t ?? ""), text_elements: [] });
  const image = (path) => ({ type: "localImage", path: String(path) });
  if (Array.isArray(inputs) && inputs.length > 0) {
    const clean = inputs
      .map((input) => {
        if (input?.type === "text") return text(input.text);
        if ((input?.type === "local_image" || input?.type === "localImage") && input.path) {
          return image(input.path);
        }
        return null;
      })
      .filter(Boolean);
    return clean.length ? clean : [text(prompt)];
  }
  const imagePaths = new Set();
  if (imagePath) imagePaths.add(String(imagePath));
  for (const a of attachments ?? []) {
    const path = a?.path ?? a?.imagePath;
    if (path) imagePaths.add(String(path));
  }
  return [text(prompt), ...[...imagePaths].map(image)];
}

export function buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox }) {
  const config = {};
  let actualModel = model ?? null;
  const actualEffort = normalizeCodexEffort(effort);
  if (webSearch) config.web_search = webSearch === "cached" ? "cached" : "live";
  if (Array.isArray(additionalDirectories) && additionalDirectories.length) {
    config.sandbox_workspace_write = { writable_roots: additionalDirectories.map(String) };
  }
  return {
    cwd: cwd ?? null,
    model: actualModel,
    approvalPolicy: "never",
    sandbox: sandbox ?? "danger-full-access",
    ...(Object.keys(config).length ? { config } : {}),
    ...(actualEffort ? { effortHint: actualEffort } : {}), // retiré avant l'appel RPC (turn/start)
  };
}

async function openThread(srv, { sessionId, threadOpts, reuseLoaded = false }) {
  const { effortHint, ...opts } = threadOpts;
  let id;
  if (sessionId) {
    if (reuseLoaded && loadedThreads.has(sessionId)) return sessionId;
    // thread/resume sur un thread déjà chargé = rejoin : on ré-applique ainsi
    // les options du tour (sandbox, web_search, writable_roots)
    const resp = await srv.request("thread/resume", { threadId: sessionId, ...opts });
    id = resp?.thread?.id ?? sessionId;
  } else {
    const resp = await srv.request("thread/start", opts);
    id = resp?.thread?.id;
    if (!id) throw new Error("thread/start sans id");
  }
  loadedThreads.add(id);
  threadSandbox.set(id, opts.sandbox ?? "danger-full-access");
  return id;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
async function goalRequest(method, { sessionId, cwd, ...rest }) {
  if (!sessionId) throw new Error("goal : session Codex absente — envoie d'abord un message");
  const srv = await ensureServer();
  const codexId = await openThread(srv, {
    sessionId,
    threadOpts: buildThreadOptions({ cwd, sandbox: "read-only" }),
    reuseLoaded: true, // ne pas écraser les options d'un thread déjà actif
  });
  const resp = await srv.request(method, { threadId: codexId, ...rest });
  if (method === "thread/goal/clear") {
    const owner = threadOwners.get(codexId);
    goalEmitter?.(owner ?? null, { kind: "goal", cleared: true, goal: null });
  }
  return resp?.goal ?? null;
}

export function setGoal({ sessionId, cwd, objective, status, tokenBudget }) {
  return goalRequest("thread/goal/set", {
    sessionId, cwd,
    ...(objective != null ? { objective } : {}),
    ...(status != null ? { status } : {}),
    ...(tokenBudget != null ? { tokenBudget } : {}),
  });
}

export function getGoal({ sessionId, cwd }) {
  return goalRequest("thread/goal/get", { sessionId, cwd });
}

/** Compaction native du contexte (thread/compact/start). */
export async function compactThread({ sessionId, cwd }) {
  if (!sessionId) throw new Error("compact : session Codex absente");
  const srv = await ensureServer();
  const codexId = await openThread(srv, {
    sessionId,
    threadOpts: buildThreadOptions({ cwd, sandbox: "read-only" }),
    reuseLoaded: true,
  });
  await srv.request("thread/compact/start", { threadId: codexId });
}

export async function clearGoal({ sessionId, cwd }) {
  await goalRequest("thread/goal/clear", { sessionId, cwd });
  return null;
}

// ---------------------------------------------------------------------------
// Tour d'agent
// ---------------------------------------------------------------------------
const activeTurns = new Map(); // atelier threadId -> { codexId, turnId }

/** Steering natif : injecte un message dans le TOUR EN COURS (turn/steer).
 * Retourne false s'il n'y a pas de tour actif ou si le tour vient de finir
 * (expectedTurnId périmé) — l'appelant repasse alors par la file d'attente. */
export async function steer({ threadId, prompt, inputs, imagePath, attachments }) {
  const t = activeTurns.get(threadId);
  if (!t?.turnId || !server) return false;
  try {
    await server.request("turn/steer", {
      threadId: t.codexId,
      input: buildCodexInput({ prompt, inputs, imagePath, attachments }),
      expectedTurnId: t.turnId,
    });
    return true;
  } catch {
    return false; // tour terminé entre-temps → l'appelant met en file
  }
}

export async function interrupt(threadId) {
  const t = activeTurns.get(threadId);
  if (!t?.turnId || !server) return;
  try {
    await server.request("turn/interrupt", { threadId: t.codexId, turnId: t.turnId });
  } catch {}
}

/** Dernier token_count du rollout : secours si thread/tokenUsage/updated manque. */
function lastTokenCount(sessionId) {
  try {
    const base = join(homedir(), ".codex", "sessions");
    let file = null;
    const walk = (d, depth) => {
      if (file || depth > 4) return;
      for (const e of readdirSync(d).sort().reverse()) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, depth + 1);
        else if (e.includes(sessionId) && e.endsWith(".jsonl")) { file = p; return; }
      }
    };
    if (!existsSync(base)) return null;
    walk(base, 0);
    if (!file) return null;
    const lines = readFileSync(file, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const p = JSON.parse(lines[i]).payload;
        if (p?.type === "token_count" && p.info) {
          return {
            context: p.info.last_token_usage?.total_tokens ?? null,
            window: p.info.model_context_window ?? null,
            output: p.info.total_token_usage?.output_tokens ?? null,
          };
        }
      } catch {}
    }
  } catch {}
  return null;
}

export async function run({
  threadId,
  cwd,
  prompt,
  inputs,
  imagePath,
  attachments,
  sessionId,
  model,
  effort,
  webSearch,
  additionalDirectories,
  sandbox,
  timeoutMs,
  onEvent,
}) {
  const srv = await ensureServer();
  const threadOpts = buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox });
  const actualEffort = normalizeCodexEffort(effort);
  const codexId = await openThread(srv, { sessionId, threadOpts });
  if (threadId) threadOwners.set(codexId, threadId);

  const activityId = `codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  // affichage SOBRE : une seule ligne par commande, un seul état de réflexion
  let lastTool = "";
  let activity = {
    kind: "activity",
    id: activityId,
    phase: "thinking",
    title: "Thinking",
    detail: "Preparing the next step",
    status: "running",
    steps: [],
  };
  const emitActivity = (patch = {}) => {
    activity = { ...activity, ...patch, steps: patch.steps ?? activity.steps };
    const steps = activity.steps.map(({ key, ...step }) => step);
    onEvent({ ...activity, steps });
  };
  const upsertStep = ({ key, title, detail, phase = "tool", status = "running" }) => {
    const existing = activity.steps.findIndex((step) => step.key === key);
    const step = { key, title, detail, phase, status, ts: Date.now() };
    const steps = existing >= 0
      ? activity.steps.map((item, idx) => (idx === existing ? { ...item, ...step } : item))
      : [...activity.steps, step].slice(-8);
    emitActivity({ title, detail, phase, status: status === "failed" ? "failed" : "running", steps });
  };
  const emitTool = (name) => {
    if (name === lastTool) return;
    lastTool = name;
    onEvent({ kind: "tool", name });
  };
  const commandName = (item) => {
    const cmd = String(item.command ?? "commande").replace(/\s+/g, " ").trim();
    return cmd.length > 64 ? cmd.slice(0, 64) + "…" : cmd;
  };
  const commandMeta = new Map(); // itemId -> dernier état connu pour les deltas
  const commandOutputs = new Map(); // itemId -> sortie agrégée construite depuis outputDelta
  const commandDetail = (item) => {
    const bits = [];
    if (item.cwd) bits.push(String(item.cwd));
    if (item.source && item.source !== "agent") bits.push(String(item.source));
    return bits.join(" · ");
  };
  const commandInput = (item) => ({
    command: item.command ?? "",
    cwd: item.cwd ?? null,
    source: item.source ?? null,
    commandActions: item.commandActions ?? [],
  });
  const emitCommandUpdate = (item, patch = {}) => {
    const id = item.id ?? patch.itemId ?? `cmd:${commandName(item)}`;
    const output = patch.output ?? item.aggregatedOutput ?? commandOutputs.get(id) ?? "";
    onEvent({
      kind: "tool_update",
      id,
      name: commandName(item),
      output: String(output ?? ""),
      status: patch.status ?? item.status,
      exitCode: patch.exitCode ?? item.exitCode ?? undefined,
      detail: commandDetail(item),
      input: commandInput(item),
      source: item.source ?? null,
    });
  };
  const fileChangeMeta = new Map(); // itemId -> dernier patch reçu
  const mcpMeta = new Map(); // itemId -> dernier état MCP connu
  const dynamicToolMeta = new Map(); // itemId -> dernier état dynamicToolCall connu
  const fileChangePaths = (changes) => (changes ?? []).map((ch) => ch.path).filter(Boolean);
  const fileChangeDetail = (changes) => {
    const files = fileChangePaths(changes).map((p) => String(p).split("/").pop()).filter(Boolean);
    return files.length ? files.slice(0, 3).join(", ") : "Files changed";
  };
  const fileChangeDiff = (changes) => (changes ?? [])
    .map((ch) => {
      const path = ch?.path ? `# ${ch.path}` : "# file";
      return `${path}\n${String(ch?.diff ?? "")}`;
    })
    .join("\n\n")
    .trim();
  const emitFileChangeUpdate = (item, patch = {}) => {
    const id = item.id ?? patch.itemId ?? "fileChange";
    const changes = patch.changes ?? item.changes ?? [];
    onEvent({
      kind: "tool_update",
      id,
      name: "apply_patch",
      output: fileChangeDiff(changes),
      status: patch.status ?? item.status ?? "inProgress",
      detail: fileChangeDetail(changes),
      input: { changes },
      source: "codex",
    });
  };
  const mcpName = (item) => [item.server, item.tool].filter(Boolean).join("/") || String(item.tool ?? "mcp");
  const mcpOutput = (item, message) => {
    if (message) return String(message);
    if (item.error) return JSON.stringify(item.error, null, 2);
    if (item.result) return JSON.stringify(item.result, null, 2);
    return "";
  };
  const emitMcpUpdate = (item, patch = {}) => {
    const id = item.id ?? patch.itemId ?? `mcp:${mcpName(item)}`;
    onEvent({
      kind: "tool_update",
      id,
      name: mcpName(item),
      output: mcpOutput(item, patch.message),
      status: patch.status ?? item.status,
      detail: patch.message ? String(patch.message) : mcpName(item),
      input: item.arguments ?? null,
      source: "mcp",
    });
  };
  const jsonText = (value) => {
    if (value == null || value === "") return "";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };
  const dynamicToolName = (item) => [item.namespace, item.tool].filter(Boolean).join("/") || String(item.tool ?? "dynamicTool");
  const dynamicToolOutput = (item) => {
    const content = item.contentItems ?? [];
    if (!content.length) return "";
    return content.map((entry) => {
      if (entry?.type === "inputText") return String(entry.text ?? "");
      if (entry?.type === "inputImage") return String(entry.imageUrl ?? "");
      return jsonText(entry);
    }).filter(Boolean).join("\n");
  };
  const emitDynamicToolUpdate = (item, patch = {}) => {
    const id = item.id ?? patch.itemId ?? `dynamic:${dynamicToolName(item)}`;
    const status = patch.status ?? item.status;
    onEvent({
      kind: "tool_update",
      id,
      name: dynamicToolName(item),
      output: patch.output ?? dynamicToolOutput(item),
      status,
      detail: item.success === false ? "failed" : dynamicToolName(item),
      input: item.arguments ?? null,
      source: "dynamic",
    });
  };
  const collabToolName = (item) => `agent:${String(item.tool ?? "collab")}`;
  const emitCollabToolUpdate = (item) => {
    onEvent({
      kind: "tool_update",
      id: item.id ?? collabToolName(item),
      name: collabToolName(item),
      output: jsonText({
        receiverThreadIds: item.receiverThreadIds ?? [],
        agentsStates: item.agentsStates ?? {},
      }),
      status: item.status,
      detail: item.model ? `${item.model}${item.reasoningEffort ? ` · ${item.reasoningEffort}` : ""}` : undefined,
      input: { prompt: item.prompt, model: item.model, reasoningEffort: item.reasoningEffort },
      source: "codex",
    });
  };
  const approvalDecision = (result) => String(result?.decision ?? "");
  const approvalAccepted = (result) => {
    const decision = approvalDecision(result);
    return decision === "accept" || decision === "acceptForSession" ||
      decision === "approved" || decision === "approved_for_session" ||
      Boolean(result?.permissions && Object.keys(result.permissions).length > 0);
  };
  const serverRequestName = (method, params) => {
    if (method === "execCommandApproval") return (params.command ?? []).join(" ") || "command approval";
    if (method === "item/commandExecution/requestApproval") return params.command || "command approval";
    if (method === "applyPatchApproval" || method === "item/fileChange/requestApproval") return "apply_patch";
    if (method === "item/permissions/requestApproval") return "permission_request";
    if (method === "item/tool/call") return [params.namespace, params.tool].filter(Boolean).join("/") || "dynamic_tool";
    if (method === "item/tool/requestUserInput") return "request_user_input";
    if (method === "mcpServer/elicitation/request") return `mcp_elicitation:${params.serverName ?? "mcp"}`;
    return method || "server_request";
  };
  const emitServerRequestUpdate = ({ method, params, result }) => {
    const accepted = approvalAccepted(result);
    const status = accepted ? "accepted" : "declined";
    const id = params.itemId ?? params.approvalId ?? params.callId ?? `${method}:${Date.now()}`;
    const name = serverRequestName(method, params);
    const reason = params.reason ?? params.message ?? "";
    const decision = approvalDecision(result) || result?.action || (result?.success === false ? "unsupported" : status);
    onEvent({
      kind: "tool_update",
      id,
      name,
      output: [decision, reason].filter(Boolean).join("\n"),
      status,
      detail: reason || decision,
      input: params,
      source: "approval",
    });
    upsertStep({
      key: `approval:${id}`,
      title: accepted ? "Permission accepted" : "Permission declined",
      detail: name,
      phase: "tool",
      status: accepted ? "completed" : "failed",
    });
  };

  let usage = null; // via thread/tokenUsage/updated
  let streamText = "";
  let doneEmitted = false;
  let finished; // resolve du tour
  const done = new Promise((resolve) => { finished = resolve; });

  const handler = (method, params) => {
    switch (method) {
      case "turn/started": {
        activeTurns.set(threadId ?? codexId, { codexId, turnId: params.turn?.id ?? null });
        onEvent({ kind: "started" });
        emitActivity();
        break;
      }
      case "item/started": {
        const item = params.item ?? {};
        if (item.type === "commandExecution") {
          commandMeta.set(item.id, item);
          commandOutputs.set(item.id, String(item.aggregatedOutput ?? ""));
          upsertStep({
            key: `cmd:${item.id ?? commandName(item)}`,
            title: "Running command",
            detail: commandName(item),
            phase: "command",
            status: "running",
          });
          emitTool(commandName(item));
        }
        if (item.type === "reasoning") {
          emitActivity({ phase: "thinking", title: "Thinking", detail: "Planning the next action", status: "running" });
          emitTool("__thinking");
        }
        if (item.type === "webSearch") {
          upsertStep({
            key: `search:${String(item.query ?? "")}`,
            title: "Searching web",
            detail: String(item.query ?? "").slice(0, 80),
            phase: "search",
            status: "running",
          });
          emitTool(`recherche web : ${String(item.query ?? "").slice(0, 50)}`);
        }
        if (item.type === "fileChange") {
          fileChangeMeta.set(item.id, item);
          upsertStep({
            key: `edits:${item.id ?? "patch"}`,
            title: "Applying edits",
            detail: fileChangeDetail(item.changes),
            phase: "edit",
            status: "running",
          });
          emitFileChangeUpdate(item);
        }
        if (item.type === "mcpToolCall") {
          mcpMeta.set(item.id, item);
          upsertStep({
            key: `mcp:${item.id ?? mcpName(item)}`,
            title: "Using tool",
            detail: mcpName(item),
            phase: "tool",
            status: "running",
          });
          emitTool(`outil ${mcpName(item)}`);
          emitMcpUpdate(item, { status: item.status ?? "inProgress" });
        }
        if (item.type === "dynamicToolCall") {
          dynamicToolMeta.set(item.id, item);
          upsertStep({
            key: `dynamic:${item.id ?? dynamicToolName(item)}`,
            title: "Using tool",
            detail: dynamicToolName(item),
            phase: "tool",
            status: "running",
          });
          emitTool(`outil ${dynamicToolName(item)}`);
          emitDynamicToolUpdate(item, { status: item.status ?? "inProgress" });
        }
        if (item.type === "collabAgentToolCall") {
          upsertStep({
            key: `collab:${item.id ?? collabToolName(item)}`,
            title: "Using agent tool",
            detail: collabToolName(item),
            phase: "tool",
            status: "running",
          });
          emitTool(collabToolName(item));
          emitCollabToolUpdate(item);
        }
        if (item.type === "imageGeneration") {
          upsertStep({
            key: `image:${item.id ?? "image"}`,
            title: "Generating image",
            detail: item.savedPath ?? item.status ?? "image",
            phase: "tool",
            status: item.status === "failed" ? "failed" : "running",
          });
          emitTool("image_generation");
        }
        if (item.type === "sleep") {
          upsertStep({
            key: `sleep:${item.id ?? "sleep"}`,
            title: "Waiting",
            detail: `${item.durationMs ?? 0} ms`,
            phase: "tool",
            status: "running",
          });
          emitTool("sleep");
        }
        if (item.type === "imageView") {
          upsertStep({
            key: `imageView:${item.id ?? item.path}`,
            title: "Viewing image",
            detail: String(item.path ?? ""),
            phase: "tool",
            status: "completed",
          });
          emitTool(`image ${String(item.path ?? "")}`);
        }
        break;
      }
      case "atelier/serverRequest/resolved": {
        emitServerRequestUpdate(params);
        break;
      }
      case "item/updated": {
        const item = params.item ?? {};
        if (item.type === "commandExecution") {
          commandMeta.set(item.id, { ...(commandMeta.get(item.id) ?? {}), ...item });
          commandOutputs.set(item.id, String(item.aggregatedOutput ?? commandOutputs.get(item.id) ?? ""));
          emitCommandUpdate(commandMeta.get(item.id));
        }
        if (item.type === "dynamicToolCall") {
          dynamicToolMeta.set(item.id, { ...(dynamicToolMeta.get(item.id) ?? {}), ...item });
          emitDynamicToolUpdate(dynamicToolMeta.get(item.id));
        }
        if (item.type === "mcpToolCall") {
          mcpMeta.set(item.id, { ...(mcpMeta.get(item.id) ?? {}), ...item });
          emitMcpUpdate(mcpMeta.get(item.id));
        }
        break;
      }
      case "item/commandExecution/outputDelta": {
        const id = params.itemId;
        const item = commandMeta.get(id);
        if (!item) break;
        const output = (commandOutputs.get(id) ?? "") + String(params.delta ?? "");
        commandOutputs.set(id, output);
        emitCommandUpdate(item, { output, status: item.status ?? "inProgress" });
        break;
      }
      case "item/agentMessage/delta": {
        streamText += String(params.delta ?? "");
        onEvent({ kind: "stream_set", text: streamText });
        break;
      }
      case "item/fileChange/patchUpdated": {
        const id = params.itemId;
        const item = { ...(fileChangeMeta.get(id) ?? {}), id, type: "fileChange", changes: params.changes ?? [] };
        fileChangeMeta.set(id, item);
        upsertStep({
          key: `edits:${id}`,
          title: "Applying edits",
          detail: fileChangeDetail(item.changes),
          phase: "edit",
          status: "running",
        });
        emitFileChangeUpdate(item, { status: "inProgress" });
        break;
      }
      case "item/fileChange/outputDelta": {
        const id = params.itemId;
        onEvent({
          kind: "tool_update",
          id,
          name: "apply_patch",
          output: String(params.delta ?? ""),
          status: "inProgress",
          source: "codex",
        });
        break;
      }
      case "item/mcpToolCall/progress": {
        const id = params.itemId;
        const item = mcpMeta.get(id) ?? { id, tool: "mcp", status: "inProgress", arguments: null };
        emitMcpUpdate(item, { message: params.message ?? "", status: "inProgress" });
        upsertStep({
          key: `mcp:${id}`,
          title: "Using tool",
          detail: String(params.message ?? mcpName(item)),
          phase: "tool",
          status: "running",
        });
        break;
      }
      case "item/completed": {
        const item = params.item ?? {};
        if (item.type === "agentMessage") {
          streamText = "";
          onEvent({ kind: "text", text: item.text ?? "" });
        }
        if (item.type === "reasoning") {
          const text = [...(item.content ?? []), ...(item.summary ?? [])].filter(Boolean).join("\n\n");
          if (text) onEvent({ kind: "thinking", text });
        }
        if (item.type === "commandExecution") {
          commandMeta.set(item.id, { ...(commandMeta.get(item.id) ?? {}), ...item });
          commandOutputs.set(item.id, String(item.aggregatedOutput ?? commandOutputs.get(item.id) ?? ""));
          const status = item.status === "failed" || (item.exitCode != null && item.exitCode !== 0)
            ? "failed" : "completed";
          upsertStep({
            key: `cmd:${item.id ?? commandName(item)}`,
            title: status === "failed" ? "Command failed" : "Command finished",
            detail: commandName(item),
            phase: "command",
            status,
          });
          emitCommandUpdate(commandMeta.get(item.id));
        }
        if (item.type === "fileChange") {
          fileChangeMeta.set(item.id, item);
          const files = (item.changes ?? []).map((ch) => ch.path?.split("/").pop()).filter(Boolean);
          upsertStep({
            key: `edits:${files.join(",")}`,
            title: "Applying edits",
            detail: files.length ? files.slice(0, 3).join(", ") : "Files changed",
            phase: "edit",
            status: "completed",
          });
          emitFileChangeUpdate(item, { status: item.status ?? "completed" });
          const paths = (item.changes ?? []).map((ch) => ch.path).filter(Boolean);
          if (paths.length) onEvent({ kind: "edit", files: paths });
          else emitTool("__edits:");
        }
        if (item.type === "mcpToolCall") {
          mcpMeta.set(item.id, item);
          const status = item.status === "failed" ? "failed" : "completed";
          upsertStep({
            key: `mcp:${item.tool ?? "mcp"}`,
            title: "Using tool",
            detail: String(item.tool ?? "mcp"),
            phase: "tool",
            status,
          });
          emitTool(`outil ${mcpName(item)}`);
          emitMcpUpdate(item, { status: item.status ?? status });
        }
        if (item.type === "dynamicToolCall") {
          dynamicToolMeta.set(item.id, item);
          const status = item.status === "failed" || item.success === false ? "failed" : "completed";
          upsertStep({
            key: `dynamic:${item.id ?? dynamicToolName(item)}`,
            title: status === "failed" ? "Tool failed" : "Tool finished",
            detail: dynamicToolName(item),
            phase: "tool",
            status,
          });
          emitTool(`outil ${dynamicToolName(item)}`);
          emitDynamicToolUpdate(item, { status: item.status ?? status });
        }
        if (item.type === "collabAgentToolCall") {
          const status = item.status === "failed" ? "failed" : "completed";
          upsertStep({
            key: `collab:${item.id ?? collabToolName(item)}`,
            title: status === "failed" ? "Agent tool failed" : "Agent tool finished",
            detail: collabToolName(item),
            phase: "tool",
            status,
          });
          emitCollabToolUpdate(item);
        }
        if (item.type === "imageGeneration") {
          const status = item.status === "failed" ? "failed" : "completed";
          upsertStep({
            key: `image:${item.id ?? "image"}`,
            title: status === "failed" ? "Image failed" : "Image generated",
            detail: item.savedPath ?? item.result ?? item.status ?? "image",
            phase: "tool",
            status,
          });
          onEvent({
            kind: "tool_update",
            id: item.id ?? "imageGeneration",
            name: "image_generation",
            output: item.savedPath ?? item.result ?? "",
            status: item.status,
            detail: item.revisedPrompt ?? undefined,
            input: { revisedPrompt: item.revisedPrompt },
            source: "codex",
          });
        }
        if (item.type === "sleep") {
          upsertStep({
            key: `sleep:${item.id ?? "sleep"}`,
            title: "Wait finished",
            detail: `${item.durationMs ?? 0} ms`,
            phase: "tool",
            status: "completed",
          });
        }
        break;
      }
      case "turn/plan/updated": {
        const items = (params.plan ?? []).map((s) => ({
          text: String(s.step ?? ""),
          completed: s.status === "completed",
        }));
        upsertStep({
          key: "todos",
          title: "Updating plan",
          detail: `${items.filter((t) => t.completed).length}/${items.length} done`,
          phase: "todo",
          status: "running",
        });
        onEvent({ kind: "todos", items });
        break;
      }
      case "thread/tokenUsage/updated": {
        const u = params.tokenUsage ?? {};
        usage = {
          context: u.last?.totalTokens ?? null,
          window: u.modelContextWindow ?? null,
          output: u.total?.outputTokens ?? null,
        };
        break;
      }
      case "error": {
        if (params.willRetry) break;
        emitActivity({ title: "Failed", detail: params.error?.message ?? "Codex error", status: "failed" });
        onEvent({ kind: "error", message: params.error?.message ?? "erreur Codex" });
        break;
      }
      case "turn/completed": {
        const turn = params.turn ?? {};
        if (turn.status === "failed") {
          emitActivity({ title: "Failed", detail: turn.error?.message ?? "Codex failed", status: "failed" });
          onEvent({ kind: "error", message: turn.error?.message ?? "failed" });
          doneEmitted = true; // pas de done ok:true après une erreur (l'event error suffit)
          finished({ ok: false });
          break;
        }
        if (turn.status === "interrupted") {
          onEvent({ kind: "activity", id: activityId, title: "Interrupted", detail: "Stopped by user", status: "failed" });
          doneEmitted = true;
          onEvent({ kind: "done", ok: false, result: "interrompu" });
          finished({ ok: false, doneSent: true });
          break;
        }
        const tc = usage ?? lastTokenCount(codexId);
        emitActivity({
          title: "Finished",
          detail: activity.steps.length ? `${activity.steps.length} actions` : "No tools used",
          status: "completed",
          phase: activity.phase,
        });
        doneEmitted = true;
        onEvent({ kind: "done", ok: true, result: "", usage: {
          context: tc?.context ?? 0,
          window: tc?.window ?? null,
          output: tc?.output ?? 0, cost: null, turns: null } });
        finished({ ok: true, doneSent: true });
        break;
      }
    }
  };

  threadHandlers.set(codexId, handler);
  const timer = timeoutMs
    ? setTimeout(() => { interrupt(threadId ?? codexId).catch(() => {}); }, timeoutMs)
    : null;
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    onEvent({ kind: "heartbeat", elapsedMs: Date.now() - startedAt });
  }, HEARTBEAT_MS);
  try {
    const input = buildCodexInput({ prompt, inputs, imagePath, attachments });
    // la réponse RPC arrive IMMÉDIATEMENT (turn inProgress) : elle donne le
    // turnId (nécessaire à turn/interrupt) ; la vraie fin = turn/completed
    const resp = await srv.request("turn/start", {
      threadId: codexId,
      input,
      ...(threadOpts.model ? { model: threadOpts.model } : {}),
      ...(actualEffort ? { effort: actualEffort } : {}),
      approvalPolicy: "never",
    });
    if (resp?.turn?.id) activeTurns.set(threadId ?? codexId, { codexId, turnId: resp.turn.id });
    await done;
    if (!doneEmitted) {
      const tc = usage ?? lastTokenCount(codexId);
      onEvent({ kind: "done", ok: true, result: "", usage: {
        context: tc?.context ?? 0, window: tc?.window ?? null,
        output: tc?.output ?? 0, cost: null, turns: null } });
    }
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(heartbeat);
    threadHandlers.delete(codexId);
    activeTurns.delete(threadId ?? codexId);
  }
  return { sessionId: codexId };
}

/** Rate limits OpenAI du rollout le plus récent (primary=5h, secondary=hebdo). */
export function rateLimits() {
  try {
    const base = join(homedir(), ".codex", "sessions");
    if (!existsSync(base)) return null;
    let newest = null;
    const walk = (d, depth) => {
      if (depth > 4) return;
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, depth + 1);
        else if (e.endsWith(".jsonl") && (!newest || st.mtimeMs > newest.m)) newest = { p, m: st.mtimeMs };
      }
    };
    walk(base, 0);
    if (!newest) return null;
    const lines = readFileSync(newest.p, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const pl = JSON.parse(lines[i]).payload;
        if (pl?.type === "token_count" && pl.rate_limits) return { ts: newest.m, data: pl.rate_limits };
      } catch {}
    }
  } catch {}
  return null;
}
