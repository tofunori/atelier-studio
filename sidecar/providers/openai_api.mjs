// Providers API OpenAI-compatible (OpenRouter, MiniMax, GLM, DeepSeek, Together…).
// Chat pur : pas d'outils ni d'accès projet — le "resume" est local (historique
// JSONL par session sous APP_DIR/api_sessions/), rejoué à chaque tour.
//
// Config utilisateur : APP_DIR/api_providers.json (chmod 600), tableau de
//   { id, label, baseURL, apiKey? , apiKeyEnv?, models, defaultModel? }
// La clé ne quitte jamais le sidecar.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";

const APP_DIR = `${homedir()}/Library/Application Support/atelier-studio`;
const CONFIG_FILE = `${APP_DIR}/api_providers.json`;
const SESSIONS_DIR = `${APP_DIR}/api_sessions`;
const MAX_HISTORY_MESSAGES = 60; // fenêtre glissante rejouée à chaque tour
const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

function normalizeModelEntry(model) {
  if (typeof model === "string") return { id: model };
  if (!model || typeof model !== "object") return null;
  const id = String(model.id ?? model.name ?? "").trim();
  if (!id) return null;
  return {
    id,
    ...(model.label ? { label: String(model.label) } : {}),
    ...(model.reasoning && typeof model.reasoning === "object" ? { reasoning: model.reasoning } : {}),
  };
}

export function loadApiProviderConfigs(configFile = CONFIG_FILE) {
  if (!existsSync(configFile)) return [];
  try {
    const raw = JSON.parse(readFileSync(configFile, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.providers;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p?.id && p?.baseURL && Array.isArray(p?.models) && p.models.length)
      .map((p) => {
        const entries = p.models.map(normalizeModelEntry).filter(Boolean);
        const modelReasoning = Object.fromEntries(entries
          .filter((m) => m.reasoning)
          .map((m) => [m.id, m.reasoning]));
        return {
          id: String(p.id),
          label: String(p.label ?? p.id),
          baseURL: String(p.baseURL).replace(/\/+$/, ""),
          apiKey: p.apiKey ?? null,
          apiKeyEnv: p.apiKeyEnv ?? null,
          protocol: p.protocol === "anthropic" ? "anthropic" : "openai",
          models: entries.map((m) => m.id),
          modelReasoning,
          defaultModel: String(p.defaultModel ?? entries[0]?.id ?? ""),
        };
      });
  } catch {
    return [];
  }
}

export function writeApiProviderConfigs(providers, configFile = CONFIG_FILE) {
  mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(configFile, JSON.stringify(providers, null, 2));
  try { chmodSync(configFile, 0o600); } catch {}
}

export function resolveApiKey(cfg) {
  if (cfg.apiKeyEnv && process.env[cfg.apiKeyEnv]) return process.env[cfg.apiKeyEnv];
  if (cfg.apiKey) return cfg.apiKey;
  return null;
}

// ---------------------------------------------------------------------------
// Historique local par session (JSONL: {role, content} par ligne)
// ---------------------------------------------------------------------------
function sessionPath(sessionId) {
  return `${SESSIONS_DIR}/${sessionId}.jsonl`;
}

export function loadHistory(sessionId) {
  const path = sessionPath(sessionId);
  if (!sessionId || !existsSync(path)) return [];
  const messages = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const m = JSON.parse(trimmed);
      if (m?.role && typeof m.content === "string") {
        messages.push({
          role: m.role,
          content: m.content,
          ...(typeof m.reasoning === "string" && m.reasoning ? { reasoning: m.reasoning } : {}),
          ...(Array.isArray(m.reasoning_details) ? { reasoning_details: m.reasoning_details } : {}),
        });
      }
    } catch {}
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function appendHistory(sessionId, messages) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  appendFileSync(sessionPath(sessionId), messages.map((m) => JSON.stringify(m) + "\n").join(""));
}

