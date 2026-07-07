// claude_warm.mjs — persistent "hot" Claude Code process for LaTeX inline autocomplete.
//
// Instead of spawning `claude -p` per keystroke (~6-9s each: Node boot + hooks +
// auth + agent init), we keep ONE long-lived process in stream-json mode. The
// boot cost is paid once; each warm turn is ~2.5s. Combined with the instant
// local predictor in CM6 (first paint), this is the "hot service" pattern.
//
// Auth: uses the Claude Max OAuth session (NOT the paid Console API). We strip
// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the subprocess env so it can
// never silently fall back to metered API billing. `--bare` is deliberately NOT
// used: it forces API-key auth and breaks the Max subscription route.
//
// Overhead cuts (all measured on claude 2.1.202): MAX_THINKING_TOKENS=0 kills
// extended thinking, --setting-sources project skips the user's global hooks,
// and --system-prompt replaces the default prompt (no CLAUDE.md / skills scan).

import { spawn } from "node:child_process";

const MAX_TURNS = 40;         // recycle the process to bound conversation growth
const TURN_TIMEOUT_MS = 12000; // per-turn wall clock; on timeout we respawn clean

const SYSTEM_PROMPT = [
  "You are an inline LaTeX-prose autocomplete engine.",
  "Each user message is an INDEPENDENT completion request; ignore previous turns.",
  "The message gives text before and after the cursor. Return ONLY the exact text",
  "to insert at the cursor.",
  "Rules:",
  "- Return 1 to 8 words, at most 80 characters.",
  "- No markdown, no quotes, no explanation, no thinking.",
  "- If the cursor is inside a LaTeX command, math, citation, reference, label,",
  "  path, or comment, return an empty string.",
  "- If the token before the cursor is partial, return only the missing suffix",
  "  without repeating typed letters.",
  "- Match the author's language and style.",
].join("\n");

function turnMessage({ before, after }) {
  const b = String(before || "").slice(-2200);
  const a = String(after || "").slice(0, 500);
  return `TEXT BEFORE CURSOR:\n${b}\n\nTEXT AFTER CURSOR:\n${a}\n\nINSERTION:`;
}

// ---- process state (module singleton) --------------------------------------

let proc = null;
let stdoutBuf = "";
let turns = 0;
let pending = null; // { resolve, timer } for the single in-flight turn
let waiting = null; // { payload, resolve } — newest request queued behind the turn
let bootConf = null; // { claudeBin, cwd, env } captured from the first call

function killProc() {
  const p = proc;
  proc = null;
  stdoutBuf = "";
  turns = 0;
  if (p) {
    // Detach handlers before killing: a dying process emits 'exit'/'error'
    // asynchronously, and a stale handler must not settle/kill a freshly
    // booted process (cross-turn corruption).
    try { p.removeAllListeners(); } catch { /* already gone */ }
    try { p.stdout && p.stdout.removeAllListeners(); } catch { /* already gone */ }
    try { p.kill("SIGKILL"); } catch { /* already gone */ }
  }
}

function settlePending(text) {
  if (!pending) return;
  const { resolve, timer } = pending;
  pending = null;
  clearTimeout(timer);
  resolve(text);
}

function boot({ claudeBin, cwd, env }) {
  const childEnv = { ...env, MAX_THINKING_TOKENS: "0" };
  delete childEnv.ANTHROPIC_API_KEY;
  delete childEnv.ANTHROPIC_AUTH_TOKEN;

  proc = spawn(claudeBin, [
    "-p",
    "--model", "haiku",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",                       // required for stream-json output
    "--setting-sources", "project",    // skip the user's global hooks
    "--system-prompt", SYSTEM_PROMPT,  // no CLAUDE.md / skills scan
  ], { cwd, env: childEnv, stdio: ["pipe", "pipe", "ignore"] });

  stdoutBuf = "";
  turns = 0;

  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk;
    let nl;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, nl);
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === "result") {
        const text = msg.subtype === "success" ? String(msg.result || "") : "";
        settlePending(text);
      }
    }
  });

  proc.on("error", () => { settlePending(""); killProc(); });
  proc.on("exit", () => { settlePending(""); if (proc) killProc(); });
}

function ensureAlive() {
  if (!proc) {
    boot(bootConf);
  } else if (turns >= MAX_TURNS) {
    // Recycle only when idle so we never kill a turn mid-flight.
    if (!pending) { killProc(); boot(bootConf); }
  }
}

function drainWaiting() {
  if (!waiting || pending) return;
  const next = waiting;
  waiting = null;
  startTurn(next.payload, next.resolve);
}

function startTurn(payload, resolve) {
  ensureAlive();
  if (!proc) {
    resolve({ text: "", busy: false });
    return;
  }
  turns += 1;
  const message = turnMessage(payload);
  const timer = setTimeout(() => {
    // Turn stalled: kill the process so a half-done turn can't corrupt the
    // next one. The waiting request (if any) re-boots a clean process.
    pending = null;
    resolve({ text: "", busy: false, timeout: true });
    killProc();
    drainWaiting();
  }, TURN_TIMEOUT_MS);
  pending = {
    resolve: (text) => {
      resolve({ text, busy: false });
      drainWaiting();
    },
    timer,
  };
  try {
    proc.stdin.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: message }] },
    }) + "\n");
  } catch {
    settlePending("");
    killProc();
  }
}

/**
 * Request one completion from the hot process (single-flight + trailing slot).
 * If a turn is in flight, the request waits in a one-deep slot and runs as
 * soon as the turn settles; a newer request replaces an older waiter, which
 * resolves with { superseded: true }.
 */
export async function warmSuggest(claudeBin, cwd, env, payload) {
  bootConf = { claudeBin, cwd, env };
  return new Promise((resolve) => {
    if (pending) {
      if (waiting) waiting.resolve({ text: "", busy: false, superseded: true });
      waiting = { payload, resolve };
      return;
    }
    startTurn(payload, resolve);
  });
}

/** Pre-boot the process so the first real suggestion is already warm. */
export function prewarm(claudeBin, cwd, env) {
  bootConf = { claudeBin, cwd, env };
  if (!proc) boot(bootConf);
}

/** Cleanly stop the hot process (tests / shutdown). */
export function stopWarm() {
  if (waiting) {
    waiting.resolve({ text: "", busy: false, superseded: true });
    waiting = null;
  }
  settlePending("");
  killProc();
}
