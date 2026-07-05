import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Bundle allégé : le binaire embarqué du SDK est retiré → utiliser le CLI système.
let CLAUDE_BIN = null;
try {
  CLAUDE_BIN = execSync("command -v claude", { encoding: "utf8" }).trim() || null;
} catch {}


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
  mode, // "steer" | "queue"
  resumeAt, // uuid : rewind via resumeSessionAt (API documentée)
  fork, // true : bifurquer en une NOUVELLE session (forkSession)
  onEvent,
  onSession,
}) {
  let s = sessions.get(threadId);
  if (s) {
    // session ouverte : priority native du SDK (now = steer, next = queue) ;
    // model/permission changeables en cours de session (API documentée)
    s.onEvent = onEvent;
    if (model && model !== s.model) { s.q.setModel(model).catch(() => {}); s.model = model; }
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
      permissionMode: permMode,
      ...(permMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      ...(CLAUDE_BIN ? { pathToClaudeCodeExecutable: CLAUDE_BIN } : {}),
      settingSources: ["user", "project"],
      includePartialMessages: true,
      ...(model ? { model } : {}),
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
    model,
    permissionMode: permissionMode || "bypassPermissions",
    close: () => {
      closed = true;
      if (notify) notify();
    },
  };
  sessions.set(threadId, s);
  push(userMsg(prompt));

  (async () => {
    try {
      for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") onSession?.(msg.session_id);
        if (msg.type === "rate_limit_event" || msg.type === "rate_limits") {
          try {
            globalThis.__claudeRateLimits = { ts: Date.now(), data: msg.rate_limits ?? msg.data ?? msg };
            const dir = `${process.env.HOME}/Library/Application Support/atelier-studio`;
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/usage-claude.json`, JSON.stringify(globalThis.__claudeRateLimits));
          } catch {}
        }
        if (msg.type === "stream_event") {
          const ev = msg.event;
          if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            s.onEvent({ kind: "delta", text: ev.delta.text });
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
            if (block.type === "text") s.onEvent({ kind: "text", text: block.text });
            if (block.type === "tool_use") s.onEvent({ kind: "tool", name: block.name });
          }
        }
        if (msg.type === "system" && msg.subtype === "compact_boundary") {
          s.onEvent({ kind: "tool", name: "__compacted" });
        }
        if (msg.type === "result") {
          const u = msg.usage ?? {};
          s.onEvent({
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
      s.onEvent({ kind: "error", message: String(e) });
    } finally {
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

export function rateLimits() {
  if (globalThis.__claudeRateLimits) return globalThis.__claudeRateLimits;
  try {
    return JSON.parse(readFileSync(
      `${process.env.HOME}/Library/Application Support/atelier-studio/usage-claude.json`, "utf8"));
  } catch { return null; }
}
