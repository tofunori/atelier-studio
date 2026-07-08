import { execFile, spawn } from "node:child_process";
import { accessSync, constants as fsConstants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBin } from "../bin_resolver.mjs";

// Provider Grok — deux chemins :
//  1) ACP (`grok agent stdio`, process persistant JSON-RPC) : chemin principal,
//     parité Codex (cartes d'outils live, diffs, usage réel, Stop, resume).
//  2) Ancien pont one-shot (`grok -p … --output-format streaming-json`) :
//     conservé en repli si le handshake ACP échoue (binaire trop vieux, crash…).
//
// Sondes empiriques 2026-07-08 (grok CLI 0.2.91) — scratchpad grok-stdio-probe/
// run3.log (tour avec tool_call + diff), run4.log (cancel + queue), et
// grok-acp-verify/probe_setmode.py + probe_load.py (sondes protocolaires
// complémentaires, sans appel modèle) :
//
// - `grok agent stdio` parle ACP (JSON-RPC 2.0 **newline-delimited**, pas de
//   Content-Length). Handshake : initialize -> session/new|load -> session/prompt.
// - fs/terminal capabilities déclarées `false` à l'initialize : vérifié que
//   c'est nécessaire, pas juste une préférence — avec `readTextFile:true`
//   (run3.log), le moteur envoie une requête serveur→client `fs/read_text_file`
//   après l'écriture d'un fichier ; comme notre sonde ne répondait pas, le
//   `session/prompt` en cours n'a JAMAIS résolu (le process reste vivant,
//   mais le tour est bloqué indéfiniment). Avec fs:false le moteur exécute
//   les outils entièrement côté serveur (namespace `opencode`) sans jamais
//   nous solliciter — confirmé par la vérification end-to-end de ce module.
// - Toute requête serveur→client malgré tout (`id` + `method` reçus) doit
//   recevoir une réponse — jamais de silence, sinon même risque de blocage.
//   On répond systématiquement une erreur JSON-RPC "method not found".
// - `session/new {cwd, mcpServers:[]}` → `{sessionId, models, _meta:{…}}`.
//   Le moteur charge quand même la config MCP locale (~19 serveurs) et émet
//   des notifications `_x.ai/mcp/*` HORS-TOUR — certaines contiennent des
//   credentials en clair (`_x.ai/mcp/servers_updated.mcpServers[].env`).
//   Ces notifications sont ignorées sans jamais être journalisées.
// - `session/load {sessionId, cwd, mcpServers:[]}` (capability `loadSession:
//   true` confirmée) : reprend une session existante. Vérifié (probe_load.py,
//   sans appel modèle) : la réponse rejoue immédiatement quelques notifications
//   `session/update` de l'historique (ex. le dernier message utilisateur) —
//   on ne les traite JAMAIS comme faisant partie du tour courant : le handler
//   d'un thread n'est attaché qu'APRÈS résolution de session/load, donc ces
//   replays tombent dans le vide (aucun handler enregistré) sans effet de
//   bord. Une session déjà chargée dans CE process n'est plus rechargée
//   (le replay ne se reproduit qu'au premier load, pas à chaque tour).
// - `session/prompt {sessionId, prompt:[{type:"text",text}]}` → notifications
//   `session/update` (discriminant `params.update.sessionUpdate`) puis
//   réponse finale `{stopReason, _meta:{totalTokens,inputTokens,
//   outputTokens,cachedReadTokens,reasoningTokens,…}}`. `stopReason` observés :
//   `end_turn`, `cancelled`.
// - Notifications x.ai spécifiques (`_x.ai/session_notification`, discriminant
//   identique `params.update.sessionUpdate`) : mêmes kinds que ci-dessus
//   multiplexés sur une méthode différente (vérifié : les DEUX méthodes
//   portent le même champ `sessionUpdate`, run3.log/run4.log) — le mapping
//   ci-dessous ne distingue donc pas la méthode porteuse, seulement le kind.
// - `session/cancel {sessionId}` est une NOTIFICATION (pas d'id) ; le
//   `session/prompt` en cours se résout ensuite avec `stopReason:"cancelled"`
//   (vérifié run4.log). Un second prompt envoyé pendant qu'un tour tourne
//   n'obtient PAS de réponse tant que le premier n'est pas terminé/annulé —
//   il démarre juste après (mécanisme de file interne au CLI ; côté Atelier
//   c'est déjà le rôle de la file du router, aucun changement requis ici).
//
// Effort / modèle par session — point d'incertitude de la spec, résolu :
// contrairement à l'hypothèse "process par effort / respawn au changement",
// `session/set_mode {sessionId, modeId}` **existe et fonctionne par session**,
// vérifié sans appel modèle (probe_setmode.py) : la réponse `session/new`
// expose `_meta["x.ai/sessionConfig"].options` = liste fusionnée d'options
// "model" et "mode" (effort) avec un flag `selected` ; `session/set_mode`
// accepte indifféremment un id de modèle ("grok-composer-2.5-fast") ou
// d'effort ("medium") dans le même champ `modeId`, sans erreur JSON-RPC.
// Donc : UN SEUL process partagé pour toute la durée de vie du sidecar,
// aucun respawn au changement de modèle/effort — on aligne juste la session
// via `session/set_mode` avant chaque `session/prompt` si besoin (best-effort :
// un modeId refusé par le modèle courant est journalisé, jamais fatal).
// Le process n'est respawné que si mort, ou si le symlink ~/.grok/bin/grok
// pointe vers un binaire différent (mise à jour auto du CLI).
//
// Permission mode : `grok agent stdio` n'expose ni flag `--permission-mode`
// (confirmé : `grok agent --help` ne liste que --reauth/-m/--reasoning-effort/
// --always-approve/--agent-profile/--plugin-dir/--leader…) ni catégorie
// "permission" dans les options de session/set_mode (seulement "model" et
// "mode"). On conserve donc le comportement auto existant (équivalent
// --always-approve, confirmé par le champ `"yolo":true` observé dans les
// notifications `_x.ai/sessions/changed`) — permissions HITL bloquantes =
// phase 2 (session/request_permission), hors scope ici.

