import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, spawnSync, execFile } from "node:child_process";
import {
  PROJECT,
  SERVER_DIR,
  ensureDir,
  expandHome,
  localOnly,
  md5,
  readJsonRequest,
  editorPath,
  realpathOrResolve,
  relSlash,
  safePath,
  sendJson,
  serveFile,
  spawnCollect,
  statMtimeSeconds,
  writeFileAtomicSync,
} from "../shared.mjs";
import { warmSuggest } from "../claude_warm.mjs";

const THUMB_DIR = path.join(PROJECT, ".fig_thumbs");
const BUILDER = path.join(SERVER_DIR, "builder.mjs");
const LATEXMK = "/Library/TeX/texbin/latexmk";
const SYNCTEX = "/Library/TeX/texbin/synctex";
const VERSION_SOURCES = new Set(["user-save", "external-reload", "external-merge", "external-conflict", "restore", "legacy"]);
const VERSION_STATUSES = new Set(["applied", "pending-conflict"]);
const VERSION_TEXT_LIMIT = 8 * 1024 * 1024;

function textHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function emptyVersionState(p) {
  return { v: 2, path: p, revision: 0, base: null, texts: {}, interventions: [], legacySnapshots: [], current: null };
}

function validateHash(hash) {
  return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
}

function validateVersionState(state) {
  if (!state || state.v !== 2 || typeof state.path !== "string"
      || !Number.isInteger(state.revision) || state.revision < 0
      || !state.texts || Array.isArray(state.texts) || typeof state.texts !== "object"
      || !Array.isArray(state.interventions) || !Array.isArray(state.legacySnapshots)) throw new Error("invalid versions state");
  let bytes = 0;
  for (const [hash, text] of Object.entries(state.texts)) {
    if (!validateHash(hash) || typeof text !== "string" || textHash(text) !== hash) throw new Error("invalid text hash");
    bytes += Buffer.byteLength(text);
  }
  if (bytes > VERSION_TEXT_LIMIT) throw new Error("versions texts too large");
  const hasText = (hash) => validateHash(hash) && Object.prototype.hasOwnProperty.call(state.texts, hash);
  if (state.base && (!hasText(state.base.hash) || !["git", "session", "legacy"].includes(state.base.kind)
      || typeof state.base.sha !== "string" || !Number.isFinite(Number(state.base.ts)))) throw new Error("invalid base");
  if (state.current && (!hasText(state.current.hash) || !Number.isFinite(Number(state.current.ts)))) throw new Error("invalid current");
  const ids = new Set();
  for (const item of state.interventions) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
        || !hasText(item.fromHash) || !hasText(item.toHash)
        || !Number.isFinite(Number(item.ts)) || !VERSION_SOURCES.has(item.source)
        || !VERSION_STATUSES.has(item.status)) throw new Error("invalid intervention");
    ids.add(item.id);
  }
  for (const snap of state.legacySnapshots) {
    if (!snap || !hasText(snap.hash) || !Number.isFinite(Number(snap.ts)) || typeof snap.label !== "string")
      throw new Error("invalid legacy snapshot");
  }
  return state;
}

function migrateVersionV1(data, p) {
  const allowed = new Set(["v", "path", "items", "last"]);
  if (!data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some((key) => !allowed.has(key))
      || (data.v !== undefined && data.v !== 1)
      || (data.path !== undefined && typeof data.path !== "string")
      || !Array.isArray(data.items)
      || !(typeof data.last === "string" || data.last === null)
      || data.items.some((it) => !it || typeof it !== "object" || Array.isArray(it)
        || typeof it.b !== "string" || (it.t !== undefined && !Number.isFinite(Number(it.t)))
        || Object.keys(it).some((key) => key !== "b" && key !== "t")))
    throw new Error("invalid versions v1 schema");
  const state = emptyVersionState(p);
  const items = data.items;
  const snapshots = items.map((it, index) => ({ text: it.b, ts: Number(it.t) || index, label: `snapshot v1 ${index + 1}` }));
  if (typeof data?.last === "string") snapshots.push({ text: data.last, ts: snapshots.at(-1)?.ts ?? 0, label: "dernier connu v1" });
  for (const snap of snapshots) {
    const hash = textHash(snap.text); state.texts[hash] = snap.text;
    state.legacySnapshots.push({ hash, ts: snap.ts, label: snap.label });
  }
  if (snapshots.length) {
    const first = snapshots[0], firstHash = textHash(first.text);
    state.base = { hash: firstHash, kind: "legacy", sha: "", ts: first.ts };
    for (let i = 1; i < snapshots.length; i += 1) {
      const before = snapshots[i - 1], after = snapshots[i];
      if (before.text === after.text) continue;
      state.interventions.push({ id: `legacy-${i}-${textHash(before.text).slice(0, 8)}-${textHash(after.text).slice(0, 8)}`,
        fromHash: textHash(before.text), toHash: textHash(after.text), ts: after.ts,
        source: "legacy", status: "applied" });
    }
    const last = snapshots.at(-1); state.current = { hash: textHash(last.text), ts: last.ts };
  }
  return validateVersionState(state);
}

function decodeVersionFile(file, p) {
  const raw = fs.readFileSync(file);
  let parsed;
  try { parsed = JSON.parse(zlib.gunzipSync(raw).toString("utf8")); }
  catch { parsed = JSON.parse(raw.toString("utf8")); }
  return parsed?.v === 2 ? validateVersionState(parsed) : migrateVersionV1(parsed, p);
}

