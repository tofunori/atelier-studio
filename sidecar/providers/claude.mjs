import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Bundle allégé : le binaire embarqué du SDK est retiré → utiliser le CLI système.
/** Détail court d'un tool_use pour l'affichage (Bash(git status), Edit(file.py)…). */
export function toolDetail(name, input) {
  if (!input || typeof input !== "object") return "";
  const first = (v) => String(v ?? "").split("\n")[0].slice(0, 80);
  if (name === "Bash") return first(input.command);
  if (["Read", "Edit", "Write", "NotebookEdit"].includes(name)) {
    const p = String(input.file_path ?? "");
    return p.length > 60 ? "…" + p.slice(-59) : p;
  }
  if (name === "Grep") return first(input.pattern);
  if (name === "Glob") return first(input.pattern);
  if (name === "WebFetch" || name === "WebSearch") return first(input.url ?? input.query);
  if (name === "Task" || name === "Agent") return first(input.description ?? input.prompt);
  return "";
}

import { appendFileSync } from "node:fs";
const LOG_DIR = `${process.env.HOME}/Library/Logs/atelier-studio`;
function logStderr(data) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(`${LOG_DIR}/claude-cli.log`, data);
  } catch {}
}

import { resolveBin } from "../bin_resolver.mjs";
const CLAUDE_BIN = resolveBin("claude");


// Sessions PERSISTANTES par thread (streaming input) :
// - un message envoyé pendant un run = steering (pris en compte en cours de route)
// - un message envoyé au repos = tour suivant de la même session
// - interrupt() = bouton Stop
// settingSources charge CLAUDE.md, skills, hooks et MCP — même harnais que le CLI.

const sessions = new Map(); // threadId -> {push, q, onEvent, close}

function userMsg(text, priority) {
  // forme documentée de SDKUserMessage ; priority 'now' = steer immédiat,
  // 'next' = après le tour en cours (queue native du harnais)
  return {
    type: "user",
    parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "text", text }] },
    ...(priority ? { priority } : {}),
  };
}

export function isActive(threadId) {
  return sessions.has(threadId);
}

/** Ferme proprement la session streaming d'un thread (pour rewind/revert). */
export function endSession(threadId) {
  const s = sessions.get(threadId);
  if (s) {
    s.close();
    sessions.delete(threadId);
  }
}

export async function interrupt(threadId) {
  const s = sessions.get(threadId);
  if (s?.q?.interrupt) {
    try {
      await s.q.interrupt();
    } catch {}
  }
}

