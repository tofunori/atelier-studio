import { WebSocketServer } from "ws";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { route } from "./router.mjs";
import { ThreadStore } from "./store.mjs";
import * as catalog from "./catalog.mjs";
import * as history from "./history.mjs";
import { watchAnnotations } from "./annotations.mjs";
import * as terminal from "./terminal.mjs";
import * as claude from "./providers/claude.mjs";
import * as codex from "./providers/codex.mjs";

const store = new ThreadStore(
  `${homedir()}/Library/Application Support/atelier-studio/threads.json`,
);
const providers = { claude, codex };

import { readdirSync, rmSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";

const PASTE_DIR = `${homedir()}/Library/Application Support/atelier-studio/pasted`;

function status() {
  let pastedCount = 0;
  try {
    pastedCount = existsSync(PASTE_DIR) ? readdirSync(PASTE_DIR).length : 0;
  } catch {}
  return { port: wss.address()?.port ?? null, pastedCount, pasteDir: PASTE_DIR };
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
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim().split("\n")[0]);
    });
  });
}

// scan des serveurs locaux pour la page "nouvel onglet" du navigateur
import net from "node:net";
const SCAN_PORTS = [
  1420, 3000, 3001, 4173, 4321, 5173, 5174, 8000, 8080, 8081, 8484, 8501,
  8765, 8787, 8888, 9091, 8790, 8791, 8792, 8793, 8794, 8795,
  ...Array.from({ length: 12 }, (_, k) => 18790 + k),
  19000, 19175, 19359,
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

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });

// broadcast: les events d'un run en cours atteignent tous les clients,
// y compris après un reload de la fenêtre (nouvelle connexion WS).
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on("listening", () => {
  console.log(JSON.stringify({ port: wss.address().port }));
});

watchAnnotations(broadcast);

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
    scanLocal,
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
