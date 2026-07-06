import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  ASSETS_DIR,
  PROJECT,
  choosePort,
  contentType,
  localOnly,
  safePath,
  sendEmpty,
  sendJson,
  serveBuffer,
  serveFile,
} from "./shared.mjs";
import { handleAnnotationGet, handleAnnotationPost } from "./routes/annotations.mjs";
import { handleCoreGet, handleCorePost } from "./routes/core.mjs";

const VIDEO_EXTS = new Set([".mp4", ".m4v", ".mov", ".webm"]);

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
    "Access-Control-Allow-Origin": "*",
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
  const tag = Buffer.from('<script defer src="/.fig_thumbs/sel_overlay.js?v=3"></script>');
  const lower = body.toString("utf8").toLowerCase();
  const i = lower.lastIndexOf("</body>");
  body = i === -1 ? Buffer.concat([body, tag]) : Buffer.concat([body.subarray(0, i), tag, body.subarray(i)]);
  return serveBuffer(res, 200, body, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
}

function handleStatic(req, res, url) {
  const urlPath = url.pathname;
  let file = projectStaticPath(urlPath);
  if (!file || !fs.existsSync(file)) {
    const asset = assetFallbackPath(urlPath);
    if (asset && fs.existsSync(asset)) file = asset;
  }
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  if (VIDEO_EXTS.has(path.extname(file).toLowerCase())) return serveVideo(req, res, file);
  if (req.method === "GET" && maybeInjectSelectionOverlay(req, res, file, urlPath)) return true;
  if (req.method === "HEAD") {
    const st = fs.statSync(file);
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Content-Length": String(st.size),
      "Cache-Control": urlPath.endsWith(".html") || urlPath.endsWith(".js") || urlPath === "/" ? "no-cache" : "max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
    return true;
  }
  return serveFile(req, res, file);
}

async function route(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "OPTIONS") return sendJson(res, 200, {});
    if (req.method === "GET" || req.method === "HEAD") {
      if (req.method === "GET" && await handleAnnotationGet(req, res, url)) return true;
      if (req.method === "GET" && await handleCoreGet(req, res, url)) return true;
      if (handleStatic(req, res, url)) return true;
      return sendEmpty(res, 404);
    }
    if (req.method === "POST") {
      if (url.pathname !== "/pdfannot" && !localOnly(req)) {
        return sendJson(res, 403, { error: "cross-origin blocked" });
      }
      if (await handleAnnotationPost(req, res, url)) return true;
      if (await handleCorePost(req, res, url)) return true;
      return sendJson(res, 404, { error: "not found" });
    }
    return sendEmpty(res, 405);
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

const port = choosePort(PROJECT);
http.createServer((req, res) => {
  route(req, res);
}).listen(port, "127.0.0.1");