const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);

function mapEffort(effort) {
  if (!effort) return null;
  if (effort === "ultra") return "max"; // alias historique (UI pré-registry)
  return EFFORTS.has(effort) ? effort : null;
}

function isExecutableFile(p) {
  try {
    accessSync(p, fsConstants.X_OK);
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Binaire grok pour le process ACP partagé : on préfère le symlink
 * ~/.grok/bin/grok (auto-updaté par le CLI lui-même) à resolveBin("grok"),
 * qui peut résoudre vers le wrapper cmux (/Applications/cmux.app/…/bin/grok)
 * injectant des hooks additionnels non désirés pour le process d'Atelier. */
function resolveGrokBin() {
  const symlink = join(homedir(), ".grok", "bin", "grok");
  if (isExecutableFile(symlink)) return symlink;
  return resolveBin("grok") ?? "grok";
}

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export function parseGrokModelsOutput(output) {
  const lines = String(output ?? "").split(/\r?\n/);
  const defaultModel = lines
    .map((line) => /^Default model:\s*(\S+)/.exec(line)?.[1] ?? null)
    .find(Boolean) ?? null;
  const models = [];
  for (const line of lines) {
    const match = /^\s*[*-]\s+([^\s(]+)/.exec(line);
    if (match?.[1]) models.push(match[1]);
  }
  const unique = [...new Set(models)];
  return {
    defaultModel: defaultModel ?? unique[0] ?? null,
    models: unique,
  };
}

export function listModels(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = execFile(resolveGrokBin(), ["models"], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || error).trim()));
        return;
      }
      const parsed = parseGrokModelsOutput(stdout);
      if (!parsed.models.length) {
        reject(new Error("grok models: aucune liste de modèles détectée"));
        return;
      }
      resolve(parsed);
    });
    child.stdin?.end?.();
  });
}

// ---------------------------------------------------------------------------
// Ancien chemin one-shot (`grok -p … --output-format streaming-json`) —
// shapes réelles vérifiées 2026-07-06 (grok 0.2.87) : {type:"thought",data},
// {type:"text",data}, {type:"end",stopReason,sessionId,requestId},
// {type:"error",message}. Les outils s'exécutent mais n'émettent aucun event
// dans ce format — pas de tool_update possible. Conservé en repli si le
// handshake ACP échoue (cf. runLegacy plus bas).
// ---------------------------------------------------------------------------
export function normalizeGrokMessage(msg) {
  if (!msg || typeof msg !== "object") return [];

  if (msg.type === "error") {
    return [{ kind: "error", message: String(msg.message ?? msg.error ?? "erreur Grok") }];
  }

  if (msg.type === "thought") {
    return [{ kind: "thinking_delta", text: String(msg.data ?? "") }];
  }

  if (msg.type === "text") {
    return [{ kind: "delta", text: String(msg.data ?? "") }];
  }

  if (msg.type === "end") {
    return [{
      kind: "done",
      ok: msg.stopReason ? msg.stopReason === "EndTurn" : true,
      sessionId: msg.sessionId ?? null,
      result: "",
      usage: { context: 0, output: 0, cost: null, turns: null },
    }];
  }

  return [];
}

