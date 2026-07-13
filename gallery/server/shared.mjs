import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const GALLERY_DIR = path.dirname(SERVER_DIR);
export const ASSETS_DIR = path.join(GALLERY_DIR, "assets");
export const PROJECT = realpathOrResolve(
  process.env.GALLERY_ROOT ? expandHome(process.env.GALLERY_ROOT) : process.cwd(),
);
export const STUDIO = Boolean(process.env.ATELIER_STUDIO);
// Les compositions annotées sont des aperçus de transport pour le chat, pas
// des artefacts du projet. Le cache .fig_thumbs est exclu du catalogue.
export const OUT_DIR = path.join(PROJECT, ".fig_thumbs", "annotation-previews");
export const STARTED_AT = new Date().toISOString();
export const APP_VERSION = process.env.ATELIER_APP_VERSION || "dev";
export const BUNDLE_HASH = process.env.ATELIER_BUNDLE_HASH || bundleFingerprint(GALLERY_DIR);

export function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function realpathOrResolve(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function md5(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

export function bundleFingerprint(root) {
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

export function choosePort(root = PROJECT) {
  if (process.env.FIG_PORT) return Number.parseInt(process.env.FIG_PORT, 10);
  if (process.env.STUDIO_PORT_BASE) {
    const base = Number.parseInt(process.env.STUDIO_PORT_BASE, 10);
    const rem = Number(BigInt(`0x${md5(realpathOrResolve(root))}`) % 1000n);
    return base + rem;
  }
  return 8790;
}

export function relSlash(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

export function safePath(input) {
  let p = expandHome(String(input || ""));
  if (!path.isAbsolute(p)) p = path.join(PROJECT, p);
  p = realpathOrResolve(p);
  const root = realpathOrResolve(PROJECT);
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

// Jeton local partagé avec l'app Tauri (commande gallery_token) : fichier 0600
// sous ~ qu'aucune page web ne peut lire — seule l'app peut donc présenter le
// jeton. Créé au boot du serveur ("wx" : le premier processus gagne, les autres
// relisent).
const TOKEN_FILE = path.join(os.homedir(), ".atelier-studio", "gallery_token");
let TOKEN_CACHE = null;

export function galleryToken() {
  if (TOKEN_CACHE) return TOKEN_CACHE;
  try {
    const tok = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (tok) {
      TOKEN_CACHE = tok;
      return tok;
    }
  } catch {}
  const fresh = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(TOKEN_FILE, fresh, { encoding: "utf8", mode: 0o600, flag: "wx" });
    TOKEN_CACHE = fresh;
  } catch {
    try {
      TOKEN_CACHE = fs.readFileSync(TOKEN_FILE, "utf8").trim() || null;
    } catch {
      TOKEN_CACHE = null;
    }
  }
  return TOKEN_CACHE;
}

// safePath des endpoints éditeur : une requête portant le jeton local peut
// sortir du projet, mais seulement sous ~/Documents ou ~/Desktop (fichiers
// hors projet ouverts depuis le chat). Sans jeton valide : sandbox projet
// inchangé.
export function editorPath(input, token) {
  const p = safePath(input);
  if (p) return p;
  if (!STUDIO || !token || token !== galleryToken()) return null;
  const q = realpathOrResolve(expandHome(String(input || "")));
  const home = os.homedir();
  const allowed = ["Documents", "Desktop"].some((d) => q.startsWith(path.join(home, d) + path.sep));
  return allowed ? q : null;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFileAtomicSync(file, data, { backup = false, mode = 0o600 } = {}) {
  const dir = path.dirname(file);
  ensureDir(dir);
  const nonce = `${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}`;
  const tmp = path.join(dir, `.${path.basename(file)}.${nonce}.tmp`);
  const backupTmp = path.join(dir, `.${path.basename(file)}.${nonce}.bak.tmp`);
  let fd;
  try {
    fd = fs.openSync(tmp, "wx", mode);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (backup && fs.existsSync(file)) {
      fs.copyFileSync(file, backupTmp);
      fs.renameSync(backupTmp, `${file}.bak`);
    }
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.unlinkSync(backupTmp); } catch {}
  }
}

export function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function htmlEscape(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pyEscapeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i += 1) {
    const cp = s.codePointAt(i);
    if (cp > 0xffff) i += 1;
    if (cp === 0x22) out += '\\"';
    else if (cp === 0x5c) out += "\\\\";
    else if (cp === 0x08) out += "\\b";
    else if (cp === 0x0c) out += "\\f";
    else if (cp === 0x0a) out += "\\n";
    else if (cp === 0x0d) out += "\\r";
    else if (cp === 0x09) out += "\\t";
    else if (cp < 0x20) out += `\\u${cp.toString(16).padStart(4, "0")}`;
    else if (cp < 0x80) out += String.fromCodePoint(cp);
    else if (cp <= 0xffff) out += `\\u${cp.toString(16).padStart(4, "0")}`;
    else {
      const n = cp - 0x10000;
      const hi = 0xd800 + (n >> 10);
      const lo = 0xdc00 + (n & 0x3ff);
      out += `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
    }
  }
  return out + '"';
}

export function pyJson(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return pyEscapeString(value);
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => pyJson(v)).join(", ")}]`;
  const parts = [];
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    parts.push(`${pyEscapeString(k)}: ${pyJson(v)}`);
  }
  return `{${parts.join(", ")}}`;
}

export function sendJson(res, code, payload) {
  const body = Buffer.from(pyJson(payload));
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": String(body.length),
  });
  res.end(body);
  return true;
}

export function sendEmpty(res, code) {
  res.writeHead(code);
  res.end();
  return true;
}

export function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html",
    ".htm": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".bcmap": "application/octet-stream",
  }[ext] || "application/octet-stream";
}

