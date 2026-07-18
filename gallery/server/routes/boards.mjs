import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  GALLERY_DIR,
  PROJECT,
  STUDIO,
  choosePort,
  ensureDir,
  expandHome,
  readJsonRequest,
  realpathOrResolve,
  relSlash,
  safePath,
  sendJson,
  serveBuffer,
  spawnCollect,
} from "../shared.mjs";

const BOARD_QUEUE = [];
const BOARD_QUEUE_MAX = 500;
const NATIVE_FULLSCREEN_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".bmp", ".svg"]);

function cmuxEnv() {
  const env = { ...process.env };
  try {
    const pw = fs.readFileSync(expandHome("~/.config/cmux/.gallery-socket-pw"), "utf8").trim();
    if (pw) env.CMUX_SOCKET_PASSWORD = pw;
  } catch {
    // optional socket password
  }
  return env;
}

async function cmuxExe() {
  for (const p of [
    "/Applications/cmux.app/Contents/Resources/bin/cmux",
    expandHome("~/.local/bin/cmux"),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  const r = await spawnCollect("which", ["cmux"], { timeoutMs: 3000 });
  return r.code === 0 ? r.out.trim().split(/\r?\n/)[0] || null : null;
}

async function whichOrNull(name, fallback = null) {
  if (fallback && fs.existsSync(fallback)) return fallback;
  const r = await spawnCollect("which", [name], { timeoutMs: 3000 });
  return r.code === 0 ? r.out.trim().split(/\r?\n/)[0] || null : null;
}

function requestLength(req) {
  const n = Number.parseInt(req.headers["content-length"] || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

function launchNativeFullscreen(file) {
  const viewer = path.join(GALLERY_DIR, "native_fullscreen_viewer.py");
  if (!fs.existsSync(viewer)) return { ok: false, error: "native fullscreen viewer missing" };
  const python = process.env.PYTHON || "python3";
  try {
    const child = spawn(python, [viewer, file], {
      cwd: PROJECT,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

export async function handleBoardsGet(req, res, url) {
  const pathname = url.pathname;
  if (STUDIO && pathname.startsWith("/zotero/")) {
    const parts = pathname.split("/");
    if (parts.length === 4) {
      const key = parts[2];
      const fname = decodeURIComponent(parts[3]);
      if (/^[A-Za-z0-9]{8}$/.test(key) && /^[^/\\]+\.pdf$/i.test(fname)) {
        const root = realpathOrResolve(expandHome("~/Zotero/storage"));
        const zp = realpathOrResolve(path.join(root, key, fname));
        if (zp.startsWith(root + path.sep) && fs.existsSync(zp) && fs.statSync(zp).isFile()) {
          try {
            return serveBuffer(res, 200, fs.readFileSync(zp), { "Content-Type": "application/pdf" });
          } catch {
            return sendJson(res, 500, { error: "read error" });
          }
        }
      }
    }
    return sendJson(res, 404, { error: "not found" });
  }
  // PDF de la base de connaissances (plan 052) : sert le fichier pointé par
  // le REGISTRE (jamais un chemin de la requête — aucune traversée possible).
  if (STUDIO && pathname.startsWith("/kb-pdf/")) {
    const id = pathname.split("/")[2] ?? "";
    if (/^[0-9a-f]{8}$/.test(id)) {
      try {
        const appDir = process.env.ATELIER_APP_DIR
          || path.join(os.homedir(), "Library", "Application Support", "atelier-studio");
        const registry = JSON.parse(fs.readFileSync(path.join(appDir, "knowledge", "knowledge.json"), "utf8"));
        const source = (registry.sources ?? []).find((s) => s?.id === id);
        const origin = source?.origin;
        if ((source?.kind === "pdf" || source?.kind === "zotero")
          && typeof origin === "string" && /\.pdf$/i.test(origin)
          && fs.existsSync(origin) && fs.statSync(origin).isFile()) {
          return serveBuffer(res, 200, fs.readFileSync(origin), { "Content-Type": "application/pdf" });
        }
      } catch {}
    }
    return sendJson(res, 404, { error: "not found" });
  }
  if (pathname === "/notes/load") {
    try {
      const np = path.join(PROJECT, "notes.md");
      return sendJson(res, 200, { markdown: fs.existsSync(np) ? fs.readFileSync(np, "utf8") : "" });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/board/load") {
    try {
      const bp = path.join(PROJECT, ".fig_thumbs", "board.tldr.json");
      return sendJson(res, 200, { snapshot: fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, "utf8")) : null });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/board/poll") {
    const commands = BOARD_QUEUE.splice(0, BOARD_QUEUE.length);
    return sendJson(res, 200, { commands });
  }
  return false;
}

export async function handleBoardsPost(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/orca-fullscreen-exit") {
    return sendJson(res, 200, { ok: true, deprecated: true, method: "noop; use /orca-native-fullscreen" });
  }
  if (pathname === "/orca-native-fullscreen") {
    try {
      const payload = await readJsonRequest(req, 4096);
      const rel = payload.rel || "";
      const p = safePath(rel);
      const ext = path.extname(p || "").toLowerCase();
      if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile() || !NATIVE_FULLSCREEN_EXTS.has(ext)) {
        return sendJson(res, 400, { ok: false, error: "not a supported project image" });
      }
      const data = launchNativeFullscreen(p);
      return sendJson(res, data.ok ? 200 : 500, data);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/board/open-surface" || pathname === "/notes/open-surface") {
    try {
      if (STUDIO) return sendJson(res, 500, { ok: false, error: "studio mode" });
      const page = pathname.startsWith("/board") ? "whiteboard" : "notes";
      const targetUrl = `http://127.0.0.1:${choosePort(PROJECT)}/.fig_thumbs/${page}/index.html`;
      let host = "";
      try {
        const len = requestLength(req);
        if (len > 0 && len <= 4096) {
          const payload = await readJsonRequest(req, 4096);
          host = String(payload.host || "");
        }
      } catch {
        // optional hint
      }
      const candidates = [
        [await cmuxExe(), ["browser", "open", targetUrl], "cmux"],
        [await whichOrNull("muxy"), ["browser", "open", targetUrl], "muxy"],
        [await whichOrNull("orca", "/usr/local/bin/orca"), ["tab", "create", "--url", targetUrl, "--json"], "orca"],
      ].filter(([exe]) => exe);
      candidates.sort((a, b) => Number(a[2] !== host) - Number(b[2] !== host));
      for (const [exe, args, name] of candidates) {
        const r = await spawnCollect(exe, args, { timeoutMs: 10000, env: cmuxEnv() });
        if (r.code !== 0) continue;
        if (name === "orca") {
          try {
            if (!JSON.parse(r.out || "{}").ok) continue;
          } catch {
            continue;
          }
        }
        return sendJson(res, 200, { ok: true, via: name });
      }
      return sendJson(res, 502, { error: "no embedded browser available (muxy/orca/cmux)" });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/notes/save") {
    try {
      const len = requestLength(req);
      if (len <= 0 || len > 16 * 1024 * 1024) return sendJson(res, 413, { error: "empty or oversized notes" });
      const payload = await readJsonRequest(req, 16 * 1024 * 1024);
      if (typeof payload.markdown !== "string") return sendJson(res, 400, { error: "markdown must be a string" });
      const tmp = path.join(PROJECT, `.notes.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, payload.markdown, "utf8");
      fs.renameSync(tmp, path.join(PROJECT, "notes.md"));
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/board/save") {
    try {
      const len = requestLength(req);
      if (len <= 0 || len > 64 * 1024 * 1024) return sendJson(res, 413, { error: "empty or oversized snapshot" });
      const payload = await readJsonRequest(req, 64 * 1024 * 1024);
      if (!payload.snapshot || typeof payload.snapshot !== "object" || Array.isArray(payload.snapshot)) {
        return sendJson(res, 400, { error: "snapshot must be an object" });
      }
      const bdir = path.join(PROJECT, ".fig_thumbs");
      ensureDir(bdir);
      const tmp = path.join(bdir, `.board.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(payload.snapshot), "utf8");
      fs.renameSync(tmp, path.join(bdir, "board.tldr.json"));
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/board/command") {
    try {
      const len = requestLength(req);
      if (len <= 0 || len > 8 * 1024 * 1024) return sendJson(res, 413, { error: "empty or oversized command" });
      const cmd = await readJsonRequest(req, 8 * 1024 * 1024);
      if (!cmd || typeof cmd !== "object" || typeof cmd.type !== "string") {
        return sendJson(res, 400, { error: "command needs a string 'type'" });
      }
      if (cmd.type === "add_image") {
        const rel = String(cmd.url || cmd.rel || "");
        const p = safePath(rel.replace(/^\/+/, ""));
        if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
          return sendJson(res, 404, { error: "image not found in project" });
        }
        cmd.url = `/${relSlash(PROJECT, p)}`;
      }
      if (BOARD_QUEUE.length >= BOARD_QUEUE_MAX) {
        return sendJson(res, 429, { error: "board queue full (canvas not open?)" });
      }
      BOARD_QUEUE.push(cmd);
      return sendJson(res, 200, { ok: true, queued: true });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  return false;
}
