import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  ASSETS_DIR,
  PROJECT,
  STUDIO,
  applyAppCors,
  choosePort,
  contentType,
  galleryToken,
  localOnly,
  safePath,
  sendEmpty,
  sendJson,
  serveBuffer,
  serveFile,
} from "./shared.mjs";
import { handleAnnotationGet, handleAnnotationPost } from "./routes/annotations.mjs";
import { handleBoardsGet, handleBoardsPost } from "./routes/boards.mjs";
import { handleCoreGet, handleCorePost } from "./routes/core.mjs";
import { handleEditorsGet, handleEditorsPost } from "./routes/editors.mjs";

const VIDEO_EXTS = new Set([".mp4", ".m4v", ".mov", ".webm"]);

let __shellCheckAt = 0;
function ensureFreshShell() {
  // coquille périmée si le template a changé (rebuild de l'app pendant que ce
  // serveur tournait) — vérif au plus 1×/5s, régénération instantanée sans scan
  const now = Date.now();
  if (now - __shellCheckAt < 5000) return;
  __shellCheckAt = now;
  try {
    const tpl = path.join(ASSETS_DIR, "gallery_template.html");
    const shell = path.join(PROJECT, "figures_index.html");
    if (fs.existsSync(shell) && fs.statSync(tpl).mtimeMs > fs.statSync(shell).mtimeMs) {
      import("./builder.mjs").then((b) => { if (b.rebuildShellOnly()) console.error("[gallery] coquille régénérée (GET)"); });
    }
  } catch {}
}

// GET / : la page est RENDUE À LA REQUÊTE depuis le template + figures_data.json —
// plus jamais de coquille cuite périmée, quel que soit le projet ou l'âge du serveur
let __liveShell = { key: "", html: null };
async function serveLiveShell(res) {
  try {
    const tpl = path.join(ASSETS_DIR, "gallery_template.html");
    const dataPath = path.join(PROJECT, "figures_data.json");
    if (!fs.existsSync(dataPath)) return false;   // pas encore scanné → fallback fichier/boot-build
    const key = fs.statSync(tpl).mtimeMs + ":" + fs.statSync(dataPath).mtimeMs;
    if (__liveShell.key !== key) {
      const { renderShellHtml } = await import("./builder.mjs");
      const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      __liveShell = { key, html: Buffer.from(renderShellHtml(payload), "utf8") };
    }
    serveBuffer(res, 200, __liveShell.html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    return true;
  } catch { return false; }
}

function projectStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath === "/" ? "/figures_index.html" : urlPath);
  if (urlPath === "/") ensureFreshShell();
  const rel = decoded.replace(/^\/+/, "");
  return safePath(rel);
}

function assetFallbackPath(urlPath) {
  if (!urlPath.startsWith("/.fig_thumbs/")) return null;
  const rel = decodeURIComponent(urlPath.slice("/.fig_thumbs/".length));
  const p = path.resolve(ASSETS_DIR, rel);
  return p === ASSETS_DIR || p.startsWith(ASSETS_DIR + path.sep) ? p : null;
}

