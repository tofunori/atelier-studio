import { query } from "@anthropic-ai/claude-agent-sdk";

// Sessions PERSISTANTES par thread (streaming input) :
// - un message envoyé pendant un run = steering (pris en compte en cours de route)
// - un message envoyé au repos = tour suivant de la même session
// - interrupt() = bouton Stop
// settingSources charge CLAUDE.md, skills, hooks et MCP — même harnais que le CLI.

const sessions = new Map(); // threadId -> {push, q, onEvent, close}

function userMsg(text) {
  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

export function isActive(threadId) {
  return sessions.has(threadId);
}

export async function interrupt(threadId) {
  const s = sessions.get(threadId);
  if (s?.q?.interrupt) {
    try {
      await s.q.interrupt();
    } catch {}
  }
}

export function send({
  threadId,
  cwd,
  prompt,
  sessionId,
  model,
  effort,
  permissionMode,
  onEvent,
  onSession,
}) {
  let s = sessions.get(threadId);
  if (s) {
    // session ouverte : steering (si run en cours) ou tour suivant
    s.onEvent = onEvent;
    s.push(userMsg(prompt));
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

  const mode = permissionMode || "bypassPermissions";
  const q = query({
    prompt: input(),
    options: {
      cwd,
      permissionMode: mode,
      ...(mode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      settingSources: ["user", "project"],
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(sessionId ? { resume: sessionId } : {}),
    },
  });

  s = {
    push,
    q,
    onEvent,
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
        if (msg.type === "assistant") {
          for (const block of msg.message.content ?? []) {
            if (block.type === "text") s.onEvent({ kind: "text", text: block.text });
            if (block.type === "tool_use") s.onEvent({ kind: "tool", name: block.name });
          }
        }
        if (msg.type === "result") {
          s.onEvent({ kind: "done", ok: msg.subtype === "success", result: msg.result ?? "" });
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
