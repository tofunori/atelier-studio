import { spawn } from "node:child_process";
import { resolveBin } from "../bin_resolver.mjs";

const OPENCODE_BIN = resolveBin("opencode") ?? "opencode";
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

export async function run({
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

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
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
