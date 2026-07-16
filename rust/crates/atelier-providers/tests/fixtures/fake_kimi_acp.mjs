#!/usr/bin/env node
// Faux agent Kimi ACP déterministe (plan 046, étape 1).
//
// Reproduit le contrat wire de `kimi acp` 0.26.0 tel que vérifié le
// 2026-07-16 dans le binaire installé (schémas zod embarqués) et dans le
// code officiel du tag @moonshot-ai/kimi-code@0.26.0 (packages/acp-adapter).
// Utilisé par les tests Rust (atelier-providers) ET Node (sidecar) — même
// fixture des deux côtés pour prouver la parité wire.
//
// Framing : JSON-RPC 2.0, un message JSON par ligne `\n` (NDJSON), logs sur
// stderr uniquement. FAKE_KIMI_FRAGMENT=1 fragmente les écritures stdout en
// petits morceaux (test de framing) sans changer le contenu.
//
// Modes globaux (env FAKE_KIMI_MODE) :
//   nominal (défaut) — capacités Kimi 0.26
//   old_version      — agentInfo.version 0.20.0 (Setup: version_unsupported)
//   auth_required    — authenticate/session/new|load|resume → -32000
//
// Marqueurs dans le texte du prompt (cumulables) :
//   [tool]        tool_call + tool_call_update completed (texte)
//   [diff]        tool_call + update avec contenu diff (event edit côté client)
//   [plan]        deux updates `plan` (3 entrées, statuts évolutifs)
//   [permission]  session/request_permission (3 options canoniques) ;
//                 le texte final reflète l'outcome reçu
//   [plan-review] request_permission plan review (plan_opt_0..2 + revise + exit)
//   [question]    request_permission AskUserQuestion (q0_opt_0..2 + q0_skip)
//   [slow-permission] request_permission PUIS 3 message chunks streamés
//                 pendant l'attente (prouve le dispatcher non bloquant)
//   [config-push] émet config_option_update (snapshot) en cours de tour
//   [commands]    émet available_commands_update
//   [usage]       émet usage_update (hors contrat Kimi 0.26 — tolérance)
//   [cancel]      stream sans fin jusqu'à session/cancel → stopReason cancelled
//   [refusal]     stopReason refusal
//   [invalid-json] émet une ligne non-JSON isolée au milieu du stream
//   [late]        répond après FAKE_KIMI_LATE_MS (défaut 250 ms)
//   [eof]         quitte brutalement sans répondre (pending à drainer)
//   [fs-request]  envoie fs/read_text_file au client, échoue le tour si la
//                 réponse n'est pas l'erreur -32601 (capacité non annoncée)
//   [image]       exige un bloc {type:"image",data,mimeType} ; répond
//                 "img:<mimeType>:<octets base64>" sans jamais logguer data

import process from "node:process";

const MODE = process.env.FAKE_KIMI_MODE || "nominal";
const FRAGMENT = process.env.FAKE_KIMI_FRAGMENT === "1";
const LATE_MS = Number(process.env.FAKE_KIMI_LATE_MS || 250);
const VERSION = MODE === "old_version" ? "0.20.0" : "0.26.0";

