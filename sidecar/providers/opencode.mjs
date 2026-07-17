import { execFile, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBin } from "../bin_resolver.mjs";
import {
  acpEdits,
  acpMethodNotFoundResponse,
  acpToolCall,
  acpToolCallUpdate,
  makeTurnEmitter,
} from "./acp_common.mjs";
import { makeAcpClient } from "./acp_client.mjs";

const OPENCODE_BIN = resolveBin("opencode") ?? "opencode";
const MODEL_CATALOG_TTL_MS = 5 * 60_000;
let modelCatalogCache = null;

export function parseOpenCodeModelsOutput(output) {
  const seen = new Set();
  const models = [];
  for (const raw of String(output ?? "").split(/\r?\n/)) {
    const id = raw.trim();
    if (!id || id.length > 512 || !id.includes("/") || id.includes("://") || /\s/.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
    if (models.length >= 5_000) break;
  }
  return models;
}

export function listModels(timeoutMs = 12_000) {
  if (modelCatalogCache && Date.now() - modelCatalogCache.fetchedAt < MODEL_CATALOG_TTL_MS) {
    return Promise.resolve(modelCatalogCache.value);
  }
  return new Promise((resolve, reject) => {
    const child = execFile(OPENCODE_BIN, ["models"], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || error).trim()));
        return;
      }
      const models = parseOpenCodeModelsOutput(stdout);
      if (!models.length) {
        reject(new Error("opencode models: aucun modèle détecté"));
        return;
      }
      const value = { models, defaultModel: "openrouter/z-ai/glm-5.2" };
      modelCatalogCache = { fetchedAt: Date.now(), value };
      resolve(value);
    });
    child.stdin?.end?.();
  });
}

// ---------------------------------------------------------------------------
// Transcripts locaux (JSONL) : OpenCode ne fournit pas d'API d'historique —
// on persiste chaque tour terminé sous APP_DIR/opencode_sessions/<sid>.jsonl.
// Les sessions antérieures à cette fonctionnalité ne sont PAS rétro-importées.
// ---------------------------------------------------------------------------
const DEFAULT_TRANSCRIPT_DIR = join(
  homedir(), "Library", "Application Support", "atelier-studio", "opencode_sessions",
);

function transcriptDir(opts = {}) {
  return opts.dir ?? process.env.ATELIER_OPENCODE_TRANSCRIPTS ?? DEFAULT_TRANSCRIPT_DIR;
}

/** Accumule le texte/raisonnement d'un tour et le persiste UNE seule fois,
 * y compris partiel après interruption. Pur vis-à-vis du process opencode. */
export function makeTranscriptRecorder(prompt, opts = {}) {
  let text = "";
  let thinking = "";
  let persisted = false;
  return {
    absorb(event) {
      if (event?.kind === "delta" && typeof event.text === "string") text += event.text;
      if (event?.kind === "thinking_delta" && typeof event.text === "string") thinking += event.text;
    },
    persist(sessionId) {
      if (persisted || !sessionId || (!text && !thinking)) return false;
      persisted = true;
      const dir = transcriptDir(opts);
      try {
        mkdirSync(dir, { recursive: true });
        const ts = Date.now();
        const lines = [
          { role: "user", content: String(prompt ?? ""), ts },
          { role: "assistant", content: text, ...(thinking ? { reasoning: thinking } : {}), ts },
        ];
        appendFileSync(join(dir, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l) + "\n").join(""));
        return true;
      } catch {
        return false; // disque plein/permissions : le streaming a déjà eu lieu
      }
    },
  };
}

/** Historique UI d'une session persistée localement (nouveaux tours seulement). */
export async function history(sessionId, _projectRoot, opts = {}) {
  if (!sessionId) return [];
  const p = join(transcriptDir(opts), `${sessionId}.jsonl`);
  if (!existsSync(p)) return [];
  const events = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const m = JSON.parse(trimmed);
      if (m.role === "user" && typeof m.content === "string") {
        events.push({ kind: "user", text: m.content, ts: m.ts });
      } else if (m.role === "assistant") {
        if (typeof m.reasoning === "string" && m.reasoning.trim()) {
          events.push({ kind: "thinking", text: m.reasoning, ts: m.ts });
        }
        if (typeof m.content === "string" && m.content) {
          events.push({ kind: "text", text: m.content, ts: m.ts });
        }
      }
    } catch {
      // ligne corrompue isolée : ignorer
    }
  }
  return events;
}
const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);
const PROJECT_REQUEST_RE = /\b(analy[sz]e|analyse|analyses|analyser|projet|project|repo|repository|codebase|dossier|folder|fichier|file|fichiers|files|architecture|impl[eé]mentation)\b/i;

