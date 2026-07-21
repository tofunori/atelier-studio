#!/usr/bin/env node
/**
 * P0: Prove two Codex threads on the same app-server get distinct MCP capabilities.
 * No model prompt / no turn/start — only thread lifecycle + mcpServerStatus/list.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKERS = path.join(__dirname, "markers");
const FIXTURES = path.join(__dirname, "fixtures");
fs.mkdirSync(MARKERS, { recursive: true });
fs.mkdirSync(FIXTURES, { recursive: true });

const fakeMcp = path.join(__dirname, "fake-mcp.mjs");
const markerA = path.join(MARKERS, "codex-thread-A.jsonl");
const markerB = path.join(MARKERS, "codex-thread-B.jsonl");
for (const p of [markerA, markerB]) {
  try { fs.unlinkSync(p); } catch {}
}

const CAP_A = "cap-thread-A-" + Date.now().toString(36);
const CAP_B = "cap-thread-B-" + Date.now().toString(36);

function mcpConfig(cap, marker, label) {
  return {
    mcp_servers: {
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
}

function redacted(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s
    .replaceAll(CAP_A, "<CAP_A>")
    .replaceAll(CAP_B, "<CAP_B>")
    .replaceAll(process.env.HOME || "", "$HOME");
}

class AppServer {
  constructor() {
    this.child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.stderr = [];
    this.child.stderr.on("data", (d) => this.stderr.push(d.toString()));
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
        return;
      }
      if (msg.method && msg.id != null) {
        // server request — auto-approve minimal
        const reply = { id: msg.id, result: this.autoAnswer(msg.method, msg.params || {}) };
        this.child.stdin.write(JSON.stringify(reply) + "\n");
        this.notifications.push({ type: "serverRequest", method: msg.method, params: msg.params });
        return;
      }
      if (msg.method) {
        this.notifications.push({ type: "notification", method: msg.method, params: msg.params });
      }
    });
  }

  autoAnswer(method) {
    if (method.includes("approval") || method.includes("Approval")) {
      return { decision: "accept", approved: true };
    }
    if (method.includes("elicitation")) {
      return { action: "decline", content: null, _meta: null };
    }
    return {};
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const msg = { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(msg) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 30000);
    });
  }

  async close() {
    try { this.child.kill("SIGTERM"); } catch {}
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    provider: "codex",
    version: null,
    ok: false,
    threads: {},
    evidence: {},
    errors: [],
  };

  try {
    const ver = spawn("codex", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let v = "";
    for await (const c of ver.stdout) v += c;
    report.version = v.trim();
  } catch (e) {
    report.errors.push(String(e));
  }

  const server = new AppServer();
  const cwd = process.cwd();
  const requests = [];

  try {
    const initParams = {
      clientInfo: { name: "atelier-p0-probe", title: "Atelier P0", version: "0.0.1" },
    };
    requests.push({ method: "initialize", params: initParams });
    const init = await server.request("initialize", initParams);
    requests.push({ method: "initialize/result", resultKeys: Object.keys(init || {}) });

    // Some protocols need initialized notification
    server.child.stdin.write(
      JSON.stringify({ method: "initialized", jsonrpc: "2.0" }) + "\n"
    );
    // Also try notifications/initialized
    server.child.stdin.write(
      JSON.stringify({ method: "notifications/initialized" }) + "\n"
    );

    const startA = {
      cwd,
      sandbox: "read-only",
      approvalPolicy: "never",
      ephemeral: true,
      config: mcpConfig(CAP_A, markerA, "thread-A"),
    };
    requests.push({ method: "thread/start", params: { ...startA, config: { mcp_servers: { "atelier-sessions-probe": { command: "node", args: ["fake-mcp.mjs"], env: { ATELIER_MCP_CAPABILITY: "<CAP_A>" } } } } } });
    const resA = await server.request("thread/start", startA);
    const tidA = resA?.thread?.id || resA?.id;
    if (!tidA) throw new Error("thread A missing id: " + JSON.stringify(resA));
    report.threads.A = { id: tidA };

    const startB = {
      cwd,
      sandbox: "read-only",
      approvalPolicy: "never",
      ephemeral: true,
      config: mcpConfig(CAP_B, markerB, "thread-B"),
    };
    requests.push({ method: "thread/start", params: { ...startB, config: { mcp_servers: { "atelier-sessions-probe": { command: "node", args: ["fake-mcp.mjs"], env: { ATELIER_MCP_CAPABILITY: "<CAP_B>" } } } } } });
    const resB = await server.request("thread/start", startB);
    const tidB = resB?.thread?.id || resB?.id;
    if (!tidB) throw new Error("thread B missing id: " + JSON.stringify(resB));
    report.threads.B = { id: tidB };

    // Wait for MCP processes to boot / initialize
    for (let i = 0; i < 20; i++) {
      const a = readMarkers(markerA);
      const b = readMarkers(markerB);
      if (a.some((x) => x.event === "initialize") && b.some((x) => x.event === "initialize")) break;
      // try refreshing / listing
      try {
        await server.request("mcpServerStatus/list", { threadId: tidA, detail: "toolsAndAuthOnly" });
      } catch {}
      try {
        await server.request("mcpServerStatus/list", { threadId: tidB, detail: "toolsAndAuthOnly" });
      } catch {}
      await sleep(500);
    }

    let listA = null;
    let listB = null;
    try {
      listA = await server.request("mcpServerStatus/list", { threadId: tidA, detail: "full" });
    } catch (e) {
      report.errors.push("listA: " + e.message);
    }
    try {
      listB = await server.request("mcpServerStatus/list", { threadId: tidB, detail: "full" });
    } catch (e) {
      report.errors.push("listB: " + e.message);
    }

    const markersA = readMarkers(markerA);
    const markersB = readMarkers(markerB);
    report.evidence.markersA = markersA.map((m) => ({
      event: m.event,
      pid: m.pid,
      capability: m.capability === CAP_A ? "<CAP_A>" : m.capability === CAP_B ? "<CAP_B>" : m.capability,
      label: m.label,
    }));
    report.evidence.markersB = markersB.map((m) => ({
      event: m.event,
      pid: m.pid,
      capability: m.capability === CAP_A ? "<CAP_A>" : m.capability === CAP_B ? "<CAP_B>" : m.capability,
      label: m.label,
    }));

    const toolsA = (listA?.data || []).map((s) => ({
      name: s.name,
      toolNames: Object.keys(s.tools || {}),
      serverInfo: s.serverInfo || null,
    }));
    const toolsB = (listB?.data || []).map((s) => ({
      name: s.name,
      toolNames: Object.keys(s.tools || {}),
      serverInfo: s.serverInfo || null,
    }));
    report.evidence.listA = toolsA;
    report.evidence.listB = toolsB;

    const capsA = new Set(markersA.map((m) => m.capability));
    const capsB = new Set(markersB.map((m) => m.capability));
    const pidsA = new Set(markersA.map((m) => m.pid));
    const pidsB = new Set(markersB.map((m) => m.pid));

    const distinctCaps =
      capsA.has(CAP_A) && capsB.has(CAP_B) && !capsA.has(CAP_B) && !capsB.has(CAP_A);
    const distinctPids =
      [...pidsA].every((p) => !pidsB.has(p)) && pidsA.size > 0 && pidsB.size > 0;
    const probeVisibleA = toolsA.some((s) => s.name === "atelier-sessions-probe" || (s.toolNames || []).includes("atelier_sessions_probe"));
    const probeVisibleB = toolsB.some((s) => s.name === "atelier-sessions-probe" || (s.toolNames || []).includes("atelier_sessions_probe"));

    report.ok = distinctCaps && distinctPids;
    report.verdict = {
      distinctCaps,
      distinctPids,
      probeVisibleA,
      probeVisibleB,
      capsA: [...capsA].map((c) => (c === CAP_A ? "<CAP_A>" : c === CAP_B ? "<CAP_B>" : c)),
      capsB: [...capsB].map((c) => (c === CAP_A ? "<CAP_A>" : c === CAP_B ? "<CAP_B>" : c)),
      pidsA: [...pidsA],
      pidsB: [...pidsB],
    };

    // Resume thread A and check MCP still works with same env
    try {
      const resumeA = await server.request("thread/resume", {
        threadId: tidA,
        config: mcpConfig(CAP_A, markerA, "thread-A-resume"),
      });
      report.evidence.resumeA = { id: resumeA?.thread?.id || tidA };
      await sleep(1000);
      try {
        report.evidence.listAAfterResume = await server.request("mcpServerStatus/list", {
          threadId: tidA,
          detail: "toolsAndAuthOnly",
        });
      } catch (e) {
        report.errors.push("listAAfterResume: " + e.message);
      }
    } catch (e) {
      report.errors.push("resumeA: " + e.message);
    }

    fs.writeFileSync(
      path.join(FIXTURES, "codex-thread-start-mcp.json"),
      redacted({
        note: "Redacted fixture of thread/start config.mcp_servers shape used for P0",
        threadStartParamsShape: {
          cwd: "$PROJECT",
          sandbox: "read-only",
          approvalPolicy: "never",
          ephemeral: true,
          config: {
            mcp_servers: {
              "atelier-sessions-probe": {
                command: "node",
                args: ["fake-mcp.mjs"],
                env: {
                  ATELIER_MCP_CAPABILITY: "<opaque-capability>",
                  ATELIER_MCP_CALLER_LABEL: "<provider label>",
                  ATELIER_PROBE_MARKER: "<marker path>",
                },
              },
            },
          },
        },
        listMethod: "mcpServerStatus/list",
        listParams: { threadId: "<codex-thread-id>", detail: "full" },
      })
    );
  } catch (e) {
    report.errors.push(String(e?.stack || e));
    report.ok = false;
  } finally {
    await server.close();
  }

  const outPath = path.join(FIXTURES, "codex-p0-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