// ---------------------------------------------------------------------------
// Sortie NDJSON (fragmentée si demandé — le contenu reste identique).
let stdoutQueue = Promise.resolve();
function writeLine(obj) {
  const line = JSON.stringify(obj) + "\n";
  stdoutQueue = stdoutQueue.then(async () => {
    if (!FRAGMENT) {
      process.stdout.write(line);
      return;
    }
    for (let i = 0; i < line.length; i += 7) {
      process.stdout.write(line.slice(i, i + 7));
      await new Promise((r) => setImmediate(r));
    }
  });
  return stdoutQueue;
}
function writeRaw(text) {
  stdoutQueue = stdoutQueue.then(() => {
    process.stdout.write(text);
  });
}
const reply = (id, result) => writeLine({ jsonrpc: "2.0", id, result });
const replyErr = (id, code, message, data) =>
  writeLine({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const notify = (method, params) => writeLine({ jsonrpc: "2.0", method, params });
const update = (sessionId, u) => notify("session/update", { sessionId, update: u });

// ---------------------------------------------------------------------------
// Catalogue et sessions prédéfinies (aucune donnée réelle).
const MODELS = [
  { value: "fake-k3", name: "Fake K3", description: "Modèle de test avec thinking" },
  { value: "fake-k3-mini", name: "Fake K3 Mini", description: "Modèle de test sans thinking" },
];
const THINKING_MODELS = new Set(["fake-k3"]);
const MODES = [
  { value: "default", name: "Default", description: "Manual approvals; tools execute normally." },
  { value: "plan", name: "Plan", description: "Read-only planning; no tool execution." },
  { value: "auto", name: "Auto", description: "Auto-approve safe operations." },
  { value: "yolo", name: "YOLO", description: "Auto-approve everything." },
];
// Sessions listables/chargeables : deux cwd distincts, titre null et
// updatedAt invalide couverts (tolérance client exigée par le plan).
const KNOWN_SESSIONS = [
  { sessionId: "session_known_a", cwd: "/tmp/fake-kimi/proj-a", title: "Session A", updatedAt: "2026-07-01T10:00:00.000Z" },
  { sessionId: "session_known_b", cwd: "/tmp/fake-kimi/proj-b", title: null, updatedAt: "not-a-date" },
];

let sessionCounter = 0;
// sessionId → { model, thinking, mode, turn, cancelState }
const sessions = new Map();
let serverReqId = 1000;
// id → resolve(outcome) des requêtes client (request_permission, fs/…)
const pendingServerReqs = new Map();

function configOptions(st) {
  const out = [
    {
      type: "select",
      id: "model",
      name: "Model",
      category: "model",
      currentValue: st.model,
      options: MODELS,
    },
  ];
  if (THINKING_MODELS.has(st.model)) {
    out.push({
      type: "select",
      id: "thinking",
      name: "Thinking",
      category: "thought_level",
      currentValue: st.thinking,
      options: [
        { value: "off", name: "Thinking Off" },
        { value: "on", name: "Thinking On" },
      ],
    });
  }
  out.push({
    type: "select",
    id: "mode",
    name: "Mode",
    category: "mode",
    currentValue: st.mode,
    options: MODES,
  });
  return out;
}

function newSessionState() {
  return { model: "fake-k3", thinking: "on", mode: "default", turn: 0, cancel: null };
}

function serverRequest(method, params) {
  const id = serverReqId++;
  writeLine({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => pendingServerReqs.set(id, resolve));
}

// ---------------------------------------------------------------------------
// Tour de prompt.
async function handlePrompt(id, params) {
  const sid = params?.sessionId;
  const st = sessions.get(sid);
  if (!st) {
    return replyErr(id, -32602, "Session not found");
  }
  const blocks = Array.isArray(params?.prompt) ? params.prompt : [];
  const text = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  st.turn += 1;
  const turn = st.turn;
  const callId = (n) => `${turn}:call_${n}`;

  if (text.includes("[eof]")) {
    // EOF brutal : plusieurs requêtes peuvent être pending côté client.
    process.exit(0);
  }
  if (text.includes("[late]")) {
    await new Promise((r) => setTimeout(r, LATE_MS));
    return reply(id, { stopReason: "end_turn" });
  }

  if (text.includes("[image]")) {
    const img = blocks.find((b) => b && b.type === "image");
    if (!img || typeof img.data !== "string" || !img.data.length || typeof img.mimeType !== "string") {
      return replyErr(id, -32602, "prompt image block missing");
    }
    await update(sid, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: `img:${img.mimeType}:${img.data.length}` },
    });
    return reply(id, { stopReason: "end_turn" });
  }

  if (text.includes("[cancel]")) {
    // Stream continu jusqu'à session/cancel.
    let n = 0;
    st.cancel = null;
    const cancelled = new Promise((resolve) => (st.cancel = resolve));
    const timer = setInterval(() => {
      n += 1;
      update(sid, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `tick${n} ` },
      });
    }, 20);
    await cancelled;
    clearInterval(timer);
    st.cancel = null;
    return reply(id, { stopReason: "cancelled" });
  }

  await update(sid, {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "réflexion du fake" },
  });

  if (text.includes("[invalid-json]")) {
    writeRaw("ceci n'est pas du JSON\n");
  }

  if (text.includes("[commands]")) {
    await update(sid, {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        { name: "compact", description: "Compact the conversation context", input: { hint: "instructions" } },
        { name: "usage", description: "Show session token usage" },
      ],
    });
  }

  if (text.includes("[config-push]")) {
    await update(sid, { sessionUpdate: "config_option_update", configOptions: configOptions(st) });
  }

  if (text.includes("[plan]")) {
    await update(sid, {
      sessionUpdate: "plan",
      entries: [
        { content: "Lire les fichiers", priority: "medium", status: "completed" },
        { content: "Écrire le correctif", priority: "medium", status: "in_progress" },
        { content: "Lancer les tests", priority: "medium", status: "pending" },
      ],
    });
    await update(sid, {
      sessionUpdate: "plan",
      entries: [
        { content: "Lire les fichiers", priority: "medium", status: "completed" },
        { content: "Écrire le correctif", priority: "medium", status: "completed" },
        { content: "Lancer les tests", priority: "medium", status: "in_progress" },
      ],
    });
  }

  if (text.includes("[tool]") || text.includes("[diff]")) {
    await update(sid, {
      sessionUpdate: "tool_call",
      toolCallId: callId(1),
      title: "Bash",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "echo fake" },
    });
    const content = text.includes("[diff]")
      ? [{ type: "diff", path: "/tmp/fake-kimi/a.txt", oldText: "", newText: "contenu écrit\n" }]
      : [{ type: "content", content: { type: "text", text: "sortie outil fake" } }];
    await update(sid, {
      sessionUpdate: "tool_call_update",
      toolCallId: callId(1),
      status: "completed",
      content,
    });
  }

  if (text.includes("[fs-request]")) {
    const resp = await serverRequest("fs/read_text_file", { sessionId: sid, path: "/tmp/fake-kimi/x.txt" });
    const codeStr = resp && resp.error ? String(resp.error.code) : "no-error";
    await update(sid, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: `fs:${codeStr}` },
    });
    return reply(id, { stopReason: "end_turn" });
  }

  const permissionKinds = [];
  if (text.includes("[permission]")) permissionKinds.push("tool");
  if (text.includes("[slow-permission]")) permissionKinds.push("slow");
  if (text.includes("[plan-review]")) permissionKinds.push("plan_review");
  if (text.includes("[question]")) permissionKinds.push("question");

  for (const kindReq of permissionKinds) {
    let options;
    let title;
    let content;
    if (kindReq === "plan_review") {
      title = "ExitPlanMode";
      content = [{ type: "content", content: { type: "text", text: "Review the proposed plan" } }];
      options = [
        { optionId: "plan_opt_0", name: "Variante A", kind: "allow_once" },
        { optionId: "plan_opt_1", name: "Variante B", kind: "allow_once" },
        { optionId: "plan_opt_2", name: "Variante C", kind: "allow_once" },
        { optionId: "plan_revise", name: "Revise", kind: "reject_once" },
        { optionId: "plan_reject_and_exit", name: "Reject and Exit", kind: "reject_once" },
      ];
    } else if (kindReq === "question") {
      title = "AskUserQuestion";
      content = [{ type: "content", content: { type: "text", text: "Quelle couleur ?" } }];
      options = [
        { optionId: "q0_opt_0", name: "Rouge", kind: "allow_once" },
        { optionId: "q0_opt_1", name: "Vert", kind: "allow_once" },
        { optionId: "q0_opt_2", name: "Bleu", kind: "allow_once" },
        { optionId: "q0_skip", name: "Skip", kind: "reject_once" },
      ];
    } else {
      title = "Bash";
      content = [
        { type: "content", content: { type: "text", text: "Requesting approval to run `rm -rf /tmp/x`" } },
      ];
      options = [
        { optionId: "approve_once", name: "Approve once", kind: "allow_once" },
        { optionId: "approve_always", name: "Approve for this session", kind: "allow_always" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ];
    }
    const pending = serverRequest("session/request_permission", {
      sessionId: sid,
      toolCall: { toolCallId: callId(9), title, content },
      options,
    });
    if (kindReq === "slow") {
      // Updates concurrentes pendant l'attente de la permission : le client
      // ne doit bloquer ni ces chunks ni les autres sessions.
      for (const t of ["pendant1 ", "pendant2 ", "pendant3 "]) {
        await update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: t } });
      }
    }
    const resp = await pending;
    const outcome = resp && resp.result && resp.result.outcome ? resp.result.outcome : { outcome: "cancelled" };
    const label =
      outcome.outcome === "selected" ? `selected:${outcome.optionId}` : String(outcome.outcome || "cancelled");
    await update(sid, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: `perm:${label} ` },
    });
  }

  if (text.includes("[usage]")) {
    await update(sid, {
      sessionUpdate: "usage_update",
      used: 1234,
      size: 200000,
      cost: { amount: 0.005, currency: "USD" },
    });
  }

  await update(sid, {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "réponse " },
  });
  await update(sid, {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: `du fake (model=${st.model},thinking=${THINKING_MODELS.has(st.model) ? st.thinking : "n/a"},mode=${st.mode})` },
  });

  if (text.includes("[refusal]")) {
    return reply(id, { stopReason: "refusal" });
  }
  // Contrat Kimi 0.26 : la réponse prompt ne porte QUE stopReason (jamais usage).
  return reply(id, { stopReason: "end_turn" });
}

