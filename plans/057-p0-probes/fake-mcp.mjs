#!/usr/bin/env node
/**
 * Minimal MCP stdio server for P0 probes.
 * Logs capability identity to MARKER_PATH on initialize; pure protocol on stdout.
 */
import fs from "node:fs";
import readline from "node:readline";

const marker = process.env.ATELIER_PROBE_MARKER || "";
const capability = process.env.ATELIER_MCP_CAPABILITY || "(none)";
const label = process.env.ATELIER_MCP_CALLER_LABEL || "(none)";
const threadHint = process.env.ATELIER_PROBE_THREAD || "(none)";

function logMarker(event, extra = {}) {
  if (!marker) return;
  const rec = {
    event,
    ts: new Date().toISOString(),
    pid: process.pid,
    ppid: process.ppid,
    capability,
    label,
    threadHint,
    cwd: process.cwd(),
    ...extra,
  };
  fs.appendFileSync(marker, JSON.stringify(rec) + "\n");
}

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

logMarker("boot");

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (method === "initialize") {
    logMarker("initialize", { clientInfo: params?.clientInfo || null });
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "atelier-probe-mcp", version: "0.0.1" },
      },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "initialized") {
    logMarker("initialized");
    return;
  }
  if (method === "tools/list") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "atelier_sessions_probe",
            description: "P0 probe tool — returns caller capability",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
    return;
  }
  if (method === "tools/call") {
    const text = JSON.stringify({ capability, label, threadHint, pid: process.pid });
    write({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text }],
        isError: false,
      },
    });
    logMarker("tools/call", { name: params?.name || null });
    return;
  }
  if (method === "ping") {
    write({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (id !== undefined) {
    write({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
});

process.stdin.on("end", () => logMarker("stdin_end"));
process.on("SIGTERM", () => {
  logMarker("sigterm");
  process.exit(0);
});
