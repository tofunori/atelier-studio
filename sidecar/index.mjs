import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import crypto from "node:crypto";
import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { route, emitProviderGlobal } from "./router.mjs";
import { ThreadStore, writeFileAtomic } from "./store.mjs";
import { AutomationManager } from "./automations.mjs";
import { HighlightStore } from "./highlights.mjs";
import * as catalog from "./catalog.mjs";
import * as history from "./history.mjs";
import { watchAnnotations } from "./annotations.mjs";
import { watchFile } from "node:fs";
import * as terminal from "./terminal.mjs";
import * as sessions from "./sessions.mjs";
import { createHarnessJournal } from "./harness_journal.mjs";
import * as reviewer from "./reviewer.mjs";
import * as gitops from "./gitops.mjs";
import * as ledger from "./ledger.mjs";
import * as zotero from "./zotero.mjs";
import * as claude from "./providers/claude.mjs";
import * as codex from "./providers/codex.mjs";
import * as grok from "./providers/grok.mjs";
import * as kimi from "./providers/kimi.mjs";
import * as opencode from "./providers/opencode.mjs";
import { listProviders } from "./providers/registry.mjs";
import { loadApiProviderConfigs, writeApiProviderConfigs, makeApiProvider, fetchAvailableModels } from "./providers/openai_api.mjs";
import { resolveBin, enrichPath } from "./bin_resolver.mjs";
import { resolveSingleInstance } from "./single_instance.mjs";
import { validGalleryCommand } from "./gallery_command.mjs";
enrichPath(); // PATH Finder minimal → complété pour tous les spawns

const APP_DIR = `${homedir()}/Library/Application Support/atelier-studio`;
const PID_FILE = `${APP_DIR}/sidecar.pid`;
const LOCK_FILE = `${APP_DIR}/sidecar.lock`;
const SIDECAR_DIR = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(APP_DIR, { recursive: true });

const ATELIER_TOKEN = process.env.ATELIER_TOKEN;
const STARTED_AT = new Date().toISOString();
const ATELIER_APP_VERSION = process.env.ATELIER_APP_VERSION || "dev";
const ATELIER_BUNDLE_HASH = process.env.ATELIER_BUNDLE_HASH || bundleFingerprint(SIDECAR_DIR);
if (!ATELIER_TOKEN) {
  console.warn("[atelier] ATELIER_TOKEN absent: mode dev, HTTP/WS acceptés sans token");
}

// Instance unique — voir single_instance.mjs. Décidé AVANT toute mutation
// (threads.json, pid file) : un doublon qui s'efface ne doit rien toucher.
const instance = await resolveSingleInstance({
  pidFile: PID_FILE,
  lockFile: LOCK_FILE,
  selfPid: process.pid,
  bundleHash: ATELIER_BUNDLE_HASH,
});
if (instance.action === "defer") {
  console.error(
    `[atelier] sidecar sain déjà actif (pid ${instance.oldPid}, même bundle) — ce doublon s'efface sans le tuer`,
  );
  process.exit(0);
}
writeFileAtomic(PID_FILE, String(process.pid));

const store = new ThreadStore(`${APP_DIR}/threads.json`);
const automations = new AutomationManager(`${APP_DIR}/automations.json`, store);
let automationContext = null;
let automationTimer = null;
// journal canonique du harnais (plan 025) : ~/…/atelier-studio/harness-history/
const harnessJournal = createHarnessJournal({ baseDir: APP_DIR });
const highlights = new HighlightStore(`${APP_DIR}/highlights.json`);
const providers = { claude, codex, grok, kimi, opencode };
const BUILTIN_PROVIDER_IDS = new Set(Object.keys(providers).concat("gemini"));
// providers API OpenAI-compatible (api_providers.json) — chat pur, runtime dédié.
// Rechargeable à chaud quand l'UI ajoute/modifie un provider.
function reloadApiProviders() {
  for (const id of Object.keys(providers)) {
    if (!BUILTIN_PROVIDER_IDS.has(id)) delete providers[id];
  }
  for (const cfg of loadApiProviderConfigs()) {
    if (!providers[cfg.id]) providers[cfg.id] = makeApiProvider(cfg);
  }
}
reloadApiProviders();

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