// Replay `session/load` : updates émises AVANT la réponse (contrat vérifié).
async function replayHistory(sid) {
  await update(sid, {
    sessionUpdate: "user_message_chunk",
    content: { type: "text", text: "question historique" },
  });
  await update(sid, {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "réponse historique" },
  });
  await update(sid, {
    sessionUpdate: "tool_call",
    toolCallId: "1:call_hist",
    title: "Read",
    kind: "read",
    status: "in_progress",
  });
  await update(sid, {
    sessionUpdate: "tool_call_update",
    toolCallId: "1:call_hist",
    status: "completed",
    content: [{ type: "content", content: { type: "text", text: "contenu historique" } }],
  });
}

// ---------------------------------------------------------------------------
// Dispatch JSON-RPC entrant.
async function handle(msg) {
  const { id, method, params } = msg;

  // Réponse à une de NOS requêtes (request_permission, fs/…).
  if (method === undefined && id !== undefined) {
    const pending = pendingServerReqs.get(id);
    if (pending) {
      pendingServerReqs.delete(id);
      pending(msg);
    }
    return;
  }

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, audio: false, embeddedContext: true },
          mcpCapabilities: { http: true, sse: true },
          sessionCapabilities: { list: {}, resume: {} },
        },
        authMethods: [
          {
            id: "login",
            type: "terminal",
            name: "Login with Kimi account",
            description: "Open the device-code login flow in a terminal.",
            args: ["--login"],
            env: {},
            _meta: {
              "terminal-auth": {
                type: "terminal",
                label: "Login with Kimi account",
                command: "/fake/bin/kimi",
                args: ["login"],
                env: {},
              },
            },
          },
        ],
        agentInfo: { name: "Kimi Code CLI", version: VERSION },
      });

    case "authenticate":
      if (MODE === "auth_required") return replyErr(id, -32000, "Authentication required");
      if (params?.methodId !== "login") return replyErr(id, -32602, "Unknown auth method");
      return reply(id, {});

    case "session/new": {
      if (MODE === "auth_required") return replyErr(id, -32000, "Authentication required");
      sessionCounter += 1;
      const sid = `session_fake_${sessionCounter}`;
      const st = newSessionState();
      if (typeof params?.cwd !== "string" || !Array.isArray(params?.mcpServers)) {
        return replyErr(id, -32602, "cwd and mcpServers required");
      }
      sessions.set(sid, st);
      return reply(id, { sessionId: sid, configOptions: configOptions(st) });
    }

    case "session/load":
    case "session/resume": {
      if (MODE === "auth_required") return replyErr(id, -32000, "Authentication required");
      const sid = params?.sessionId;
      const known = KNOWN_SESSIONS.some((s) => s.sessionId === sid) || sessions.has(sid);
      if (!known) return replyErr(id, -32602, "Session not found");
      if (!sessions.has(sid)) sessions.set(sid, newSessionState());
      const st = sessions.get(sid);
      if (method === "session/load") await replayHistory(sid);
      return reply(id, { configOptions: configOptions(st) });
    }

    case "session/list": {
      const cwd = typeof params?.cwd === "string" ? params.cwd : null;
      const list = KNOWN_SESSIONS.filter((s) => !cwd || s.cwd === cwd).map((s) => ({ ...s }));
      return reply(id, { sessions: list, nextCursor: null });
    }

    case "session/set_config_option": {
      const st = sessions.get(params?.sessionId);
      if (!st) return replyErr(id, -32602, "Session not found");
      const { configId, value } = params ?? {};
      const validate = (allowed) => allowed.some((o) => o.value === value);
      if (configId === "model") {
        if (!validate(MODELS)) return replyErr(id, -32602, `Unknown model: ${value}`);
        st.model = value;
        if (!THINKING_MODELS.has(st.model)) st.thinking = "off";
      } else if (configId === "thinking") {
        if (!THINKING_MODELS.has(st.model)) return replyErr(id, -32602, "thinking not supported");
        if (value !== "on" && value !== "off") return replyErr(id, -32602, `Unknown thinking: ${value}`);
        st.thinking = value;
      } else if (configId === "mode") {
        if (!validate(MODES)) return replyErr(id, -32602, `Unknown mode: ${value}`);
        st.mode = value;
      } else {
        return replyErr(id, -32602, `Unknown configId: ${configId}`);
      }
      const snapshot = configOptions(st);
      await reply(id, { configOptions: snapshot });
      // Kimi double-canal : notification après la réponse.
      return update(params.sessionId, { sessionUpdate: "config_option_update", configOptions: snapshot });
    }

    case "session/prompt":
      return handlePrompt(id, params);

    default:
      if (method === "session/cancel") {
        const st = sessions.get(params?.sessionId);
        if (st && typeof st.cancel === "function") st.cancel();
        return; // notification — pas de réponse
      }
      if (id !== undefined) {
        return replyErr(id, -32601, `Method not found: ${method}`);
      }
      return;
  }
}

// ---------------------------------------------------------------------------
// Boucle stdin NDJSON.
let carry = "";
process.stdin.on("data", (chunk) => {
  carry += chunk.toString();
  let idx;
  while ((idx = carry.indexOf("\n")) >= 0) {
    const line = carry.slice(0, idx).trim();
    carry = carry.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ligne corrompue : jamais fatal
    }
    Promise.resolve(handle(msg)).catch((e) => {
      process.stderr.write(`fake_kimi_acp handle error: ${e}\n`);
    });
  }
});
process.stdin.on("end", () => process.exit(0));
