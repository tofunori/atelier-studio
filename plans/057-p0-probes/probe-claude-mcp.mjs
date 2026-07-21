#!/usr/bin/env node
/**
 * P0: Prove Claude loads per-session --mcp-config with distinct env capabilities.
 * Uses `claude mcp` / print mode without a paid multi-turn agent when possible.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKERS = path.join(__dirname, "markers");
const FIXTURES = path.join(__dirname, "fixtures");
fs.mkdirSync(MARKERS, { recursive: true });
fs.mkdirSync(FIXTURES, { recursive: true });

const fakeMcp = path.join(__dirname, "fake-mcp.mjs");
const CAP_A = "cap-claude-A-" + Date.now().toString(36);
const CAP_B = "cap-claude-B-" + Date.now().toString(36);
const markerA = path.join(MARKERS, "claude-thread-A.jsonl");
const markerB = path.join(MARKERS, "claude-thread-B.jsonl");
for (const p of [markerA, markerB]) {
  try { fs.unlinkSync(p); } catch {}
}

function writeMcpConfig(file, cap, marker, label) {
  const cfg = {
    mcpServers: {
      "atelier-sessions-probe": {
        command: process.execPath,
        args: [fakeMcp],
        env: {
          ATELIER_MCP_CAPABILITY: cap,
          ATELIER_MCP_CALLER_LABEL: label,
          ATELIER_PROBE_MARKER: marker,
          ATELIER_PROBE_THREAD: label,
        },
      },
    },
  };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  fs.chmodSync(file, 0o600);
  return cfg;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env || {}) },
      cwd: opts.cwd || process.cwd(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
    }, opts.timeoutMs || 45000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function readMarkers(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

async function main() {
  const report = {
    provider: "claude",
    version: null,
    ok: false,
    evidence: {},
    errors: [],
  };

  const ver = await run("claude", ["--version"], { timeoutMs: 10000 });
  report.version = (ver.stdout || ver.stderr).trim();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-claude-p0-"));
  const cfgA = path.join(tmp, "mcp-A.json");
  const cfgB = path.join(tmp, "mcp-B.json");
  writeMcpConfig(cfgA, CAP_A, markerA, "claude-A");
  writeMcpConfig(cfgB, CAP_B, markerB, "claude-B");

  // Fixture redacted
  fs.writeFileSync(
    path.join(FIXTURES, "claude-mcp-config.json"),
    JSON.stringify(
      {
        note: "Per-thread --mcp-config file shape (mode 0600)",
        mcpServers: {
          "atelier-sessions-probe": {
            command: "node",
            args: ["fake-mcp.mjs"],
            env: {
              ATELIER_MCP_CAPABILITY: "<opaque-capability>",
              ATELIER_MCP_CALLER_LABEL: "<label>",
            },
          },
        },
        cli: "claude --strict-mcp-config --mcp-config <file> ...",
      },
      null,
      2
    )
  );

  // Prefer mcp list with config if supported; fall back to print mode with tool list
  // Claude Code: `claude mcp list` uses user config; for session config use --mcp-config with -p
  // Probe 1: list tools via print with a tiny local command that does NOT need heavy model work —
  // use `claude -p` with allowedTools empty and just force MCP connection via debug?
  // Better: `claude --mcp-config X -p "reply only: pong" --max-turns 1` is paid.
  // Use debug boot path: claude --mcp-config with mcp get?

  // Attempt: claude mcp list after launching with config — not persistent.
  // Session-scoped: use `claude -p` with --bare and a no-network prompt only if needed.
  // First try: start with --mcp-config and ask for /mcp status via print JSON stream.

  async function probeOne(cfg, label, marker, cap) {
    // Use stream-json print with a tiny instruction that should load MCP before any tool call.
    // To minimize cost: max-turns 0 or system-only if available.
    // Claude 2.x supports --max-turns 1. We'll use a deterministic short prompt that does not require tools.
    // The MCP process should still start at session init when --mcp-config is provided.
    const args = [
      "--print",
      "--output-format", "json",
      "--strict-mcp-config",
      "--mcp-config", cfg,
      "--max-turns", "0",
      "--bare",
      "Reply with exactly: ok",
    ];
    const r = await run("claude", args, {
      timeoutMs: 60000,
      cwd: tmp,
      env: {
        // avoid reading global MCP if strict works
      },
    });
    // wait for marker writes
    await new Promise((res) => setTimeout(res, 500));
    const markers = readMarkers(marker);
    return { label, cap, code: r.code, stdoutHead: r.stdout.slice(0, 400), stderrHead: r.stderr.slice(0, 600), markers };
  }

  // max-turns 0 may not be supported — try without first for process spawn proof
  let a = await probeOne(cfgA, "claude-A", markerA, CAP_A);
  let b = await probeOne(cfgB, "claude-B", markerB, CAP_B);

  // If max-turns 0 failed and no markers, retry with max-turns 1 (still cheap short prompt)
  if (a.markers.length === 0 || b.markers.length === 0) {
    report.errors.push("retrying with max-turns 1");
    const probeRetry = async (cfg, label, marker, cap) => {
      const args = [
        "--print",
        "--output-format", "json",
        "--strict-mcp-config",
        "--mcp-config", cfg,
        "--max-turns", "1",
        "--bare",
        "Reply with exactly the word: ok. Do not use tools.",
      ];
      const r = await run("claude", args, { timeoutMs: 90000, cwd: tmp });
      await new Promise((res) => setTimeout(res, 800));
      return {
        label,
        cap,
        code: r.code,
        stdoutHead: r.stdout.slice(0, 400),
        stderrHead: r.stderr.slice(0, 600),
        markers: readMarkers(marker),
      };
    };
    if (a.markers.length === 0) a = await probeRetry(cfgA, "claude-A", markerA, CAP_A);
    if (b.markers.length === 0) b = await probeRetry(cfgB, "claude-B", markerB, CAP_B);
  }

  const redact = (m) => ({
    event: m.event,
    pid: m.pid,
    capability: m.capability === CAP_A ? "<CAP_A>" : m.capability === CAP_B ? "<CAP_B>" : m.capability,
    label: m.label,
  });

  report.evidence.A = { ...a, markers: a.markers.map(redact), capabilityExpected: "<CAP_A>" };
  report.evidence.B = { ...b, markers: b.markers.map(redact), capabilityExpected: "<CAP_B>" };

  const capsA = new Set(a.markers.map((m) => m.capability));
  const capsB = new Set(b.markers.map((m) => m.capability));
  const pidsA = new Set(a.markers.map((m) => m.pid));
  const pidsB = new Set(b.markers.map((m) => m.pid));
  const distinctCaps =
    capsA.has(CAP_A) && capsB.has(CAP_B) && !capsA.has(CAP_B) && !capsB.has(CAP_A);
  const distinctPids =
    pidsA.size > 0 && pidsB.size > 0 && [...pidsA].every((p) => !pidsB.has(p));

  report.ok = distinctCaps && distinctPids;
  report.verdict = {
    distinctCaps,
    distinctPids,
    capsA: [...capsA].map((c) => (c === CAP_A ? "<CAP_A>" : c === CAP_B ? "<CAP_B>" : c)),
    capsB: [...capsB].map((c) => (c === CAP_A ? "<CAP_A>" : c === CAP_B ? "<CAP_B>" : c)),
    pidsA: [...pidsA],
    pidsB: [...pidsB],
  };

  // mode 0600 proof
  const st = fs.statSync(cfgA);
  report.evidence.configMode = (st.mode & 0o777).toString(8);

  fs.writeFileSync(path.join(FIXTURES, "claude-p0-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  // cleanup tmp configs (markers stay)
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