function mapEffort(effort) {
  if (!effort) return null;
  if (effort === "ultra") return "max";
  return EFFORTS.has(effort) ? effort : null;
}

function textFromPart(part) {
  if (!part || typeof part !== "object") return "";
  if (typeof part.text === "string") return part.text;
  if (typeof part.content === "string") return part.content;
  return "";
}

function errorMessage(msg) {
  if (typeof msg?.message === "string") return msg.message;
  if (typeof msg?.error === "string") return msg.error;
  if (typeof msg?.error?.message === "string") return msg.error.message;
  if (typeof msg?.part?.error === "string") return msg.part.error;
  if (typeof msg?.part?.message === "string") return msg.part.message;
  return "erreur OpenCode";
}

function reasoningTextFromDetails(details) {
  if (!Array.isArray(details)) return [];
  return details
    .map((detail) => detail?.text ?? detail?.summary ?? "")
    .filter((text) => typeof text === "string" && text.trim())
    .map((text) => ({ kind: "thinking_delta", text }));
}

function stringifyPayload(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toolSource(part, state) {
  const source = part?.metadata?.mcp || state?.metadata?.mcp ? "mcp" : null;
  if (source) return source;
  const name = String(part?.tool ?? part?.name ?? "");
  return /^mcp[_.:-]/i.test(name) ? "mcp" : null;
}

function buildPrompt(prompt) {
  const text = String(prompt ?? "");
  if (!PROJECT_REQUEST_RE.test(text)) return text;
  return [
    "Tu es un agent de code dans Atelier avec acces au dossier courant.",
    "Si la demande concerne le projet, le code, les fichiers ou le dossier courant, inspecte les fichiers avec tes outils avant de conclure.",
    "Ne réponds pas seulement que tu vas analyser: fais l'analyse, puis donne les constats concrets.",
    "",
    text,
  ].join("\n");
}

function killOpenCodeProcess(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to the direct child when the process group is already gone.
  }
  try {
    child.kill(signal);
  } catch {
    // The child may have exited between timeout handling and cleanup.
  }
}

// Shapes réelles de `opencode run --format json` (opencode 1.17.14,
// vérifiées 2026-07-06) : {type:"step_start",sessionID,part},
// {type:"text",sessionID,part:{text}}, {type:"step_finish",part:{tokens,cost}}.
export function normalizeOpenCodeMessage(msg) {
  if (!msg || typeof msg !== "object") return [];

  if (msg.type === "error") {
    return [{ kind: "error", message: errorMessage(msg) }];
  }

  if (msg.type === "step_start") {
    return [{ kind: "started" }];
  }

  if (msg.type === "text") {
    const text = textFromPart(msg.part);
    return text ? [{ kind: "delta", text }] : [];
  }

  if (msg.type === "reasoning" || msg.type === "thinking") {
    const text = textFromPart(msg.part);
    return text ? [{ kind: "thinking_delta", text }] : [];
  }

  if (msg.type === "tool" || msg.type === "tool_update" || msg.type === "tool_use") {
    const part = msg.part ?? {};
    const state = part.state && typeof part.state === "object" ? part.state : {};
    const name = String(part.tool ?? part.name ?? part.type ?? "tool");
    const detail = String(
      state.title ?? part.title ?? part.command ?? part.description ?? state.status ?? "",
    ).slice(0, 160);
    return [
      ...reasoningTextFromDetails(part.metadata?.openrouter?.reasoning_details),
      {
        kind: "tool_update",
        id: String(part.callID ?? part.id ?? `${name}:${msg.timestamp ?? Date.now()}`),
        name,
        detail,
        input: state.input ?? part.input ?? null,
        output: stringifyPayload(state.output ?? part.output ?? ""),
        status: String(state.status ?? part.status ?? "running"),
        source: toolSource(part, state),
      },
    ];
  }

  if (msg.type === "step_finish") {
    const tokens = msg.part?.tokens ?? {};
    return [{
      kind: "usage",
      sessionId: msg.sessionID ?? msg.part?.sessionID ?? null,
      usage: {
        context: Number.isFinite(tokens.input) ? tokens.input : null,
        output: Number.isFinite(tokens.output) ? tokens.output : null,
        cost: Number.isFinite(msg.part?.cost) ? msg.part.cost : null,
        turns: null,
      },
    }];
  }

  return [];
}