export function parseGrokJsonl(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      for (const event of normalizeGrokMessage(JSON.parse(trimmed))) events.push(event);
    } catch {
      events.push({ kind: "error", message: `JSON Grok invalide: ${trimmed.slice(0, 120)}` });
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
  const args = ["--output-format", "streaming-json", "--cwd", cwd || process.env.HOME || process.cwd()];
  if (model) args.push("--model", model);
  const mappedEffort = mapEffort(effort);
  if (mappedEffort) args.push("--effort", mappedEffort);
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (!permissionMode || permissionMode === "bypassPermissions") args.push("--always-approve");
  if (sessionId) args.push("--resume", sessionId);
  args.push("-p", String(prompt ?? ""));

  return new Promise((resolve, reject) => {
    const child = spawn(resolveGrokBin(), args, {
      cwd: cwd || process.env.HOME || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let sid = sessionId ?? null;
    let rest = "";
    let stderr = "";
    let finished = false;
    const timer = timeoutMs
      ? setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Grok timeout"));
      }, timeoutMs)
      : null;

    const emit = (event) => {
      if (event.sessionId) sid = event.sessionId;
      if (event.kind === "done") {
        finished = true;
        onEvent?.(event);
        resolve({ sessionId: sid });
        return;
      }
      if (event.kind === "error") {
        finished = true;
        onEvent?.(event);
        reject(new Error(event.message));
        return;
      }
      onEvent?.(event);
    };

    child.stdout.on("data", (buf) => {
      const parsed = parseGrokJsonl(String(buf), rest);
      rest = parsed.rest;
      for (const event of parsed.events) emit(event);
    });
    child.stderr.on("data", (buf) => { stderr += String(buf); });
    child.on("error", (err) => {
      if (!finished) reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (finished) return;
      if (rest.trim()) {
        const parsed = parseGrokJsonl("\n", rest);
        for (const event of parsed.events) emit(event);
        if (finished) return;
      }
      if (code === 0) {
        onEvent?.({ kind: "done", ok: true, result: "", usage: { context: 0, output: 0, cost: null, turns: null } });
        resolve({ sessionId: sid });
      } else {
        reject(new Error(stderr.trim() || `Grok exited with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// ACP (`grok agent stdio`) — framing NDJSON pur (testable sans process réel)
// ---------------------------------------------------------------------------

/** Découpe un buffer réseau en messages JSON-RPC ACP complets (une ligne =
 * un message, pas de Content-Length) ; renvoie les objets parsés (lignes
 * invalides ignorées, jamais fatal) et le reliquat à reporter au prochain
 * appel. */
export function parseAcpLines(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const messages = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // ligne corrompue : ignorée silencieusement (pas de crash du provider)
    }
  }
  return { messages, rest };
}

/** Réponse JSON-RPC "method not found" à renvoyer pour toute requête entrante
 * inattendue du serveur (fs/terminal désactivés à l'initialize : le serveur
 * ne devrait jamais nous en demander — s'il le fait quand même, jamais de
 * silence, cf. commentaire de module sur le blocage observé en sonde). */
export function acpMethodNotFoundResponse(id, method) {
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

/** Erreur JSON-RPC sur `session/prompt` (ou tout rejet du process ACP en
 * cours de tour) -> event `error` Atelier. */
export function mapPromptError(e) {
  return { kind: "error", message: String(e?.message ?? e) };
}

function toolMeta(update) {
  return update?._meta?.["x.ai/tool"] ?? {};
}

function toolCallStatus(update) {
  const raw = update?.status ?? update?._meta?.updateParams?.status;
  if (raw) {
    const s = String(raw).toLowerCase();
    if (s.includes("fail") || s.includes("error") || s.includes("reject")) return "failed";
    if (s.includes("complet") || s.includes("done") || s.includes("success")) return "completed";
    if (s.includes("progress") || s.includes("pending")) return "running";
    return s;
  }
  // Aucun statut explicite observé en pratique (run3.log/run4.log :
  // "status": null à tous les niveaux, y compris _meta.updateParams.status) —
  // la présence d'un contenu (diff/texte) signale la fin de l'action.
  return (update?.content ?? []).length ? "completed" : "running";
}

function toolCallOutput(update) {
  const parts = [];
  for (const c of update?.content ?? []) {
    if (c?.type === "diff") {
      const label = c.path ? `# ${c.path}` : "# fichier";
      parts.push(`${label}\n${String(c.newText ?? "")}`);
    } else if (c?.type === "text" && c.text) {
      parts.push(String(c.text));
    } else if (typeof c?.content?.text === "string") {
      parts.push(c.content.text);
    }
  }
  return parts.join("\n\n");
}

/** Mémorise nom/détail/input d'un toolCallId dans `toolMetaCache` (si fourni)
 * — vérifié en direct (E2E, 2026-07-08) : le CLI envoie parfois un SECOND
 * `tool_call_update` pour le même appel, sans `_meta["x.ai/tool"]` ni
 * `rawInput` (juste une confirmation de statut). Sans ce cache, cette
 * seconde update écraserait la belle carte "write" par une carte générique
 * "tool" sans input (le front remplace la carte par id à chaque tool_update). */
function rememberToolMeta(toolMetaCache, toolCallId, patch) {
  if (!toolMetaCache || !toolCallId) return;
  const prev = toolMetaCache.get(toolCallId) ?? {};
  const next = { ...prev };
  if (patch.name && patch.name !== "tool") next.name = patch.name;
  if (patch.detail) next.detail = patch.detail;
  if (patch.input != null) next.input = patch.input;
  toolMetaCache.set(toolCallId, next);
}

function toolUpdateFromToolCall(update, toolMetaCache) {
  const meta = toolMeta(update);
  const ev = {
    kind: "tool_update",
    id: update.toolCallId,
    name: meta.name || update.title || "tool",
    status: "running",
    detail: update.title && update.title !== meta.name ? update.title : undefined,
    // `output` est un string REQUIS côté front (ws.ts, Chat.tsx fait
    // event.output.length sans garde — crash blanc constaté 2026-07-08)
    output: "",
    input: update.rawInput ?? null,
    source: "grok",
  };
  rememberToolMeta(toolMetaCache, update.toolCallId, ev);
  return ev;
}

function toolUpdateFromToolCallUpdate(update, toolMetaCache) {
  const meta = toolMeta(update);
  const cached = toolMetaCache?.get(update.toolCallId);
  const ev = {
    kind: "tool_update",
    id: update.toolCallId,
    name: meta.name || update.title || cached?.name || "tool",
    status: toolCallStatus(update),
    detail: update.title || cached?.detail || undefined,
    output: toolCallOutput(update),
    input: update.rawInput ?? cached?.input ?? null,
    source: "grok",
  };
  rememberToolMeta(toolMetaCache, update.toolCallId, ev);
  return ev;
}

function editFromToolCallUpdate(update, seenEdits) {
  const files = [];
  for (const c of update?.content ?? []) {
    if (c?.type !== "diff" || !c.path) continue;
    // Un même toolCallId peut ré-émettre le même diff (cf. rememberToolMeta) —
    // dédoublonné par (toolCallId, path, longueur du nouveau texte).
    const key = `${update.toolCallId}:${c.path}:${String(c.newText ?? "").length}`;
    if (seenEdits) {
      if (seenEdits.has(key)) continue;
      seenEdits.add(key);
    }
    files.push(String(c.path));
  }
  return files.length ? [{ kind: "edit", files }] : [];
}

function hookExecutionEvent(update) {
  // Ignoré entièrement, échecs compris — les hooks globaux de l'utilisateur
  // (~/.grok/hooks/{cmux-session,muxy-notify,orca-status}.json) ciblent des
  // hôtes (cmux/Muxy/Orca) absents quand grok tourne dans Atelier : ils
  // échouent SYSTÉMATIQUEMENT ici → bruit permanent non actionnable dans le
  // chat (constaté en réel 2026-07-08). Le TUI grok ne les affiche pas non
  // plus. Diagnostic possible via ~/.grok/sessions/…/events.jsonl au besoin.
  void update;
  return [];
}

function pendingInteractionEvent(update) {
  return [{ kind: "tool", name: update?.kind ? `permission (${update.kind})` : "permission en attente" }];
}

function planEvent(update) {
  // Non observé en direct dans les sondes (run3.log/run4.log n'en émettent
  // pas) — mapping best-effort aligné sur la forme ACP standard "entries"
  // ({content,status}), à valider si un vrai plan update apparaît un jour.
  const entries = update?.entries ?? update?.plan ?? update?.items ?? [];
  if (!Array.isArray(entries) || !entries.length) return [];
  const items = entries.map((e) => ({
    text: String(e?.content ?? e?.step ?? e?.text ?? ""),
    completed: e?.status === "completed",
  }));
  return [{ kind: "todos", items }];
}

/** Mapping "sessionUpdate" ACP -> kind(s) Atelier. Reçoit directement
 * `params.update`, peu importe la méthode porteuse (`session/update` ACP
 * standard ou `_x.ai/session_notification` extension xAI — vérifié : les
 * deux multiplexent le même discriminant `sessionUpdate`, run3.log/run4.log).
 * Tout kind non listé ici est ignoré silencieusement (tolérance aux futures
 * évolutions du CLI, cf. constraint "jamais planter sur un event inconnu").
 *
 * `ctx` (optionnel) porte l'état MÉMOIRE d'un tour pour les toolCallId répétés
 * (`toolMeta`: Map toolCallId -> {name,detail,input}, `seenEdits`: Set) — sans
 * lui, chaque appel reste une pure fonction d'un seul update (suffisant pour
 * les tests unitaires "un event isolé -> kind(s)"), avec lui (fourni par
 * runAcp), les mises à jour successives d'un même appel d'outil ne
 * dégradent/dédoublonnent pas la carte déjà affichée (cf. rememberToolMeta,
 * comportement observé en E2E réel, 2026-07-08). */
export function mapSessionUpdate(update, ctx = {}) {
  switch (update?.sessionUpdate) {
    case "agent_thought_chunk":
      return [{ kind: "thinking_delta", text: String(update.content?.text ?? "") }];
    case "agent_message_chunk":
      return [{ kind: "delta", text: String(update.content?.text ?? "") }];
    case "tool_call":
      return [toolUpdateFromToolCall(update, ctx.toolMeta)];
    case "tool_call_update":
      return [toolUpdateFromToolCallUpdate(update, ctx.toolMeta), ...editFromToolCallUpdate(update, ctx.seenEdits)];
    case "plan":
      return planEvent(update);
    case "hook_execution":
      return hookExecutionEvent(update);
    case "pending_interaction":
      return pendingInteractionEvent(update);
    // ignorés explicitement (bruit de gestion de session, table de la spec) :
    case "user_message_chunk":
    case "available_commands_update":
    case "session_summary_generated":
    case "interaction_resolved":
    case "turn_completed":
      return [];
    default:
      return []; // event/notification inconnu → ignoré silencieusement
  }
}

/** Fin de tour (réponse `session/prompt`) -> event `done`. `ok:true` si
 * `end_turn` OU `cancelled` (interruption utilisateur = succès), usage réel
 * pris dans `_meta` (vérifié run3.log/run4.log : `_meta` est un objet plat,
 * pas imbriqué sous "usage"). */
export function mapPromptResult(result) {
  const stopReason = result?.stopReason ?? null;
  const ok = stopReason === "end_turn" || stopReason === "cancelled";
  const meta = result?._meta ?? {};
  return {
    kind: "done",
    ok,
    result: "",
    usage: {
      context: Number.isFinite(meta.totalTokens) ? meta.totalTokens : 0,
      output: Number.isFinite(meta.outputTokens) ? meta.outputTokens : 0,
      cost: null,
      turns: null,
    },
  };
}

/** Prompt ACP avec pièces jointes : le protocole grok annonce
 * `promptCapabilities.image:false` (pas de bloc image), donc on référence les
 * fichiers joints par leur chemin dans le texte — le moteur les lit avec ses
 * propres outils (read_file). Même dégradation que l'ancien chemin one-shot,
 * mais explicite au lieu de silencieusement perdue. */
export function buildAcpPromptText(prompt, { imagePath, attachments } = {}) {
  const paths = [];
  if (imagePath) paths.push(String(imagePath));
  for (const a of attachments ?? []) {
    const p = a?.path ?? a?.imagePath;
    if (p) paths.push(String(p));
  }
  const unique = [...new Set(paths)];
  if (!unique.length) return String(prompt ?? "");
  return `${String(prompt ?? "")}\n\n[Pièce${unique.length > 1 ? "s" : ""} jointe${unique.length > 1 ? "s" : ""} (lis ce${unique.length > 1 ? "s" : ""} fichier${unique.length > 1 ? "s" : ""} si pertinent) : ${unique.join(", ")}]`;
}

/** Extrait la sélection modèle/effort courante d'une liste d'options
 * `_meta["x.ai/sessionConfig"].options` (réponse session/new|load) — vérifié
 * en direct (grok-acp-verify/probe_setmode.py, sans appel modèle) : la liste
 * fusionne des entrées catégorie "model" et catégorie "mode" (effort), avec
 * un flag `selected`. */
export function selectionFromOptions(options) {
  const sel = {};
  for (const o of options ?? []) {
    if (!o?.selected) continue;
    if (o.category === "model") sel.model = o.id;
    if (o.category === "mode") sel.effort = o.id;
  }
  return sel;
}

// ---------------------------------------------------------------------------
// Process ACP partagé — un seul `grok agent stdio` pour tout le sidecar,
// comme codex.mjs. Aucun respawn au changement de modèle/effort (cf. en-tête
// de module) : seulement si le process est mort ou le binaire a changé.
// ---------------------------------------------------------------------------
const ACP_HANDSHAKE_TIMEOUT_MS = 10000; // spec : 10s pour initialize/session/new|load

let server = null; // { proc, request(method,params), notify(method,params), realBin }
const pendingRpc = new Map(); // id -> { resolve, reject }
const sessionHandlers = new Map(); // grok sessionId -> (update) => void (tour en cours)
const loadedGrokSessions = new Set(); // grok sessionId déjà ouvertes (session/new|load) dans CE process
const grokSessionSelection = new Map(); // grok sessionId -> { model, effort } dernier connu
const activeTurns = new Map(); // clé de tour (threadId ?? sessionId) -> grok sessionId, pour interrupt()

function handshakeFailure(message) {
  const e = new Error(message);
  e.acpHandshakeFailure = true;
  return e;
}

function withHandshakeTimeout(promise, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(handshakeFailure(`${label}: pas de réponse sous ${ACP_HANDSHAKE_TIMEOUT_MS}ms`)),
      ACP_HANDSHAKE_TIMEOUT_MS,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e?.acpHandshakeFailure ? e : handshakeFailure(`${label}: ${e?.message ?? e}`)); },
    );
  });
}

