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
export const OUT_DIR = path.join(PROJECT, "annotations");
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

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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
    "Access-Control-Allow-Origin": "*",
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

export function localOnly(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
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