function readVersionStateResult(file, p) {
  if (!fs.existsSync(file)) {
    try { return { state: decodeVersionFile(`${file}.bak`, p), recovered: true }; }
    catch { return { state: emptyVersionState(p), recovered: false }; }
  }
  try { return { state: decodeVersionFile(file, p), recovered: false }; }
  catch (primaryError) {
    try { return { state: decodeVersionFile(`${file}.bak`, p), recovered: true }; }
    catch { throw primaryError; }
  }
}

const readVersionState = (file, p) => readVersionStateResult(file, p).state;

function addVersionTexts(state, texts) {
  if (!texts || Array.isArray(texts) || typeof texts !== "object") throw new Error("invalid texts");
  for (const [hash, text] of Object.entries(texts)) {
    if (!validateHash(hash) || typeof text !== "string" || textHash(text) !== hash) throw new Error("invalid text hash");
    state.texts[hash] = text;
  }
}

function applyVersionOps(current, ops) {
  if (!Array.isArray(ops) || ops.length > 500) throw new Error("invalid ops");
  const state = structuredClone(current);
  for (const op of ops) {
    if (!op || typeof op.type !== "string") throw new Error("invalid op");
    addVersionTexts(state, op.texts || {});
    if (op.type === "init") {
      if (state.base && JSON.stringify(state.base) !== JSON.stringify(op.base)) throw new Error("base-conflict");
      if (!state.base) state.base = structuredClone(op.base);
      if (op.current) state.current = structuredClone(op.current);
      if (Array.isArray(op.legacySnapshots)) {
        for (const snap of op.legacySnapshots) {
          const key = JSON.stringify([snap.hash, snap.ts, snap.label]);
          if (!state.legacySnapshots.some((it) => JSON.stringify([it.hash, it.ts, it.label]) === key))
            state.legacySnapshots.push(structuredClone(snap));
        }
      }
    } else if (op.type === "append") {
      const item = structuredClone(op.intervention);
      const existing = state.interventions.find((it) => it.id === item?.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error("intervention-id-conflict");
      if (!existing) state.interventions.push(item);
      if (op.current) state.current = structuredClone(op.current);
    } else if (op.type === "set-current") {
      state.current = structuredClone(op.current);
    } else throw new Error("invalid op type");
  }
  state.interventions.sort((a, b) => Number(a.ts) - Number(b.ts) || a.id.localeCompare(b.id));
  // Content-addressed compaction: only unreferenced blobs may disappear.
  const refs = new Set();
  if (state.base) refs.add(state.base.hash);
  if (state.current) refs.add(state.current.hash);
  for (const it of state.interventions) { refs.add(it.fromHash); refs.add(it.toHash); }
  for (const snap of state.legacySnapshots) refs.add(snap.hash);
  for (const hash of Object.keys(state.texts)) if (!refs.has(hash)) delete state.texts[hash];
  return validateVersionState(state);
}

function escapeRe(s) {
  return String(s).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function tempFile(dir, prefix, suffix) {
  ensureDir(dir);
  for (let i = 0; i < 100; i += 1) {
    const name = `${prefix}${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}${suffix}`;
    const p = path.join(dir, name);
    try {
      const fd = fs.openSync(p, "wx", 0o600);
      return [fd, p];
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("could not allocate temp file");
}

function requestLength(req) {
  const n = Number.parseInt(req.headers["content-length"] || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

async function findExecutable(name) {
  const r = await spawnCollect("which", [name], { timeoutMs: 3000 });
  if (r.code === 0) return r.out.trim().split(/\r?\n/)[0] || null;
  return null;
}

async function findClaudeCode() {
  const hit = await findExecutable("claude");
  if (hit) return hit;
  for (const p of [
    path.join(os.homedir(), ".local/bin/claude"),
    path.join(os.homedir(), ".claude/local/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      // keep trying the usual install locations
    }
  }
  return null;
}

async function findChrome() {
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  for (const name of ["google-chrome", "chromium-browser", "chromium", "chrome"]) {
    const hit = await findExecutable(name);
    if (hit) return hit;
  }
  return null;
}

export function findTexRoot(p) {
  let txt;
  try {
    txt = fs.readFileSync(p, "utf8");
  } catch {
    return p;
  }
  if (txt.includes("\\documentclass")) return p;
  const directive = /%\s*!TEX\s+root\s*=\s*(.+)/i.exec(txt);
  if (directive) {
    const cand = realpathOrResolve(path.join(path.dirname(p), directive[1].trim()));
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  const stem = path.basename(p, path.extname(p));
  const dir = path.dirname(p);
  for (const folder of [dir, path.dirname(dir)]) {
    let names = [];
    try {
      names = fs.readdirSync(folder);
    } catch {
      continue;
    }
    for (const fn of names) {
      if (!fn.endsWith(".tex")) continue;
      const cand = path.join(folder, fn);
      let body = "";
      try {
        body = fs.readFileSync(cand, "utf8");
      } catch {
        continue;
      }
      if (body.includes("\\documentclass")
          && new RegExp(`\\\\(?:input|include)\\{[^}]*${escapeRe(stem)}`).test(body)) {
        return cand;
      }
    }
  }
  return p;
}

function svgRootLooksValid(svg) {
  if (typeof svg !== "string" || !svg.slice(0, 4000).includes("<svg")) return false;
  let head = svg.trimStart().replace(/^\uFEFF/, "");
  head = head.replace(/^<\?xml[\s\S]*?\?>\s*/i, "");
  head = head.replace(/^<!--[\s\S]*?-->\s*/g, "");
  const m = /^<([A-Za-z_][\w:.-]*)(?:\s|>|\/>)/.exec(head);
  return Boolean(m && m[1].split(":").pop().toLowerCase() === "svg");
}

function writeContactSheet(outPath, files) {
  const raster = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
  const cells = [];
  for (const [, p] of files.slice(0, 80)) {
    const ext = path.extname(p).toLowerCase();
    const name = path.basename(p).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    let thumb = `<div class="ph">${(ext.slice(1).toUpperCase() || "FILE")}</div>`;
    if (raster.has(ext)) {
      const tmp = `${p}.contact.jpg`;
      try {
        spawnSync("sips", ["-Z", "460", "-s", "format", "jpeg", p, "--out", tmp], {
          stdio: "ignore",
          timeout: 20000,
        });
      } catch {
        // ignored below; the placeholder remains
      }
      try {
        if (fs.existsSync(tmp)) {
          thumb = `<img src="data:image/jpeg;base64,${fs.readFileSync(tmp).toString("base64")}">`;
        }
      } catch {
        // placeholder
      } finally {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          // ignore
        }
      }
    }
    cells.push(`<figure>${thumb}<figcaption>${name}</figcaption></figure>`);
  }
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contact sheet</title><style>`
    + "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:24px;background:#fff;color:#111}"
    + "h1{font-size:15px;font-weight:600;margin:0 0 14px}"
    + ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}"
    + "figure{margin:0;border:1px solid #ddd;border-radius:8px;overflow:hidden;break-inside:avoid}"
    + "figure img{width:100%;height:165px;object-fit:contain;background:#f6f6f6;display:block}"
    + ".ph{height:165px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:13px}"
    + "figcaption{font-size:10.5px;padding:6px 8px;word-break:break-all;color:#333}"
    + `</style></head><body><h1>Contact sheet - ${files.length} file(s)</h1>`
    + `<div class="grid">${cells.join("")}</div></body></html>`;
  fs.writeFileSync(outPath, doc, "utf8");
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function writeZip(out, files) {
  const local = [];
  const central = [];
  let offset = 0;
  const seen = new Map();
  for (const [, p] of files) {
    let arc = path.basename(p);
    const n = seen.get(arc) || 0;
    seen.set(arc, n + 1);
    if (n) {
      const ext = path.extname(arc);
      arc = `${path.basename(arc, ext)}_${n}${ext}`;
    }
    const name = Buffer.from(arc);
    const data = fs.readFileSync(p);
    const crc = crc32(data);
    const { time, day } = dosDateTime(fs.statSync(p).mtime);
    const head = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    local.push(head, data);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += head.length + data.length;
  }
  const centralStart = offset;
  const centralBody = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(centralBody.length), u32(centralStart), u16(0),
  ]);
  fs.writeFileSync(out, Buffer.concat([...local, centralBody, end]));
}

function spawnBuilderDataOnly() {
  const child = spawn(process.execPath, [BUILDER], {
    cwd: PROJECT,
    env: { ...process.env, GALLERY_ROOT: PROJECT, GALLERY_DATA_ONLY: "1" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function normalizeSuggestion(text) {
  let out = String(text || "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)[0]
    .replace(/^["'`«»“”\s]+|["'`«»“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  if (/^(none|null|empty|n\/a)$/i.test(out)) out = "";
  return out;
}

function claudeSuggestEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

async function handleRasterize(req, res, url) {
  try {
    const src = safePath(url.searchParams.get("path") || "");
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) return sendJson(res, 404, { error: "not found" });
    let w = Number.parseInt(url.searchParams.get("w") || "1000", 10);
    let h = Number.parseInt(url.searchParams.get("h") || "750", 10);
    w = Math.max(320, Math.min(2400, Number.isNaN(w) ? 1000 : w));
    h = Math.max(200, Math.min(20000, Number.isNaN(h) ? 750 : h));
    const key = md5(`${realpathOrResolve(src)}:${statMtimeSeconds(src)}:rast:${w}x${h}`);
    ensureDir(THUMB_DIR);
    const out = path.join(THUMB_DIR, `rast_${key}.png`);
    if (!fs.existsSync(out)) {
      const chrome = await findChrome();
      if (!chrome) return sendJson(res, 501, { error: "no chrome available" });
      const shot = `${out}.tmp.png`;
      const r = await spawnCollect(chrome, [
        "--headless=new", "--hide-scrollbars", "--password-store=basic",
        "--no-first-run", "--no-default-browser-check", `--screenshot=${shot}`,
        `--window-size=${w},${h}`, "--virtual-time-budget=6000", `file://${src}`,
      ], { detached: true, timeoutMs: 30000 });
      if (r.timeout || !fs.existsSync(shot)) return sendJson(res, 500, { error: "render failed" });
      fs.renameSync(shot, out);
    }
    return serveFile(req, res, out);
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// stdout exact d'une commande git (execFile : stderr séparé, contrairement à spawnCollect)
function gitOut(args, cwd) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

// Base des diffs de l'éditeur : le dernier commit SIGNIFICATIF. Un auto-commit
// de fond (« auto: session … ») committe le fichier quelques minutes après
// chaque sauvegarde — si la base était HEAD, la gouttière se viderait et le
// message IA ne verrait plus de diff dès son passage.
async function gitBase(root) {
  const out = await gitOut(["log", "-100", "--format=%h%x09%s"], root);
  if (out) {
    for (const line of out.split("\n")) {
      const ix = line.indexOf("\t");
      if (ix < 0) continue;
      const sha = line.slice(0, ix);
      const subject = line.slice(ix + 1);
      if (sha && !/^auto: /.test(subject)) return sha;
    }
  }
  return "HEAD";
}

function requestedDiffBase(value) {
  const sha = String(value || "");
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha) ? sha : null;
}

export async function handleEditorsGet(req, res, url) {
  const pathname = url.pathname;
  // jeton local : les endpoints éditeur acceptent les fichiers hors projet
  // (~/Documents, ~/Desktop) quand la requête le porte — voir editorPath()
  const tok = url.searchParams.get("token");
  if (pathname === "/githead") {
    // version committée (HEAD) d'un fichier suivi par git — pour la gouttière
    // et la pseudo-version « HEAD » du comparateur. ok:false = pas de dépôt,
    // fichier non suivi, ou git absent : le client dégrade en silence.
    try {
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p) return sendJson(res, 200, { ok: false });
      const dir = path.dirname(p);
      const top = await gitOut(["rev-parse", "--show-toplevel"], dir);
      if (!top) return sendJson(res, 200, { ok: false });
      const root = top.trim();
      const rel = path.relative(root, p).split(path.sep).join("/");
      const base = requestedDiffBase(url.searchParams.get("base")) || await gitBase(root);
      const text = await gitOut(["show", `${base}:${rel}`], root);
      if (text === null) return sendJson(res, 200, { ok: false });
      const sha = await gitOut(["rev-parse", "--short", base], root);
      // ts (epoch s) : la timeline du comparateur ne compte que les
      // interventions POSTÉRIEURES à la base — sinon « tout · N » compterait
      // des interventions déjà committées, absentes du diff cumulé
      const ts = await gitOut(["show", "-s", "--format=%ct", base], root);
      return sendJson(res, 200, { ok: true, text, sha: (sha || "").trim(), ts: Number((ts || "").trim()) || 0 });
    } catch (e) {
      return sendJson(res, 200, { ok: false });
    }
  }
  if (pathname === "/versions") {
    // Journal v2 content-addressed. Le backup est lu seulement si le principal
    // ne peut pas être validé; un vieux JSON v1 est migré en mémoire.
    try {
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p) return sendJson(res, 200, { ok: false });
      const file = path.join(PROJECT, ".fig_thumbs", "dv_versions", `${md5(realpathOrResolve(p))}.json`);
      const loaded = readVersionStateResult(file, p);
      const state = loaded.state;
      if (loaded.recovered) {
        // Réparer le principal depuis l'état validé sans jamais toucher au .bak
        // qui est précisément notre dernière copie connue valide.
        writeFileAtomicSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(state))));
      } else if (fs.existsSync(file)) {
        const prefix = fs.readFileSync(file).subarray(0, 2);
        if (prefix[0] !== 0x1f || prefix[1] !== 0x8b)
          writeFileAtomicSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(state))), { backup: true });
      }
      return sendJson(res, 200, { ok: true, ...state });
    } catch (e) {
      return sendJson(res, 200, { ok: false });
    }
  }
  if (pathname === "/gitlog") {
    // commits touchant le fichier (panneau historique) — {sha, ts, msg}
    try {
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p) return sendJson(res, 200, { ok: false });
      const dir = path.dirname(p);
      const top = await gitOut(["rev-parse", "--show-toplevel"], dir);
      if (!top) return sendJson(res, 200, { ok: false });
      const root = top.trim();
      const rel = path.relative(root, p).split(path.sep).join("/");
      const out = await gitOut(["log", "--follow", "-100", "--format=%h%x09%ct%x09%s", "--", rel], root);
      if (out === null) return sendJson(res, 200, { ok: false });
      const items = out.split("\n").filter(Boolean).map((l) => {
        const [sha, ts, ...msg] = l.split("\t");
        return { sha, ts: Number(ts) || 0, msg: msg.join("\t") };
      });
      return sendJson(res, 200, { ok: true, items });
    } catch (e) {
      return sendJson(res, 200, { ok: false });
    }
  }
  if (pathname === "/commitmsg") {
    // message de commit proposé par Haiku à partir du diff vs HEAD du fichier.
    // ok:false = pas de diff / pas de claude : le client garde le message auto.
    try {
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p) return sendJson(res, 200, { ok: false });
      const dir = path.dirname(p);
      const top = await gitOut(["rev-parse", "--show-toplevel"], dir);
      if (!top) return sendJson(res, 200, { ok: false });
      const root = top.trim();
      const rel = path.relative(root, p).split(path.sep).join("/");
      const base = await gitBase(root);
      const diff = await gitOut(["diff", base, "--", rel], root);
      if (!diff || !diff.trim()) return sendJson(res, 200, { ok: false });
      const claude = await findClaudeCode();
      if (!claude) return sendJson(res, 200, { ok: false });
      const env = claudeSuggestEnv();
      env.MAX_THINKING_TOKENS = "0";
      const sys = [
        "Tu écris des messages de commit git.",
        "Réponds UNIQUEMENT avec le message : une seule ligne, impérative,",
        "concise (max 72 caractères), en français, sans guillemets, sans",
        "préfixe conventionnel, sans explication.",
      ].join(" ");
      const text = await new Promise((resolve) => {
        // prompt via stdin : --disallowedTools est variadique et avalerait un
        // prompt passé en argument
        const child = spawn(claude, [
          "-p", "--model", "haiku",
          "--setting-sources", "project",
          "--system-prompt", sys,
          "--disallowedTools", "Bash,Edit,Write,Read,Grep,Glob,Task,WebFetch,WebSearch,NotebookEdit",
        ], { cwd: root, env, stdio: ["pipe", "pipe", "ignore"] });
        let out = "";
        const timer = setTimeout(() => { try{ child.kill("SIGKILL"); }catch{} resolve(null); }, 20000);
        child.stdout.on("data", (c) => { out += c; });
        child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? out.trim() : null); });
        child.on("error", () => { clearTimeout(timer); resolve(null); });
        child.stdin.end(`Fichier : ${rel}\n\nDiff :\n${diff.slice(0, 8000)}`);
      });
      if (!text) return sendJson(res, 200, { ok: false });
      const msg = text.split("\n")[0].replace(/^["'`]+|["'`]+$/g, "").slice(0, 100);
      return sendJson(res, 200, { ok: true, msg });
    } catch (e) {
      return sendJson(res, 200, { ok: false });
    }
  }
  if (pathname === "/gitshow") {
    // texte du fichier à un commit donné (Comparer / Rétablir de l'historique)
    try {
      const p = editorPath(url.searchParams.get("path"), tok);
      const sha = String(url.searchParams.get("sha") || "");
      if (!p || !/^[0-9a-f]{4,40}$/i.test(sha)) return sendJson(res, 200, { ok: false });
      const dir = path.dirname(p);
      const top = await gitOut(["rev-parse", "--show-toplevel"], dir);
      if (!top) return sendJson(res, 200, { ok: false });
      const root = top.trim();
      const rel = path.relative(root, p).split(path.sep).join("/");
      const text = await gitOut(["show", `${sha}:${rel}`], root);
      if (text === null) return sendJson(res, 200, { ok: false });
      return sendJson(res, 200, { ok: true, text });
    } catch (e) {
      return sendJson(res, 200, { ok: false });
    }
  }
  if (pathname === "/texroot") {
    try {
      if (!url.searchParams.has("path")) throw new Error("path");
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p) return sendJson(res, 403, { error: "outside the project" });
      const root = findTexRoot(p);
      return sendJson(res, 200, { root, pdf: `${root.replace(/\.[^.]*$/, "")}.pdf` });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/lint") {
    if (!process.env.ATELIER_STUDIO) return false;
    try {
      const p = realpathOrResolve(expandHome(url.searchParams.get("path") || ""));
      const home = os.homedir();
      const allowed = ["Documents", "Desktop"].some((d) => p.startsWith(path.join(home, d) + path.sep));
      if (!(allowed && p.endsWith(".py") && fs.existsSync(p) && fs.statSync(p).isFile())) {
        return sendJson(res, 200, { available: false });
      }
      const ruff = await findExecutable("ruff");
      if (!ruff) return sendJson(res, 200, { available: false });
      const r = await spawnCollect(ruff, ["check", "--output-format", "json", "--quiet", p], { timeoutMs: 5000 });
      let diags = [];
      try {
        diags = JSON.parse(r.out || "[]");
      } catch {
        return sendJson(res, 200, { available: false });
      }
      const diagnostics = diags.slice(0, 200).map((d) => ({
        row: d?.location?.row || 1,
        col: d?.location?.column || 1,
        code: d?.code || "",
        message: d?.message || "",
      }));
      return sendJson(res, 200, { available: true, diagnostics });
    } catch (error) {
      return sendJson(res, 200, { available: false, error: String(error.message || error) });
    }
  }
  if (pathname === "/code") {
    try {
      if (!url.searchParams.has("path")) throw new Error("path");
      const p = editorPath(url.searchParams.get("path"), tok);
      if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
        return sendJson(res, 404, { error: "file not found or outside the project" });
      }
      const text = fs.readFileSync(p, "utf8");
      return sendJson(res, 200, { text, mtime: fs.statSync(p).mtimeMs / 1000, path: p });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/findfile") {
    // retrouver un fichier du projet par nom nu — les refs du chat ne sont pas
    // toujours dans l'index git (fichiers gitignorés : données, figures…)
    try {
      const name = String(url.searchParams.get("name") || "");
      if (!name || name.includes("/") || name.startsWith(".")) return sendJson(res, 400, { error: "bad name" });
      const skip = new Set(["node_modules", "__pycache__", "test-results"]);
      const hits = [];
      const walk = (dir, depth) => {
        if (hits.length >= 5 || depth > 8) return;
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (hits.length >= 5) return;
          if (e.name.startsWith(".") || skip.has(e.name)) continue;
          if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
          else if (e.name === name) hits.push(relSlash(PROJECT, path.join(dir, e.name)));
        }
      };
      walk(PROJECT, 0);
      return sendJson(res, 200, { hits });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/rasterize") return handleRasterize(req, res, url);
  if (pathname === "/rev") {
    let rev = 0;
    for (const name of ["figures_data.json", "figures_index.html"]) {
      const p = path.join(PROJECT, name);
      try {
        if (fs.existsSync(p)) rev = Math.max(rev, statMtimeSeconds(p));
      } catch {
        // ignore
      }
    }
    return sendJson(res, 200, { rev });
  }
  if (pathname === "/findscript") {
    try {
      if (!localOnly(req)) return sendJson(res, 403, { error: "cross-origin blocked" });
      const stem = String(url.searchParams.get("stem") || "").trim().slice(0, 200);
      if (!stem) return sendJson(res, 400, { error: "no stem" });
      let hit = null;
      const rg = await findExecutable("rg");
      if (rg) {
        const r = await spawnCollect(rg, [
          "-l", "--no-messages", "--no-config", "-F", "-g", "*.{py,r,R,jl,sh,ipynb}", "--", stem, PROJECT,
        ], { timeoutMs: 15000 });
        for (const line of (r.out || "").split(/\r?\n/)) {
          const ap = realpathOrResolve(line.trim());
          if (ap.startsWith(PROJECT + path.sep)) {
            hit = relSlash(PROJECT, ap);
            break;
          }
        }
      }
      return sendJson(res, 200, { script: hit });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  return false;
}

export async function handleEditorsPost(req, res, url) {
  // même contrat que handleEditorsGet : jeton local = accès hors projet borné
  const tok = url.searchParams.get("token");
  const pathname = url.pathname;
  if (pathname === "/save-svg") {
    try {
      const len = requestLength(req);
      if (len <= 0 || len > 64 * 1024 * 1024) return sendJson(res, 413, { error: "empty or oversized svg" });
      const payload = await readJsonRequest(req, 64 * 1024 * 1024);
      const rel = payload.rel || payload.name || "";
      const svg = payload.svg || "";
      if (!svgRootLooksValid(svg)) return sendJson(res, 400, { error: "not an svg payload" });
      const dst = safePath(rel);
      if (!dst || !dst.toLowerCase().endsWith(".svg") || !fs.existsSync(dst)
          || !fs.statSync(dst).isFile() || fs.lstatSync(dst).isSymbolicLink()) {
        return sendJson(res, 400, { error: "bad/non-svg/symlink path" });
      }
      const ddir = path.dirname(dst);
      const bak = `${dst}.orig.bak`;
      if (!(fs.existsSync(bak) || (fs.existsSync(bak) && fs.lstatSync(bak).isSymbolicLink()))) {
        const [fd, tmpBak] = tempFile(ddir, ".bak.", ".tmp");
        try {
          fs.closeSync(fd);
          fs.copyFileSync(dst, tmpBak);
          try {
            fs.linkSync(tmpBak, bak);
          } catch (error) {
            if (error?.code !== "EEXIST") throw error;
          }
        } finally {
          fs.rmSync(tmpBak, { force: true });
        }
      }
      const [fd, tmp] = tempFile(ddir, ".save.", ".tmp");
      fs.writeFileSync(fd, svg, "utf8");
      fs.closeSync(fd);
      fs.renameSync(tmp, dst);
      if (Array.isArray(payload.edits)) {
        const ep = `${dst.slice(0, -4)}.edits.json`;
        if (payload.edits.length) {
          const [fd2, t2] = tempFile(ddir, ".edits.", ".tmp");
          fs.writeFileSync(fd2, JSON.stringify({ svg: path.basename(dst), edits: payload.edits }, null, 1), "utf8");
          fs.closeSync(fd2);
          fs.renameSync(t2, ep);
        } else if (fs.existsSync(ep) && !fs.lstatSync(ep).isSymbolicLink()) {
          fs.rmSync(ep);
        }
      }
      return sendJson(res, 200, { ok: true, path: relSlash(PROJECT, dst) });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/export-png") {
    try {
      const len = requestLength(req);
      if (len <= 0 || len > 64 * 1024 * 1024) return sendJson(res, 413, { error: "empty or oversized svg" });
      const payload = await readJsonRequest(req, 64 * 1024 * 1024);
      const rel = payload.rel || payload.name || "";
      const svg = payload.svg || "";
      let dpi = Number.parseInt(payload.dpi ?? 300, 10);
      dpi = Math.max(72, Math.min(1200, Number.isNaN(dpi) ? 300 : dpi));
      if (typeof svg !== "string" || !svg.slice(0, 4000).includes("<svg")) {
        return sendJson(res, 400, { error: "not an svg payload" });
      }
      const dst = safePath(rel);
      if (!dst || !dst.toLowerCase().endsWith(".svg") || !fs.existsSync(dst)
          || !fs.statSync(dst).isFile() || fs.lstatSync(dst).isSymbolicLink()) {
        return sendJson(res, 400, { error: "svg not found / non-svg / symlink" });
      }
      const png = `${dst.slice(0, -4)}.png`;
      if ((fs.existsSync(png) && fs.lstatSync(png).isSymbolicLink()) || !safePath(png)) {
        return sendJson(res, 400, { error: "bad png output path" });
      }
      const rsvg = await findExecutable("rsvg-convert");
      if (!rsvg) {
        return sendJson(res, 501, { error: "rsvg-convert not installed (brew install librsvg / apt install librsvg2-bin)" });
      }
      const [fdS, tmpSvg] = tempFile(path.dirname(dst), ".exp.", ".svg");
      const [fdP, tmpPng] = tempFile(path.dirname(png), ".exp.", ".png");
      fs.closeSync(fdP);
      try {
        fs.writeFileSync(fdS, svg, "utf8");
        fs.closeSync(fdS);
        const r = await spawnCollect(rsvg, ["--dpi-x", String(dpi), "--dpi-y", String(dpi), "-o", tmpPng, tmpSvg], {
          timeoutMs: 120000,
        });
        if (r.code !== 0 || !fs.existsSync(tmpPng) || fs.statSync(tmpPng).size === 0) {
          return sendJson(res, 500, { error: `rsvg-convert failed: ${(r.out || "").slice(-300)}` });
        }
        fs.renameSync(tmpPng, png);
      } finally {
        for (const t of [tmpSvg, tmpPng]) fs.rmSync(t, { force: true });
      }
      return sendJson(res, 200, { ok: true, path: relSlash(PROJECT, png), dpi });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/delete") {
    try {
      const payload = await readJsonRequest(req);
      const trash = expandHome("~/.Trash");
      const deleted = [];
      for (const rel of Array.isArray(payload.rels) ? payload.rels : []) {
        const p = safePath(rel);
        if (!p || p === PROJECT || !fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
        let dest = path.join(trash, path.basename(p));
        let i = 1;
        while (fs.existsSync(dest)) {
          const ext = path.extname(p);
          dest = path.join(trash, `${path.basename(p, ext)}_${i}${ext}`);
          i += 1;
        }
        fs.renameSync(p, dest);
        deleted.push(rel);
      }
      if (deleted.length) spawnBuilderDataOnly();
      return sendJson(res, 200, { deleted });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/export") {
    try {
      const payload = await readJsonRequest(req);
      const files = [];
      for (const rel of Array.isArray(payload.rels) ? payload.rels : []) {
        const p = safePath(rel);
        if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
          files.push([rel, p]);
        }
      }
      if (!files.length) return sendJson(res, 400, { error: "no valid files selected" });
      const exp = path.join(PROJECT, "_gallery_exports");
      ensureDir(exp);
      const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_");
      let out;
      if (payload.mode === "zip") {
        out = path.join(exp, `export_${ts}.zip`);
        writeZip(out, files);
      } else if (payload.mode === "contact") {
        out = path.join(exp, `contact_${ts}.html`);
        writeContactSheet(out, files);
      } else {
        out = path.join(exp, `export_${ts}`);
        ensureDir(out);
        for (const [, p] of files) {
          let dest = path.join(out, path.basename(p));
          let i = 1;
          while (fs.existsSync(dest)) {
            const ext = path.extname(p);
            dest = path.join(out, `${path.basename(p, ext)}_${i}${ext}`);
            i += 1;
          }
          fs.copyFileSync(p, dest);
        }
      }
      await spawnCollect("open", [fs.statSync(out).isFile() ? "-R" : "", out].filter(Boolean), { timeoutMs: 10000 });
      return sendJson(res, 200, { ok: true, path: relSlash(PROJECT, out), count: files.length });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/open") {
    try {
      const payload = await readJsonRequest(req);
      const p = safePath(payload.rel);
      if (p && p !== PROJECT && fs.existsSync(p)) {
        await spawnCollect("open", [p], { timeoutMs: 10000 });
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 404, { error: "not found" });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/compile") {
    try {
      const payload = await readJsonRequest(req);
      const p = editorPath(payload.path, tok);
      if (!p) return sendJson(res, 403, { error: "outside the project" });
      const root = findTexRoot(p);
      const r = await spawnCollect(LATEXMK, [
        "-pdf", "-synctex=1", "-g", "-interaction=nonstopmode", "-halt-on-error", path.basename(root),
      ], { cwd: path.dirname(root), timeoutMs: 180000 });
      if (r.error?.code === "ENOENT" || r.code === -1) {
        return sendJson(res, 200, { ok: false, error: "latexmk not found at /Library/TeX/texbin/latexmk - install MacTeX or TeX Live" });
      }
      if (r.timeout) return sendJson(res, 200, { ok: false, error: "compilation > 180 s" });
      const pdf = `${root.replace(/\.[^.]*$/, "")}.pdf`;
      const ok = r.code === 0 && fs.existsSync(pdf);
      let err = "";
      if (!ok) {
        const lines = (r.out || "").split(/\r?\n/).filter((line) => line.startsWith("!") || line.includes("Error"));
        err = lines.slice(0, 8).join("\n") || (r.out || "").slice(-1500);
      }
      // le stdout de latexmk ne contient pas les erreurs TeX : elles sont dans le .log
      let log = (r.out || "");
      if (!ok) {
        try {
          const texlog = fs.readFileSync(`${root.replace(/\.[^.]*$/, "")}.log`, "latin1");
          const bang = texlog.indexOf("\n!");
          log = (bang >= 0 ? texlog.slice(bang + 1) : texlog.slice(-8000)) + "\n\n--- latexmk ---\n" + log;
        } catch {}
      }
      return sendJson(res, 200, { ok, pdf: ok ? pdf : null, root, error: err, log: log.slice(-20000) });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/synctex") {
    try {
      const payload = await readJsonRequest(req);
      const tex = editorPath(payload.tex, tok);
      const pdf = editorPath(payload.pdf, tok);
      if (!tex || !pdf) return sendJson(res, 403, { error: "outside the project" });
      if (payload.dir === "view") {
        const r = await spawnCollect(SYNCTEX, ["view", "-i", `${payload.line}:${payload.col || 1}:${tex}`, "-o", pdf], {
          timeoutMs: 10000,
        });
        const out = {};
        for (const line of (r.out || "").split(/\r?\n/)) {
          for (const key of ["Page:", "x:", "y:"]) {
            if (line.startsWith(key)) out[key.slice(0, -1).toLowerCase()] = Number.parseFloat(line.split(":")[1]);
          }
        }
        return sendJson(res, 200, Object.keys(out).length ? out : { error: "no match" });
      }
      const r = await spawnCollect(SYNCTEX, ["edit", "-o", `${Number.parseInt(payload.page, 10)}:${payload.x}:${payload.y}:${pdf}`], {
        timeoutMs: 10000,
      });
      const out = {};
      for (const line of (r.out || "").split(/\r?\n/)) {
        if (line.startsWith("Line:")) out.line = Number.parseInt(line.split(":")[1], 10);
        if (line.startsWith("Input:")) out.input = line.split(":").slice(1).join(":");
      }
      return sendJson(res, 200, Object.keys(out).length ? out : { error: "no match" });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/latex-suggest") {
    try {
      const payload = await readJsonRequest(req, 128 * 1024);
      const before = String(payload.before || "");
      const after = String(payload.after || "");
      if (!before.trim()) return sendJson(res, 200, { ok: true, text: "", source: "empty" });
      const claude = await findClaudeCode();
      if (!claude) return sendJson(res, 200, { ok: false, text: "", error: "claude CLI not found" });
      // Persistent "hot" Claude process (haiku): the ~6-9s spawn cost is paid
      // once at boot, warm turns are ~2.5s. See claude_warm.mjs.
      const r = await warmSuggest(claude, PROJECT, claudeSuggestEnv(), { before, after });
      if (r.superseded) return sendJson(res, 200, { ok: false, text: "", superseded: true, source: "claude-warm" });
      if (r.timeout) return sendJson(res, 200, { ok: false, text: "", error: "claude timeout", source: "claude-warm" });
      return sendJson(res, 200, {
        ok: Boolean(r.text),
        text: normalizeSuggestion(r.text),
        source: "claude-warm",
        model: "haiku",
      });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/versions") {
    // Le serveur est l'autorité de révision. Chaque ack est gzip puis remplacé
    // atomiquement dans le même dossier; l'ancien principal valide devient .bak.
    try {
      const payload = await readJsonRequest(req, 8 * 1024 * 1024);
      const p = editorPath(payload.path, tok);
      if (!p) return sendJson(res, 403, { error: "outside the project" });
      const dir = path.join(PROJECT, ".fig_thumbs", "dv_versions");
      ensureDir(dir);
      const file = path.join(dir, `${md5(realpathOrResolve(p))}.json`);
      const current = readVersionState(file, p);
      if (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision !== current.revision)
        return sendJson(res, 409, { ok: false, error: "revision-conflict", revision: current.revision, state: current });
      const next = applyVersionOps(current, payload.ops);
      next.path = p;
      next.revision = current.revision + 1;
      validateVersionState(next);
      if (fs.existsSync(file)) {
        try { decodeVersionFile(file, p); }
        catch { fs.rmSync(file, { force: true }); }
      }
      writeFileAtomicSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(next))), { backup: true });
      return sendJson(res, 200, { ok: true, revision: next.revision });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/gitcommit") {
    // commit du fichier courant SEUL (jamais -A) — bouton commit de l'éditeur
    try {
      const payload = await readJsonRequest(req);
      const p = editorPath(payload.path, tok);
      const msg = String(payload.message || "").trim();
      if (!p) return sendJson(res, 403, { error: "outside the project" });
      if (!msg) return sendJson(res, 400, { error: "message vide" });
      const dir = path.dirname(p);
      const top = await gitOut(["rev-parse", "--show-toplevel"], dir);
      if (!top) return sendJson(res, 200, { ok: false, error: "hors dépôt git" });
      const root = top.trim();
      const rel = path.relative(root, p).split(path.sep).join("/");
      if (await gitOut(["add", "--", rel], root) === null)
        return sendJson(res, 200, { ok: false, error: "git add a échoué" });
      if (await gitOut(["commit", "--no-verify", "-m", msg, "--", rel], root) === null) {
        // arbre propre ? l'auto-commit de fond a déjà enregistré les
        // changements — si le fichier a bougé depuis la base significative,
        // poser quand même le jalon (commit vide porteur du message)
        const base = await gitBase(root);
        const clean = await gitOut(["diff", "--quiet", base, "HEAD", "--", rel], root);
        if (clean !== null) // exit 0 = identique à la base : vraiment rien à committer
          return sendJson(res, 200, { ok: false, error: "git commit a échoué (rien à committer ?)" });
        if (await gitOut(["commit", "--no-verify", "--allow-empty", "-m", msg], root) === null)
          return sendJson(res, 200, { ok: false, error: "git commit a échoué" });
      }
      const sha = await gitOut(["rev-parse", "--short", "HEAD"], root);
      return sendJson(res, 200, { ok: true, sha: (sha || "").trim() });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  if (pathname === "/codesave") {
    try {
      const payload = await readJsonRequest(req);
      const p = editorPath(payload.path, tok);
      if (!p) return sendJson(res, 403, { error: "outside the project" });
      const diskMtime = fs.existsSync(p) ? fs.statSync(p).mtimeMs / 1000 : 0;
      if (payload.mtime && Math.abs(diskMtime - payload.mtime) > 0.001) {
        return sendJson(res, 409, { error: "conflit", mtime: diskMtime });
      }
      fs.writeFileSync(p, String(payload.text), "utf8");
      return sendJson(res, 200, { mtime: fs.statSync(p).mtimeMs / 1000 });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  return false;
}