export function parseOpenCodeJsonl(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      for (const event of normalizeOpenCodeMessage(JSON.parse(trimmed))) events.push(event);
    } catch {
      events.push({ kind: "error", message: `JSON OpenCode invalide: ${trimmed.slice(0, 120)}` });
    }
  }
  return { events, rest };
}

async function runLegacy({
  cwd,
  prompt,
  sessionId,
  model,
  effort,
  permissionMode,
  timeoutMs,
  onEvent,
}) {
  const args = ["--pure", "run", "--format", "json", "--dir", cwd || process.env.HOME || process.cwd()];
  if (model) args.push("--model", model);
  const mappedEffort = mapEffort(effort);
  if (mappedEffort) args.push("--variant", mappedEffort);
  if (!permissionMode || permissionMode === "bypassPermissions") args.push("--auto");
  if (sessionId) args.push("--session", sessionId);
  args.push(buildPrompt(prompt));

  return new Promise((resolve, reject) => {
    const child = spawn(OPENCODE_BIN, args, {
      cwd: cwd || process.env.HOME || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let sid = sessionId ?? null;
    let lastUsage = { context: 0, output: 0, cost: null, turns: null };
    let rest = "";
    let stderr = "";
    let settled = false;
    // transcript du tour (texte final + raisonnement), persisté au settle —
    // succès comme interruption : le partiel est conservé, une seule fois
    const recorder = makeTranscriptRecorder(prompt);

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      recorder.persist(sid);
      resolve(value);
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      recorder.persist(sid);
      reject(err);
    };

    const timer = timeoutMs
      ? setTimeout(() => {
        const err = new Error(`OpenCode timeout après ${timeoutMs} ms`);
        onEvent?.({ kind: "error", message: err.message });
        killOpenCodeProcess(child, "SIGTERM");
        const killTimer = setTimeout(() => killOpenCodeProcess(child, "SIGKILL"), 1500);
        killTimer.unref?.();
        settleReject(err);
      }, timeoutMs)
      : null;
    timer?.unref?.();

    const emit = (event) => {
      if (settled) return;
      if (event.sessionId) sid = event.sessionId;
      recorder.absorb(event);
      if (event.kind === "usage" && event.usage) {
        lastUsage = event.usage;
      }
      if (event.kind === "done") {
        onEvent?.(event);
        settleResolve({ sessionId: sid });
        return;
      }
      if (event.kind === "error") {
        onEvent?.(event);
        settleReject(new Error(event.message));
        return;
      }
      onEvent?.(event);
    };

    child.stdout.on("data", (buf) => {
      const parsed = parseOpenCodeJsonl(String(buf), rest);
      rest = parsed.rest;
      for (const event of parsed.events) emit(event);
    });
    child.stderr.on("data", (buf) => { stderr += String(buf); });
    child.on("error", (err) => {
      settleReject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      if (rest.trim()) {
        const parsed = parseOpenCodeJsonl("\n", rest);
        for (const event of parsed.events) emit(event);
        if (settled) return;
      }
      if (code === 0) {
        onEvent?.({ kind: "done", ok: true, sessionId: sid, result: "", usage: lastUsage });
        settleResolve({ sessionId: sid });
      } else {
        settleReject(new Error(stderr.trim() || `OpenCode exited with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Chemin ACP (`opencode acp`) — plan 045. Miroir de grok.mjs (process JSON-RPC
// partagé, sessions multiplexées), champs ACP STANDARD (title/kind/status/
// content/rawInput — pas d'extension _meta). Contrat wire vérifié par sonde
// le 2026-07-16 (opencode 1.18.3) : voir plans/045-acp-client-rust.md.
// Repli sur runLegacy UNIQUEMENT si le handshake échoue (spawn/initialize/
// ouverture de session) — une erreur en cours de tour devient {kind:"error"}.
// ---------------------------------------------------------------------------

const ACP_HANDSHAKE_TIMEOUT_MS = 10000; // initialize
// session/new|load : premier appel lent (chargement providers/models.dev —
// >15 s observés en sonde) ; 30 s de marge.
const ACP_OPEN_TIMEOUT_MS = 30000;

// Cycle de vie du process (spawn singleton, pending RPC, framing, garde de
// génération) : extrait vers acp_client.mjs (plan 046 étape 9). Ici ne
// restent que les états PROVIDER : sessions ouvertes, modèle par session,
// tours actifs — invalidés quand la génération du client change.
const acpLoadedSessions = new Set(); // sessions ouvertes (new|load) dans CE process
const acpSessionModel = new Map(); // sessionId -> dernier modelId aligné/connu
const acpActiveTurns = new Map(); // clé de tour (threadId ?? sessionId) -> sessionId
let acpKnownGeneration = 0;

function acpHandshakeFailure(message) {
  const e = new Error(message);
  e.acpHandshakeFailure = true;
  return e;
}

/** Politique OpenCode du plan 045, conservée PAR OpenCode (plan 046 §2.4) :
 * auto-approbation allow_once (parité `--auto` legacy, le catalogue déclare
 * permissions:false). Toute autre méthode ⇒ null ⇒ repli sûr du client
 * (-32601). */
export function opencodeServerPolicy(method, params) {
  if (method !== "session/request_permission") return null;
  const options = params?.options ?? [];
  const picked = options.find((o) => o?.kind === "allow_once") ?? options[0];
  return picked?.optionId != null
    ? { outcome: { outcome: "selected", optionId: picked.optionId } }
    : { outcome: { outcome: "cancelled" } };
}

const acpClient = makeAcpClient({
  label: "opencode",
  binPath: () => OPENCODE_BIN,
  args: ["acp"],
  initParams: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  },
  onServerRequest: opencodeServerPolicy,
  handshakeTimeoutMs: ACP_HANDSHAKE_TIMEOUT_MS,
});

function withAcpTimeout(promise, label, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(acpHandshakeFailure(`${label}: pas de réponse sous ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e?.acpHandshakeFailure ? e : acpHandshakeFailure(`${label}: ${e?.message ?? e}`)); },
    );
  });
}

/** Compat plan 045 (tests) : réponse automatique aux requêtes serveur→client,
 * écrite de façon SYNCHRONE sur `proc.stdin` — même comportement que la
 * politique branchée dans le client partagé. Le flux réel passe par
 * acp_client.mjs ; cette fonction reste l'entrée testable sans process. */
export function handleOpencodeIncoming(proc, msg) {
  if (msg.id != null && msg.method) {
    const body = opencodeServerPolicy(msg.method, msg.params);
    if (body != null) {
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: body }) + "\n");
    } else {
      proc.stdin.write(JSON.stringify(acpMethodNotFoundResponse(msg.id, msg.method)) + "\n");
    }
    return;
  }
  // Réponses et notifications : dispatchées par le client partagé sur le vrai
  // flux ; ce shim de test n'a pas d'état à mettre à jour.
}

