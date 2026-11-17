#!/usr/bin/env node
// Faux `agy acp` déterministe (fournisseur Antigravity, lot 2).
//
// Reproduit les formes relevées par la sonde du 2026-11-17 sur agy 1.5.10
// (plans/antigravity-2026-11-17/sonde-resultats.md) : options de session
// `model` (ids sans effort) / `thought_level` / `mode`, modes standard via
// `session/set_mode`, permissions `allow`/`deny` seulement avec des ids de
// requête serveur EN CHAÎNE, outils nommés (`run_command`, `write_file`,
// `ask_question`) avec `args`, `rawOutput {output, exit_code}`, revue de plan
// par l'écriture de `brain/<sid>/implementation_plan.md`, usage dans la
// réponse de `session/prompt`, `session/list` qui ignore `cwd`.
//
// Lancement : `node fake_agy_acp.mts <mode>` ; modes : nominal, old_version,
// auth_required.
//
// Marqueurs du prompt :
//   [command]     run_command avec permission ; le texte final dit l'outcome
//   [edit]        write_file avec permission et diff
//   [plan-review] écriture d'implementation_plan.md avec RequestFeedback
//   [question]    ask_question laissé pending, question en texte, end_turn
//   [silent]      end_turn sans contenu ni usage
//   [cancel]      flux sans fin jusqu'à session/cancel → cancelled
//   [stuck]       ignore session/cancel ; session/close termine le tour
//   [chatty]      une pensée toutes les 200 ms pendant ~2,4 s
//   [mute]        ne dit plus rien et ne répond jamais
//   [image]       exige un bloc image
//   [refusal]     stopReason refusal

import process from "node:process";

// Commandes latérales (sans ACP) : `--version`, `models`.
if (process.argv[2] === "--version") {
  process.stdout.write("agy 1.5.10\n");
  process.exit(0);
}
if (process.argv[2] === "models") {
  process.stdout.write(
    "Fetching available models...\n" +
      "gemini-4-carbon\tGemini 4 Carbon\n" +
      "gemini-4-carbon-high\tGemini 4 Carbon (High)\n" +
      "claude-opus-5-5\tClaude Opus 5.5 (Thinking)\n",
  );
  process.exit(0);
}

const MODE = process.argv[2] || "nominal";
const VERSION = MODE === "old_version" ? "1.5.9" : "1.5.10";
const HOME = process.env.HOME || "/tmp";

const write = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const reply = (id, result) => write({ jsonrpc: "2.0", id, result });
const replyErr = (id, code, message) => write({ jsonrpc: "2.0", id, error: { code, message } });
const update = (sessionId, u) =>
  write({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODELS = ["gemini-4-carbon", "claude-opus-5-5", "gpt-oss-120b-medium"];
const NO_THOUGHT = new Set(["gpt-oss-120b-medium"]);
const MODES = ["default", "accept-edits", "auto", "plan"];

let sessionCounter = 0;
const sessions = new Map();
const counters = { resume: 0, close: 0, authenticate: 0, set_mode: [] };

function newState() {
  return { model: "gemini-4-carbon", thought: "medium", mode: "default", cancel: null, close: null };
}

function configOptions(st) {
  const opts = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: st.model,
      options: MODELS.map((value) => ({ value, name: value })),
    },
  ];
  if (!NO_THOUGHT.has(st.model)) {
    opts.push({
      id: "thought_level",
      name: "Thinking",
      category: "thought_level",
      type: "select",
      currentValue: st.thought,
      options: ["low", "medium", "high"].map((value) => ({ value, name: value })),
    });
  }
  opts.push({
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: st.mode,
    options: MODES.map((value) => ({ value, name: value })),
  });
  return opts;
}