export async function titleConversation(firstMessage) {
  const prompt =
    "Donne un titre de 3-6 mots pour cette conversation : " +
    String(firstMessage ?? "").slice(0, 1200);
  let title = "";
  const q = query({
    prompt,
    options: {
      maxTurns: 1,
      model: "claude-haiku-4-5-20251001",
      ...(CLAUDE_BIN ? { pathToClaudeCodeExecutable: CLAUDE_BIN } : {}),
      settingSources: ["user"],
    },
  });
  let resultTitle = "";
  for await (const msg of q) {
    if (msg.type === "result" && msg.result) resultTitle = msg.result;
    if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "text") title += block.text;
      }
    }
  }
  return (title || resultTitle)
    .replace(/\*\*/g, "")
    .replace(/^(titre( proposé)?\s*:?)\s*/i, "")
    .replace(/^["'«\s]+|["'»\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 70);
}

export async function commitMessage(diff) {
  const body = String(diff ?? "").slice(0, 8000);
  const prompt =
    "Rédige un message de commit Git concis en français, une seule ligne, " +
    "impératif ou descriptif court, sans guillemets ni markdown. Diff:\n\n" +
    body;
  let text = "";
  const q = query({
    prompt,
    options: {
      maxTurns: 1,
      model: "claude-haiku-4-5-20251001",
      ...(CLAUDE_BIN ? { pathToClaudeCodeExecutable: CLAUDE_BIN } : {}),
      settingSources: ["user"],
    },
  });
  let resultText = "";
  for await (const msg of q) {
    if (msg.type === "result" && msg.result) resultText = msg.result;
    if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "text") text += block.text;
      }
    }
  }
  return (text || resultText)
    .replace(/^["'«\s]+|["'»\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function send({
  threadId,
  cwd,
  prompt,
  sessionId,
  model,
  effort,
  permissionMode,
  onPermissionRequest,
  mode, // "steer" | "queue"
  resumeAt, // uuid : rewind via resumeSessionAt (API documentée)
  fork, // true : bifurquer en une NOUVELLE session (forkSession)
  onEvent,
  onSession,
}) {
  const actualModel = model;
  let s = sessions.get(threadId);
  if (s) {
    // session ouverte : priority native du SDK (now = steer, next = queue) ;
    // model/permission changeables en cours de session (API documentée).
    // Le dispatcher (onEvent) de la session est STABLE : c'est le routeur qui
    // attribue les événements au bon turn — un second send ne réattribue rien
    // (plan 025 : un steer déplaçait les événements du turn 1 dans le turn 2).
    if (actualModel && actualModel !== s.model) { s.q.setModel(actualModel).catch(() => {}); s.model = actualModel; }
    if (permissionMode && permissionMode !== s.permissionMode) {
      s.q.setPermissionMode(permissionMode).catch(() => {});
      s.permissionMode = permissionMode;
    }
    s.push(userMsg(prompt, mode === "queue" ? "next" : "now"));
    return;
  }

  const queue = [];
  let notify = null;
  let closed = false;
  const push = (m) => {
    queue.push(m);
    if (notify) {
      const n = notify;
      notify = null;
      n();
    }
  };
  async function* input() {
    while (!closed) {
      while (queue.length) yield queue.shift();
      await new Promise((r) => (notify = r));
    }
  }

  const permMode = permissionMode || "bypassPermissions";
  const q = query({
    prompt: input(),
    options: {
      cwd,
      // prompt de base de Claude Code (outils, conventions, sections dynamiques
      // cwd/git/mémoire) — sans ce preset le SDK démarre avec un system prompt
      // vide ; settingSources charge CLAUDE.md/skills PAR-DESSUS, pas à la place
      systemPrompt: { type: "preset", preset: "claude_code" },
      permissionMode: permMode,
      ...(permMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      ...(CLAUDE_BIN ? { pathToClaudeCodeExecutable: CLAUDE_BIN } : {}),
      settingSources: ["user", "project"],
      includePartialMessages: true,
      stderr: logStderr,
      // mode Ask : le SDK demande la permission — on relaie au front et on attend
      ...(onPermissionRequest ? {
        canUseTool: async (toolName, input, { signal }) => {
          try {
            const allow = await onPermissionRequest({ toolName, input, signal });
            return allow
              ? { behavior: "allow", updatedInput: input }
              : { behavior: "deny", message: "Refusé par l'utilisateur dans Atelier." };
          } catch {
            return { behavior: "deny", message: "Demande de permission expirée." };
          }
        },
      } : {}),
      ...(actualModel ? { model: actualModel } : {}),
      ...(effort ? { effort } : {}),
      ...(sessionId ? { resume: sessionId } : {}),
      ...(sessionId && resumeAt ? { resumeSessionAt: resumeAt } : {}),
      ...(sessionId && fork ? { forkSession: true } : {}),
    },
  });

  s = {
    push,
    q,
    onEvent,
    model: actualModel,
    permissionMode: permissionMode || "bypassPermissions",
    close: () => {
      closed = true;
      if (notify) notify();
    },
  };
  sessions.set(threadId, s);

  // onEvent du routeur est async : un rejet non attrapé tuerait le sidecar.
  // On suit aussi si le DERNIER événement émis était terminal (done/error) —
  // filet pour garantir un done/error même si la boucle se ferme sans result.
  let sawTerminal = false;
  const emit = (ev) => {
    sawTerminal = ev.kind === "done" || ev.kind === "error";
    try { Promise.resolve(s.onEvent(ev)).catch(() => {}); } catch {}
  };

  push(userMsg(prompt));

  (async () => {
    // tool_use d'édition en attente de leur tool_result : id → {name, path}
    const pendingEdits = new Map();
    try {
      for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") onSession?.(msg.session_id);
        if (msg.type === "rate_limit_event" && msg.rate_limit_info) {
          try {
            // un événement PAR type de limite (five_hour, seven_day…) : accumuler
            const info = msg.rate_limit_info;
            const store = globalThis.__claudeRL ?? (globalThis.__claudeRL = {});
            store[info.rateLimitType ?? "five_hour"] = { ...info, ts: Date.now() };
            const dir = `${process.env.HOME}/Library/Application Support/atelier-studio`;
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/usage-claude.json`, JSON.stringify(store));
          } catch {}
        }
        if (msg.type === "stream_event") {
          const ev = msg.event;
          if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            emit({ kind: "delta", text: ev.delta.text });
          }
          if (ev?.type === "content_block_delta" && ev.delta?.type === "thinking_delta" && ev.delta.thinking) {
            emit({ kind: "thinking_delta", text: ev.delta.thinking });
          }
        }
        if (msg.type === "assistant") {
          const au = msg.message?.usage;
          if (au) {
            s.lastCtx =
              (au.input_tokens ?? 0) +
              (au.cache_read_input_tokens ?? 0) +
              (au.cache_creation_input_tokens ?? 0);
          }
          for (const block of msg.message.content ?? []) {
            if (block.type === "text") emit({ kind: "text", text: block.text });
            if (block.type === "thinking" && block.thinking) emit({ kind: "thinking", text: block.thinking });
            if (block.type === "tool_use") {
              const editPath = ["Edit", "Write", "NotebookEdit"].includes(block.name)
                ? String(block.input?.file_path ?? block.input?.notebook_path ?? "")
                : "";
              if (editPath) {
                // la ligne « edit » (±lignes, diff dépliable) sera émise au tool_result,
                // une fois le fichier réellement modifié sur disque
                pendingEdits.set(block.id, { name: block.name, path: editPath });
              } else {
                emit({ kind: "tool", name: block.name, detail: toolDetail(block.name, block.input) });
              }
            }
          }
        }
        if (msg.type === "user" && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block?.type !== "tool_result" || !pendingEdits.has(block.tool_use_id)) continue;
            const pe = pendingEdits.get(block.tool_use_id);
            pendingEdits.delete(block.tool_use_id);
            if (block.is_error) {
              emit({ kind: "tool", name: pe.name, detail: toolDetail(pe.name, { file_path: pe.path }) });
            } else {
              emit({ kind: "edit", files: [pe.path] });
            }
          }
        }
        if (msg.type === "system" && msg.subtype === "compact_boundary") {
          emit({ kind: "tool", name: "__compacted" });
        }
        if (msg.type === "result") {
          const u = msg.usage ?? {};
          emit({
            kind: "done",
            ok: msg.subtype === "success",
            result: msg.result ?? "",
            usage: {
              context: s.lastCtx ??
                ((u.input_tokens ?? 0) +
                (u.cache_read_input_tokens ?? 0) +
                (u.cache_creation_input_tokens ?? 0)),
              output: u.output_tokens ?? 0,
              cost: msg.total_cost_usd ?? null,
              turns: msg.num_turns ?? null,
            },
          });
        }
      }
    } catch (e) {
      emit({ kind: "error", message: String(e) });
    } finally {
      // filet : la boucle s'est fermée sans done/error final (session interrompue
      // ou fermée par endSession pendant un tour) → sinon le thread reste "running"
      if (!sawTerminal) {
        emit({ kind: "error", message: "session terminée sans résultat (interrompue ou fermée)" });
      }
      s.close();
      sessions.delete(threadId);
    }
  })();
}

// compat : ancienne interface one-shot (tests, router générique)
export async function run(opts) {
  return new Promise((resolve, reject) => {
    let sid = opts.sessionId ?? null;
    send({
      ...opts,
      onSession: (id) => {
        sid = id;
      },
      onEvent: (e) => {
        opts.onEvent(e);
        if (e.kind === "done") resolve({ sessionId: sid });
        if (e.kind === "error") reject(new Error(e.message));
      },
    });
  });
}


let __oauthCache = { ts: 0, data: null };
async function fetchOAuthUsage() {
  if (Date.now() - __oauthCache.ts < 60000) return __oauthCache.data;
  try {
    const creds = JSON.parse(readFileSync(`${process.env.HOME}/.claude/.credentials.json`, "utf8"));
    const tok = creds?.claudeAiOauth?.accessToken;
    if (!tok) return null;
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${tok}`, "anthropic-beta": "oauth-2025-04-20" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null; // token expiré (401) ou rate-limit (429) : repli
    const j = await r.json();
    __oauthCache = { ts: Date.now(), data: j };
    return j;
  } catch { return null; }
}

/** Version asynchrone : OAuth usage (les vrais %) avec repli sur les rate_limit_event. */
export async function rateLimitsAsync() {
  const oauth = await fetchOAuthUsage();
  if (oauth) {
    // formats possibles : {five_hour:{utilization,resets_at}, seven_day:{...}} ou similaires
    const pick = (o) => o ? {
      used_percent: o.utilization != null ? (o.utilization > 1.5 ? o.utilization : o.utilization * 100) : null,
      resets_at: o.resets_at ?? o.resetsAt ?? null,
    } : null;
    const five = oauth.five_hour ?? oauth.fiveHour ?? oauth.session ?? null;
    const week = oauth.seven_day ?? oauth.sevenDay ?? oauth.weekly ?? oauth.seven_day_sonnet ?? null;
    if (five || week) return { ts: Date.now(), data: { primary: pick(five), secondary: pick(week) }, raw: oauth };
  }
  return rateLimits();
}

export function rateLimits() {
  let store = globalThis.__claudeRL;
  if (!store) {
    try {
      store = JSON.parse(readFileSync(
        `${process.env.HOME}/Library/Application Support/atelier-studio/usage-claude.json`, "utf8"));
    } catch { return null; }
  }
  if (store.primary || store.data) return store; // très vieux format : tel quel
  const pct = (u) => (u == null ? null : u > 1.5 ? u : u * 100);
  const week = store.seven_day ?? store.seven_day_sonnet ?? store.seven_day_opus ?? null;
  const toLimit = (x) => x ? { used_percent: pct(x.utilization), resets_at: x.resetsAt ?? null, status: x.status } : null;
  return { ts: Date.now(), data: { primary: toLimit(store.five_hour), secondary: toLimit(week) } };
}
