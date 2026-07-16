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
import { jsonSafe, sanitizeAndBoundInput } from "./../sanitize.mjs";
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

// Bornes du contrat tool_update (plan 025) — mêmes limites que le provider
// Claude : une sortie d'outil Codex volumineuse ne doit pas être émise ni
// journalisée sans borne, et un input d'outil peut porter des secrets (clé API
// passée à un serveur MCP) → borné et marqué.
export const TOOL_OUTPUT_MAX = 64 * 1024;
export const TOOL_INPUT_MAX = 16 * 1024;

export function boundToolOutput(value) {
  const s = typeof value === "string" ? value : jsonSafe(value);
  if (s.length <= TOOL_OUTPUT_MAX) return { output: s };
  return { output: s.slice(0, TOOL_OUTPUT_MAX), truncated: true, outputLength: s.length };
}

/** État cumulatif borné : la mémoire reste <=64 KiB mais la longueur totale
 * continue d'être comptée pour l'UI et le diagnostic. */
export function appendBoundedToolOutput(previous, value) {
  const chunk = typeof value === "string" ? value : jsonSafe(value);
  const prev = previous ?? { output: "", outputLength: 0, truncated: false };
  const remaining = Math.max(0, TOOL_OUTPUT_MAX - prev.output.length);
  const output = remaining > 0 ? prev.output + chunk.slice(0, remaining) : prev.output;
  const outputLength = (prev.outputLength ?? prev.output.length) + chunk.length;
  return {
    output,
    outputLength,
    truncated: outputLength > output.length,
  };
}

/** Input d'outil borné pour émission/journal : jamais l'objet complet non
 * plafonné (un input MCP peut contenir des secrets). Au-delà de la limite, on
 * ne garde qu'un aperçu tronqué — la valeur intégrale ne quitte pas le provider. */
export function scrubToolInput(input) {
  return sanitizeAndBoundInput(input, TOOL_INPUT_MAX);
}

/** Codex expose la consultation d'image comme un item de transcript dédié.
 * Atelier le normalise en tool_update structuré pour conserver le chemin sans
 * l'injecter dans le libellé visible (et pour partager le rendu providers). */
export function imageViewEvent(item = {}) {
  const path = String(item.path ?? "").trim();
  return {
    kind: "tool_update",
    id: String(item.id ?? `image:${path || "unknown"}`),
    name: "view_image",
    output: "",
    status: "completed",
    input: { paths: path ? [path] : [] },
    source: "codex",
  };
}

// Registre des sessions Codex actives : un codexId (thread app-server) ne peut
// porter qu'UN tour à la fois. Deux threads Atelier qui reprennent la même
// session native (ex. fork avant premier send) ne doivent pas cross-wirer
// leurs événements via un handler partagé (plan 025 : isolation).
const activeCodexRuns = new Map(); // codexId -> atelier threadId propriétaire du run

export function claimCodexRun(codexId, threadId) {
  const owner = activeCodexRuns.get(codexId);
  if (owner && owner !== threadId) {
    throw new Error(`session Codex ${codexId} déjà active pour le thread ${owner} — reprise concurrente refusée`);
  }
  activeCodexRuns.set(codexId, threadId ?? codexId);
}

export function releaseCodexRun(codexId) {
  activeCodexRuns.delete(codexId);
}

/** Réserve une session existante AVANT thread/resume. La fermeture retournée
 * doit vivre jusqu'au finally du run. */
export async function claimAndOpenCodexRun({ sessionId, threadId, open: openNative }) {
  const owner = threadId ?? sessionId ?? "codex-run";
  let claimedId = sessionId ?? null;
  if (claimedId) claimCodexRun(claimedId, owner);
  try {
    const codexId = await openNative();
    if (codexId !== claimedId) {
      claimCodexRun(codexId, owner);
      if (claimedId) releaseCodexRun(claimedId);
      claimedId = codexId;
    }
    let released = false;
    return {
      codexId,
      release() {
        if (released) return;
        released = true;
        if (claimedId) releaseCodexRun(claimedId);
      },
    };
  } catch (error) {
    if (claimedId) releaseCodexRun(claimedId);
    throw error;
  }
}

/**
 * Classe une notification `error` Codex (plan 025 — terminalisation).
 * Une erreur mid-turn ne DOIT PAS terminaliser le turn avant `turn/completed` :
 * elle est surfacée comme diagnostic non-terminal, et `turn/completed` (failed)
 * reste l'unique terminal. `willRetry` → ignorée entièrement.
 */
export function classifyCodexError(params = {}) {
  if (params.willRetry) return { terminal: false, event: null };
  return {
    terminal: false,
    event: {
      kind: "tool_update",
      id: `error:${params.error?.code ?? "codex"}`,
      name: "error",
      status: "failed",
      output: String(params.error?.message ?? "erreur Codex"),
      detail: String(params.error?.message ?? "erreur Codex").slice(0, 120),
      source: "codex",
    },
  };
}

export function buildApprovalResponse(method, fullAccess, params = {}, scope = "once") {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: fullAccess ? (scope === "session" ? "approved_for_session" : "approved") : "denied" };
  }
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    return { decision: fullAccess ? (scope === "session" ? "acceptForSession" : "accept") : "decline" };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      permissions: fullAccess
        ? {
            ...(params.permissions?.network ? { network: params.permissions.network } : {}),
            ...(params.permissions?.fileSystem ? { fileSystem: params.permissions.fileSystem } : {}),
          }
        : {},
      scope: fullAccess && scope === "session" ? "session" : "turn",
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