function sessionResult(sid, st) {
  return {
    ...(sid ? { sessionId: sid } : {}),
    models: {
      availableModels: [{ modelId: `${st.model}-medium`, name: st.model }],
      currentModelId: `${st.model}-medium`,
    },
    modes: {
      currentModeId: st.mode,
      availableModes: MODES.map((id) => ({ id, name: id })),
    },
    configOptions: configOptions(st),
    _meta: { antigravity: { tier: { name: "Google AI Pro", id: "g1-pro-tier" } } },
  };
}

// Requêtes serveur → client : ids EN CHAÎNE comme agy.
let serverReqId = 0;
const pendingServerReqs = new Map();
function serverRequest(method, params) {
  serverReqId += 1;
  const id = String(serverReqId);
  return new Promise((resolve) => {
    pendingServerReqs.set(id, resolve);
    write({ jsonrpc: "2.0", id, method, params });
  });
}

const OPTIONS = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "deny", name: "Deny", kind: "reject_once" },
];

async function permissionFor(sid, toolCall) {
  await update(sid, { sessionUpdate: "tool_call_update", toolCallId: toolCall.toolCallId, status: "pending" });
  const res = await serverRequest("session/request_permission", { sessionId: sid, toolCall, options: OPTIONS });
  const outcome = res?.result?.outcome;
  if (outcome?.outcome === "selected") return outcome.optionId;
  return "cancelled";
}

async function runTool(sid, st, tc, extra) {
  update(sid, { sessionUpdate: "tool_call", status: "in_progress", ...tc });
  const verdict = await permissionFor(sid, { ...tc, ...(extra || {}) });
  if (verdict === "allow") {
    update(sid, {
      sessionUpdate: "tool_call_update",
      toolCallId: tc.toolCallId,
      status: "completed",
      ...(tc.name === "run_command" ? { rawOutput: { output: "a.txt\nb.txt\n", exit_code: 0 } } : {}),
      ...(extra?.content ? { content: extra.content } : {}),
    });
  } else {
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: tc.toolCallId, status: "failed" });
  }
  return verdict;
}

