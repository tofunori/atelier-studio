import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT,
  APP_VERSION,
  BUNDLE_HASH,
  editorPath,
  ensureDir,
  md5,
  readJsonRequest,
  safePath,
  sendBuffer,
  sendEmpty,
  sendJson,
  serveFile,
  STARTED_AT,
  spawnCollect,
  statMtimeSeconds,
} from "../shared.mjs";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILDER = path.join(THIS_DIR, "..", "builder.mjs");
const DATA_FILE = path.join(PROJECT, "figures_data.json");

function stateDefault() {
  return {
    favs: [],
    ratings: {},
    hidden: [],
    tags: {},
    hideRules: [],
    collections: {},
    workflow: {},
  };
}

function pythonSorted(names) {
  return names.sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    return 0;
  });
}

async function handleThumb(req, res, url) {
  try {
    const src = safePath(url.searchParams.get("path") || "");
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) {
      return sendJson(res, 404, { error: "not found" });
    }
    let w = Number.parseInt(url.searchParams.get("w") || "480", 10);
    if (Number.isNaN(w)) w = 480;
    w = Math.max(64, Math.min(2000, w));
    const lower = src.toLowerCase();
    const key = md5(`${fs.realpathSync(src)}:${statMtimeSeconds(src)}:${w}${lower.endsWith(".svg") ? ":svg-rsvg" : ""}`);
    const td = path.join(PROJECT, ".fig_thumbs");
    ensureDir(td);
    let out = path.join(td, `imgthumb_${key}.png`);
    if (!fs.existsSync(out)) {
      if (lower.endsWith(".svg")) {
        const rsvg = await findExecutable("rsvg-convert");
        if (rsvg) {
          const r = await spawnCollect(rsvg, ["-w", String(w), "-o", out, src], { timeoutMs: 20000 });
          if (r.code !== 0 || !fs.existsSync(out)) out = src;
        } else {
          out = src;
        }
      } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        return sendJson(res, 404, { error: "no html preview (chrome not found)" });
      } else {
        const r = await spawnCollect("sips", ["-Z", String(w), "-s", "format", "png", src, "--out", out], {
          timeoutMs: 20000,
        });
        if (r.code !== 0 || !fs.existsSync(out)) out = src;
      }
    }
    return serveFile(req, res, out);
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

async function findExecutable(name) {
  const r = await spawnCollect("which", [name], { timeoutMs: 3000 });
  if (r.code === 0) return r.out.trim().split(/\r?\n/)[0] || null;
  return null;
}