function resetServerState(err) {
  const e = err ?? new Error("grok agent stdio terminé");
  for (const { reject } of pendingRpc.values()) reject(e);
  pendingRpc.clear();
  loadedGrokSessions.clear();
  grokSessionSelection.clear();
  server = null;
  sessionHandlers.clear(); // les tours en cours voient leur `await srv.request(...)` rejeter (pendingRpc ci-dessus)
}

/** Dispatch d'un message ACP entrant (requête serveur→client, réponse à une
 * requête sortante, ou notification). Exporté pour être testable sans
 * spawner de process réel (`proc` peut être un simple objet {stdin:{write}}). */
export function handleIncoming(proc, msg) {
  // Requête serveur → client : jamais de silence (cf. en-tête de module) —
  // fs/terminal désactivés à l'initialize, donc tout appel entrant est
  // inattendu ⇒ erreur JSON-RPC standard.
  if (msg.id != null && msg.method) {
    proc.stdin.write(JSON.stringify(acpMethodNotFoundResponse(msg.id, msg.method)) + "\n");
    return;
  }
  if (msg.id != null) {
    const p = pendingRpc.get(msg.id);
    if (!p) return;
    pendingRpc.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? "erreur ACP grok"));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === "session/update" || msg.method === "_x.ai/session_notification") {
    const sid = msg.params?.sessionId;
    const handler = sid ? sessionHandlers.get(sid) : null;
    handler?.(msg.params?.update ?? {}); // pas de handler = tour déjà fini / replay de session/load : silence attendu
    return;
  }
  // Tout le reste (_x.ai/mcp/*, announcements, sessions/changed, queue/changed…) :
  // notifications hors-tour ignorées. NE JAMAIS journaliser ces payloads —
  // _x.ai/mcp/servers_updated notamment transporte des credentials en clair
  // (env des serveurs MCP locaux de l'utilisateur).
}