const APPROVAL_METHODS = new Set([
  "execCommandApproval",
  "applyPatchApproval",
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
]);

/**
 * Traduit une server request Codex en spec d'interaction Atelier (plan 025).
 * Retourne null si la requête n'est pas relayable à l'utilisateur (elle garde
 * alors sa réponse automatique sûre). Pur et testable — aucune valeur secrète.
 */
export function describeServerRequest(method, params = {}) {
  if (APPROVAL_METHODS.has(method)) {
    const detail =
      String(params.command ?? (Array.isArray(params.argv) ? params.argv.join(" ") : "") ?? "") ||
      String(params.path ?? params.file ?? "") ||
      (params.permissions ? JSON.stringify(params.permissions).slice(0, 300) : "");
    return {
      interactionType: "approval",
      title: method.includes("fileChange") || method === "applyPatchApproval"
        ? "Modification de fichiers"
        : method === "item/permissions/requestApproval"
          ? "Permissions additionnelles"
          : "Exécution de commande",
      detail,
      itemId: params.itemId ?? null,
    };
  }
  if (method === "item/tool/requestUserInput") {
    const questions = Array.isArray(params.questions) ? params.questions : [];
    return {
      interactionType: "user_input",
      title: "L'agent a besoin d'une réponse",
      fields: questions.slice(0, 3).map((q) => ({
        id: String(q.id ?? ""),
        question: String(q.question ?? ""),
        ...(q.header ? { header: String(q.header) } : {}),
        ...(Array.isArray(q.options)
          ? { options: q.options.map((o) => ({ label: String(o.label ?? ""), ...(o.description ? { description: String(o.description) } : {}) })) }
          : {}),
        allowOther: !!q.isOther,
        secret: !!q.isSecret,
      })),
      autoResolutionMs: params.autoResolutionMs ?? null,
      itemId: params.itemId ?? null,
    };
  }
  if (method === "mcpServer/elicitation/request") {
    const base = {
      interactionType: "mcp_elicitation",
      title: `MCP ${String(params.serverName ?? "?")}`,
      detail: String(params.message ?? ""),
      itemId: null,
    };
    if (params.mode === "url" || params.url) {
      let domain = "";
      try { domain = new URL(String(params.url ?? "")).hostname; } catch {}
      return { ...base, urlDomain: domain || String(params.url ?? "") };
    }
    if (params.mode === "form" && params.requestedSchema?.properties) {
      const props = params.requestedSchema.properties;
      const required = new Set(params.requestedSchema.required ?? []);
      return {
        ...base,
        fields: Object.entries(props).slice(0, 8).map(([key, p]) => ({
          id: key,
          question: String(p?.title ?? p?.description ?? key),
          header: key,
          ...(Array.isArray(p?.enum)
            ? { options: p.enum.map((v) => ({ label: String(v) })) }
            : Array.isArray(p?.oneOf)
              ? { options: p.oneOf.map((o) => ({ label: String(o?.const ?? ""), ...(o?.title ? { description: String(o.title) } : {}) })) }
              : {}),
          allowOther: false,
          secret: false,
          required: required.has(key),
        })),
      };
    }
    // openai/form ou schéma illisible : message + accepter/refuser
    return base;
  }
  return null;
}

/** Construit la réponse RPC Codex depuis la réponse utilisateur (null = refus sûr). */
export function answerFromInteraction(method, params, response, fullAccessFallback = false) {
  if (APPROVAL_METHODS.has(method)) {
    return buildApprovalResponse(method, response?.allow === true, params, response?.scope ?? "once");
  }
  if (method === "item/tool/requestUserInput") {
    const answers = response?.answers && typeof response.answers === "object" ? response.answers : {};
    return { answers };
  }
  if (method === "mcpServer/elicitation/request") {
    if (response?.action === "accept") {
      return { action: "accept", content: response.content ?? {}, _meta: null };
    }
    return { action: "decline", content: null, _meta: null };
  }
  return fullAccessFallback ? buildApprovalResponse(method, true, params) : buildServerRequestFallback(method);
}

// ---------------------------------------------------------------------------
// Client JSON-RPC (une instance app-server partagée par tout le sidecar)
// ---------------------------------------------------------------------------
let server = null; // { proc, request(method, params), nextId }
const pendingRpc = new Map(); // id -> { resolve, reject }
const threadHandlers = new Map(); // codexThreadId -> (method, params) => void
const threadOwners = new Map(); // codexThreadId -> atelier threadId
const threadInteractions = new Map(); // codexThreadId -> relay(spec) => Promise<response|null>
const loadedThreads = new Set(); // codexThreadIds déjà démarrés/répris dans CE serveur
const threadSandbox = new Map(); // codexThreadId -> sandbox du thread
const threadsWithGoal = new Set(); // codexThreadIds avec un goal actif (filtre les "cleared" sans goal)
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
  threadInteractions.clear();
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

/** Relaye la requête à l'utilisateur si un relay d'interaction est enregistré
 * pour ce thread (runs interactifs) ; sinon réponse automatique sûre (reviewer,
 * quickAsk). Une réponse null (timeout/refus/déconnexion) = refus sûr. */
