import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import crypto from "node:crypto";
import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { route } from "./router.mjs";
import { ThreadStore, writeFileAtomic } from "./store.mjs";
import * as catalog from "./catalog.mjs";
import * as history from "./history.mjs";
import { watchAnnotations } from "./annotations.mjs";
import { watchFile } from "node:fs";
import * as terminal from "./terminal.mjs";
import * as sessions from "./sessions.mjs";
import * as reviewer from "./reviewer.mjs";
import * as gitops from "./gitops.mjs";
import * as ledger from "./ledger.mjs";
import * as zotero from "./zotero.mjs";
import * as claude from "./providers/claude.mjs";
import * as codex from "./providers/codex.mjs";
import { resolveBin, enrichPath } from "./bin_resolver.mjs";
enrichPath(); // PATH Finder minimal → complété pour tous les spawns

const APP_DIR = `${homedir()}/Library/Application Support/atelier-studio`;
const PID_FILE = `${APP_DIR}/sidecar.pid`;
const SIDECAR_DIR = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(APP_DIR, { recursive: true });

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

try {
  const oldPid = Number(readFileSync(PID_FILE, "utf8"));
  if (oldPid && oldPid !== process.pid && pidAlive(oldPid)) process.kill(oldPid, "SIGTERM");
} catch {}
writeFileAtomic(PID_FILE, String(process.pid));

const store = new ThreadStore(`${APP_DIR}/threads.json`);
const providers = { claude, codex };
const ATELIER_TOKEN = process.env.ATELIER_TOKEN;
const STARTED_AT = new Date().toISOString();
const ATELIER_APP_VERSION = process.env.ATELIER_APP_VERSION || "dev";
const ATELIER_BUNDLE_HASH = process.env.ATELIER_BUNDLE_HASH || bundleFingerprint(SIDECAR_DIR);
if (!ATELIER_TOKEN) {
  console.warn("[atelier] ATELIER_TOKEN absent: mode dev, HTTP/WS acceptés sans token");
}

function bundleFingerprint(root) {
  const files = [];
  const ignored = new Set([
    ".conductor",
    ".fig_thumbs",
    ".git",
    ".pytest_cache",
    "annotations",
    "logs",
    "node_modules",
    "test-results",
  ]);
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (ignored.has(name)) continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) files.push(p);
    }
  }
  walk(root);
  const h = crypto.createHash("md5");
  for (const file of files.sort()) {
    h.update(path.relative(root, file).split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}

// au démarrage, aucune session ne tourne : purger les statuts "running"
// persistés par un sidecar précédent (spinner fantôme dans la sidebar)
for (const t of store.list()) {
  if (t.status === "running") store.upsert({ id: t.id, status: "idle" });
}

import { readdirSync, rmSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";

const PASTE_DIR = `${homedir()}/Library/Application Support/atelier-studio/pasted`;

function cleanup() {
  try { terminal.closeAll(); } catch {}
  try {
    if (Number(readFileSync(PID_FILE, "utf8")) === process.pid) rmSync(PID_FILE);
  } catch {}
}

process.once("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.once("exit", cleanup);

function status() {
  let pastedCount = 0;
  try {
    pastedCount = existsSync(PASTE_DIR) ? readdirSync(PASTE_DIR).length : 0;
  } catch {}
  return { port: httpServer.address()?.port ?? null, pastedCount, pasteDir: PASTE_DIR };
}

function health() {
  return {
    ok: true,
    service: "atelier-sidecar",
    pid: process.pid,
    port: httpServer.address()?.port ?? null,
    startedAt: STARTED_AT,
    appVersion: ATELIER_APP_VERSION,
    bundleHash: ATELIER_BUNDLE_HASH,
    tokenRequired: Boolean(ATELIER_TOKEN),
  };
}

function clearPasted() {
  let n = 0;
  try {
    if (existsSync(PASTE_DIR)) {
      for (const f of readdirSync(PASTE_DIR)) {
        rmSync(`${PASTE_DIR}/${f}`);
        n++;
      }
    }
  } catch {}
  return n;
}

function cliVersion(bin) {
  const path = resolveBin(bin);
  if (!path) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(path, ["--version"], { timeout: 8000 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim().split("\n")[0]);
    });
  });
}

// scan des serveurs locaux pour la page "nouvel onglet" du navigateur
import net from "node:net";
// ports UTILES seulement : pas le dev-server de l'app (1420) ni les serveurs
// de galerie atelier (879x/187xx-19xxx) déjà affichés dans le panneau Atelier
const SCAN_PORTS = [
  3000, 3001, 4173, 4321, 5173, 5174, 8000, 8080, 8081, 8484, 8501,
  8765, 8787, 8888, 9091,
];
function tcpAlive(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1", timeout: 250 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.on("timeout", () => { s.destroy(); resolve(false); });
  });
}
async function htmlTitle(port) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 600);
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: ctl.signal });
    clearTimeout(t);
    const text = (await r.text()).slice(0, 4000);
    const m = /<title[^>]*>([^<]*)<\/title>/i.exec(text);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