async function spawnServer() {
  const binPath = resolveGrokBin();
  const proc = spawn(binPath, ["agent", "stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  proc.on("exit", () => resetServerState(new Error("grok agent stdio a quitté")));
  proc.on("error", (e) => resetServerState(e));
  proc.stderr.on("data", () => {}); // logs debug grok ignorés (bruyants ; jamais de contenu _x.ai/mcp/* à journaliser de toute façon)
  let carry = "";
  proc.stdout.on("data", (buf) => {
    const { messages, rest } = parseAcpLines(String(buf), carry);
    carry = rest;
    for (const msg of messages) handleIncoming(proc, msg);
  });
  let nextId = 1;
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pendingRpc.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const notify = (method, params) => {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  };
  const srv = { proc, request, notify, realBin: safeRealpath(binPath) };
  // détection rapide d'un spawn raté (binaire absent, crash immédiat) en plus
  // du timeout générique ci-dessous
  const earlyExit = new Promise((_, reject) => {
    proc.once("error", (e) => reject(handshakeFailure(`spawn grok: ${e.message}`)));
    proc.once("exit", (code) => reject(handshakeFailure(`grok agent stdio a quitté immédiatement (code ${code})`)));
  });
  await Promise.race([
    withHandshakeTimeout(
      srv.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      }),
      "initialize",
    ),
    earlyExit,
  ]);
  server = srv;
  return srv;
}

