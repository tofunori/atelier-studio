import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSETS_DIR,
  GALLERY_DIR,
  PROJECT,
  ensureDir,
  expandHome,
  htmlEscape,
  md5,
  realpathOrResolve,
  relSlash,
  spawnCollect,
} from "./shared.mjs";

const ROOT = PROJECT;
const EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".svg", ".pdf", ".html", ".docx", ".xlsx", ".xls",
  ".csv", ".md", ".py", ".r", ".jl", ".tex", ".sh", ".mp4", ".m4v", ".mov", ".webm",
]);
const EXCLUDE_PARTS = new Set([
  ".git", ".venv", ".venv-era5", ".venv-codex", "node_modules", "__pycache__",
  ".ipynb_checkpoints", "worktrees", ".claude", ".fig_thumbs", "_gallery_exports", ".prism",
]);
const ARCHIVE_HINTS = ["_archive", "menage_", "/tmp/", "tmp_dir", "/tmp", "raqdps_tests"];
const SELF = "figures_index.html";
const SNIP_EXTS = new Set([".py", ".r", ".jl", ".sh", ".tex", ".md", ".csv"]);
const SHOW_FRAMES = Boolean(process.env.GALLERY_SHOW_FRAMES);
const THUMB_DIR = path.join(ROOT, ".fig_thumbs");
const NO_THUMBS = Boolean(process.env.GALLERY_NO_THUMBS);
let THUMB_EXTS = [".pdf", ".mp4", ".m4v", ".mov", ".webm"];
if (process.env.GALLERY_OFFICE_THUMBS) THUMB_EXTS = THUMB_EXTS.concat([".docx", ".xlsx", ".xls"]);
const THUMB_EXT_SET = new Set(THUMB_EXTS);

function isFramesDir(name) {
  const n = name.toLowerCase();
  return n === "frames" || n === "frame" || n.endsWith("_frames") || n.endsWith("_frame") || n.includes("html_frames");
}