/** Spawn + initialize via le client partagé. Toute erreur devient un échec de
 * HANDSHAKE (déclencheur du repli legacy) ; un respawn invalide les états
 * par-session du provider (sessions ouvertes, modèle). */
async function ensureAcpServer() {
  try {
    await acpClient.ensure();
  } catch (e) {
    throw e?.acpHandshakeFailure ? e : acpHandshakeFailure(String(e?.message ?? e));
  }
  const generation = acpClient.generation();
  if (generation !== acpKnownGeneration) {
    acpKnownGeneration = generation;
    acpLoadedSessions.clear();
    acpSessionModel.clear();
  }
  return acpClient;
}

export function stopAcpServer() {
  acpClient.stop("opencode acp arrêté");
  acpLoadedSessions.clear();
  acpSessionModel.clear();
}

// --- Mapping session/update -> kinds Atelier (formes ACP standard) ----------

// Helpers tool_call partagés : acp_common.mjs (paramétrés par source —
// plan 046). Les wrappers gardent la signature historique d'opencode.
const opencodeToolCall = (update, toolMetaCache) => acpToolCall(update, toolMetaCache, "opencode");
const opencodeToolCallUpdate = (update, toolMetaCache) =>
  acpToolCallUpdate(update, toolMetaCache, "opencode");