// ---------------------------------------------------------------------------
// Parsing SSE (text/event-stream) → events Atelier
// ---------------------------------------------------------------------------
export function parseSseChunk(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let obj;
    try { obj = JSON.parse(data); } catch { continue; }
    const choice = obj?.choices?.[0];
    const delta = choice?.delta ?? {};
    // OpenRouter/DeepSeek exposent le raisonnement en delta.reasoning
    const reasoning = delta.reasoning ?? delta.reasoning_content;
    if (typeof reasoning === "string" && reasoning) {
      events.push({ kind: "thinking_delta", text: reasoning });
    }
    for (const detail of delta.reasoning_details ?? []) {
      const text = detail?.text ?? detail?.summary ?? null;
      if (typeof text === "string" && text) {
        events.push({ kind: "thinking_delta", text });
      }
    }
    if (typeof delta.content === "string" && delta.content) {
      events.push({ kind: "delta", text: delta.content });
    }
    if (obj?.usage) {
      events.push({
        kind: "usage",
        usage: {
          context: obj.usage.prompt_tokens ?? 0,
          output: obj.usage.completion_tokens ?? 0,
          cost: obj.usage.cost ?? null,
          turns: null,
        },
      });
    }
    if (obj?.error) {
      events.push({ kind: "error", message: String(obj.error.message ?? JSON.stringify(obj.error)) });
    }
  }
  return { events, rest };
}

// Protocole Anthropic (/v1/messages) — GLM, MiniMax et autres services
// "Claude-Code-compatibles". Events SSE: message_start, content_block_delta
// (text_delta | thinking_delta), message_delta (usage), message_stop, error.
export function parseAnthropicSseChunk(chunk, carry = "") {
  const text = carry + chunk;
  const lines = text.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    let obj;
    try { obj = JSON.parse(data); } catch { continue; }
    if (obj.type === "content_block_delta") {
      const d = obj.delta ?? {};
      if (d.type === "text_delta" && d.text) events.push({ kind: "delta", text: d.text });
      else if (d.type === "thinking_delta" && d.thinking) events.push({ kind: "thinking_delta", text: d.thinking });
    } else if (obj.type === "message_start") {
      const u = obj.message?.usage;
      if (u) events.push({ kind: "usage", usage: { context: u.input_tokens ?? 0, output: 0, cost: null, turns: null } });
    } else if (obj.type === "message_delta") {
      const u = obj.usage;
      if (u) events.push({
        kind: "usage",
        usage: { context: u.input_tokens ?? null, output: u.output_tokens ?? 0, cost: null, turns: null },
      });
    } else if (obj.type === "error") {
      events.push({ kind: "error", message: String(obj.error?.message ?? JSON.stringify(obj.error)) });
    }
  }
  return { events, rest };
}

