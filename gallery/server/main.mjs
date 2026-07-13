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
  spawnCollect,
  withTimeout,
} from "./shared.mjs";
import { handleAnnotationGet, handleAnnotationPost } from "./routes/annotations.mjs";
import { handleBoardsGet, handleBoardsPost } from "./routes/boards.mjs";
import { handleCoreGet, handleCorePost } from "./routes/core.mjs";
import { handleEditorsGet, handleEditorsPost } from "./routes/editors.mjs";

const VIDEO_EXTS = new Set([".mp4", ".m4v", ".mov", ".webm"]);

// GET / : la page est RENDUE À LA REQUÊTE depuis le template + figures_data.json —
// plus jamais de coquille cuite périmée, quel que soit le projet ou l'âge du serveur
let __liveShell = { key: "", html: null, pending: null };

function loadLiveShell() {
  if (__liveShell.pending) return __liveShell.pending;
  const task = (async () => {
    const tpl = path.join(ASSETS_DIR, "gallery_template.html");
    const dataPath = path.join(PROJECT, "figures_data.json");
    const [tplStat, dataStat] = await Promise.all([
      fs.promises.stat(tpl),
      fs.promises.stat(dataPath),
    ]);
    const key = `${tplStat.mtimeMs}:${dataStat.mtimeMs}`;
    if (__liveShell.key === key && __liveShell.html) return __liveShell.html;
    const payload = JSON.parse(await fs.promises.readFile(dataPath, "utf8"));
    const { renderShellHtml } = await import("./builder.mjs");
    const html = Buffer.from(renderShellHtml(payload), "utf8");
    __liveShell = { ...__liveShell, key, html };
    return html;
  })();
  __liveShell.pending = task;
  task.finally(() => {
    if (__liveShell.pending === task) __liveShell.pending = null;
  }).catch(() => {});
  return task;
}

function waitingShell(error) {
  const detail = error?.code === "ENOENT"
    ? "Indexing project files…"
    : "Waiting for macOS project access…";
  return Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atelier gallery</title><style>
html,body{height:100%;margin:0;background:#1d1f23;color:#aeb3bd;font:13px -apple-system,BlinkMacSystemFont,sans-serif}
body{display:grid;place-items:center}.card{display:flex;gap:10px;align-items:center}.dot{width:8px;height:8px;border-radius:50%;background:#8b7cf6;box-shadow:0 0 0 5px #8b7cf622}
</style></head><body><div class="card"><span class="dot"></span><span>${detail}</span></div></body></html>`, "utf8");
}

async function serveLiveShell(req, res) {
  try {
    const html = await withTimeout(loadLiveShell(), 3500, "load gallery shell");
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(html.length),
        "Cache-Control": "no-cache",
      });
      res.end();
      return true;
    }
    serveBuffer(res, 200, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    return true;
  } catch (error) {
    const html = waitingShell(error);
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(html.length),
        "Cache-Control": "no-cache",
        "Retry-After": "3",
      });
      res.end();
      return true;
    }
    serveBuffer(res, 200, html, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Retry-After": "3",
    });
    return true;
  }
}

function projectStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath === "/" ? "/figures_index.html" : urlPath);
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
      (req.method === "GET" || req.method === "HEAD")) return serveLiveShell(req, res);
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

// Premier lancement dans un projet : bâtir l'index en arrière-plan. Le serveur
// écoute AVANT tout accès au projet afin qu'une consultation TCC ne puisse
// jamais bloquer /health ni figer le bootstrap Tauri.
const dataPath = path.join(PROJECT, "figures_data.json");
async function prepareInitialGallery() {
  try {
    await fs.promises.access(dataPath);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("[gallery] accès index en attente:", String(error?.message || error));
      return;
    }
  }
  const builder = path.join(path.dirname(new URL(import.meta.url).pathname), "builder.mjs");
  const result = await spawnCollect(process.execPath, [builder], {
    cwd: PROJECT,
    env: { ...process.env, GALLERY_ROOT: PROJECT },
    timeoutMs: 300000,
  });
  if (result.code !== 0) {
    console.error("[gallery] build initial en échec:", String(result.out || result.error || "").slice(-400));
  }
}

// mode Studio : poser le jeton local dès le boot pour que l'app (commande
// Rust gallery_token) puisse le lire avant la première ouverture hors projet
if (STUDIO) galleryToken();

const port = choosePort(PROJECT);
const server = http.createServer((req, res) => {
  route(req, res);
});
server.on("error", (error) => {
  console.error("[gallery] server error:", error?.stack || String(error));
});
server.listen(port, "127.0.0.1");
void prepareInitialGallery();