const opencodeEdits = (update, seenEdits) => acpEdits(update, seenEdits);

/** Mapping `sessionUpdate` ACP standard -> kind(s) Atelier. `ctx` porte l'état
 * mémoire du tour ({toolMeta: Map, seenEdits: Set, lastUsageUpdate}) — sans
 * lui, chaque appel reste une pure fonction d'un seul update. Tout kind non
 * listé est ignoré silencieusement (tolérance aux évolutions du CLI). */
export function mapOpencodeSessionUpdate(update, ctx = {}) {
  switch (update?.sessionUpdate) {
    case "agent_thought_chunk":
      return [{ kind: "thinking_delta", text: String(update.content?.text ?? "") }];
    case "agent_message_chunk":
      return [{ kind: "delta", text: String(update.content?.text ?? "") }];
    case "tool_call":
      return [opencodeToolCall(update, ctx.toolMeta)];
    case "tool_call_update":
      return [opencodeToolCallUpdate(update, ctx.toolMeta), ...opencodeEdits(update, ctx.seenEdits)];
    case "usage_update":
      // Absorbé dans le ctx, fusionné dans le done final — ne JAMAIS ré-émettre
      // (event fréquent => gonflement du journal, piège __ephemeral documenté).
      ctx.lastUsageUpdate = update;
      return [];
    // ignorés explicitement (bruit de gestion de session) :
    case "user_message_chunk":
    case "available_commands_update":
    case "current_mode_update":
    case "session_summary_generated":
      return [];
    default:
      return []; // update inconnue -> ignorée silencieusement
  }
}

/** Fin de tour (réponse `session/prompt`) -> event `done`. `ok:true` couvre
 * `cancelled` (interruption utilisateur = succès). Usage fusionné : tokens de
 * la réponse prompt + window/cost du dernier usage_update (sonde 2026-07-16 :
 * usage inline {inputTokens,outputTokens,totalTokens,…} et usage_update
 * {used,size,cost:{amount}}). */
export function mapOpencodePromptResult(result, ctx = {}) {
  const stopReason = result?.stopReason ?? null;
  const ok = stopReason === "end_turn" || stopReason === "cancelled";
  const usage = result?.usage ?? {};
  const uu = ctx.lastUsageUpdate ?? {};
  const context = Number.isFinite(usage.totalTokens)
    ? usage.totalTokens
    : (Number.isFinite(uu.used) ? uu.used : 0);
  return {
    kind: "done",
    ok,
    result: "",
    usage: {
      context,
      output: Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0,
      cost: Number.isFinite(uu.cost?.amount) ? uu.cost.amount : null,
      turns: null,
      window: Number.isFinite(uu.size) ? uu.size : null,
    },
  };
}

// --- Sessions, modèle, tour --------------------------------------------------

function currentModelOf(result) {
  const options = result?.configOptions;
  if (!Array.isArray(options)) return undefined;
  const model = options.find((o) => o?.category === "model");
  return typeof model?.currentValue === "string" ? model.currentValue : undefined;
}

/** session/load si sessionId connu (repli session/new si refusé avec process
 * vivant — thread déplacé/cwd différent, même règle qu'openGrokSession), sinon
 * session/new. Le handler du tour n'est attaché qu'APRÈS résolution : les
 * replays d'historique de session/load tombent dans le vide (voulu). */