async function checkFrame(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    clearTimeout(t);
    const xfo = (r.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (r.headers.get("content-security-policy") || "").toLowerCase();
    const blocked =
      xfo.includes("deny") || xfo.includes("sameorigin") ||
      (csp.includes("frame-ancestors") && !csp.includes("frame-ancestors *"));
    return { blocked };
  } catch {
    return { blocked: false };
  }
}

async function scanLocal() {
  const alive = (await Promise.all(SCAN_PORTS.map(async (p) => (await tcpAlive(p)) ? p : null)))
    .filter(Boolean);
  return Promise.all(alive.map(async (port) => ({ port, title: await htmlTitle(port) })));
}

function exportThread(thread, events, markdown) {
  const dir = `${homedir()}/Downloads`;
  const safe = String(thread.title ?? "conversation").replace(/[^\w\u00C0-\u017F -]/g, "").slice(0, 60).trim() || "conversation";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const base = `${dir}/atelier-${safe}-${stamp}`;
  writeFileSync(`${base}.md`, markdown);
  writeFileSync(`${base}.json`, JSON.stringify({ thread, events }, null, 2));
  return `${base}.md`;
}

async function providerStatus() {
  const [claudeV, codexV] = await Promise.all([cliVersion("claude"), cliVersion("codex")]);
  return [
    { id: "claude", label: "Claude Code", version: claudeV, ok: !!claudeV },
    { id: "codex", label: "Codex", version: codexV, ok: !!codexV },
  ];
}
function saveImage(ext, base64) {
  mkdirSync(PASTE_DIR, { recursive: true });
  const path = `${PASTE_DIR}/coller-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

// État UI partagé dev/prod (projets, réglages, favoris…) — les deux origines
// (localhost:1420 et tauri://) ont des localStorage séparés.
const UI_PATH = `${APP_DIR}/ui.json`;
function httpAuthorized(req) {
  return !ATELIER_TOKEN || req.headers["x-atelier-token"] === ATELIER_TOKEN;
}
const httpServer = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-atelier-token");
  if (req.method === "OPTIONS") { res.end(); return; }
  if (!httpAuthorized(req)) {
    res.statusCode = 401;
    res.end("unauthorized");
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health" && req.method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(health()));
    return;
  }
  if (url.pathname === "/uistate" && req.method === "GET") {
    res.setHeader("content-type", "application/json");
    try { res.end(readFileSync(UI_PATH)); } catch { res.end("{}"); }
    return;
  }
  if (url.pathname === "/uistate" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { JSON.parse(body); writeFileAtomic(UI_PATH, body); } catch {}
      res.end("ok");
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ req }) => {
    if (!ATELIER_TOKEN) return true;
    const url = new URL(req.url ?? "/", "ws://127.0.0.1");
    return url.searchParams.get("token") === ATELIER_TOKEN;
  },
});
httpServer.listen(0, "127.0.0.1");

// broadcast: les events d'un run en cours atteignent tous les clients,
// y compris après un reload de la fenêtre (nouvelle connexion WS).
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

httpServer.on("listening", () => {
  console.log(JSON.stringify(health()));
});

// papier ajouté/modifié dans Zotero → la Bibliothèque se rafraîchit toute seule
try {
  const zoteroDb = `${homedir()}/Zotero/zotero.sqlite`;
  watchFile(zoteroDb, { interval: 4000 }, () => {
    broadcast({ type: "zoteroChanged" });
  });
} catch {}

watchAnnotations(broadcast);

// notifications goal Codex (thread/goal/updated) → tous les clients ;
// elles arrivent aussi hors-tour (goal mis à jour par le modèle en tâche de fond)
codex.onGoal?.((threadId, event) => {
  if (threadId) broadcast({ type: "event", threadId, event });
});

wss.on("connection", (ws) => {
  const ctx = {
    send: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    broadcast,
    store,
    providers,
    catalog,
    history,
    saveImage,
    status,
    clearPasted,
    providerStatus,
    exportThread,
    terminal,
    sessions,
    reviewer,
    gitops,
    ledger,
    zotero,
    scanLocal,
    checkFrame,
  };
  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return ctx.send({ type: "error", message: "JSON invalide" });
    }
    try {
      await route(msg, ctx);
    } catch (e) {
      ctx.send({ type: "error", threadId: msg.threadId, message: String(e) });
    }
  });
});
