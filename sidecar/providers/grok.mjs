import { spawn } from "node:child_process";
import { resolveBin } from "../bin_resolver.mjs";

const GROK_BIN = resolveBin("grok") ?? "grok";
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

function mapEffort(effort) {
  if (!effort) return null;
  if (effort === "ultra") return "max";
  return EFFORTS.has(effort) ? effort : null;
}

// Shapes réelles de `grok -p … --output-format streaming-json` (grok 0.2.87,
// vérifiées 2026-07-06) : {type:"thought",data}, {type:"text",data},
// {type:"end",stopReason,sessionId,requestId}, {type:"error",message}.
// Les outils s'exécutent mais n'émettent AUCUN event dans ce format —
// pas de tool_update possible tant que le CLI ne les expose pas.
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
  const args = ["--output-format", "streaming-json", "--cwd", cwd || process.env.HOME || process.cwd()];
  if (model) args.push("--model", model);
  const mappedEffort = mapEffort(effort);
  if (mappedEffort) args.push("--effort", mappedEffort);
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (!permissionMode || permissionMode === "bypassPermissions") args.push("--always-approve");
  if (sessionId) args.push("--resume", sessionId);
  args.push("-p", String(prompt ?? ""));

  return new Promise((resolve, reject) => {
    const child = spawn(GROK_BIN, args, {
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
