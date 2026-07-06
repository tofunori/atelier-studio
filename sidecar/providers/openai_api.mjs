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

export function loadApiProviderConfigs(configFile = CONFIG_FILE) {
  if (!existsSync(configFile)) return [];
  try {
    const raw = JSON.parse(readFileSync(configFile, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.providers;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p?.id && p?.baseURL && Array.isArray(p?.models) && p.models.length)
      .map((p) => ({
        id: String(p.id),
        label: String(p.label ?? p.id),
        baseURL: String(p.baseURL).replace(/\/+$/, ""),
        apiKey: p.apiKey ?? null,
        apiKeyEnv: p.apiKeyEnv ?? null,
        models: p.models.map(String),
        defaultModel: String(p.defaultModel ?? p.models[0]),
      }));
  } catch {
    return [];
  }
}

export function writeApiProviderConfigs(providers, configFile = CONFIG_FILE) {
  mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(configFile, JSON.stringify(providers, null, 2));
  try { chmodSync(configFile, 0o600); } catch {}
}

function resolveApiKey(cfg) {
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
      if (m?.role && typeof m.content === "string") messages.push({ role: m.role, content: m.content });
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

// ---------------------------------------------------------------------------
// Fabrique un provider runtime au contrat du router (run/interrupt/status)
// ---------------------------------------------------------------------------
export function makeApiProvider(cfg) {
  const controllers = new Map(); // threadId -> AbortController

  async function run({ threadId, prompt, sessionId, model, onEvent }) {
    const apiKey = resolveApiKey(cfg);
    if (!apiKey) {
      const message = `clé API manquante pour ${cfg.label} (${cfg.apiKeyEnv ?? "apiKey"})`;
      onEvent?.({ kind: "error", message });
      throw new Error(message);
    }
    const sid = sessionId || randomUUID();
    const history = loadHistory(sid);
    const userMessage = { role: "user", content: String(prompt ?? "") };
    const body = {
      model: model || cfg.defaultModel,
      messages: [...history, userMessage],
      stream: true,
      stream_options: { include_usage: true },
    };

    const controller = new AbortController();
    controllers.set(threadId, controller);
    let fullText = "";
    let usage = { context: 0, output: 0, cost: null, turns: null };
    try {
      const res = await fetch(`${cfg.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`${cfg.label} HTTP ${res.status}: ${detail}`);
      }
      const decoder = new TextDecoder();
      let carry = "";
      for await (const chunk of res.body) {
        const parsed = parseSseChunk(decoder.decode(chunk, { stream: true }), carry);
        carry = parsed.rest;
        for (const event of parsed.events) {
          if (event.kind === "usage") { usage = event.usage; continue; }
          if (event.kind === "error") throw new Error(event.message);
          if (event.kind === "delta") fullText += event.text;
          onEvent?.(event);
        }
      }
      appendHistory(sid, [userMessage, { role: "assistant", content: fullText }]);
      onEvent?.({ kind: "text", text: fullText });
      onEvent?.({ kind: "done", ok: true, result: fullText, usage });
      return { sessionId: sid };
    } catch (e) {
      if (controller.signal.aborted) {
        // tour interrompu : conserver ce qui a été produit
        if (fullText) appendHistory(sid, [userMessage, { role: "assistant", content: fullText }]);
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
