// Kimi Code provider — client ACP natif du CLI officiel (plan 046).
// Miroir Node de rust/crates/atelier-providers/src/kimi.rs + kimi_map.rs :
// même fixture de test (fake_kimi_acp.mjs), même mapping d'optionId, mêmes
// erreurs actionnables, même limite image. AUCUN repli vers un autre harnais.
//
// Contrat wire vérifié le 2026-07-16 contre le binaire 0.26.0 installé et le
// tag officiel @moonshot-ai/kimi-code@0.26.0 : configOptions [model,
// thinking?, mode], permissions approve_once/approve_always/reject, plan
// review plan_*, questions q0_*, session/prompt → {stopReason} seul.

import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { resolveBin } from "../bin_resolver.mjs";
import {
  acpEdits,
  acpToolCall,
  acpToolCallUpdate,
  makeTurnEmitter,
} from "./acp_common.mjs";
import { makeAcpClient } from "./acp_client.mjs";

const KIMI_HANDSHAKE_TIMEOUT_MS = 10000;
const KIMI_OPEN_TIMEOUT_MS = 30000;
const KIMI_CONFIG_TIMEOUT_MS = 15000;
/** Limite documentée d'une image envoyée à Kimi (octets sur disque). */
export const KIMI_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Version CLI minimale supportée (plan 046, décision 2). */
export const KIMI_MIN_VERSION = "0.26.0";

// ---------------------------------------------------------------------------
// Binaire
// ---------------------------------------------------------------------------

/** Résolution du binaire (plan 046 étape 4) : ATELIER_KIMI_BIN → PATH →
 * ~/.kimi-code/bin/kimi → chemins Homebrew usuels en dernier recours. */