async function openOpencodeSession(srv, { sessionId, cwd }) {
  if (sessionId && acpLoadedSessions.has(sessionId)) {
    return { sessionId };
  }
  if (sessionId) {
    try {
      const result = await withAcpTimeout(
        srv.request("session/load", { sessionId, cwd, mcpServers: [] }),
        "session/load",
        ACP_OPEN_TIMEOUT_MS,
      );
      acpLoadedSessions.add(sessionId);
      const m = currentModelOf(result);
      if (m) acpSessionModel.set(sessionId, m);
      return { sessionId };
    } catch (e) {
      if (!acpClient.isAlive()) throw e;
      console.warn(`[opencode] session/load refusé (${sessionId}), repli session/new:`, e?.message ?? e);
    }
  }
  const result = await withAcpTimeout(
    srv.request("session/new", { cwd, mcpServers: [] }),
    "session/new",
    ACP_OPEN_TIMEOUT_MS,
  );
  const sid = result?.sessionId;
  if (!sid) throw acpHandshakeFailure("session/new sans sessionId");
  acpLoadedSessions.add(sid);
  const m = currentModelOf(result);
  if (m) acpSessionModel.set(sid, m);
  return { sessionId: sid };
}

/** Alignement modèle best-effort — `modelId` = chaîne catalogue telle quelle
 * (`provider/model`, vérifié par sonde) ; un refus n'interrompt jamais le tour.
 * (effort : pas d'équivalent ACP, le repli legacy garde --variant.) */
async function alignOpencodeModel(srv, sessionId, model) {
  if (!model || acpSessionModel.get(sessionId) === model) return;
  try {
    // borné : un serveur vivant mais muet ne doit pas bloquer le tour avant
    // même l'enregistrement d'activeTurns (le tour serait ininterrompable)
    await withAcpTimeout(
      srv.request("session/set_model", { sessionId, modelId: model }),
      "session/set_model",
      10000,
    );
    acpSessionModel.set(sessionId, model);
  } catch (e) {
    console.warn(`[opencode] session/set_model(${model}) refusé, ignoré (best-effort):`, e?.message ?? e);
  }
}

/** `session/cancel` est une NOTIFICATION — le `session/prompt` en cours se
 * résout ensuite avec `stopReason:"cancelled"`. Découvert par le router
 * (router.mjs, case "interrupt"). */
export async function interrupt(threadId) {
  const sid = acpActiveTurns.get(threadId);
  if (!sid || !acpClient.isAlive()) return;
  acpClient.notify("session/cancel", { sessionId: sid });
}

async function runAcp({ threadId, cwd, prompt, sessionId, model, timeoutMs, onEvent }) {
  const workDir = cwd || process.env.HOME || process.cwd();
  let srv;
  let sid;
  try {
    srv = await ensureAcpServer();
    ({ sessionId: sid } = await openOpencodeSession(srv, { sessionId, cwd: workDir }));
  } catch (e) {
    throw e?.acpHandshakeFailure ? e : acpHandshakeFailure(String(e?.message ?? e));
  }

  await alignOpencodeModel(srv, sid, model || undefined);

  // transcript local du tour (texte + raisonnement) — même persistance que le
  // chemin legacy, y compris partiel après interruption
  const recorder = makeTranscriptRecorder(prompt);
  const ctx = { toolMeta: new Map(), seenEdits: new Set(), lastUsageUpdate: null };
  const emitter = makeTurnEmitter((ev) => {
    recorder.absorb(ev);
    onEvent?.(ev);
  });

  const handler = (update) => {
    for (const ev of mapOpencodeSessionUpdate(update, ctx)) emitter.emit(ev);
  };
  acpClient.setSessionHandler(sid, handler);
  const turnKey = threadId ?? sid;
  acpActiveTurns.set(turnKey, sid);

  const timer = timeoutMs
    ? setTimeout(() => { interrupt(turnKey).catch(() => {}); }, timeoutMs)
    : null;

  try {
    const result = await srv.request("session/prompt", {
      sessionId: sid,
      prompt: [{ type: "text", text: buildPrompt(prompt) }],
    });
    emitter.flush();
    onEvent?.(mapOpencodePromptResult(result, ctx));
  } catch (e) {
    emitter.flush();
    onEvent?.({ kind: "error", message: String(e?.message ?? e) });
  } finally {
    if (timer) clearTimeout(timer);
    recorder.persist(sid);
    acpClient.clearSessionHandler(sid);
    acpActiveTurns.delete(turnKey);
  }
  return { sessionId: sid };
}

export async function run(opts) {
  try {
    return await runAcp(opts);
  } catch (e) {
    if (!e?.acpHandshakeFailure) throw e;
    console.warn("[opencode] handshake ACP échoué, repli run one-shot:", e.message);
    return runLegacy(opts);
  }
}