async function ensureServer() {
  if (server) {
    const alive = server.proc.exitCode == null && !server.proc.killed;
    const currentBin = safeRealpath(resolveGrokBin());
    if (alive && currentBin === server.realBin) return server;
    // process mort OU symlink ~/.grok/bin/grok mis à jour vers une autre
    // version : on repart propre plutôt que de parler à un binaire obsolète.
    try { server.proc.kill("SIGTERM"); } catch {}
    resetServerState(new Error("grok agent stdio remplacé (version/process)"));
  }
  return spawnServer();
}

export function stopServer() {
  if (server?.proc && !server.proc.killed) {
    try { server.proc.kill("SIGTERM"); } catch {}
  }
  resetServerState(new Error("grok agent stdio arrêté"));
}

/** `session/cancel` est une NOTIFICATION (pas d'id) — le `session/prompt` en
 * cours se résout ensuite avec `stopReason:"cancelled"` (vérifié run4.log).
 * Le router (router.mjs, case "interrupt") l'appelle sans modification. */
export async function interrupt(threadId) {
  const sid = activeTurns.get(threadId);
  if (!sid || !server) return;
  try { server.notify("session/cancel", { sessionId: sid }); } catch {}
}

async function openGrokSession(srv, { sessionId, cwd, threadId }) {
  if (sessionId && loadedGrokSessions.has(sessionId)) {
    return { sessionId }; // déjà chargée dans ce process : pas de re-load (évite le replay bruyant)
  }
  if (sessionId) {
    const result = await withHandshakeTimeout(srv.request("session/load", { sessionId, cwd, mcpServers: [] }), "session/load");
    loadedGrokSessions.add(sessionId);
    grokSessionSelection.set(sessionId, selectionFromOptions(result?._meta?.["x.ai/sessionConfig"]?.options));
    return { sessionId };
  }
  const result = await withHandshakeTimeout(srv.request("session/new", { cwd, mcpServers: [] }), "session/new");
  const sid = result?.sessionId;
  if (!sid) throw handshakeFailure("session/new sans sessionId");
  loadedGrokSessions.add(sid);
  grokSessionSelection.set(sid, selectionFromOptions(result?._meta?.["x.ai/sessionConfig"]?.options));
  void threadId; // conservé dans la signature pour un futur usage (titres, debug) ; non requis aujourd'hui
  return { sessionId: sid };
}