async function handlePrompt(id, params) {
  const sid = params?.sessionId;
  const st = sessions.get(sid);
  if (!st) return replyErr(id, -32002, "Session not found");
  const blocks = Array.isArray(params?.prompt) ? params.prompt : [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const consigne = blocks[0]?.type === "text" && blocks[0].text.startsWith("<consigne-atelier>");

  if (text.includes("[silent]")) return reply(id, { stopReason: "end_turn" });
  if (text.includes("[mute]")) return; // jamais de réponse

  update(sid, { sessionUpdate: "session_info_update", title: "Titre du fake" });
  update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Planning the answer" } });

  if (text.includes("[image]")) {
    const img = blocks.find((b) => b.type === "image");
    if (!img || typeof img.data !== "string" || !img.mimeType) {
      return replyErr(id, -32602, "image block expected");
    }
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `img:${img.mimeType}` } });
  }

  const outcomes = [];
  if (text.includes("[command]")) {
    outcomes.push(
      await runTool(sid, st, {
        toolCallId: `tc_cmd_${Date.now()}`,
        title: "ls -la",
        kind: "execute",
        name: "run_command",
        args: { CommandLine: "ls -la" },
      }),
    );
  }
  if (text.includes("[edit]")) {
    outcomes.push(
      await runTool(
        sid,
        st,
        { toolCallId: `tc_edit_${Date.now()}`, title: "notes.md", kind: "edit", name: "write_file",
          args: { TargetFile: "/tmp/fake-agy-proj/notes.md" } },
        { content: [{ type: "diff", path: "/tmp/fake-agy-proj/notes.md", newText: "neuf" }] },
      ),
    );
  }
  if (text.includes("[plan-review]")) {
    const path = `${HOME}/.gemini/antigravity-cli/brain/${sid}/implementation_plan.md`;
    outcomes.push(
      await runTool(
        sid,
        st,
        { toolCallId: `tc_plan_${Date.now()}`, title: "implementation_plan.md", kind: "edit", name: "write_file",
          args: { TargetFile: path, ArtifactMetadata: { RequestFeedback: true } } },
        { content: [{ type: "diff", path, newText: "# Plan\n1. Lire\n2. Écrire" }] },
      ),
    );
  }
  if (text.includes("[question]")) {
    update(sid, { sessionUpdate: "tool_call", toolCallId: "tc_q", title: "Ask user", kind: "other",
      name: "ask_question", status: "in_progress", args: { question: "Laquelle ?" } });
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Laquelle préfères-tu ?" } });
  }
  if (text.includes("[chatty]")) {
    for (let i = 0; i < 12; i++) {
      await sleep(200);
      update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: `étape ${i}` } });
    }
  }
  if (text.includes("[cancel]") || text.includes("[stuck]")) {
    update(sid, { sessionUpdate: "tool_call", toolCallId: "tc_long", title: "sleep 600", kind: "execute",
      name: "run_command", status: "in_progress", args: { CommandLine: "sleep 600" } });
    const stuck = text.includes("[stuck]");
    await new Promise((resolve) => {
      if (stuck) st.close = resolve;
      else st.cancel = resolve;
    });
    st.cancel = null;
    st.close = null;
    update(sid, { sessionUpdate: "tool_call_update", toolCallId: "tc_long", status: "failed" });
    return reply(id, { stopReason: "cancelled" });
  }

  const pcwd = process.cwd();
  const status = `model=${st.model},effort=${NO_THOUGHT.has(st.model) ? "n/a" : st.thought},mode=${st.mode}`;
  update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `réponse du fake (${status})` } });
  if (outcomes.length) {
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: ` permission=${outcomes.join("+")}` } });
  }
  update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: ` pcwd=${pcwd}` } });
  if (consigne) {
    update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " consigne=oui" } });
  }
  update(sid, { sessionUpdate: "usage_update", used: 1200, size: 1048576 });
  if (text.includes("[refusal]")) return reply(id, { stopReason: "refusal" });
  if (text.includes("[question]")) return reply(id, { stopReason: "end_turn" });
  return reply(id, {
    stopReason: "end_turn",
    usage: { inputTokens: 1000, outputTokens: 40, cachedReadTokens: 0, cachedWriteTokens: 0,
      thoughtTokens: 12, totalTokens: 1052 },
  });
}

async function replayHistory(sid) {
  update(sid, { sessionUpdate: "user_message_chunk", content: { type: "text", text: "question historique" } });
  update(sid, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "pensée historique" } });
  update(sid, { sessionUpdate: "tool_call", toolCallId: "tc_hist", title: "note.md", kind: "edit",
    name: "write_file", status: "completed",
    content: [{ type: "diff", path: "/tmp/fake-agy-proj/note.md", newText: "x" }] });
  update(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "réponse historique" } });
  update(sid, { sessionUpdate: "usage_update", used: 900, size: 1048576 });
}

