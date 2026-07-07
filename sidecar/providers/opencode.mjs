import { spawn } from "node:child_process";
import { resolveBin } from "../bin_resolver.mjs";

const OPENCODE_BIN = resolveBin("opencode") ?? "opencode";
const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);

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

  if (msg.type === "tool" || msg.type === "tool_update") {
    const part = msg.part ?? {};
    return [{
      kind: "tool",
      name: String(part.tool ?? part.name ?? part.type ?? "tool"),
      detail: String(part.title ?? part.command ?? part.description ?? "").slice(0, 160),
    }];
  }

  if (msg.type === "step_finish") {
    const tokens = msg.part?.tokens ?? {};
    return [{
      kind: "done",
      ok: msg.part?.reason ? msg.part.reason !== "error" : true,
      sessionId: msg.sessionID ?? msg.part?.sessionID ?? null,
      result: "",
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
  args.push(String(prompt ?? ""));

  return new Promise((resolve, reject) => {
    const child = spawn(OPENCODE_BIN, args, {
      cwd: cwd || process.env.HOME || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let sid = sessionId ?? null;
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
        onEvent?.({ kind: "done", ok: true, result: "", usage: { context: 0, output: 0, cost: null, turns: null } });
        settleResolve({ sessionId: sid });
      } else {
        settleReject(new Error(stderr.trim() || `OpenCode exited with code ${code}`));
      }
    });
  });
}
