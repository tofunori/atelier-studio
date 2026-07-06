import { spawn } from "node:child_process";
import { resolveBin } from "../bin_resolver.mjs";
import { toolDetail } from "./claude.mjs";

const GROK_BIN = resolveBin("grok") ?? "grok";
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

function mapEffort(effort) {
  if (!effort) return null;
  if (effort === "ultra") return "max";
  return EFFORTS.has(effort) ? effort : null;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => typeof block === "string" ? block : block?.text ?? block?.content ?? "")
    .filter(Boolean)
    .join("");
}

export function normalizeGrokMessage(msg) {
  if (!msg || typeof msg !== "object") return [];

  if (msg.type === "error") {
    return [{ kind: "error", message: String(msg.message ?? msg.error ?? "erreur Grok") }];
  }

  if (msg.type === "system" && msg.subtype === "init") {
    return [{ kind: "started", sessionId: msg.session_id ?? msg.sessionId ?? null }];
  }

  if (msg.type === "stream_event") {
    const ev = msg.event ?? {};
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      return [{ kind: "delta", text: String(ev.delta.text ?? "") }];
    }
    if (ev.type === "content_block_delta" && ev.delta?.type === "thinking_delta") {
      return [{ kind: "thinking_delta", text: String(ev.delta.thinking ?? "") }];
    }
    if (ev.type === "message_start") {
      return [{ kind: "started", sessionId: msg.session_id ?? msg.sessionId ?? null }];
    }
    return [];
  }

  if (msg.type === "assistant") {
    const events = [];
    const content = msg.message?.content ?? msg.content ?? [];
    for (const block of Array.isArray(content) ? content : [content]) {
      if (typeof block === "string") events.push({ kind: "text", text: block });
      else if (block?.type === "text") events.push({ kind: "text", text: String(block.text ?? "") });
      else if (block?.type === "thinking") events.push({ kind: "thinking", text: String(block.thinking ?? "") });
      else if (block?.type === "tool_use") {
        events.push({
          kind: "tool",
          name: String(block.name ?? "tool"),
          detail: toolDetail(block.name, block.input),
        });
      }
    }
    return events;
  }

  if (msg.type === "result") {
    const usage = msg.usage ?? {};
    return [{
      kind: "done",
      ok: msg.subtype ? msg.subtype === "success" : msg.is_error !== true,
      result: String(msg.result ?? textFromContent(msg.content) ?? ""),
      usage: {
        context:
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0),
        output: usage.output_tokens ?? 0,
        cost: msg.total_cost_usd ?? null,
        turns: msg.num_turns ?? null,
      },
    }];
  }

  if (msg.type === "tool_result") {
    return [{
      kind: "tool_update",
      id: msg.tool_use_id ?? msg.id,
      name: String(msg.name ?? "tool"),
      output: textFromContent(msg.content ?? msg.result),
      status: msg.is_error ? "failed" : "completed",
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