const KNOWN_SESSIONS = [
  { sessionId: "agy_hist_1", cwd: "/tmp/fake-agy-list/", title: "Session du projet", updatedAt: "2026-11-17T12:00:00Z" },
  { sessionId: "agy_hist_2", cwd: "/ailleurs", title: "Autre projet", updatedAt: "2026-11-17T13:00:00Z" },
];

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === undefined && id !== undefined) {
    const pending = pendingServerReqs.get(String(id));
    if (pending) {
      pendingServerReqs.delete(String(id));
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
          sessionCapabilities: { resume: {}, close: {}, load: {}, list: {}, additionalDirectories: {} },
          auth: { logout: {} },
          _meta: { antigravity: { tier: true, systemPrompt: { append: true } } },
        },
        agentInfo: { name: "Antigravity ACP Server", version: VERSION },
        authMethods: [
          { id: "oauth-personal", name: "Sign in with Google" },
          { id: "oauth-business", name: "Sign in with Google Workspace" },
          { id: "gemini-api-key", name: "Gemini API key" },
          { id: "agent-platform", name: "Agent Platform" },
        ],
      });
    case "authenticate":
      counters.authenticate += 1;
      return reply(id, {});
    case "session/new": {
      if (MODE === "auth_required") return replyErr(id, -32000, "Authentication required");
      if (typeof params?.cwd !== "string" || !Array.isArray(params?.mcpServers)) {
        return replyErr(id, -32602, "cwd and mcpServers required");
      }
      sessionCounter += 1;
      const sid = `agy_sess_${sessionCounter}`;
      const st = newState();
      sessions.set(sid, st);
      reply(id, sessionResult(sid, st));
      update(sid, { sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "compact", description: "Compact" }, { name: "usage", description: "Usage" }] });
      return update(sid, { sessionUpdate: "usage_update", used: 0, size: 1048576 });
    }
    case "session/resume":
    case "session/load": {
      const sid = params?.sessionId;
      const known = sessions.has(sid) || KNOWN_SESSIONS.some((s) => s.sessionId === sid);
      if (!known) return replyErr(id, -32002, `Session not found: ${sid}`);
      if (!sessions.has(sid)) sessions.set(sid, newState());
      if (method === "session/resume") counters.resume += 1;
      if (method === "session/load") await replayHistory(sid);
      return reply(id, sessionResult(null, sessions.get(sid)));
    }
    case "session/list":
      // agy ignore le filtre cwd (sonde).
      return reply(id, { sessions: KNOWN_SESSIONS.map((s) => ({ ...s })) });
    case "session/set_config_option": {
      const st = sessions.get(params?.sessionId);
      if (!st) return replyErr(id, -32002, "Session not found");
      const { configId, value } = params ?? {};
      if (configId === "model") {
        if (!MODELS.includes(value)) return replyErr(id, -32602, `Unknown model: ${value}`);
        st.model = value;
      } else if (configId === "thought_level") {
        if (NO_THOUGHT.has(st.model)) return replyErr(id, -32602, "thought_level not supported");
        if (!["low", "medium", "high"].includes(value)) return replyErr(id, -32602, `Unknown level: ${value}`);
        st.thought = value;
      } else {
        return replyErr(id, -32602, `Unknown configId: ${configId}`);
      }
      reply(id, { configOptions: configOptions(st) });
      return update(params.sessionId, { sessionUpdate: "config_option_update", configOptions: configOptions(st) });
    }
    case "session/set_mode": {
      const st = sessions.get(params?.sessionId);
      if (!st) return replyErr(id, -32002, "Session not found");
      if (!MODES.includes(params?.modeId)) return replyErr(id, -32602, `Unknown mode: ${params?.modeId}`);
      st.mode = params.modeId;
      counters.set_mode.push(params.modeId);
      reply(id, {});
      update(params.sessionId, { sessionUpdate: "current_mode_update", currentModeId: st.mode });
      return update(params.sessionId, { sessionUpdate: "config_option_update", configOptions: configOptions(st) });
    }
    case "session/close": {
      const st = sessions.get(params?.sessionId);
      counters.close += 1;
      reply(id, {});
      // La session reste connue : un `session/resume` la rouvre.
      if (st && typeof st.close === "function") st.close();
      return;
    }
    case "session/prompt":
      return handlePrompt(id, params);
    case "_fake/counters":
      return reply(id, counters);
    default:
      if (method === "session/cancel") {
        const st = sessions.get(params?.sessionId);
        if (st && typeof st.cancel === "function") st.cancel();
        return;
      }
      if (id !== undefined) return replyErr(id, -32601, `Method not found: ${method}`);
  }
}

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
      continue;
    }
    Promise.resolve(handle(msg)).catch((e) => process.stderr.write(`fake_agy_acp: ${e}\n`));
  }
});
process.stdin.on("end", () => process.exit(0));