function serveVideo(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: "not found" });
  const fsize = fs.statSync(file).size;
  let start = 0;
  let end = fsize - 1;
  let partial = false;
  const range = req.headers.range;
  if (range && range.startsWith("bytes=")) {
    try {
      const [s, e] = range.slice(6).split("-", 2);
      if (s.trim()) {
        start = Number.parseInt(s, 10);
        end = e.trim() ? Number.parseInt(e, 10) : fsize - 1;
      } else {
        start = Math.max(0, fsize - Number.parseInt(e, 10));
      }
      if (start > end || start >= fsize) {
        res.writeHead(416, { "Content-Range": `bytes */${fsize}` });
        res.end();
        return true;
      }
      end = Math.min(end, fsize - 1);
      partial = true;
    } catch {
      start = 0;
      end = fsize - 1;
      partial = false;
    }
  }
  const length = end - start + 1;
  res.writeHead(partial ? 206 : 200, {
    "Content-Type": contentType(file),
    "Accept-Ranges": "bytes",
    "Content-Length": String(length),
    ...(partial ? { "Content-Range": `bytes ${start}-${end}/${fsize}` } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(file, { start, end }).pipe(res);
  return true;
}

function maybeInjectSelectionOverlay(req, res, file, urlPath) {
  const ext = path.extname(file).toLowerCase();
  if (![".html", ".htm"].includes(ext)) return false;
  if (urlPath.startsWith("/.fig_thumbs/") || path.basename(file) === "figures_index.html") return false;
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    return false;
  }
  const tag = '<script defer src="/.fig_thumbs/sel_overlay.js?v=3"></script>';
  // index CARACTÈRES vs BYTES : le HTML contient des multi-octets (« ») —
  // on splice en string, jamais un index string dans un Buffer
  const text = body.toString("utf8");
  const i = text.toLowerCase().lastIndexOf("</body>");
  body = Buffer.from(i === -1 ? text + tag : text.slice(0, i) + tag + text.slice(i), "utf8");
  return serveBuffer(res, 200, body, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
}

async function handleStatic(req, res, url) {
  const urlPath = url.pathname;
  // L'app Atelier ouvre explicitement /figures_index.html alors que les
  // navigateurs utilisent souvent /. Les deux doivent être une vue du même
  // template embarqué; ne jamais servir la coquille historique du projet.
  if ((urlPath === "/" || urlPath === "/figures_index.html") &&
      req.method === "GET" && await serveLiveShell(res)) return true;
  const asset = assetFallbackPath(urlPath);
  let file = asset && fs.existsSync(asset) ? asset : null;
  if (!file) file = projectStaticPath(urlPath);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  if (VIDEO_EXTS.has(path.extname(file).toLowerCase())) return serveVideo(req, res, file);
  if (req.method === "GET" && maybeInjectSelectionOverlay(req, res, file, urlPath)) return true;
  if (req.method === "HEAD") {
    const st = fs.statSync(file);
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Content-Length": String(st.size),
      "Cache-Control": urlPath.endsWith(".html") || urlPath.endsWith(".js") || urlPath === "/" ? "no-cache" : "max-age=86400",
    });
    res.end();
    return true;
  }
  return serveFile(req, res, file);
}

async function route(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    // frontière d'origine unique, AVANT tout routage (GET/HEAD/POST/OPTIONS,
    // pdfannot compris) : origine refusée → 403 sans lecture ni mutation
    if (!localOnly(req)) return sendJson(res, 403, { error: "cross-origin blocked" });
    applyAppCors(req, res);
    if (req.method === "OPTIONS") return sendJson(res, 200, {});
    if (req.method === "GET" || req.method === "HEAD") {
      if (req.method === "GET" && await handleAnnotationGet(req, res, url)) return true;
      if (req.method === "GET" && await handleCoreGet(req, res, url)) return true;
      if (req.method === "GET" && await handleEditorsGet(req, res, url)) return true;
      if (req.method === "GET" && await handleBoardsGet(req, res, url)) return true;
      if (await handleStatic(req, res, url)) return true;
      return sendEmpty(res, 404);
    }
    if (req.method === "POST") {
      if (await handleAnnotationPost(req, res, url)) return true;
      if (await handleCorePost(req, res, url)) return true;
      if (await handleEditorsPost(req, res, url)) return true;
      if (await handleBoardsPost(req, res, url)) return true;
      return sendJson(res, 404, { error: "not found" });
    }
    return sendEmpty(res, 405);
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// premier lancement dans un projet : bâtir la galerie avant d'écouter
// (parité avec cmux_gallery.py run, qui build puis sert)
import { spawnSync } from "node:child_process";
const shellPath = path.join(PROJECT, "figures_index.html");
const dataPath = path.join(PROJECT, "figures_data.json");
// coquille périmée (template mis à jour par un rebuild de l'app) → régénérer
// la coquille SEULE depuis les données existantes (instantané, pas de rescan)
try {
  const tpl = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets", "gallery_template.html");
  if (fs.existsSync(shellPath) && fs.existsSync(dataPath) &&
      fs.statSync(tpl).mtimeMs > fs.statSync(shellPath).mtimeMs) {
    const { rebuildShellOnly } = await import("./builder.mjs");
    if (rebuildShellOnly()) console.error("[gallery] coquille régénérée (template plus récent)");
  }
} catch {}
if (!fs.existsSync(shellPath) || !fs.existsSync(dataPath)) {
  const builder = path.join(path.dirname(new URL(import.meta.url).pathname), "builder.mjs");
  const r = spawnSync(process.execPath, [builder], {
    cwd: PROJECT,
    env: { ...process.env, GALLERY_ROOT: PROJECT },
    timeout: 300000,
  });
  if (r.status !== 0) console.error("[gallery] build initial en échec:", String(r.stderr).slice(0, 400));
}

// mode Studio : poser le jeton local dès le boot pour que l'app (commande
// Rust gallery_token) puisse le lire avant la première ouverture hors projet
if (STUDIO) galleryToken();

const port = choosePort(PROJECT);
http.createServer((req, res) => {
  route(req, res);
}).listen(port, "127.0.0.1");