// migration : threads Claude portant un sessionId qui n'est pas un UUID Claude.
// Un id « ses_… » vient d'opencode (mal étiqueté claude pendant les smoke tests) :
// on rétablit le vrai provider pour qu'il reprenne. Tout autre id non-UUID est
// illisible par claude --resume → on repart sur une session neuve.
const CLAUDE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const t of store.list()) {
  if (t.provider !== "claude" || !t.sessionId || CLAUDE_UUID.test(t.sessionId)) continue;
  if (String(t.sessionId).startsWith("ses_")) {
    store.upsert({ id: t.id, provider: "opencode" });
  } else {
    store.upsert({ id: t.id, sessionId: null, resumeAt: null });
  }
}

import { readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { execFile } from "node:child_process";

const PASTE_DIR = `${homedir()}/Library/Application Support/atelier-studio/pasted`;
const SETTINGS_FILE = `${APP_DIR}/settings.json`;

// miroir disque des réglages UI : survit aux redémarrages/mises à jour même si
// le localStorage du webview est perdu (rebuild, signature ad-hoc, reset WebKit)
function readSettingsFile() {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeSettingsFile(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  try {
    writeFileAtomic(SETTINGS_FILE, JSON.stringify(settings, null, 1));
    return true;
  } catch {
    return false;
  }
}

const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
function listPasted() {
  const files = [];
  try {
    if (!existsSync(PASTE_DIR)) return files;
    const entries = readdirSync(PASTE_DIR)
      .map((name) => {
        try {
          const st = statSync(`${PASTE_DIR}/${name}`);
          return st.isFile() ? { name, size: st.size, mtime: st.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 48);
    for (const entry of entries) {
      const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
      if (IMG_EXTS.has(ext) && entry.size <= 4_000_000) {
        try {
          const mime = ext === "jpg" ? "jpeg" : ext;
          entry.dataURL = `data:image/${mime};base64,${readFileSync(`${PASTE_DIR}/${entry.name}`).toString("base64")}`;
        } catch {}
      }
      files.push(entry);
    }
  } catch {}
  return files;
}

function cleanup() {
  if (automationTimer) clearInterval(automationTimer);
  try { terminal.closeAll(); } catch {}
  // pas de process `… acp` zombie après l'arrêt du sidecar
  try { opencode.stopAcpServer(); } catch {}
  try { kimi.stopAcpServer(); } catch {}
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

function versionFromPath(bin, binPath) {
  if (bin === "gemini") {
    try {
      const real = fs.realpathSync(binPath);
      const m = /\/gemini-cli\/([^/]+)\//.exec(real);
      if (m?.[1]) return `gemini ${m[1]}`;
    } catch {}
  }
  return null;
}

function cliVersion(bin) {
  const path = resolveBin(bin);
  if (!path) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(path, ["--version"], { timeout: 8000 }, (err, stdout) => {
      const version = err ? null : String(stdout).trim().split("\n")[0];
      resolve(version || versionFromPath(bin, path));
    });
  });
}

function fileExists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function authHintForProvider(provider, modelError) {
  if (provider.kind === "api") {
    const st = providers[provider.id]?.status?.() ?? { ok: false };
    return st.ok ? "ready" : "missing_key";
  }
  if (provider.id === "claude") {
    return fileExists(`${homedir()}/.claude/.credentials.json`) ||
      fileExists(`${homedir()}/.claude/daemon-auth-status.json`)
      ? "ready"
      : "login_needed";
  }
  if (provider.id === "codex") {
    return fileExists(`${homedir()}/.codex/auth.json`) ? "ready" : "login_needed";
  }
  if (provider.id === "grok") {
    return modelError ? "login_or_models_needed" : "ready";
  }
  if (provider.id === "kimi") {
    // jamais atteint en pratique : setupStatus passe par kimi.setupProbe()
    // (états not_installed/version_unsupported/login_needed/
    // model_config_needed/ready/protocol_error) — repli sûr sinon.
    return "login_needed";
  }
  if (provider.id === "opencode") {
    return "check_provider_config";
  }
  return "unknown";
}

async function setupStatus() {
  const runtimeNodePath = process.execPath;
  const runtimeBundled = runtimeNodePath.includes(".app/Contents/Resources/");
  const providerRows = await Promise.all(listProviders().map(async (provider) => {
    if (provider.id === "kimi") {
      // Sonde dédiée SANS quota (plan 046 étape 10) : binaire (résolution
      // spécifique ~/.kimi-code), --version, initialize, authenticate(login),
      // discovery modèles — jamais session/prompt. `auth` porte les états
      // not_installed/version_unsupported/login_needed/model_config_needed/
      // ready/protocol_error.
      const probe = await kimi.setupProbe();
      return {
        id: provider.id,
        label: provider.label,
        kind: provider.kind,
        installed: probe.state !== "not_installed",
        version: probe.version ?? null,
        binPath: probe.binPath ?? null,
        auth: probe.state,
        models: probe.models ?? 0,
        defaultModel: "",
        modelError: probe.shadowed
          ? `installation officielle masquée : ${probe.shadowed} (binaire utilisé : ${probe.binPath})`
          : (probe.error ?? null),
      };
    }
    const binPath = provider.bin ? resolveBin(provider.bin) : null;
    let version = null;
    let models = provider.models;
    let defaultModel = provider.defaultModel;
    let modelError = null;
    if (provider.kind === "api") {
      const st = providers[provider.id]?.status?.() ?? { ok: false };
      return {
        id: provider.id,
        label: provider.label,
        kind: provider.kind,
        installed: st.ok,
        version: st.ok ? "api" : null,
        binPath: null,
        auth: st.ok ? "ready" : "missing_key",
        models: provider.models.length,
        defaultModel,
        modelError: null,
      };
    }
    if (binPath) version = await cliVersion(provider.bin);
    const dynamicModels = providers[provider.id]?.listModels;
    if (typeof dynamicModels === "function" && binPath) {
      try {
        const discovered = await dynamicModels(3500);
        if (Array.isArray(discovered?.models) && discovered.models.length) {
          models = discovered.models;
          defaultModel = discovered.defaultModel ?? discovered.models[0] ?? defaultModel;
        }
      } catch (e) {
        modelError = String(e?.message ?? e);
      }
    }
    return {
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      installed: !!binPath,
      version,
      binPath,
      auth: binPath ? authHintForProvider(provider, modelError) : "not_installed",
      models: models.length,
      defaultModel,
      modelError,
    };
  }));
  return {
    runtime: {
      node: runtimeNodePath,
      version: process.version,
      bundled: runtimeBundled,
    },
    sidecar: {
      pid: process.pid,
      startedAt: STARTED_AT,
      appVersion: ATELIER_APP_VERSION,
      bundleHash: ATELIER_BUNDLE_HASH,
      dir: SIDECAR_DIR,
    },
    providers: providerRows,
  };
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
  return Promise.all(listProviders().map(async (provider) => {
    let models = provider.models;
    let defaultModel = provider.defaultModel;
    const dynamicModels = providers[provider.id]?.listModels;
    if (typeof dynamicModels === "function") {
      try {
        const discovered = await dynamicModels();
        if (Array.isArray(discovered?.models) && discovered.models.length) {
          models = discovered.models;
          defaultModel = discovered.defaultModel ?? discovered.models[0] ?? defaultModel;
        }
      } catch {}
    }
    let modelReasoning = provider.modelReasoning ?? {};
    if (provider.id === "kimi") {
      // Catalogue vivant : discovery CLI + derniers snapshots configOptions.
      // Le thinking off/on n'apparaît QUE pour les modèles confirmés par Kimi
      // (option `thinking` présente dans le snapshot) — plan 046 étape 6.
      const catalog = kimi.cachedKimiCatalog();
      if (!models.length && catalog.models.length) models = catalog.models;
      modelReasoning = { ...modelReasoning, ...catalog.modelReasoning };
    }
    const base = {
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      models,
      modelReasoning,
      defaultModel,
      efforts: provider.efforts,
      // le sidecar est l'autorité des capacités (plan 025) : le composer ne
      // montre que les contrôles réellement supportés
      capabilities: { ...(provider.capabilities ?? {}) },
    };
    if (provider.kind === "api") {
      const st = providers[provider.id]?.status?.() ?? { ok: false };
      return { ...base, version: st.ok ? "api" : null, ok: st.ok, keyMissing: !st.ok };
    }
    const version = await cliVersion(provider.bin);
    return { ...base, version, ok: !!version };
  }));
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
  if (url.pathname === "/providers" && req.method === "GET") {
    res.setHeader("content-type", "application/json");
    providerStatus()
      .then((providers) => res.end(JSON.stringify(providers)))
      .catch(() => {
        res.statusCode = 500;
        res.end(JSON.stringify([]));
      });
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
  if (url.pathname === "/gallery-command" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) req.destroy();
    });
    req.on("end", () => {
      let command;
      try { command = JSON.parse(body); } catch {}
      res.setHeader("content-type", "application/json");
      if (!validGalleryCommand(command)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "gallery-command-invalid" }));
        return;
      }
      broadcast({ type: "galleryCommand", command });
      res.statusCode = 202;
      res.end(JSON.stringify({ ok: true, queued: true, requestId: command.requestId }));
    });
    return;
  }
  if (url.pathname === "/setup" && req.method === "GET") {
    res.setHeader("content-type", "application/json");
    setupStatus()
      .then((status) => res.end(JSON.stringify(status)))
      .catch((e) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(e?.message ?? e) }));
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