function dateString(seconds) {
  const d = new Date(seconds * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function countString(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pathPartsWithinRoot(dir) {
  const rel = path.relative(ROOT, dir);
  return rel ? rel.split(path.sep) : [];
}

function hasExcludedPart(dir) {
  return pathPartsWithinRoot(dir).some((part) => EXCLUDE_PARTS.has(part));
}

function thumbKey(rel, mtime) {
  return md5(`${rel}:${mtime}`);
}

async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function buildThumbs(pending) {
  if (!pending.length) return;
  ensureDir(THUMB_DIR);
  for (const name of fs.readdirSync(THUMB_DIR)) {
    if (name.startsWith("qlm_")) fs.rmSync(path.join(THUMB_DIR, name), { recursive: true, force: true });
  }
  const workers = Math.min(8, os.cpus().length || 4);
  await mapLimit(pending, workers, async ([full, key]) => {
    const base = path.basename(full);
    const out = path.join(THUMB_DIR, `${key}.png`);
    const fail = path.join(THUMB_DIR, `${key}.fail`);
    const tmp = fs.mkdtempSync(path.join(THUMB_DIR, "qlm_"));
    try {
      await spawnCollect("qlmanage", ["-t", "-s", "480", "-o", tmp, full], {
        detached: true,
        timeoutMs: 15000,
      });
      const produced = path.join(tmp, `${base}.png`);
      if (fs.existsSync(produced)) {
        try {
          fs.renameSync(produced, out);
          if (fs.existsSync(fail)) fs.rmSync(fail, { force: true });
        } catch {
          // ignore, matching Python best-effort thumbnail generation
        }
      } else {
        fs.closeSync(fs.openSync(fail, "w"));
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  console.log(`[gallery] built ${pending.length} qlmanage thumbnail(s)`);
}

function purgeOrphanThumbs(keysSeen) {
  if (!fs.existsSync(THUMB_DIR)) return;
  let n = 0;
  for (const name of fs.readdirSync(THUMB_DIR)) {
    const m = /^([0-9a-f]{32})\.(png|fail)$/.exec(name);
    if (m && !keysSeen.has(m[1])) {
      try {
        fs.rmSync(path.join(THUMB_DIR, name));
        n += 1;
      } catch {
        // ignore
      }
    }
  }
  if (n) console.log(`  purge: ${n} orphan thumbnails removed`);
}

export async function scan() {
  const rows = [];
  const thumbPending = [];
  const keysSeen = new Set();

  function walk(dir) {
    if (hasExcludedPart(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = [];
    const files = [];
    for (const ent of entries) {
      if (ent.isDirectory()) dirs.push(ent.name);
      else if (ent.isFile() || ent.isSymbolicLink()) files.push(ent.name);
    }
    for (const name of dirs) {
      if (EXCLUDE_PARTS.has(name)) continue;
      if (!SHOW_FRAMES && isFramesDir(name)) continue;
      walk(path.join(dir, name));
    }
    for (const fn of files) {
      if (fn.startsWith("~$")) continue;
      const ext = path.extname(fn).toLowerCase();
      if (!EXTS.has(ext) || fn === SELF) continue;
      const full = path.join(dir, fn);
      const rel = relSlash(ROOT, full);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      const mtime = Math.floor(st.mtimeMs / 1000);
      const btime = Math.floor((st.birthtimeMs || st.mtimeMs) / 1000);
      const low = rel.toLowerCase();
      let thumb = null;
      if (THUMB_EXT_SET.has(ext) && !NO_THUMBS) {
        const key = thumbKey(rel, mtime);
        keysSeen.add(key);
        if (fs.existsSync(path.join(THUMB_DIR, `${key}.png`))) {
          thumb = `.fig_thumbs/${key}.png`;
        } else if (!fs.existsSync(path.join(THUMB_DIR, `${key}.fail`))) {
          thumbPending.push([full, key]);
          thumb = `.fig_thumbs/${key}.png`;
        }
      }
      rows.push({
        thumb,
        code: SNIP_EXTS.has(ext),
        name: fn,
        rel,
        folder: path.dirname(rel) === "." ? "." : path.dirname(rel).split(path.sep).join("/"),
        ext: ext.slice(1),
        mtime,
        btime,
        mdate: dateString(mtime),
        bdate: dateString(btime),
        size: st.size,
        archive: ARCHIVE_HINTS.some((hint) => low.includes(hint)),
      });
    }
  }

  walk(ROOT);
  if (thumbPending.length) {
    await buildThumbs(thumbPending);
    const ok = new Set(
      thumbPending
        .filter(([, key]) => fs.existsSync(path.join(THUMB_DIR, `${key}.png`)))
        .map(([, key]) => key),
    );
    for (const row of rows) {
      if (!row.thumb) continue;
      const key = row.thumb.split("/").pop().slice(0, -4);
      if (!ok.has(key) && !fs.existsSync(path.join(THUMB_DIR, `${key}.png`))) row.thumb = null;
    }
  }
  purgeOrphanThumbs(keysSeen);
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows;
}

function cmuxFavorites() {
  const favDir = expandHome("~/.cmux-favorites");
  const favs = new Set();
  if (!fs.existsSync(favDir)) return favs;
  for (const fn of fs.readdirSync(favDir)) {
    const p = path.join(favDir, fn);
    const target = realpathOrResolve(p);
    if (target.startsWith(ROOT + path.sep)) favs.add(relSlash(ROOT, target));
  }
  return favs;
}

async function prewarmImageThumbs(rows, limit = 400) {
  if (NO_THUMBS || process.platform !== "darwin") return;
  const imgs = rows
    .filter((r) => ["png", "jpg", "jpeg"].includes(r.ext))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((r) => [r.mtime, path.join(ROOT, r.rel)]);
  const todo = [];
  for (const [mt, full] of imgs) {
    const key = md5(`${realpathOrResolve(full)}:${Math.floor(mt)}:480`);
    const out = path.join(THUMB_DIR, `imgthumb_${key}.png`);
    if (!fs.existsSync(out)) todo.push([full, out]);
  }
  if (!todo.length) return;
  ensureDir(THUMB_DIR);
  await mapLimit(todo, Math.min(8, os.cpus().length || 4), async ([full, out]) => {
    await spawnCollect("sips", ["-Z", "480", "-s", "format", "png", full, "--out", out], {
      timeoutMs: 20000,
    });
  });
  console.log(`[gallery] pre-warmed ${todo.length} image thumbnail(s)`);
}

export function provisionViewers(root = ROOT) {
  const target = path.join(root, ".fig_thumbs");
  ensureDir(target);
  for (const name of fs.readdirSync(ASSETS_DIR)) {
    const src = path.join(ASSETS_DIR, name);
    const dst = path.join(target, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.cpSync(src, dst, { recursive: true, force: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

function loadGalleryTemplate() {
  return fs.readFileSync(path.join(GALLERY_DIR, "assets", "gallery_template.html"), "utf8");
}

export async function buildGallery() {
  const rows = await scan();
  await prewarmImageThumbs(rows);
  const folders = [...new Set(rows.map((r) => r.folder))].sort();
  const gen = dateString(Math.floor(Date.now() / 1000));
  const wordmark = htmlEscape(process.env.GALLERY_TITLE || "Atelier");
  const project = htmlEscape(path.basename(ROOT.replace(/\/+$/, "")) || "project");
  const rootJs = ROOT.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n").replaceAll("\r", "").replaceAll("</", "<\\/");
  const dataJson = JSON.stringify(rows).replaceAll("</", "<\\/");
  const folderJson = JSON.stringify(folders).replaceAll("</", "<\\/");
  const favJson = JSON.stringify([...cmuxFavorites()].sort()).replaceAll("</", "<\\/");
  const html = loadGalleryTemplate()
    .replaceAll("__TITLE__", `${wordmark} \u00b7 ${project}`)
    .replaceAll("__WORDMARK__", wordmark)
    .replaceAll("__PROJECT__", project)
    .replaceAll("__COUNT__", countString(rows.length))
    .replaceAll("__GEN__", gen)
    .replaceAll("__VER__", String(Math.floor(Date.now() / 1000)))
    .replaceAll("__DATA__", dataJson)
    .replaceAll("__FOLDERS__", folderJson)
    .replaceAll("__FAVS__", favJson)
    .replaceAll("__ROOT__", rootJs);
  const nClose = (html.match(/<\/script>/g) || []).length;
  if (nClose !== 1) {
    throw new Error(`build_gallery: emitted page has ${nClose} </script> tags (expected 1) - data escaping is broken; aborting rather than ship a blank gallery`);
  }
  const out = path.join(ROOT, SELF);
  fs.writeFileSync(out, html);
  console.log(`[${gen}] ${rows.length} files indexed -> ${out}`);
  return out;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  buildGallery().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