async function handleServerRequest(msg) {
  const m = msg.method ?? "";
  const params = msg.params ?? {};
  const tid = requestThreadId(msg);
  const relay = tid ? threadInteractions.get(tid) : null;
  if (relay) {
    const spec = describeServerRequest(m, params);
    if (spec) {
      const response = await relay(spec);
      return answerFromInteraction(m, params, response);
    }
  }
  return answerServerRequest(msg);
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
  // goals : relayés aussi hors-tour (le front suit l'objectif en continu).
  // Un "cleared" sans goal préalable est du bruit (émis par l'app-server à
  // l'init) : on ne relaie que si un goal a réellement existé sur ce thread.
  if (msg.method === "thread/goal/updated" || msg.method === "thread/goal/cleared") {
    const cleared = msg.method === "thread/goal/cleared" || !params.goal;
    if (cleared && !threadsWithGoal.has(codexThreadId)) return;
    if (cleared) threadsWithGoal.delete(codexThreadId);
    else threadsWithGoal.add(codexThreadId);
    const ev = { kind: "goal", cleared, goal: params.goal ?? null };
    const owner = codexThreadId ? threadOwners.get(codexThreadId) : null;
    goalEmitter?.(owner ?? null, ev);
  }
  if (!codexThreadId) return;
  const handler = threadHandlers.get(codexThreadId);
  if (handler) { handler(msg.method, params); return; }
  // aucun runTurn n'écoute : tour AUTONOME démarré par le serveur pour
  // poursuivre le goal (turn/started sans turn/start client) — sans mapping,
  // toute son activité serait muette pour l'utilisateur
  if (threadsWithGoal.has(codexThreadId)) {
    handleGoalTurnNotification(codexThreadId, msg.method, params);
  }
}

// ---------------------------------------------------------------------------
// Tours autonomes du goal : mapping minimal notifications → AgentEvents,
// émis via goalEmitter (même canal harnais/journal que les événements goal).
// Volontairement plus simple que le handler complet de runTurn — l'essentiel
// est que thinking/commandes/texte/done soient VISIBLES et interruptibles.
// ---------------------------------------------------------------------------
const goalTurnStates = new Map(); // codexThreadId -> { streamText }

function goalCommandName(item) {
  // retire le wrapper shell (`/bin/zsh -lc '…'`) : n'afficher que la commande réelle
  let cmd = String(item.command ?? "commande").replace(/\s+/g, " ").trim();
  const m = /^(?:\S*\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]+)\1$/.exec(cmd);
  if (m) cmd = m[2];
  return cmd.length > 64 ? cmd.slice(0, 64) + "…" : cmd;
}

function goalWebSearchUpdate(item, status) {
  return {
    kind: "tool_update", id: item.id ?? "web-search", name: "web_search",
    output: "", status, detail: String(item.query ?? ""),
    input: { query: item.query ?? "", action: item.action ?? null }, source: "codex",
  };
}

function goalImageGenerationUpdate(item, status) {
  return {
    kind: "tool_update", id: item.id ?? "image-generation", name: "image_generation",
    output: item.savedPath ?? item.result ?? "", status,
    detail: item.revisedPrompt ?? undefined,
    input: { revisedPrompt: item.revisedPrompt ?? null }, source: "codex",
  };
}

/** Mapping pur (testé) : (method, params, state) → AgentEvents à émettre.
 * `state.streamText` est muté ; `state.turn` porte le nativeTurnId courant. */