/** Aligne modèle/effort de la session ACP sur ceux demandés pour ce tour via
 * `session/set_mode` (cf. en-tête de module). Best-effort : un modeId refusé
 * n'interrompt jamais le tour, juste journalisé. */
async function alignSessionMode(srv, sessionId, wanted) {
  const known = grokSessionSelection.get(sessionId) ?? {};
  const next = { ...known };
  for (const field of ["model", "effort"]) {
    const want = wanted[field];
    if (!want || want === known[field]) continue;
    try {
      await srv.request("session/set_mode", { sessionId, modeId: want });
      next[field] = want;
    } catch (e) {
      console.warn(`[grok] session/set_mode(${field}=${want}) refusé, ignoré (best-effort):`, e?.message ?? e);
    }
  }
  grokSessionSelection.set(sessionId, next);
}

/** Émetteur bufferisé d'un tour — maintient l'ADJACENCE bloc live → bloc
 * final exigée par le reducer du front (App.tsx : la bulle `streaming`/
 * `thinking_live` n'est remplacée par son bloc final `text`/`thinking` que si
 * elle est le DERNIER event de la liste). Tout event intercalé (tool, edit,
 * hook…) entre des deltas et leur bloc final laisserait une bulle orpheline
 * (caret clignotant à jamais) + un texte dupliqué — observé en réel
 * 2026-07-08 avec les hooks de fin de tour. Règle : avant d'émettre quoi que
 * ce soit d'autre que le delta du buffer actif, flusher le(s) buffer(s). */