export async function handleCoreGet(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/ping") {
    return sendJson(res, 200, { ok: true, service: "fig-annotate", project: fs.realpathSync(PROJECT) });
  }
  if (pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "atelier-gallery",
      pid: process.pid,
      port: Number.parseInt(process.env.FIG_PORT || "0", 10) || null,
      startedAt: STARTED_AT,
      projectRoot: fs.realpathSync(PROJECT),
      appVersion: APP_VERSION,
      bundleHash: BUNDLE_HASH,
      tokenRequired: false,
    });
  }
  if (pathname === "/state") {
    try {
      const sp = path.join(PROJECT, ".fig_state.json");
      if (fs.existsSync(sp)) return sendJson(res, 200, JSON.parse(fs.readFileSync(sp, "utf8")));
      return sendJson(res, 200, stateDefault());
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/data") {
    try {
      if (!fs.existsSync(DATA_FILE)) return sendJson(res, 404, { error: "not found" });
      return sendBuffer(res, 200, fs.readFileSync(DATA_FILE), {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/ls" && url.search) { // python: startswith("/ls?") — /ls nu = 404
    try {
      // jeton local : le navigateur de fichiers de l'éditeur peut lister les
      // dossiers hors projet ouverts via le chat (voir editorPath)
      const d = editorPath(url.searchParams.get("dir") ?? PROJECT, url.searchParams.get("token")) || PROJECT;
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
        return sendJson(res, 404, { error: "not a directory" });
      }
      const items = [];
      for (const name of pythonSorted(fs.readdirSync(d))) {
        if (name.startsWith(".")) continue;
        const p = path.join(d, name);
        items.push({ name, dir: fs.existsSync(p) && fs.statSync(p).isDirectory() });
      }
      const parent = d !== PROJECT ? path.dirname(d) : null;
      return sendJson(res, 200, { path: d, parent, items });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/raw") {
    try {
      const p = safePath(url.searchParams.get("path"));
      if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return sendEmpty(res, 404);
      const data = fs.readFileSync(p);
      return sendBuffer(res, 200, data, {
        "Content-Type": p.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
    } catch {
      return sendEmpty(res, 500);
    }
  }
  if (pathname === "/snippet") {
    try {
      const src = safePath(url.searchParams.get("path") || "");
      if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) {
        return sendJson(res, 404, { error: "not found" });
      }
      let n = Number.parseInt(url.searchParams.get("n") || "10", 10);
      if (Number.isNaN(n)) n = 10;
      n = Math.max(1, Math.min(40, n));
      const lines = fs.readFileSync(src, "utf8").split(/\r?\n/).slice(0, n);
      const body = Buffer.from(lines.join("\n").slice(0, 600), "utf8");
      return sendBuffer(res, 200, body, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "max-age=300",
      });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/thumb") return handleThumb(req, res, url);
  return false;
}

export async function handleCorePost(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/state") {
    try {
      const reqJson = await readJsonRequest(req);
      const tags = {};
      const tagsIn = reqJson.tags && typeof reqJson.tags === "object" && !Array.isArray(reqJson.tags) ? reqJson.tags : {};
      for (const [k, v] of Object.entries(tagsIn)) {
        if (!Array.isArray(v) || !v.length) continue;
        const clean = [...new Set(v.map((t) => String(t).trim()).filter(Boolean))].sort().slice(0, 30);
        if (clean.length) tags[k] = clean;
      }
      const rules = [...new Set((Array.isArray(reqJson.hideRules) ? reqJson.hideRules : [])
        .filter((r) => typeof r === "string" && r.trim())
        .map((r) => String(r).trim()))].sort().slice(0, 200);
      const collections = {};
      const collectionsIn = reqJson.collections && typeof reqJson.collections === "object" && !Array.isArray(reqJson.collections)
        ? reqJson.collections
        : {};
      for (const [k, v] of Object.entries(collectionsIn)) {
        const name = String(k).trim().slice(0, 80);
        if (!name || !Array.isArray(v)) continue;
        collections[name] = [...new Set(v.filter((rel) => typeof rel === "string" && rel.trim()).map(String))]
          .sort()
          .slice(0, 1000);
      }
      const workflow = {};
      const workflowIn = reqJson.workflow && typeof reqJson.workflow === "object" && !Array.isArray(reqJson.workflow)
        ? reqJson.workflow
        : {};
      const allowed = new Set(["draft", "candidate", "final", "rejected"]);
      for (const [k, v] of Object.entries(workflowIn)) {
        if (typeof k === "string" && allowed.has(String(v))) workflow[String(k)] = String(v);
      }
      const rin = reqJson.ratings && typeof reqJson.ratings === "object" && !Array.isArray(reqJson.ratings) ? reqJson.ratings : {};
      const ratings = {};
      for (const [k, v] of Object.entries(rin)) {
        if (Number.isInteger(v) && v >= 1 && v <= 5) ratings[k] = v;
      }
      const strs = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].sort() : []);
      const state = {
        favs: strs(reqJson.favs),
        ratings,
        hidden: strs(reqJson.hidden),
        tags,
        hideRules: rules,
        collections,
        workflow,
      };
      const sp = path.join(PROJECT, ".fig_state.json");
      const tmp = `${sp}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
      fs.renameSync(tmp, sp);
      return sendJson(res, 200, {
        ok: true,
        favs: state.favs.length,
        ratings: Object.keys(state.ratings).length,
        hidden: state.hidden.length,
      });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/rescan") {
    const r = await spawnCollect(process.execPath, [BUILDER], {
      cwd: PROJECT,
      // coquille + data : la coquille est triviale à régénérer et suit le template
      env: { ...process.env, GALLERY_ROOT: PROJECT },
      detached: true,
      timeoutMs: 300000,
    });
    if (r.timeout) {
      await spawnCollect("pkill", ["-f", "qlmanage"], { timeoutMs: 10000 });
      return sendJson(res, 200, { ok: false, out: "rescan timed out" });
    }
    return sendJson(res, 200, { ok: r.code === 0, out: (r.out || "").slice(-200) });
  }
  return false;
}