export function mapGoalTurnNotification(method, params, state) {
  const item = params.item ?? {};
  const events = [];
  if (method === "turn/started") {
    state.streamText = "";
    state.turn = params.turn?.id ?? null;
    events.push({ kind: "started", ...(state.turn ? { nativeTurnId: state.turn } : {}) });
  }
  if (method === "item/started") {
    if (item.type === "reasoning") events.push({ kind: "tool", name: "__thinking" });
    if (item.type === "webSearch") {
      events.push(goalWebSearchUpdate(item, "inProgress"));
    }
    if (item.type === "commandExecution") {
      events.push({
        kind: "tool_update", id: item.id, name: "Bash",
        ...boundToolOutput(item.aggregatedOutput ?? ""),
        status: item.status ?? "inProgress", detail: goalCommandName(item),
        input: {
          command: item.command ?? "", cwd: item.cwd ?? null,
          source: item.source ?? null, commandActions: item.commandActions ?? [],
        }, source: "codex",
      });
    }
    if (item.type === "imageGeneration") events.push(goalImageGenerationUpdate(item, item.status ?? "inProgress"));
    if (item.type === "sleep") {
      events.push({ kind: "tool_update", id: item.id ?? "sleep", name: "sleep", output: "", status: "inProgress", source: "codex" });
    }
    if (item.type === "contextCompaction") {
      events.push({ kind: "tool_update", id: item.id ?? "__compacted", name: "__compacted", output: "", status: "inProgress", source: "codex" });
    }
  }
  if (method === "item/agentMessage/delta") {
    state.streamText += String(params.delta ?? "");
    events.push({ kind: "stream_set", text: state.streamText });
  }
  if (method === "item/completed") {
    if (item.type === "agentMessage") {
      state.streamText = "";
      events.push({ kind: "text", text: item.text ?? "" });
    }
    if (item.type === "reasoning") {
      const text = [...(item.content ?? []), ...(item.summary ?? [])].filter(Boolean).join("\n\n");
      if (text) events.push({ kind: "thinking", text });
    }
    if (item.type === "commandExecution") {
      events.push({
        kind: "tool_update", id: item.id, name: "Bash",
        ...boundToolOutput(item.aggregatedOutput ?? ""),
        status: item.status ?? "completed",
        ...(item.exitCode != null ? { exitCode: item.exitCode } : {}),
        detail: goalCommandName(item),
        input: {
          command: item.command ?? "", cwd: item.cwd ?? null,
          source: item.source ?? null, commandActions: item.commandActions ?? [],
        }, source: "codex",
      });
    }
    if (item.type === "fileChange") {
      const files = (item.changes ?? [])
        .map((ch) => String(ch?.path ?? "").split("/").pop()).filter(Boolean);
      events.push({
        kind: "tool_update", id: item.id, name: "apply_patch",
        output: "", status: item.status ?? "completed",
        detail: files.length ? files.slice(0, 3).join(", ") : "Files changed",
        input: { changes: item.changes ?? [] }, source: "codex",
      });
    }
    if (item.type === "mcpToolCall") {
      const raw = item.error ? JSON.stringify(item.error) : item.result ? JSON.stringify(item.result) : "";
      events.push({
        kind: "tool_update", id: item.id,
        name: [item.server, item.tool].filter(Boolean).join("/") || "mcp",
        ...boundToolOutput(raw), status: item.status ?? "completed", source: "mcp",
      });
    }
    if (item.type === "webSearch") events.push(goalWebSearchUpdate(item, "completed"));
    if (item.type === "imageGeneration") events.push(goalImageGenerationUpdate(item, item.status ?? "completed"));
    if (item.type === "sleep") {
      events.push({ kind: "tool_update", id: item.id ?? "sleep", name: "sleep", output: "", status: "completed", source: "codex" });
    }
    if (item.type === "contextCompaction") {
      events.push({ kind: "tool_update", id: item.id ?? "__compacted", name: "__compacted", output: "", status: "completed", source: "codex" });
    }
  }
  if (method === "turn/completed") {
    state.streamText = "";
    const status = params.turn?.status ?? "completed";
    events.push({
      kind: "done", ok: status !== "failed",
      result: status === "failed" ? String(params.turn?.error?.message ?? "échec") : "",
    });
  }
  return events;
}

