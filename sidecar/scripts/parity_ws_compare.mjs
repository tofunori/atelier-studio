#!/usr/bin/env node
/**
 * Porte 9 — comparaison contrôlée Node vs Rust (lecture seule uniquement).
 *
 * Usage:
 *   node sidecar/scripts/parity_ws_compare.mjs \
 *     --node ws://127.0.0.1:PORT_NODE?token=... \
 *     --rust ws://127.0.0.1:PORT_RUST?token=...
 *
 * Ne envoie jamais send / git mutable / generateImage / delete.
 * Normalise pid, port, timestamps, chemins.
 *
 * Exit 0 si zéro divergence inexpliquée; 1 sinon. Rapport JSON sur stdout.
 */
import WebSocket from "ws";

const MUTATING = new Set([
  "send", "interrupt", "saveSettings", "saveImage", "generateImage", "clearPasted",
  "saveApiProvider", "deleteApiProvider", "gitStage", "gitUnstage", "gitRevertFile",
  "gitCommit", "gitPush", "gitPull", "gitIgnore", "gitUndoLastTurn", "gitCreateBranchAt",
  "gitRestoreFileFromCommit", "gitRevertCommit", "gitUndoCommit", "gitResetToCommit", "gitFetch", "deleteThread",
  "renameThread", "moveThread", "upsertThread", "addHighlight", "removeHighlight",
  "importSession", "forkThread", "revert", "retitleAll", "qaPromote", "codexCompact",
  "codexClear", "goalSet", "goalClear", "permissionResponse", "interactionResponse",
  "zoteroFav", "zoteroAddPdf", "termOpen", "termInput", "termResize", "termClose",
  "exportThread", "quickAsk", "requestReview", "generateCommitMsg",
]);

const FREE_KEYS = new Set([
  "pid", "port", "startedAt", "started_at", "bundleHash", "appVersion", "version",
  "ts", "createdAt", "updatedAt", "backend", "node",
]);

const CORPUS = [
  { type: "ping" },
  { type: "status" },
  { type: "providerStatus" },
  { type: "setupStatus" },
  { type: "listThreads" },
  { type: "listHighlights" },
  { type: "getSettings" },
  { type: "apiProviders" },
  { type: "listPasted" },
  { type: "getUsage" },
  { type: "listCommands", projectRoot: "/tmp" },
  { type: "listFiles", projectRoot: "/tmp" },
  { type: "getLedger", projectRoot: "/tmp", limit: 5 },
  { type: "getHistory", threadId: "__parity_missing__" },
  { type: "listSessions", provider: "claude", projectRoot: "/tmp" },
  // kimi (plan 046) : listing natif ACP — même mapping des deux côtés
  // (session/list réel, ou [] identique quand kimi est absent/éteint).
  { type: "listSessions", provider: "kimi", projectRoot: "/tmp" },
  { type: "clientLog", note: "parity" },
  { type: "clientHello", clientInstanceId: "00000000-0000-4000-8000-000000000001" },
];

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--node") out.node = argv[++i];
    else if (argv[i] === "--rust") out.rust = argv[++i];
    else if (argv[i] === "--timeout") out.timeout = Number(argv[++i]);
  }
  return out;
}

function normalize(v) {
  if (Array.isArray(v)) {
    return { _len: v.length, _sample: v[0] != null ? normalize(v[0]) : null };
  }
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      if (FREE_KEYS.has(k)) continue;
      if (k === "path" || k === "pasteDir" || k === "dir" || k === "binPath") {
        o[k] = "<path>";
        continue;
      }
      if (["providers", "threads", "highlights", "files", "commands", "entries", "servers", "sessions", "items", "collections", "models"].includes(k) && Array.isArray(val)) {
        o[k] = { _len: val.length, _sample: val[0] != null ? normalize(val[0]) : null };
        continue;
      }
      o[k] = normalize(val);
    }
    return o;
  }
  return v;
}

function diff(a, b, path = "$") {
  const out = [];
  if (typeof a !== typeof b) {
    out.push(`${path}: type ${typeof a} vs ${typeof b}`);
    return out;
  }
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      if (!(k in (a || {}))) out.push(`${path}.${k}: only right`);
      else if (!(k in (b || {}))) out.push(`${path}.${k}: only left`);
      else out.push(...diff(a[k], b[k], `${path}.${k}`));
    }
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

function onceWs(url, msg, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`timeout ${msg.type}`));
    }, timeoutMs);
    const replies = [];
    ws.on("open", () => ws.send(JSON.stringify(msg)));
    ws.on("message", (data) => {
      try {
        replies.push(JSON.parse(String(data)));
      } catch {
        replies.push({ type: "parse_error", raw: String(data) });
      }
      // most request/response pairs: first reply is enough; wait a tick for multi-reply
      clearTimeout(timer);
      setTimeout(() => {
        try { ws.close(); } catch {}
        resolve(replies);
      }, 80);
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.node || !args.rust) {
    console.error("Usage: parity_ws_compare.mjs --node ws://… --rust ws://…");
    process.exit(2);
  }
  for (const m of CORPUS) {
    if (MUTATING.has(m.type)) {
      console.error("FATAL: mutating type in corpus", m.type);
      process.exit(2);
    }
  }
  const report = { compared: 0, ok: 0, divergences: [], errors: [] };
  for (const msg of CORPUS) {
    report.compared += 1;
    try {
      const [left, right] = await Promise.all([
        onceWs(args.node, msg, args.timeout ?? 8000),
        onceWs(args.rust, msg, args.timeout ?? 8000),
      ]);
      // clientHello may be empty on both
      if (msg.type === "clientHello") {
        report.ok += 1;
        continue;
      }
      const na = normalize(left[0] ?? null);
      const nb = normalize(right[0] ?? null);
      const d = diff(na, nb);
      if (d.length === 0) report.ok += 1;
      else {
        report.divergences.push({ type: msg.type, diffs: d, node: left[0], rust: right[0] });
      }
    } catch (e) {
      report.errors.push({ type: msg.type, error: String(e?.message ?? e) });
    }
  }
  report.summary = {
    ok: report.ok,
    compared: report.compared,
    divergences: report.divergences.length,
    errors: report.errors.length,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.divergences.length || report.errors.length ? 1 : 0);
}

main();