export function makeTurnEmitter(onEvent) {
  let messageBuffer = "";
  let thoughtBuffer = "";
  const flushThinking = () => {
    if (!thoughtBuffer) return;
    onEvent({ kind: "thinking", text: thoughtBuffer });
    thoughtBuffer = "";
  };
  const flushText = () => {
    if (!messageBuffer) return;
    onEvent({ kind: "text", text: messageBuffer });
    messageBuffer = "";
  };
  const flush = () => { flushThinking(); flushText(); };
  const emit = (ev) => {
    if (ev.kind === "thinking_delta") { flushText(); thoughtBuffer += ev.text; onEvent(ev); return; }
    if (ev.kind === "delta") { flushThinking(); messageBuffer += ev.text; onEvent(ev); return; }
    flush();
    onEvent(ev);
  };
  return { emit, flush };
}

async function runAcp({ threadId, cwd, prompt, sessionId, model, effort, imagePath, attachments, timeoutMs, onEvent }) {
  const workDir = cwd || process.env.HOME || process.cwd();
  let srv;
  let sid;
  try {
    srv = await ensureServer();
    ({ sessionId: sid } = await openGrokSession(srv, { sessionId, cwd: workDir, threadId }));
  } catch (e) {
    throw e?.acpHandshakeFailure ? e : handshakeFailure(String(e?.message ?? e));
  }

  await alignSessionMode(srv, sid, { model: model || undefined, effort: mapEffort(effort) || undefined });

  // état mémoire du tour pour les toolCallId répétés (cf. mapSessionUpdate/
  // rememberToolMeta) : sans lui, une update de suivi sans _meta écraserait
  // la carte déjà affichée par une carte générique "tool" sans input.
  const updateCtx = { toolMeta: new Map(), seenEdits: new Set() };
  const emitter = makeTurnEmitter(onEvent);

  const handler = (update) => {
    for (const ev of mapSessionUpdate(update, updateCtx)) emitter.emit(ev);
  };
  sessionHandlers.set(sid, handler);
  const turnKey = threadId ?? sid;
  activeTurns.set(turnKey, sid);

  const timer = timeoutMs
    ? setTimeout(() => { interrupt(turnKey).catch(() => {}); }, timeoutMs)
    : null;

  try {
    const result = await srv.request("session/prompt", {
      sessionId: sid,
      prompt: [{ type: "text", text: buildAcpPromptText(prompt, { imagePath, attachments }) }],
    });
    emitter.flush();
    onEvent(mapPromptResult(result));
  } catch (e) {
    emitter.flush();
    onEvent(mapPromptError(e));
  } finally {
    if (timer) clearTimeout(timer);
    sessionHandlers.delete(sid);
    activeTurns.delete(turnKey);
  }
  return { sessionId: sid };
}

export async function run(opts) {
  try {
    return await runAcp(opts);
  } catch (e) {
    if (!e?.acpHandshakeFailure) throw e;
    console.warn("[grok] handshake ACP échoué, repli sur l'ancien run() streaming-json:", e.message);
    return runLegacy(opts);
  }
}