export function resolveKimiBin() {
  const envBin = process.env.ATELIER_KIMI_BIN;
  if (envBin && existsSync(envBin)) return envBin;
  const found = resolveBin("kimi");
  if (found) return found;
  const official = join(homedir(), ".kimi-code", "bin", "kimi");
  if (existsSync(official)) return official;
  for (const p of ["/opt/homebrew/bin/kimi", "/usr/local/bin/kimi"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** L'installation officielle ~/.kimi-code existe mais un AUTRE binaire la
 * masque — le Setup le signale (plan 046 étape 4). */
export function shadowedOfficialInstall(resolved) {
  if (!resolved) return null;
  const official = join(homedir(), ".kimi-code", "bin", "kimi");
  if (!existsSync(official)) return null;
  try {
    if (realpathSync(resolved) === realpathSync(official)) return null;
  } catch {
    if (resolved === official) return null;
  }
  return official;
}

// ---------------------------------------------------------------------------
// Client ACP partagé (aucune politique par défaut : les permissions passent
// par le handler PAR SESSION du tour ; sans lui ⇒ cancelled, jamais approuvé)
// ---------------------------------------------------------------------------

const client = makeAcpClient({
  label: "kimi",
  binPath: () => resolveKimiBin() ?? "kimi",
  args: ["acp"],
  initParams: {
    protocolVersion: 1,
    clientCapabilities: {
      // Décisions 4/5 : filesystem et terminal ACP désactivés — Kimi utilise
      // ses vrais outils locaux (LocalKaos).
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
  },
  onServerRequest: null,
  handshakeTimeoutMs: KIMI_HANDSHAKE_TIMEOUT_MS,
});

// État provider, invalidé quand la génération du client change.
const loadedSessions = new Set(); // sessions ouvertes (new/resume/load) dans CE process
const invalidSessions = new Set(); // -32602 au resume : prochain tour ⇒ session/new
const configSnapshots = new Map(); // sessionId -> configOptions (source de vérité)
const commandsCatalog = new Map(); // sessionId -> availableCommands (éphémère)
const activeTurns = new Map(); // clé de tour -> sessionId
let knownGeneration = 0;

function syncGeneration() {
  const generation = client.generation();
  if (generation !== knownGeneration) {
    knownGeneration = generation;
    loadedSessions.clear();
    invalidSessions.clear();
    configSnapshots.clear();
    commandsCatalog.clear();
  }
}

/** Message utilisateur actionnable — jamais de repli (décision 1). */
export function kimiUserError(e) {
  if (e?.code === -32000) {
    return "Connexion Kimi requise — exécute `kimi login` dans un terminal, puis renvoie ton message (Réglages → Providers → Kimi Code).";
  }
  if (e?.transport) return `Kimi ACP injoignable : ${e.message}`;
  return `Kimi ACP : ${e?.message ?? e}`;
}

async function ensureKimi() {
  const init = await client.ensure();
  syncGeneration();
  if ((init?.protocolVersion ?? 0) !== 1) {
    throw new Error(
      `Kimi ACP annonce protocolVersion ${init?.protocolVersion} (attendu 1) — intégration à mettre à jour avant tout envoi.`,
    );
  }
  const name = init?.agentInfo?.name;
  if (name && name !== "Kimi Code CLI") {
    console.warn(`[kimi] agentInfo.name inattendu: ${name}`);
  }
  return init;
}

// ---------------------------------------------------------------------------
// Mappings purs (miroir kimi_map.rs) — testés par kimi_acp.test.mjs
// ---------------------------------------------------------------------------

/** Mapping verrouillé des modes Atelier → Kimi (décision 9). */
export function mapKimiPermissionMode(mode) {
  return { default: "default", plan: "plan", acceptEdits: "auto", bypassPermissions: "yolo" }[mode] ?? null;
}

/** Effort Atelier → option thinking Kimi (off/on seulement, décision 10).
 * Retour : null = ne pas toucher ; "off"/"on" = aligner ; throw = invalide. */
export function mapKimiThinking(effort) {
  if (!effort) return null;
  if (effort === "on") return "on";
  if (effort === "off" || effort === "none") return "off";
  throw new Error(`thinking Kimi = off/on uniquement (reçu « ${effort} »)`);
}

const KNOWN_SILENT_UPDATES = new Set([
  "user_message_chunk",
  "session_info_update",
  "plan_update",
  "plan_removed",
  "current_mode_update",
]);

/** `plan.entries` → items du singleton todos Atelier. */
function kimiTodos(update) {
  const items = (update?.entries ?? []).map((e) => ({
    text: String(e?.content ?? ""),
    completed: e?.status === "completed",
    active: e?.status === "in_progress",
  }));
  return { kind: "todos", items };
}

/** `session/update` Kimi → 0..n events transcript Atelier.
 * config_option_update / available_commands_update ⇒ [] (état éphémère
 * consommé par le provider, jamais le journal). Inconnu ⇒ [] + trace bornée. */
export function mapKimiSessionUpdate(update, ctx = {}) {
  switch (update?.sessionUpdate) {
    case "agent_thought_chunk":
      return [{ kind: "thinking_delta", text: String(update.content?.text ?? "") }];
    case "agent_message_chunk":
      return [{ kind: "delta", text: String(update.content?.text ?? "") }];
    case "tool_call":
      return [acpToolCall(update, ctx.toolMeta, "kimi")];
    case "tool_call_update":
      return [acpToolCallUpdate(update, ctx.toolMeta, "kimi"), ...acpEdits(update, ctx.seenEdits)];
    case "plan":
      return [kimiTodos(update)];
    case "config_option_update":
    case "available_commands_update":
      return [];
    case "usage_update":
      // Hors contrat 0.26 (jamais émis) — absorbé par tolérance.
      ctx.lastUsageUpdate = update;
      return [];
    default: {
      const kind = update?.sessionUpdate;
      if (kind && !KNOWN_SILENT_UPDATES.has(kind)) {
        console.warn(`[kimi] session/update inconnue ignorée: ${String(kind).slice(0, 64)}`);
      }
      return [];
    }
  }
}

/** Réponse session/prompt → done. `ok` couvre end_turn ET cancelled. La clé
 * `usage` n'existe QUE si Kimi a fourni un usage réel (contrat 0.26 :
 * {stopReason} seul ⇒ pas de clé, aucun compteur synthétique — décision 12). */
export function mapKimiPromptResult(result, ctx = {}) {
  const stopReason = result?.stopReason ?? null;
  const ok = stopReason === "end_turn" || stopReason === "cancelled";
  const done = { kind: "done", ok, result: "" };
  const usage = result?.usage;
  if (usage && typeof usage === "object") {
    const uu = ctx.lastUsageUpdate ?? {};
    done.usage = {
      context: Number.isFinite(usage.totalTokens) ? usage.totalTokens : 0,
      output: Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0,
      cost: Number.isFinite(uu.cost?.amount) ? uu.cost.amount : null,
      turns: null,
      window: Number.isFinite(uu.size) ? uu.size : null,
    };
  }
  return done;
}

// ---------------------------------------------------------------------------
// Permissions : spec d'interaction + outcome (miroir send.rs / kimi.rs)
// ---------------------------------------------------------------------------

function isQuestionOptionId(id) {
  if (typeof id !== "string" || !id.startsWith("q")) return false;
  const rest = id.slice(1);
  const sep = rest.indexOf("_");
  if (sep <= 0) return false;
  const n = rest.slice(0, sep);
  const tail = rest.slice(sep + 1);
  return /^\d+$/.test(n) && (tail === "skip" || tail.startsWith("opt_"));
}

/** `session/request_permission` → spec d'interaction Atelier (plan 046 é5) :
 * AskUserQuestion ⇒ user_input à UNE question, options {label, value:id
 * opaque}, Skip exclu (le bouton Annuler couvre la dismissal) ; sinon
 * approval avec choices[] dans l'ordre EXACT. Sans options ⇒ null (refus sûr). */
export function describeKimiPermission(params) {
  const options = params?.options;
  if (!Array.isArray(options) || options.length === 0) return null;
  const title = params?.toolCall?.title || "Permission";
  const detail = (params?.toolCall?.content ?? [])
    .map((c) => (typeof c?.content?.text === "string" ? c.content.text : c?.path || ""))
    .filter(Boolean)
    .join(" · ")
    .slice(0, 400);

  const allQuestionIds = options.every((o) => isQuestionOptionId(o?.optionId));
  if (title === "AskUserQuestion" || allQuestionIds) {
    const fieldOptions = options
      .filter((o) => o?.kind !== "reject_once" && o?.kind !== "reject_always")
      .map((o) => ({ label: String(o?.name ?? "?"), value: o?.optionId }));
    return {
      interactionType: "user_input",
      title: "Kimi — question",
      fields: [
        {
          id: "q0",
          question: detail || title,
          options: fieldOptions,
          allowOther: false,
          secret: false,
        },
      ],
    };
  }

  return {
    interactionType: "approval",
    title,
    ...(detail ? { detail } : {}),
    choices: options.map((o) => ({
      optionId: o?.optionId,
      label: String(o?.name ?? "?"),
      kind: o?.kind,
    })),
  };
}

/** Réponse UI (ou absence) → outcome ACP. optionId OPAQUE ; absence d'UI,
 * timeout, fermeture ou option inconnue ⇒ cancelled — jamais d'approbation
 * implicite (plan 046 étape 5). */
export function kimiPermissionOutcome(params, answer) {
  const cancelled = { outcome: { outcome: "cancelled" } };
  const optionIds = (params?.options ?? []).map((o) => o?.optionId).filter((v) => v != null);
  if (!answer || typeof answer !== "object") return cancelled;

  if (typeof answer.optionId === "string") {
    if (optionIds.includes(answer.optionId)) {
      return { outcome: { outcome: "selected", optionId: answer.optionId } };
    }
    console.warn(`[kimi] optionId inconnu renvoyé par l'UI, cancelled: ${answer.optionId.slice(0, 64)}`);
    return cancelled;
  }
  if (answer.answers && typeof answer.answers === "object") {
    const value = Object.values(answer.answers).find((v) => typeof v === "string" && v);
    if (value && optionIds.includes(value)) {
      return { outcome: { outcome: "selected", optionId: value } };
    }
    return cancelled;
  }
  if (typeof answer.allow === "boolean") {
    const target = answer.allow
      ? answer.scope === "session" && optionIds.includes("approve_always")
        ? "approve_always"
        : "approve_once"
      : "reject";
    if (optionIds.includes(target)) {
      return { outcome: { outcome: "selected", optionId: target } };
    }
    return cancelled;
  }
  return cancelled;
}

// ---------------------------------------------------------------------------
// Images, inputs et resources (miroir kimi.rs, mêmes limites)
// ---------------------------------------------------------------------------

const IMAGE_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/** Image locale → {type:"image", data, mimeType}. Erreurs NOMMÉES (jamais le
 * base64) : extension, taille (max 5 Mo), lisibilité. */
export function kimiImageBlock(path) {
  const mime = IMAGE_MIME[extname(String(path)).toLowerCase()];
  if (!mime) {
    throw new Error(`extension d'image non supportée pour Kimi « ${path} » (png/jpg/jpeg/gif/webp).`);
  }
  let size;
  try {
    size = statSync(path).size;
  } catch (e) {
    throw new Error(`image illisible « ${path} » : ${e?.message ?? e}`);
  }
  if (size > KIMI_IMAGE_MAX_BYTES) {
    throw new Error(`image « ${path} » trop volumineuse (${size} octets, max ${KIMI_IMAGE_MAX_BYTES}).`);
  }
  const data = readFileSync(path).toString("base64");
  return { type: "image", data, mimeType: mime };
}

/** Inputs structurés Atelier → content blocks Kimi. Input invalide ⇒ throw
 * AVANT le prompt (jamais de drop silencieux) ; skills/mentions ⇒
 * resource_link file:// que le harnais Kimi résout localement. */
export function buildKimiPromptBlocks(prompt, inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return [{ type: "text", text: String(prompt ?? "") }];
  }
  const blocks = [];
  let hasText = false;
  for (const input of inputs) {
    switch (input?.type) {
      case "text":
        hasText = true;
        blocks.push({ type: "text", text: String(input.text ?? "") });
        break;
      case "local_image":
        if (!input.path) throw new Error("input image sans chemin");
        blocks.push(kimiImageBlock(input.path));
        break;
      case "skill":
      case "mention": {
        const path = input.path ?? "";
        const name = input.name ?? path;
        if (!path) throw new Error(`input « ${name} » sans chemin pour Kimi.`);
        blocks.push({ type: "resource_link", uri: `file://${path}`, name });
        break;
      }
      default:
        throw new Error(`type d'input non supporté pour Kimi : « ${String(input?.type).slice(0, 32)} ».`);
    }
  }
  if (!hasText) blocks.unshift({ type: "text", text: String(prompt ?? "") });
  return blocks;
}

// ---------------------------------------------------------------------------
// Sessions et configuration
// ---------------------------------------------------------------------------

function rememberSnapshot(sid, result) {
  if (Array.isArray(result?.configOptions)) configSnapshots.set(sid, result.configOptions);
}

function findConfigOption(sid, configId) {
  return (configSnapshots.get(sid) ?? []).find((o) => o?.id === configId) ?? null;
}

function optionValues(option) {
  const out = [];
  for (const item of option?.options ?? []) {
    if (typeof item?.value === "string") out.push(item.value);
    else for (const o of item?.options ?? []) if (typeof o?.value === "string") out.push(o.value);
  }
  return out;
}

/** session/new sans sessionId ; session/resume pour un thread Atelier déjà
 * journalisé (décision 11 — jamais de replay ici). -32602 ⇒ erreur
 * actionnable, le PROCHAIN tour créera une session neuve. */
async function openKimiSession({ sessionId, cwd }) {
  const requested = sessionId && !invalidSessions.has(sessionId) ? sessionId : null;
  if (requested) {
    if (loadedSessions.has(requested)) return requested;
    try {
      const result = await client.request(
        "session/resume",
        { sessionId: requested, cwd, mcpServers: [] },
        KIMI_OPEN_TIMEOUT_MS,
      );
      loadedSessions.add(requested);
      rememberSnapshot(requested, result);
      return requested;
    } catch (e) {
      if (e?.code === -32602) {
        invalidSessions.add(requested);
        throw new Error(
          `La session Kimi ${requested} n'existe plus côté CLI — renvoie ton message pour démarrer une nouvelle session Kimi.`,
        );
      }
      throw new Error(kimiUserError(e));
    }
  }
  let result;
  try {
    result = await client.request("session/new", { cwd, mcpServers: [] }, KIMI_OPEN_TIMEOUT_MS);
  } catch (e) {
    throw new Error(kimiUserError(e));
  }
  const sid = result?.sessionId;
  if (!sid) throw new Error("session/new sans sessionId");
  loadedSessions.add(sid);
  rememberSnapshot(sid, result);
  return sid;
}

/** Aligne UN axe via session/set_config_option — un refus N'EST PAS
 * best-effort : le tour s'arrête (plan 046 étape 6). */
async function alignAxis(sid, configId, target) {
  const option = findConfigOption(sid, configId);
  if (!option) {
    if (configId === "thinking" && target === "off") return; // déjà sémantiquement off
    throw new Error(`Kimi n'expose pas le réglage « ${configId} » pour la session/le modèle actif.`);
  }
  if (option.currentValue === target) return;
  const values = optionValues(option);
  if (!values.includes(target)) {
    throw new Error(
      `« ${target} » n'est pas proposé par Kimi pour « ${configId} » (choix: ${values.join(", ")}).`,
    );
  }
  let result;
  try {
    result = await client.request(
      "session/set_config_option",
      { sessionId: sid, configId, value: target },
      KIMI_CONFIG_TIMEOUT_MS,
    );
  } catch (e) {
    throw new Error(`Kimi a refusé ${configId}=${target} : ${kimiUserError(e)}`);
  }
  // Le snapshot retourné est la source de vérité (contrat 0.26).
  rememberSnapshot(sid, result);
  const now = findConfigOption(sid, configId)?.currentValue;
  if (now !== target) {
    throw new Error(`Kimi a refusé ${configId}=${target} (valeur effective: ${now ?? "inconnue"}).`);
  }
}

/** Alignement modèle → thinking → mode (ordre du plan). */
async function alignConfig(sid, { model, effort, permissionMode }) {
  if (model) await alignAxis(sid, "model", model);
  const thinking = mapKimiThinking(effort ?? "");
  if (thinking) await alignAxis(sid, "thinking", thinking);
  if (permissionMode) {
    const kimiMode = mapKimiPermissionMode(permissionMode);
    if (!kimiMode) throw new Error(`mode Atelier inconnu pour Kimi : ${permissionMode}`);
    await alignAxis(sid, "mode", kimiMode);
  }
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

/** Entrée principale (router.mjs startProviderTurn). Erreur AVANT le prompt
 * (auth, session disparue, config refusée, image invalide) ⇒ throw — le
 * router en fait un event error, JAMAIS un repli sur un autre harnais. */
export async function run({
  threadId,
  cwd,
  prompt,
  inputs,
  sessionId,
  model,
  effort,
  permissionMode,
  onInteraction,
  onEvent,
}) {
  const workDir = cwd || process.env.HOME || process.cwd();
  let init;
  try {
    init = await ensureKimi();
  } catch (e) {
    throw new Error(kimiUserError(e));
  }

  // Inputs validés AVANT toute session/prompt (plan 046 étape 7).
  const blocks = buildKimiPromptBlocks(prompt, inputs);
  if (
    blocks.some((b) => b.type === "image") &&
    init?.agentCapabilities?.promptCapabilities?.image !== true
  ) {
    throw new Error("Kimi n'annonce pas la capacité image (promptCapabilities.image).");
  }

  const sid = await openKimiSession({ sessionId, cwd: workDir });
  await alignConfig(sid, { model, effort, permissionMode });

  const ctx = { toolMeta: new Map(), seenEdits: new Set(), lastUsageUpdate: null };
  const emitter = makeTurnEmitter((ev) => onEvent?.(ev));
  client.setSessionHandler(sid, (update) => {
    // États éphémères consommés ici — jamais le transcript.
    if (update?.sessionUpdate === "config_option_update" && Array.isArray(update.configOptions)) {
      configSnapshots.set(sid, update.configOptions);
    }
    if (update?.sessionUpdate === "available_commands_update" && Array.isArray(update.availableCommands)) {
      commandsCatalog.set(sid, update.availableCommands);
    }
    for (const ev of mapKimiSessionUpdate(update, ctx)) emitter.emit(ev);
  });
  client.setSessionServerHandler(sid, async (method, params) => {
    if (method !== "session/request_permission") return null; // ⇒ -32601
    const spec = describeKimiPermission(params);
    const answer = spec && onInteraction ? await onInteraction(spec) : null;
    return kimiPermissionOutcome(params, answer);
  });
  const turnKey = threadId ?? sid;
  activeTurns.set(turnKey, sid);

  try {
    const result = await client.request("session/prompt", { sessionId: sid, prompt: blocks });
    emitter.flush();
    onEvent?.(mapKimiPromptResult(result, ctx));
  } catch (e) {
    emitter.flush();
    onEvent?.({ kind: "error", message: kimiUserError(e) });
  } finally {
    client.clearSessionHandler(sid);
    client.clearSessionServerHandler(sid);
    activeTurns.delete(turnKey);
  }
  return { sessionId: sid };
}

/** `session/cancel` est une NOTIFICATION — le session/prompt en cours se
 * résout ensuite avec stopReason:"cancelled". */
export async function interrupt(threadId) {
  const sid = activeTurns.get(threadId);
  if (!sid || !client.isAlive()) return;
  client.notify("session/cancel", { sessionId: sid });
}

export function stopAcpServer() {
  client.stop("kimi acp arrêté");
  loadedSessions.clear();
  invalidSessions.clear();
  configSnapshots.clear();
  commandsCatalog.clear();
}

// ---------------------------------------------------------------------------
// Sessions natives et historique (plan 046 étape 8)
// ---------------------------------------------------------------------------

function iso8601ToEpochMs(s) {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Listing natif session/list {cwd} — jamais le parser de fichiers Codex. */
export async function listSessions(projectRoot) {
  try {
    await ensureKimi();
  } catch {
    return [];
  }
  let result;
  try {
    result = await client.request(
      "session/list",
      projectRoot ? { cwd: projectRoot } : {},
      KIMI_CONFIG_TIMEOUT_MS,
    );
  } catch {
    return [];
  }
  return (result?.sessions ?? []).map((s) => {
    const sid = String(s?.sessionId ?? "");
    const title = typeof s?.title === "string" && s.title ? s.title : sid.slice(0, 16);
    return {
      id: sid,
      title,
      // updatedAt invalide toléré : 0 (affichage epoch, pas de crash)
      mtime: iso8601ToEpochMs(s?.updatedAt) ?? 0,
      projectRoot: typeof s?.cwd === "string" ? s.cwd : "",
    };
  });
}

/** Replay capturé de session/load → events d'historique Atelier (coalescés). */
export function replayToHistory(updates) {
  const events = [];
  const ctx = { toolMeta: new Map(), seenEdits: new Set(), lastUsageUpdate: null };
  let user = "";
  let think = "";
  let text = "";
  const flush = (kind) => {
    if (kind === "user" && user) {
      events.push({ kind: "user", text: user });
      user = "";
    }
    if (kind === "thinking" && think) {
      events.push({ kind: "thinking", text: think });
      think = "";
    }
    if (kind === "text" && text) {
      events.push({ kind: "text", text });
      text = "";
    }
  };
  const flushAll = () => {
    flush("user");
    flush("thinking");
    flush("text");
  };
  for (const u of updates) {
    switch (u?.sessionUpdate) {
      case "user_message_chunk":
        flush("thinking");
        flush("text");
        user += String(u.content?.text ?? "");
        break;
      case "agent_thought_chunk":
        flush("user");
        flush("text");
        think += String(u.content?.text ?? "");
        break;
      case "agent_message_chunk":
        flush("user");
        flush("thinking");
        text += String(u.content?.text ?? "");
        break;
      case "tool_call":
      case "tool_call_update":
        flushAll();
        events.push(...mapKimiSessionUpdate(u, ctx));
        break;
      default:
        break;
    }
  }
  flushAll();
  return events;
}

/** Import d'une session Kimi externe : session/load rejoue AVANT la réponse ;
 * capturé UNE fois par génération (la session devient ouverte — le prochain
 * prompt réutilise le même sessionId sans re-replay). */
export async function history(sessionId, projectRoot) {
  if (!sessionId) return [];
  try {
    await ensureKimi();
  } catch {
    return [];
  }
  if (loadedSessions.has(sessionId)) return []; // déjà importée : journal Atelier
  const captured = [];
  client.setSessionHandler(sessionId, (update) => captured.push(update));
  try {
    const result = await client.request(
      "session/load",
      { sessionId, cwd: projectRoot || process.env.HOME || process.cwd(), mcpServers: [] },
      KIMI_OPEN_TIMEOUT_MS,
    );
    loadedSessions.add(sessionId);
    rememberSnapshot(sessionId, result);
    // La réponse n'est traitée qu'ici — tous les updates de replay sont arrivés.
    return replayToHistory(captured);
  } catch {
    return [];
  } finally {
    client.clearSessionHandler(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Setup et catalogue dynamique (plan 046 étapes 6/10)
// ---------------------------------------------------------------------------

function execFileText(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}

/** Compare deux versions a.b.c ; négatif si a < b. */
export function compareKimiVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Catalogue modèles SANS quota ni prompt : `kimi provider list --json`
 * (vide tant qu'aucun provider Kimi n'est configuré). */
export async function listModels(timeoutMs = 3500) {
  const bin = resolveKimiBin();
  if (!bin) return { models: [], defaultModel: "" };
  const out = await execFileText(bin, ["provider", "list", "--json"], timeoutMs);
  const parsed = JSON.parse(out);
  const models = Object.keys(parsed?.models ?? {});
  return { models, defaultModel: models[0] ?? "" };
}

/** Catalogue courant pour providerStatus : discovery CLI + dernier snapshot
 * configOptions (source de vérité quand une session est ouverte). Le
 * modelReasoning n'expose off/on QUE pour les modèles dont Kimi a confirmé
 * le thinking (option présente dans le snapshot). */
let lastDiscoveredModels = [];
export function cachedKimiCatalog() {
  const models = new Set(lastDiscoveredModels);
  const modelReasoning = {};
  for (const snapshot of configSnapshots.values()) {
    const modelOption = snapshot.find((o) => o?.id === "model");
    for (const v of optionValues(modelOption ?? {})) models.add(v);
    const current = modelOption?.currentValue;
    const thinking = snapshot.find((o) => o?.id === "thinking");
    if (current && thinking) {
      modelReasoning[current] = { supported_efforts: ["off", "on"], default_effort: thinking.currentValue ?? "on" };
    }
  }
  return { models: [...models], modelReasoning };
}

/** Dérivation PURE de l'état Setup (testée exhaustivement). */
export function deriveKimiSetupState({ binPath, version, protocolOk, authRequired, probeError, modelCount }) {
  if (!binPath) return "not_installed";
  if (version && compareKimiVersions(version, KIMI_MIN_VERSION) < 0) return "version_unsupported";
  if (probeError) return "protocol_error";
  if (protocolOk === false) return "protocol_error";
  if (authRequired) return "login_needed";
  if (!modelCount) return "model_config_needed";
  return "ready";
}

/** Sonde Setup SANS quota (plan 046 étape 10) : binaire → --version →
 * initialize → authenticate(login) → discovery modèles. JAMAIS session/prompt.
 * `overrides` injecte les dépendances pour les tests. */
export async function setupProbe(overrides = {}) {
  const bin = overrides.binPath ?? resolveKimiBin();
  if (!bin) return { state: "not_installed", binPath: null, version: null, models: 0 };
  let version = overrides.version ?? null;
  if (version == null) {
    try {
      version = (await execFileText(bin, ["--version"], 8000)).trim();
    } catch {
      version = null;
    }
  }
  const base = {
    binPath: bin,
    version,
    shadowed: shadowedOfficialInstall(bin),
    loginCommand: "kimi login",
  };
  if (version && compareKimiVersions(version, KIMI_MIN_VERSION) < 0) {
    return { ...base, state: "version_unsupported", models: 0 };
  }
  let init;
  try {
    init = overrides.init ?? (await ensureKimi());
  } catch (e) {
    return { ...base, state: "protocol_error", models: 0, error: String(e?.message ?? e) };
  }
  const protocolOk =
    (init?.protocolVersion ?? 0) === 1 &&
    (init?.agentInfo?.name == null || init.agentInfo.name === "Kimi Code CLI");
  if (!protocolOk) {
    return { ...base, state: "protocol_error", models: 0, error: "handshake inattendu" };
  }
  // La commande de login vient d'authMethods (jamais codée en dur quand annoncée).
  const method = (init?.authMethods ?? []).find((m) => m?.id === "login");
  const terminalAuth = method?._meta?.["terminal-auth"];
  if (terminalAuth?.command) {
    base.loginCommand = [terminalAuth.command, ...(terminalAuth.args ?? [])].join(" ");
  }
  try {
    if (overrides.authenticate) await overrides.authenticate();
    else await client.request("authenticate", { methodId: "login" }, 10000);
  } catch (e) {
    if (e?.code === -32000) return { ...base, state: "login_needed", models: 0 };
    return { ...base, state: "protocol_error", models: 0, error: String(e?.message ?? e) };
  }
  let models = [];
  try {
    ({ models } = overrides.listModels ? await overrides.listModels() : await listModels());
  } catch {
    models = [];
  }
  lastDiscoveredModels = models;
  if (!models.length) return { ...base, state: "model_config_needed", models: 0 };
  return { ...base, state: "ready", models: models.length };
}