// Découverte des modèles : GET /models (OpenAI) ou /v1/models (Anthropic).
// `entry` = config partielle {baseURL, protocol, apiKey?|apiKeyEnv?|id?} ;
// si `id` correspond à un provider configuré, sa clé stockée est utilisée.
export async function fetchAvailableModels(entry) {
  const configs = loadApiProviderConfigs();
  const existing = entry.id ? configs.find((c) => c.id === entry.id) : null;
  const cfg = {
    baseURL: String(entry.baseURL ?? existing?.baseURL ?? "").replace(/\/+$/, ""),
    protocol: (entry.protocol ?? existing?.protocol) === "anthropic" ? "anthropic" : "openai",
    apiKey: entry.apiKey || existing?.apiKey || null,
    apiKeyEnv: entry.apiKeyEnv ?? existing?.apiKeyEnv ?? null,
  };
  const apiKey = resolveApiKey(cfg);
  if (!cfg.baseURL) throw new Error("baseURL requise");
  if (!apiKey) throw new Error("clé API requise pour lister les modèles");
  const url = cfg.protocol === "anthropic" ? `${cfg.baseURL}/v1/models` : `${cfg.baseURL}/models`;
  const headers = cfg.protocol === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${apiKey}` };
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  // proxys minimaux (ex. relais perso) : /models pas relayé ; le catalogue
  // OpenRouter est public, on retombe dessus directement
  if (!res.ok && /openrouter/i.test(cfg.baseURL)) {
    res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
  return list
    .map((m) => ({
      id: String(m.id ?? m.name ?? ""),
      label: String(m.display_name ?? m.name ?? m.id ?? ""),
      reasoning: m.reasoning && typeof m.reasoning === "object" ? m.reasoning : null,
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function modelLooksReasoningCapable(model) {
  return /(^|\/|-)glm-5|deepseek.*r1|qwen.*(thinking|qwq)|grok|gemini-(3|2\.5)|(^|\/)o[134]|gpt-5/i
    .test(String(model ?? ""));
}

function providerAcceptsReasoningParam(cfg) {
  return /openrouter/i.test(cfg.baseURL);
}

function reasoningForRequest(cfg, model, effort) {
  if (cfg.protocol !== "openai") return null;
  const metadata = cfg.modelReasoning?.[model] ?? null;
  const supported = Array.isArray(metadata?.supported_efforts) ? metadata.supported_efforts : null;
  const normalizedEffort = String(effort ?? "").trim();
  if (normalizedEffort === "none") return { effort: "none", exclude: false };
  if (REASONING_EFFORTS.includes(normalizedEffort)) {
    return { enabled: true, effort: normalizedEffort, exclude: false };
  }
  if (metadata?.mandatory || metadata?.default_enabled || supported || modelLooksReasoningCapable(model)) {
    const defaultEffort = metadata?.default_effort && metadata.default_effort !== "none"
      ? metadata.default_effort
      : supported?.includes("medium") ? "medium" : supported?.at(-1) ?? "medium";
    return { enabled: true, effort: defaultEffort, exclude: false };
  }
  if (providerAcceptsReasoningParam(cfg)) {
    return { enabled: true, exclude: false };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fabrique un provider runtime au contrat du router (run/interrupt/status)
// ---------------------------------------------------------------------------
export function makeApiProvider(cfg) {
  const controllers = new Map(); // threadId -> AbortController

  async function run({ threadId, prompt, sessionId, model, effort, onEvent }) {
    const apiKey = resolveApiKey(cfg);
    if (!apiKey) {
      const message = `clé API manquante pour ${cfg.label} (${cfg.apiKeyEnv ?? "apiKey"})`;
      onEvent?.({ kind: "error", message });
      throw new Error(message);
    }
    const sid = sessionId || randomUUID();
    const history = loadHistory(sid);
    const userMessage = { role: "user", content: String(prompt ?? "") };
    const anthropic = cfg.protocol === "anthropic";
    const selectedModel = model || cfg.defaultModel;
    const reasoning = reasoningForRequest(cfg, selectedModel, effort);
    const body = anthropic
      ? {
        model: selectedModel,
        max_tokens: 8192,
        messages: [...history, userMessage],
        stream: true,
      }
      : {
        model: selectedModel,
        messages: [...history, userMessage],
        stream: true,
        stream_options: { include_usage: true },
        ...(reasoning ? { reasoning } : {}),
      };

    const controller = new AbortController();
    controllers.set(threadId, controller);
    let fullText = "";
    let fullThinking = "";
    let usage = { context: 0, output: 0, cost: null, turns: null };
    try {
      const url = anthropic ? `${cfg.baseURL}/v1/messages` : `${cfg.baseURL}/chat/completions`;
      const headers = anthropic
        ? {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        }
        : {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`${cfg.label} HTTP ${res.status}: ${detail}`);
      }
      const decoder = new TextDecoder();
      const parse = anthropic ? parseAnthropicSseChunk : parseSseChunk;
      let carry = "";
      for await (const chunk of res.body) {
        const parsed = parse(decoder.decode(chunk, { stream: true }), carry);
        carry = parsed.rest;
        for (const event of parsed.events) {
          if (event.kind === "usage") {
            // Anthropic répartit l'usage sur message_start (input) et
            // message_delta (output) : fusionner sans écraser par des null
            usage = {
              context: event.usage.context ?? usage.context,
              output: event.usage.output ?? usage.output,
              cost: event.usage.cost ?? usage.cost,
              turns: null,
            };
            continue;
          }
          if (event.kind === "error") throw new Error(event.message);
          if (event.kind === "delta") fullText += event.text;
          if (event.kind === "thinking_delta") fullThinking += event.text;
          onEvent?.(event);
        }
      }
      appendHistory(sid, [userMessage, {
        role: "assistant",
        content: fullText,
        ...(fullThinking ? { reasoning: fullThinking } : {}),
      }]);
      onEvent?.({ kind: "text", text: fullText });
      onEvent?.({ kind: "done", ok: true, result: fullText, usage });
      return { sessionId: sid };
    } catch (e) {
      if (controller.signal.aborted) {
        // tour interrompu : conserver ce qui a été produit
        if (fullText || fullThinking) appendHistory(sid, [userMessage, {
          role: "assistant",
          content: fullText,
          ...(fullThinking ? { reasoning: fullThinking } : {}),
        }]);
        onEvent?.({ kind: "done", ok: false, result: fullText, usage });
        return { sessionId: sid };
      }
      onEvent?.({ kind: "error", message: String(e.message ?? e) });
      throw e;
    } finally {
      controllers.delete(threadId);
    }
  }

  async function interrupt(threadId) {
    controllers.get(threadId)?.abort();
  }

  function status() {
    return { id: cfg.id, label: cfg.label, ok: !!resolveApiKey(cfg), keyMissing: !resolveApiKey(cfg) };
  }

  return { id: cfg.id, kind: "api", run, interrupt, status };
}