export function serveFile(req, res, file, opts = {}) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return sendJson(res, 404, { error: "not found" });
  }
  const urlPath = new URL(req.url, "http://127.0.0.1").pathname;
  const noCache = urlPath === "/" || urlPath.endsWith(".html") || urlPath.endsWith(".js");
  res.writeHead(200, {
    "Content-Type": opts.type || contentType(file),
    "Content-Length": String(data.length),
    "Cache-Control": opts.cacheControl || (noCache ? "no-cache" : "max-age=86400"),
  });
  res.end(data);
  return true;
}

export function serveBuffer(res, code, data, headers = {}) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  res.writeHead(code, { "Content-Length": String(body.length), ...headers });
  res.end(body);
  return true;
}

export const sendBuffer = serveBuffer;

/**
 * Borne l'attente d'une opération asynchrone sans bloquer l'event loop.
 *
 * Les accès aux dossiers protégés par TCC peuvent rester suspendus plusieurs
 * secondes quand le serveur est lancé depuis le bundle .app. La promesse
 * source continue en arrière-plan (et peut donc converger après l'autorisation
 * macOS), tandis que la requête HTTP courante reçoit une réponse bornée.
 */
export function withTimeout(promise, timeoutMs, label = "operation") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs} ms`);
      error.code = "ETIMEDOUT";
      reject(error);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function readRequestBody(req, limit = 128 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJsonRequest(req, limit) {
  const body = await readRequestBody(req, limit);
  return JSON.parse(body.length ? body.toString("utf8") : "{}");
}

// Origines de la webview de l'app Tauri : un navigateur ne peut pas forger
// l'en-tête Origin, et aucune page web ne peut porter tauri:// ni être servie
// depuis le devUrl local sans exécuter déjà du code sur la machine. Le scénario
// fermé ici est la page web externe qui lit/mute le serveur local ; l'app
// elle-même (POST /rescan du générateur d'images) reste autorisée.
const APP_WEBVIEW_ORIGINS = new Set([
  "tauri://localhost", // build macOS
  "http://tauri.localhost", // build Windows
  "http://localhost:1420", // dev vite (tauri.conf.json devUrl)
]);

// CORS minimal : SEULE la webview de l'app peut lire les réponses en
// cross-origin (ex. /findfile depuis App.tsx) — aucune page web externe
// n'obtient jamais cet en-tête.
export function applyAppCors(req, res) {
  const origin = req.headers.origin;
  if (origin && APP_WEBVIEW_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

export function localOnly(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true; // probes Rust/sidecar, navigation directe
  if (APP_WEBVIEW_ORIGINS.has(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false; // "null" (iframe sandboxée), origine opaque ou invalide
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") return false;
  // port réel de la socket, jamais le header Host (falsifiable)
  const localPort = req.socket?.localPort;
  const originPort = url.port ? Number.parseInt(url.port, 10) : 80;
  return Number.isInteger(localPort) && originPort === localPort;
}

export function statMtimeSeconds(file) {
  return Math.floor(fs.statSync(file).mtimeMs / 1000);
}

export function spawnCollect(cmd, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      detached: Boolean(options.detached),
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let out = "";
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", (error) => finish({ code: -1, out, error }));
    child.on("close", (code) => finish({ code, out }));
    const timer = setTimeout(() => {
      killTree(child);
      finish({ code: null, out, timeout: true });
    }, timeoutMs);
    try {
      if (options.input !== undefined) child.stdin?.write(options.input);
      child.stdin?.end();
    } catch {
      // The subprocess may fail before accepting stdin; report its exit/error instead.
    }
  });
}

export function killTree(child) {
  if (!child || !child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
    return;
  } catch {
    // fall through
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }
}