// notifications goal Codex (thread/goal/updated) ET tours autonomes du goal
// (turn démarré par le serveur, mappé par le provider) → via le HARNAIS du
// thread (meta + sequence + journal) pour survivre au reload. Sérialisé par
// thread : les événements de streaming d'un tour autonome gardent leur ordre.
const goalEmitChains = new Map(); // threadId -> chaîne de promesses
codex.onGoal?.((threadId, event) => {
  if (!threadId) return;
  const prev = goalEmitChains.get(threadId) ?? Promise.resolve();
  const next = prev.then(() =>
    emitProviderGlobal(threadId, event, {
      send: broadcast,
      broadcast,
      store,
      harnessJournal,
      history,
      sessions,
      providers,
    }).catch((error) => console.warn("[atelier] goal global non journalisé:", error)),
  );
  goalEmitChains.set(threadId, next.then(() => {}, () => {}));
});

wss.on("connection", (ws) => {
  const ctx = {
    connectionId: crypto.randomUUID(),
    clientInstanceId: null,
    send: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    broadcast,
    store,
    automations,
    highlights,
    providers,
    catalog,
    history,
    saveImage,
    status,
    clearPasted,
    listPasted,
    readSettingsFile,
    writeSettingsFile,
    setupStatus,
    apiProviders: {
      // liste SANS les clés (l'UI ne voit que keySet)
      list: () => loadApiProviderConfigs().map(({ apiKey, ...rest }) => ({ ...rest, keySet: !!apiKey || !!(rest.apiKeyEnv && process.env[rest.apiKeyEnv]) })),
      save: (entry) => {
        const id = String(entry.id ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!id || BUILTIN_PROVIDER_IDS.has(id)) throw new Error(`id provider invalide: ${entry.id}`);
        const configs = loadApiProviderConfigs();
        const existing = configs.find((c) => c.id === id);
        const modelMetadata = entry.modelMetadata && typeof entry.modelMetadata === "object"
          ? entry.modelMetadata
          : {};
        const modelIds = (Array.isArray(entry.models) ? entry.models : String(entry.models ?? "").split(","))
          .map((m) => String(m).trim()).filter(Boolean);
        const next = {
          id,
          label: String(entry.label ?? id),
          baseURL: String(entry.baseURL ?? "").replace(/\/+$/, ""),
          protocol: entry.protocol === "anthropic" ? "anthropic" : "openai",
          // clé vide → conserver l'existante (l'UI ne la connaît jamais)
          apiKey: entry.apiKey ? String(entry.apiKey) : existing?.apiKey ?? null,
          apiKeyEnv: entry.apiKeyEnv ? String(entry.apiKeyEnv) : existing?.apiKeyEnv ?? null,
          models: modelIds.map((modelId) => {
            const meta = modelMetadata[modelId];
            return meta?.reasoning ? { id: modelId, label: meta.label, reasoning: meta.reasoning } : modelId;
          }),
          defaultModel: entry.defaultModel ? String(entry.defaultModel) : undefined,
        };
        if (!next.baseURL || !next.models.length) throw new Error("baseURL et au moins un modèle requis");
        writeApiProviderConfigs([...configs.filter((c) => c.id !== id), next]);
        reloadApiProviders();
      },
      remove: (id) => {
        writeApiProviderConfigs(loadApiProviderConfigs().filter((c) => c.id !== id));
        reloadApiProviders();
      },
      discoverModels: (entry) => fetchAvailableModels(entry),
    },
    providerStatus,
    exportThread,
    terminal,
    sessions,
    harnessJournal,
    reviewer,
    gitops,
    ledger,
    zotero,
    scanLocal,
    checkFrame,
  };
  automationContext = { ...ctx, send: broadcast };
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

automationTimer = setInterval(() => {
  if (automationContext) automations.runDue(automationContext, route).catch(() => {});
}, 30_000);
automationTimer.unref?.();