function handleGoalTurnNotification(codexThreadId, method, params) {
  const owner = threadOwners.get(codexThreadId);
  if (!owner || !goalEmitter) return;
  const state = goalTurnStates.get(codexThreadId) ?? { streamText: "", turn: null };
  goalTurnStates.set(codexThreadId, state);
  const events = mapGoalTurnNotification(method, params, state);
  // interruptibilité : le tour autonome s'enregistre comme un tour normal
  if (method === "turn/started") activeTurns.set(owner, { codexId: codexThreadId, turnId: state.turn });
  if (method === "turn/completed") { activeTurns.delete(owner); goalTurnStates.delete(codexThreadId); }
  for (const ev of events) goalEmitter(owner, ev);
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
      // requête serveur → client : ASYNCHRONE (plan 025) — le reader continue
      // de traiter les autres messages pendant qu'une interaction attend
      // l'utilisateur ; la réponse RPC est écrite à la résolution du waiter.
      Promise.resolve(handleServerRequest(msg))
        .catch(() => answerServerRequest(msg))
        .then((result) => {
          notifyServerRequest(msg, result);
          try { proc.stdin.write(JSON.stringify({ id: msg.id, result }) + "\n"); } catch {}
        });
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
        if (input?.type === "skill" && input.name && input.path) {
          return { type: "skill", name: String(input.name), path: String(input.path) };
        }
        if (input?.type === "mention" && input.name && input.path) {
          return { type: "mention", name: String(input.name), path: String(input.path) };
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

const ATELIER_PLUGIN_MVP = [
  "visualize",
  "latex",
  "documents",
  "pdf",
  "presentations",
  "spreadsheets",
  "build-web-data-visualization",
  "openai-developers",
  "frontend-design",
  "template-creator",
];

function preferredPluginSkill(pluginName, skills) {
  const preferred = {
    latex: "latex-compile",
    "build-web-data-visualization": "data-visualization",
    "openai-developers": "agents-sdk",
  }[pluginName] ?? pluginName;
  return skills.find((skill) => skill?.name === preferred || skill?.name?.endsWith(`:${preferred}`)) ?? skills[0] ?? null;
}

function hydrateCachedSkillPaths(marketplaceName, pluginName, skills) {
  const root = join(homedir(), ".codex", "plugins", "cache", marketplaceName, pluginName);
  let versions = [];
  try {
    versions = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch { return skills; }
  return skills.map((skill) => {
    if (skill?.path) return skill;
    const leaf = String(skill?.name ?? "").split(":").pop();
    const path = versions
      .map((version) => join(root, version, "skills", leaf, "SKILL.md"))
      .find((candidate) => existsSync(candidate));
    return path ? { ...skill, path } : skill;
  });
}

export async function listAtelierPlugins(cwd = "") {
  const srv = await ensureServer();
  const installed = await srv.request("plugin/installed", cwd ? { cwds: [cwd] } : {});
  const plugins = [];
  for (const marketplace of installed?.marketplaces ?? []) {
    for (const summary of marketplace?.plugins ?? []) {
      if (!ATELIER_PLUGIN_MVP.includes(summary?.name) || !summary?.installed || !summary?.enabled) continue;
      const params = { pluginName: marketplace.path ? summary.name : (summary.remotePluginId ?? summary.name) };
      if (marketplace.path) params.marketplacePath = marketplace.path;
      else if (marketplace.name) params.remoteMarketplaceName = marketplace.name;
      const response = await srv.request("plugin/read", params);
      const detail = response?.plugin ?? response ?? {};
      const skills = hydrateCachedSkillPaths(
        marketplace.name,
        summary.name,
        Array.isArray(detail.skills) ? detail.skills : [],
      );
      plugins.push({
        id: summary.id ?? summary.name,
        name: summary.name,
        displayName: summary.interface?.displayName ?? summary.name,
        description: summary.interface?.shortDescription ?? "",
        version: summary.localVersion ?? null,
        enabled: true,
        icon: summary.interface?.composerIcon ?? summary.interface?.composerIconUrl ?? null,
        skills,
        primarySkill: preferredPluginSkill(summary.name, skills),
      });
    }
  }
  plugins.sort((a, b) => ATELIER_PLUGIN_MVP.indexOf(a.name) - ATELIER_PLUGIN_MVP.indexOf(b.name));
  return plugins;
}

/**
 * Plan 025 : mapping EXPLICITE mode de permission Atelier → politique Codex
 * (schéma codex-cli 0.142.5). Un mode inconnu retombe sur un repli SÛR
 * (read-only + on-request) avec diagnostic — jamais sur danger-full-access.
 * Le mode Plan exige un collaborationMode réel : settings.model est REQUIS
 * par le protocole (fourni par l'appelant, résolu au câblage du turn).
 */
export function resolveCodexSafety(permissionMode, { model } = {}) {
  switch (permissionMode) {
    case "bypassPermissions":
      return { sandbox: "danger-full-access", approvalPolicy: "never" };
    case "acceptEdits":
      return { sandbox: "workspace-write", approvalPolicy: "on-request" };
    case "default":
      return { sandbox: "workspace-write", approvalPolicy: "untrusted" };
    case "plan":
      return {
        sandbox: "read-only",
        approvalPolicy: "never",
        collaborationMode: { mode: "plan", settings: { model: model ?? null } },
      };
    default:
      return {
        sandbox: "read-only",
        approvalPolicy: "on-request",
        diagnostic: `mode de permission inconnu (${String(permissionMode)}) — repli read-only/on-request`,
      };
  }
}

export function buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox, permissionMode }) {
  const config = {};
  let actualModel = model ?? null;
  const actualEffort = normalizeCodexEffort(effort);
  // Politique (plan 025) : un sandbox EXPLICITE (reviewer read-only, ou
  // bypassPermissions programmatique) prime ; sinon resolveCodexSafety (repli
  // SÛR read-only pour un mode inconnu). AUCUN chemin latent vers
  // danger-full-access : l'absence des deux retombe sur read-only, jamais full.
  const safety = sandbox != null
    ? { sandbox, approvalPolicy: "never" }
    : resolveCodexSafety(permissionMode, { model: actualModel });
  if (webSearch) config.web_search = webSearch === "cached" ? "cached" : "live";
  if (Array.isArray(additionalDirectories) && additionalDirectories.length &&
      safety.sandbox !== "read-only") {
    // additionalDirectories ne devient writable qu'en mode autorisant l'écriture
    config.sandbox_workspace_write = { writable_roots: additionalDirectories.map(String) };
  }
  return {
    cwd: cwd ?? null,
    model: actualModel,
    approvalPolicy: safety.approvalPolicy,
    sandbox: safety.sandbox,
    ...(Object.keys(config).length ? { config } : {}),
    ...(actualEffort ? { effortHint: actualEffort } : {}), // hints retirés avant l'appel RPC
    ...(safety.collaborationMode ? { collaborationModeHint: safety.collaborationMode } : {}),
    ...(safety.diagnostic ? { safetyDiagnosticHint: safety.diagnostic } : {}),
  };
}

async function openThread(srv, { sessionId, threadOpts, reuseLoaded = false }) {
  const { effortHint, collaborationModeHint, safetyDiagnosticHint, ...opts } = threadOpts;
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
async function goalRequest(method, { sessionId, cwd, permissionMode, ...rest }) {
  if (!sessionId) throw new Error("goal : session Codex absente — envoie d'abord un message");
  const srv = await ensureServer();
  const codexId = await openThread(srv, {
    sessionId,
    // thread pas encore chargé (app-server relancé…) : reprendre avec le mode
    // RÉEL du thread quand il est connu — un resume read-only rétrograderait
    // le sandbox de TOUT le thread pour les tours suivants. read-only reste
    // le défaut sûr quand aucun mode n'est connu (plan 025).
    threadOpts: buildThreadOptions(permissionMode ? { cwd, permissionMode } : { cwd, sandbox: "read-only" }),
    reuseLoaded: true, // ne pas écraser les options d'un thread déjà actif
  });
  const resp = await srv.request(method, { threadId: codexId, ...rest });
  if (method === "thread/goal/set" && resp?.goal) threadsWithGoal.add(codexId);
  if (method === "thread/goal/clear" && threadsWithGoal.has(codexId)) {
    threadsWithGoal.delete(codexId); // la notification cleared qui suit sera filtrée (pas de doublon)
    const owner = threadOwners.get(codexId);
    goalEmitter?.(owner ?? null, { kind: "goal", cleared: true, goal: null });
  }
  return resp?.goal ?? null;
}

export function setGoal({ sessionId, cwd, objective, status, tokenBudget, permissionMode }) {
  return goalRequest("thread/goal/set", {
    sessionId, cwd, permissionMode,
    ...(objective != null ? { objective } : {}),
    ...(status != null ? { status } : {}),
    ...(tokenBudget != null ? { tokenBudget } : {}),
  });
}

export function getGoal({ sessionId, cwd, permissionMode }) {
  return goalRequest("thread/goal/get", { sessionId, cwd, permissionMode });
}

/** Compaction native du contexte (thread/compact/start). */
export async function compactThread({ sessionId, cwd, permissionMode }) {
  if (!sessionId) throw new Error("compact : session Codex absente");
  const srv = await ensureServer();
  const codexId = await openThread(srv, {
    sessionId,
    // même politique que goalRequest : mode réel du thread si connu, sinon
    // read-only sûr — jamais de démotion durable du sandbox du thread
    threadOpts: buildThreadOptions(permissionMode ? { cwd, permissionMode } : { cwd, sandbox: "read-only" }),
    reuseLoaded: true,
  });
  await srv.request("thread/compact/start", { threadId: codexId });
}

export async function clearGoal({ sessionId, cwd, permissionMode }) {
  await goalRequest("thread/goal/clear", { sessionId, cwd, permissionMode });
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
  permissionMode, // mode Atelier → politique Codex réelle (plan 025)
  clientMessageId, // messageId Atelier → clientUserMessageId Codex (plan 025)
  onInteraction, // relay(spec) => Promise<response|null> — runs interactifs seulement
  onEvent: rawOnEvent,
}) {
  // TOUTE émission tool_update passe par ici : sortie plafonnée 64 KiB et input
  // borné (un input MCP peut porter des secrets) — plan 025, un seul point.
  const onEvent = (evt) => {
    if (evt?.kind === "tool_update") {
      const bounded = boundToolOutput(evt.output ?? "");
      return rawOnEvent({
        ...evt,
        output: bounded.output,
        ...(bounded.truncated ? { truncated: true, outputLength: bounded.outputLength } : {}),
        input: scrubToolInput(evt.input),
      });
    }
    return rawOnEvent(evt);
  };
  const srv = await ensureServer();
  const threadOpts = buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox, permissionMode });
  const actualEffort = normalizeCodexEffort(effort);
  const reservation = await claimAndOpenCodexRun({
    sessionId,
    threadId,
    open: () => openThread(srv, { sessionId, threadOpts }),
  });
  const codexId = reservation.codexId;
  try {
  if (threadId) threadOwners.set(codexId, threadId);
  if (onInteraction) threadInteractions.set(codexId, onInteraction);
  if (threadOpts.safetyDiagnosticHint) {
    onEvent({ kind: "tool", name: "__permission-fallback", detail: threadOpts.safetyDiagnosticHint });
  }

  // affichage SOBRE, aligné sur le provider Claude : une seule ligne par action
  // (event `tool`/`tool_update` avec libellé court), pas de carte d'activité.
  let lastTool = "";
  const emitTool = (name, detail) => {
    const key = `${name}|${detail ?? ""}`;
    if (key === lastTool) return;
    lastTool = key;
    onEvent({ kind: "tool", name, ...(detail ? { detail } : {}) });
  };
  const commandName = (item) => {
    // retire le wrapper shell (`/bin/zsh -lc '…'`) : n'afficher que la commande réelle
    let cmd = String(item.command ?? "commande").replace(/\s+/g, " ").trim();
    const m = /^(?:\S*\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]+)\1$/.exec(cmd);
    if (m) cmd = m[2];
    return cmd.length > 64 ? cmd.slice(0, 64) + "…" : cmd;
  };
  const commandMeta = new Map(); // itemId -> dernier état connu pour les deltas
  const commandOutputs = new Map(); // itemId -> {output borné, outputLength, truncated}
  const commandInput = (item) => ({
    command: item.command ?? "",
    cwd: item.cwd ?? null,
    source: item.source ?? null,
    commandActions: item.commandActions ?? [],
  });
  const emitCommandUpdate = (item, patch = {}) => {
    const id = item.id ?? patch.itemId ?? `cmd:${commandName(item)}`;
    const state = patch.outputState
      ?? commandOutputs.get(id)
      ?? appendBoundedToolOutput(undefined, patch.output ?? item.aggregatedOutput ?? "");
    onEvent({
      kind: "tool_update",
      id,
      name: "Bash",
      output: state.output,
      ...(state.truncated ? { truncated: true, outputLength: state.outputLength } : {}),
      status: patch.status ?? item.status,
      exitCode: patch.exitCode ?? item.exitCode ?? undefined,
      detail: commandName(item),
      input: commandInput(item),
      ...(patch.ephemeral ? { __ephemeral: true } : {}),
    });
  };
  const emitWebSearchUpdate = (item, status) => {
    onEvent({
      kind: "tool_update",
      id: item.id ?? "web-search",
      name: "web_search",
      output: "",
      status,
      detail: String(item.query ?? ""),
      input: { query: item.query ?? "", action: item.action ?? null },
      source: "codex",
    });
  };
  const emitImageGenerationUpdate = (item, status) => {
    onEvent({
      kind: "tool_update",
      id: item.id ?? "image-generation",
      name: "image_generation",
      output: item.savedPath ?? item.result ?? "",
      status,
      detail: item.revisedPrompt ?? undefined,
      input: { revisedPrompt: item.revisedPrompt ?? null },
      source: "codex",
    });
  };
  const emitSimpleActivity = (item, name, status) => {
    onEvent({
      kind: "tool_update",
      id: item.id ?? name,
      name,
      output: "",
      status,
      source: "codex",
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
    const receiverThreadIds = item.receiverThreadIds ?? [];
    const agentsStates = item.agentsStates ?? {};
    onEvent({
      kind: "tool_update",
      id: item.id ?? collabToolName(item),
      name: collabToolName(item),
      output: jsonText({
        receiverThreadIds,
        agentsStates,
      }),
      status: item.status,
      detail: item.model ? `${item.model}${item.reasoningEffort ? ` · ${item.reasoningEffort}` : ""}` : undefined,
      input: { prompt: item.prompt, model: item.model, reasoningEffort: item.reasoningEffort },
      source: "codex",
      agentActivity: {
        tool: item.tool ?? "collab",
        senderThreadId: item.senderThreadId ?? null,
        receiverThreadIds,
        agentsStates,
        prompt: item.prompt ?? null,
        model: item.model ?? null,
        reasoningEffort: item.reasoningEffort ?? null,
      },
    });
  };
  const emitSubagentActivity = (item) => {
    const threadId = String(item.agentThreadId ?? "unknown");
    const interrupted = item.kind === "interrupted";
    onEvent({
      kind: "tool_update",
      id: item.id ?? `subagent:${threadId}:${item.kind ?? "started"}`,
      name: "agent:activity",
      output: "",
      status: interrupted ? "completed" : "inProgress",
      source: "codex",
      agentActivity: {
        tool: "activity",
        receiverThreadIds: [threadId],
        agentsStates: {
          [threadId]: { status: interrupted ? "interrupted" : "running", message: null },
        },
        agentThreadId: threadId,
        agentPath: item.agentPath ?? null,
        activityKind: item.kind ?? "started",
      },
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
  };

  let usage = null; // via thread/tokenUsage/updated
  let streamText = "";
  let doneEmitted = false;
  let finished; // resolve du tour
  const done = new Promise((resolve) => { finished = resolve; });

  const handler = (method, params) => {
    switch (method) {
      case "turn/started": {
        const nativeTurnId = params.turn?.id ?? null;
        activeTurns.set(threadId ?? codexId, { codexId, turnId: nativeTurnId });
        // le turn natif est propagé au harnais (meta.nativeTurnId, plan 025)
        onEvent({ kind: "started", ...(nativeTurnId ? { nativeTurnId } : {}) });
        break;
      }
      case "item/started": {
        const item = params.item ?? {};
        if (item.type === "commandExecution") {
          commandMeta.set(item.id, item);
          commandOutputs.set(item.id, appendBoundedToolOutput(undefined, item.aggregatedOutput ?? ""));
          emitCommandUpdate(item, { status: item.status ?? "inProgress" });
        }
        if (item.type === "reasoning") {
          emitTool("__thinking");
        }
        if (item.type === "webSearch") {
          emitWebSearchUpdate(item, "inProgress");
        }
        if (item.type === "fileChange") {
          fileChangeMeta.set(item.id, item);
          emitFileChangeUpdate(item);
        }
        if (item.type === "mcpToolCall") {
          mcpMeta.set(item.id, item);
          emitTool(`outil ${mcpName(item)}`);
          emitMcpUpdate(item, { status: item.status ?? "inProgress" });
        }
        if (item.type === "dynamicToolCall") {
          dynamicToolMeta.set(item.id, item);
          emitTool(`outil ${dynamicToolName(item)}`);
          emitDynamicToolUpdate(item, { status: item.status ?? "inProgress" });
        }
        if (item.type === "collabAgentToolCall") {
          emitTool(collabToolName(item));
          emitCollabToolUpdate(item);
        }
        if (item.type === "subAgentActivity") {
          emitSubagentActivity(item);
        }
        if (item.type === "imageGeneration") {
          emitImageGenerationUpdate(item, item.status ?? "inProgress");
        }
        if (item.type === "sleep") {
          emitSimpleActivity(item, "sleep", "inProgress");
        }
        if (item.type === "contextCompaction") {
          emitSimpleActivity(item, "__compacted", "inProgress");
        }
        if (item.type === "imageView") {
          onEvent(imageViewEvent(item));
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
          if (item.aggregatedOutput != null) {
            commandOutputs.set(item.id, appendBoundedToolOutput(undefined, item.aggregatedOutput));
          }
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
        if (item.type === "collabAgentToolCall") {
          emitCollabToolUpdate(item);
        }
        if (item.type === "subAgentActivity") {
          emitSubagentActivity(item);
        }
        break;
      }
      case "item/commandExecution/outputDelta": {
        const id = params.itemId;
        const item = commandMeta.get(id);
        if (!item) break;
        const outputState = appendBoundedToolOutput(commandOutputs.get(id), params.delta ?? "");
        commandOutputs.set(id, outputState);
        emitCommandUpdate(item, { outputState, status: item.status ?? "inProgress", ephemeral: true });
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
          if (item.aggregatedOutput != null) {
            commandOutputs.set(item.id, appendBoundedToolOutput(undefined, item.aggregatedOutput));
          }
          emitCommandUpdate(commandMeta.get(item.id));
        }
        if (item.type === "fileChange") {
          fileChangeMeta.set(item.id, item);
          emitFileChangeUpdate(item, { status: item.status ?? "completed" });
          const paths = (item.changes ?? []).map((ch) => ch.path).filter(Boolean);
          if (paths.length) onEvent({ kind: "edit", files: paths });
          else emitTool("__edits:");
        }
        if (item.type === "mcpToolCall") {
          mcpMeta.set(item.id, item);
          emitTool(`outil ${mcpName(item)}`);
          emitMcpUpdate(item, { status: item.status ?? "completed" });
        }
        if (item.type === "dynamicToolCall") {
          dynamicToolMeta.set(item.id, item);
          const status = item.status === "failed" || item.success === false ? "failed" : "completed";
          emitTool(`outil ${dynamicToolName(item)}`);
          emitDynamicToolUpdate(item, { status: item.status ?? status });
        }
        if (item.type === "collabAgentToolCall") {
          emitCollabToolUpdate(item);
        }
        if (item.type === "subAgentActivity") {
          emitSubagentActivity(item);
        }
        if (item.type === "imageGeneration") {
          emitImageGenerationUpdate(item, item.status ?? "completed");
        }
        if (item.type === "webSearch") {
          emitWebSearchUpdate(item, "completed");
        }
        if (item.type === "sleep") {
          emitSimpleActivity(item, "sleep", "completed");
        }
        if (item.type === "contextCompaction") {
          emitSimpleActivity(item, "__compacted", "completed");
        }
        break;
      }
      case "turn/plan/updated": {
        const items = (params.plan ?? []).map((s) => ({
          text: String(s.step ?? ""),
          completed: s.status === "completed",
        }));
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
        // NON-terminal : surfacé comme diagnostic, jamais un terminal error avant
        // le turn/completed réel (plan 025 — terminalisation Codex)
        const { event } = classifyCodexError(params);
        if (event) onEvent(event);
        break;
      }
      case "turn/completed": {
        const turn = params.turn ?? {};
        if (turn.status === "failed") {
          onEvent({ kind: "error", message: turn.error?.message ?? "failed" });
          doneEmitted = true; // pas de done ok:true après une erreur (l'event error suffit)
          finished({ ok: false });
          break;
        }
        if (turn.status === "interrupted") {
          doneEmitted = true;
          onEvent({ kind: "done", ok: false, result: "interrompu" });
          finished({ ok: false, doneSent: true });
          break;
        }
        const tc = usage ?? lastTokenCount(codexId);
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
    const collaborationMode = await resolvePlanCollaborationMode(srv, threadOpts, onEvent);
    const resp = await srv.request("turn/start", {
      threadId: codexId,
      input,
      ...(threadOpts.model ? { model: threadOpts.model } : {}),
      ...(actualEffort ? { effort: actualEffort } : {}),
      ...(clientMessageId ? { clientUserMessageId: String(clientMessageId) } : {}),
      ...(collaborationMode ? { collaborationMode } : {}),
      approvalPolicy: threadOpts.approvalPolicy ?? "never",
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
    threadInteractions.delete(codexId);
    activeTurns.delete(threadId ?? codexId);
  }
  return { sessionId: codexId };
  } finally {
    reservation.release();
  }
}

// Mode Plan : le protocole exige un collaborationMode complet (settings.model
// REQUIS). Si le modèle du tour est connu on le fournit ; sinon on interroge
// collaborationMode/list (mis en cache) — jamais d'objet plan incomplet. En
// dernier recours le tour reste read-only/never SANS collaborationMode, avec
// un diagnostic visible.
let collabModesCache = null;
async function resolvePlanCollaborationMode(srv, threadOpts, onEvent) {
  const hint = threadOpts.collaborationModeHint;
  if (!hint) return null;
  if (hint.settings?.model) return hint;
  if (!collabModesCache) {
    try { collabModesCache = await srv.request("collaborationMode/list", {}); } catch { collabModesCache = {}; }
  }
  const modes = collabModesCache?.modes ?? collabModesCache?.collaborationModes ?? [];
  const plan = Array.isArray(modes)
    ? modes.find((m) => (m?.mode ?? m?.modeKind) === "plan" && m?.settings?.model)
    : null;
  if (plan) return { mode: "plan", settings: plan.settings };
  onEvent({
    kind: "tool",
    name: "__permission-fallback",
    detail: "mode Plan : collaborationMode indisponible — tour read-only sans plan natif",
  });
  return null;
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
