// Base de connaissances Atelier (plan 049) : registre global de sources
// épinglées + cache d'extraction en pages, réutilisant le moteur de passages
// Zotero pour la recherche lexicale. Aucune dépendance externe.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { extractPdfPages, resolveZoteroPdf, searchPassages } from "./zotero_passages.mjs";

// Écriture atomique locale (même pattern que store.mjs) — pas d'import de
// store.mjs pour que le staging rust-server-dist reste autonome
// (knowledge.mjs + zotero_passages.mjs seulement).
function writeFileAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

import { KB_INLINE_MAX } from "./kb_prompt.mjs";

const REGISTRY_VERSION = 2;
const PAGES_CACHE_VERSION = 1;
export { KB_INLINE_MAX };
// T3: zotero. Kind "gbrain" (plan 050 P3) = UNE page du corpus NAS épinglée
// (gbrain get → cache local) ; l'id réservé "gbrain" (outil corpus entier)
// reste hors registre.
export const KB_KINDS = new Set(["file", "pdf", "web", "note", "folder", "youtube", "gbrain", "zotero"]);
const GBRAIN_TIMEOUT_MS = 20_000;
const TEXT_EXTS = new Set([".md", ".tex", ".txt"]);
const WEB_TEXT_MAX = 300_000;
// Dossiers / vaults Obsidian (plan 049 T6) : fichiers texte seulement — les
// PDF d'un dossier sont exclus v1 (extraction massive), à épingler un par un.
const FOLDER_EXTS = new Set([".md", ".tex", ".txt"]);
const FOLDER_SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", "__pycache__"]);
const FOLDER_MAX_FILES = 2000;
const FOLDER_MAX_FILE_BYTES = 2 * 1024 * 1024;
const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 10_000;

export function defaultKnowledgeDir() {
  const appDir = process.env.ATELIER_APP_DIR
    || join(homedir(), "Library", "Application Support", "atelier-studio");
  return join(appDir, "knowledge");
}

// Id déterministe par origine : ré-épingler la même source met à jour au lieu
// de dupliquer.
// Slug lisible et stable d'une collection (plan 051).
export function collectionSlug(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function sourceId(kind, key) {
  return createHash("sha256").update(`${kind}\n${key}`).digest("hex").slice(0, 8);
}

const NAMED_ENTITIES = new Map(Object.entries({
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  laquo: "«", raquo: "»", deg: "°", times: "×", middot: "·", bull: "•", copy: "©",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â",
  ccedil: "ç", ugrave: "ù", ucirc: "û", uuml: "ü", ocirc: "ô", ouml: "ö", icirc: "î", iuml: "ï",
}));

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try { return String.fromCodePoint(Number.parseInt(code, 16)); } catch { return " "; }
    })
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return " "; }
    })
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES.get(name.toLowerCase()) ?? match)
    .replace(/&amp;/gi, "&");
}

export function htmlToText(html) {
  const source = String(html ?? "");
  const title = decodeEntities(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const text = decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|head|title)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote|pre|ul|ol|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

function pagesFromText(text) {
  const clean = String(text ?? "").replace(/\r/g, "").trim();
  return clean ? [{ page: 1, text: clean }] : [];
}

// Parcours récursif déterministe (trié) : fichiers texte, dotfiles et
// répertoires bruyants exclus, liens symboliques non suivis.
function walkFolder(root) {
  const out = [];
  const stack = [""];
  while (stack.length && out.length < FOLDER_MAX_FILES) {
    const rel = stack.pop();
    let dirents;
    try {
      dirents = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const childRel = rel ? join(rel, dirent.name) : dirent.name;
      if (dirent.isDirectory()) {
        if (!FOLDER_SKIP_DIRS.has(dirent.name)) stack.push(childRel);
      } else if (dirent.isFile() && FOLDER_EXTS.has(extname(dirent.name).toLowerCase())) {
        out.push(childRel);
        if (out.length >= FOLDER_MAX_FILES) break;
      }
    }
  }
  return out.sort();
}

// Balaye un dossier en réutilisant les extractions dont mtime/size n'ont pas
// bougé (re-scan bon marché à chaque attache/recherche).
function scanFolder(root, previous = []) {
  const prevByRel = new Map(previous.map((file) => [file.rel, file]));
  const files = [];
  let skipped = 0;
  for (const rel of walkFolder(root)) {
    let stat;
    try {
      stat = statSync(join(root, rel));
    } catch {
      continue;
    }
    if (stat.size > FOLDER_MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const prev = prevByRel.get(rel);
    if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
      files.push(prev);
      continue;
    }
    let text = "";
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    const pages = pagesFromText(text);
    if (!pages.length) continue;
    files.push({ rel, mtimeMs: stat.mtimeMs, size: stat.size, chars: pages[0].text.length, pages });
  }
  return { files, skipped };
}

function folderFingerprint(files) {
  return files.map((file) => `${file.rel}:${file.mtimeMs}:${file.size}`).join("|");
}

function parseHttpUrl(origin) {
  if (!origin) throw new Error("Argument requis: --origin (URL de la page)");
  let url;
  try {
    url = new URL(String(origin));
  } catch {
    throw new Error(`URL invalide: ${origin}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Seuls http(s) sont pris en charge: ${origin}`);
  }
  return url;
}

// YouTube (plan 049 T8) : le transcript horodaté est la source. Les pages
// sont des tranches de 60 s — page N ↔ timestamp (N-1)*60 s, ce qui donne
// des citations mm:ss et des liens &t= sans format de cache dédié.
export const YT_BUCKET_SECONDS = 60;

export function parseYoutubeUrl(origin) {
  const url = parseHttpUrl(origin);
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] ?? "";
  } else if (host === "youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
    else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split("/")[2] ?? "";
  }
  if (!/^[\w-]{6,20}$/.test(id)) throw new Error(`URL YouTube non reconnue: ${origin}`);
  return { id, href: `https://www.youtube.com/watch?v=${id}` };
}

export function vttToPages(vtt, { bucketSeconds = YT_BUCKET_SECONDS } = {}) {
  const buckets = new Map();
  let currentStart = null;
  let lastText = "";
  for (const rawLine of String(vtt ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const cue = line.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,]\d{3}\s*-->/);
    if (cue) {
      const hours = cue[1] ? Number(cue[1]) : 0;
      currentStart = hours * 3600 + Number(cue[2]) * 60 + Number(cue[3]);
      continue;
    }
    if (!line || line === "WEBVTT" || /^(Kind|Language|NOTE|STYLE|Region)\b/i.test(line) || /^\d+$/.test(line)) {
      continue;
    }
    if (currentStart === null) continue;
    const text = line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text || text === lastText) continue; // les sous-titres auto répètent chaque ligne
    lastText = text;
    const bucket = Math.floor(currentStart / bucketSeconds);
    buckets.set(bucket, `${buckets.get(bucket) ?? ""}${buckets.get(bucket) ? " " : ""}${text}`);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, text]) => ({ page: bucket + 1, text }))
    .filter((page) => page.text);
}

function defaultFetchYoutube(url, { ytdlp = "yt-dlp" } = {}) {
  const meta = spawnSync(ytdlp, [
    "--no-download", "--no-playlist", "--print", "%(title)s\n%(duration)s\n%(channel)s", url,
  ], { encoding: "utf8", timeout: 45_000, maxBuffer: 8 * 1024 * 1024 });
  if (meta.error) throw new Error(`yt-dlp indisponible: ${meta.error.message} (brew install yt-dlp)`);
  if (meta.status !== 0) throw new Error(String(meta.stderr || "yt-dlp: échec").trim() || "yt-dlp: échec");
  const [title, durationRaw, channelRaw] = meta.stdout.trim().split("\n");
  const subsDir = mkdtempSync(join(tmpdir(), "atelier-kb-yt-"));
  try {
    const subs = spawnSync(ytdlp, [
      "--skip-download", "--no-playlist", "--write-subs", "--write-auto-subs",
      "--sub-langs", "fr,fr-*,en,en-*", "--sub-format", "vtt",
      "-o", join(subsDir, "sub"), url,
    ], { encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
    if (subs.error) throw new Error(`yt-dlp indisponible: ${subs.error.message}`);
    const rank = (name) => (/\.fr[.-]|\.fr\.vtt$/.test(name) ? 0 : /\.en[.-]|\.en\.vtt$/.test(name) ? 1 : 2);
    const vtts = readdirSync(subsDir).filter((name) => name.endsWith(".vtt")).sort((a, b) => rank(a) - rank(b));
    if (!vtts.length) {
      throw new Error("Aucun sous-titre disponible pour cette vidéo (transcript requis)");
    }
    const vtt = readFileSync(join(subsDir, vtts[0]), "utf8");
    const duration = Number(durationRaw);
    const channel = String(channelRaw ?? "").trim();
    return { title: String(title ?? "").trim(), duration: Number.isFinite(duration) ? duration : null, channel: channel && channel !== "NA" ? channel : null, vtt };
  } finally {
    rmSync(subsDir, { recursive: true, force: true });
  }
}

async function defaultFetchPage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      // UA navigateur : passe les WAF naïfs (les protections par empreinte
      // TLS type AGU restent infranchissables — voir le repli plus bas)
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      accept: "text/html,application/xhtml+xml,text/plain,*/*",
      "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // sites anti-robot (éditeurs, paywalls) : le texte affiché reste
    // capturable par la webview — guider vers ce chemin
    const guidance = [403, 401, 406, 429, 451, 503].includes(res.status)
      ? " — ce site bloque le téléchargement direct : ouvre la page dans le browser intégré et utilise son bouton livre (capture du texte affiché)"
      : "";
    throw new Error(`Téléchargement échoué (HTTP ${res.status}) : ${url}${guidance}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (/application\/pdf/i.test(contentType)) {
    throw new Error("URL de PDF : télécharger le fichier puis l'épingler avec --kind pdf");
  }
  return { body: await res.text(), contentType };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- gbrain (plan 050 P3) : lecture du corpus NAS via le CLI utilisateur ---

export function resolveGbrainBin() {
  const test = process.env.ATELIER_TEST_GBRAIN;
  if (test && existsSync(test)) return test;
  const which = spawnSync("which", ["gbrain"], { encoding: "utf8" });
  if (which.status === 0) {
    const found = String(which.stdout ?? "").trim();
    if (found) return found;
  }
  const home = homedir();
  // installation bun (cas réel) puis emplacements classiques — le PATH GUI
  // de l'app ne contient pas ~/.bun/bin
  return [
    join(home, ".bun", "bin", "gbrain"),
    "/opt/homebrew/bin/gbrain",
    "/usr/local/bin/gbrain",
    join(home, "bin", "gbrain"),
    join(home, ".local", "bin", "gbrain"),
  ].find((candidate) => existsSync(candidate)) ?? null;
}

// `gbrain get <slug-absent>` répond « Error [page_not_found]: … » sur stdout
// avec exit 0 (sonde 2026-07-17) — la détection d'existence passe par là.
export const GBRAIN_NOT_FOUND = /^Error \[page_not_found\]/m;

export function runGbrain(args, { timeout = GBRAIN_TIMEOUT_MS, input } = {}) {
  const bin = resolveGbrainBin();
  if (!bin) throw new Error("gbrain introuvable (PATH, ~/.bun/bin) — corpus NAS indisponible");
  const run = spawnSync(bin, args, {
    encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024,
    ...(input !== undefined ? { input } : {}),
  });
  if (run.error) {
    throw new Error(run.error.code === "ETIMEDOUT"
      ? "gbrain : délai dépassé (NAS injoignable ?)"
      : `gbrain: ${run.error.message}`);
  }
  if (run.status !== 0) {
    throw new Error(String(run.stderr || run.stdout || "gbrain: échec").trim().slice(0, 300));
  }
  return String(run.stdout ?? "");
}

// `gbrain search` : lignes `[score] slug -- extrait…`, extraits parfois
// multi-lignes ; « No results. » = liste vide.
export function parseGbrainSearch(output) {
  const results = [];
  let current = null;
  for (const line of String(output ?? "").split("\n")) {
    const match = line.match(/^\[\d+(?:\.\d+)?\]\s+(\S+)\s+--\s*(.*)$/);
    if (match) {
      current = { slug: match[1], snippet: match[2].replace(/^#+\s*/, "").trim() };
      results.push(current);
    } else if (current && line.trim()) {
      if (current.snippet.length < 180) {
        current.snippet = `${current.snippet} ${line.trim()}`.trim();
      }
    }
  }
  return results;
}

// --- Écriture gbrain (plan 050 P4) : page directe avec garde-fous ---

export function slugifyTitle(title) {
  const base = String(title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "page";
}

const GBRAIN_SLUG_RE = /^[a-z0-9][a-z0-9/_.-]*$/i;
const GBRAIN_PREVIEW_MAX = 4000;
const GBRAIN_PAGE_MAX = 100_000;

// Compose la page markdown (front-matter traçable) depuis le cache local.
export function buildGbrainPage(store, id) {
  const entry = store.get(id);
  if (!entry) throw new Error(`Source inconnue: ${id}`);
  const text = store.fullText(id);
  const capped = Array.from(text);
  const body = capped.length > GBRAIN_PAGE_MAX
    ? `${capped.slice(0, GBRAIN_PAGE_MAX).join("")}\n[…tronqué]`
    : text;
  const markdown = [
    "---",
    `title: ${JSON.stringify(entry.title)}`,
    `origin: ${JSON.stringify(entry.origin ?? entry.kind)}`,
    `captured: ${new Date().toISOString().slice(0, 10)}`,
    "from: atelier",
    "---",
    "",
    body,
    "",
  ].join("\n");
  return { entry, markdown };
}

// Aperçu (write=false) puis écriture (write=true) d'une page directe.
// JAMAIS d'écrasement silencieux : l'existence du slug est vérifiée par un
// `get` préalable et retournée à l'UI, qui redemande confirmation.
export function promotePage(store, { id, slug, write = false } = {}, deps = {}) {
  const run = deps.runGbrain ?? runGbrain;
  const { entry, markdown } = buildGbrainPage(store, id);
  const target = String(slug ?? "").trim() || `atelier/${slugifyTitle(entry.title)}`;
  if (!GBRAIN_SLUG_RE.test(target) || /\s/.test(target)) {
    throw new Error(`Slug invalide: ${target}`);
  }
  const probe = String(run(["get", target])).trim();
  const exists = Boolean(probe) && !GBRAIN_NOT_FOUND.test(probe);
  if (!write) {
    const scalars = Array.from(markdown);
    const preview = scalars.length > GBRAIN_PREVIEW_MAX
      ? `${scalars.slice(0, GBRAIN_PREVIEW_MAX).join("")}\n[…]`
      : markdown;
    return { ok: true, id, slug: target, exists, title: entry.title, chars: entry.chars, preview };
  }
  const out = String(run(["put", target], { input: markdown }));
  if (GBRAIN_NOT_FOUND.test(out) || /^Error \[/m.test(out)) {
    throw new Error(out.trim().slice(0, 300));
  }
  return { ok: true, id, slug: target, written: true, updated: exists };
}

// Titre d'une page gbrain : front-matter YAML (`title:` inline ou plié `>-`),
// sinon premier titre markdown, sinon le slug.
export function gbrainTitle(markdown, slug) {
  const fm = String(markdown ?? "").match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const folded = fm[1].match(/^title:\s*>-?\s*\n((?:[ \t]+\S.*\n?)+)/m);
    const inline = fm[1].match(/^title:\s*(\S.*)$/m);
    const raw = folded
      ? folded[1].split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
      : inline
        ? inline[1].trim()
        : "";
    const clean = raw.replace(/^["']|["']$/g, "").trim();
    if (clean && !clean.startsWith(">")) return clean;
  }
  const heading = String(markdown ?? "").match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : slug;
}

export class KnowledgeStore {
  constructor(dir = defaultKnowledgeDir(), deps = {}) {
    this.dir = dir;
    this.registryPath = join(dir, "knowledge.json");
    this.cacheDir = join(dir, "cache");
    this.pdfCacheDir = join(dir, "pdf-cache");
    this.lockDir = join(dir, ".lock");
    this.deps = { fetchPage: defaultFetchPage, extractPdf: extractPdfPages, fetchYoutube: defaultFetchYoutube, runGbrain, ...deps };
    this.sources = new Map();
    this.warning = null;
    this.lockHeld = false;
    this.reloadFromDisk();
  }

  // Recharge le registre. Un registre illisible est sauvegardé en
  // knowledge.json.corrupt-<ts> (jamais écrasé en silence) et signalé via
  // this.warning ; les caches restent sur disque.
  reloadFromDisk() {
    this.sources = new Map();
    this.collections = [];
    if (!existsSync(this.registryPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.registryPath, "utf8"));
      // v1 lu tel quel (plan 051) : champs absents = défauts, réécrit en v2 à
      // la première mutation.
      this.collections = (Array.isArray(raw.collections) ? raw.collections : [])
        .filter((c) => c && typeof c.slug === "string" && c.slug);
      for (const entry of raw.sources ?? []) {
        if (!entry || typeof entry.id !== "string" || !entry.id) continue;
        entry.collections = Array.isArray(entry.collections) ? entry.collections : [];
        entry.archived = entry.archived === true;
        this.sources.set(entry.id, entry);
      }
    } catch {
      const backup = `${this.registryPath}.corrupt-${Date.now()}`;
      try {
        renameSync(this.registryPath, backup);
        this.warning = `Registre illisible — sauvegardé dans ${basename(backup)}, base repartie à vide`;
      } catch {
        this.warning = "Registre illisible et non sauvegardable — base repartie à vide";
      }
      process.stderr.write(`[atelier-kb] ${this.warning}\n`);
    }
  }

  // Verrou inter-processus (mkdir atomique) pour toute mutation : chaque
  // écriture relit le registre puis écrit, donc deux processus concurrents ne
  // se perdent plus d'entrées. Réentrant dans l'instance.
  withLock(fn) {
    if (this.lockHeld) return fn();
    mkdirSync(this.dir, { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        mkdirSync(this.lockDir);
        break;
      } catch {
        try {
          if (Date.now() - statSync(this.lockDir).mtimeMs > LOCK_STALE_MS) {
            rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {}
        if (Date.now() > deadline) throw new Error("Base de connaissances occupée (verrou) — réessayer");
        sleepMs(25);
      }
    }
    this.lockHeld = true;
    try {
      return fn();
    } finally {
      this.lockHeld = false;
      rmSync(this.lockDir, { recursive: true, force: true });
    }
  }

  list({ collection = null, archived = false } = {}) {
    return [...this.sources.values()]
      .filter((s) => (archived ? s.archived === true : s.archived !== true))
      .filter((s) => !collection || (s.collections ?? []).includes(collection))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  // Liste brute (persistance) : toutes les sources, archivées comprises.
  listAll() {
    return [...this.sources.values()]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  get(id) {
    return this.sources.get(id);
  }

  persist() {
    writeFileAtomic(
      this.registryPath,
      JSON.stringify({ version: REGISTRY_VERSION, collections: this.collections ?? [], sources: this.listAll() }, null, 2),
    );
  }

  cachePath(id) {
    return join(this.cacheDir, `${id}.json`);
  }

  readPages(id) {
    try {
      const cached = JSON.parse(readFileSync(this.cachePath(id), "utf8"));
      if (cached.version === PAGES_CACHE_VERSION && Array.isArray(cached.pages)) return cached.pages;
    } catch {}
    return null;
  }

  readFolderFiles(id) {
    try {
      const cached = JSON.parse(readFileSync(this.cachePath(id), "utf8"));
      if (cached.version === PAGES_CACHE_VERSION && Array.isArray(cached.files)) return cached.files;
    } catch {}
    return null;
  }

  upsertRaw({ id, kind, title, origin, chars, meta, cachePayload }) {
    return this.withLock(() => {
      this.reloadFromDisk();
      const prev = this.sources.get(id);
      const now = new Date().toISOString();
      const entry = {
        id,
        kind,
        title: title || prev?.title || "Sans titre",
        origin: origin ?? null,
        chars,
        addedAt: prev?.addedAt ?? now,
        updatedAt: now,
        meta: meta ?? {},
        collections: prev?.collections ?? [],
        archived: prev?.archived === true,
      };
      this.sources.set(id, entry);
      writeFileAtomic(this.cachePath(id), JSON.stringify({ version: PAGES_CACHE_VERSION, ...cachePayload }));
      this.persist();
      return { source: entry, refreshed: Boolean(prev) };
    });
  }

  upsertEntry({ id, kind, title, origin, pages, meta }) {
    return this.upsertRaw({
      id, kind, title, origin, meta,
      chars: pages.reduce((sum, page) => sum + page.text.length, 0),
      cachePayload: { pages },
    });
  }

  remove(id) {
    this.withLock(() => {
      this.reloadFromDisk();
      if (!this.sources.delete(id)) throw new Error(`Source inconnue: ${id}`);
      rmSync(this.cachePath(id), { force: true });
      this.persist();
    });
  }

  // — Collections & archivage (plan 051) — l'étiquette organise, ne détruit
  // jamais : supprimer une collection retire l'étiquette des sources.
  collectionOp({ op, slug, title } = {}) {
    return this.withLock(() => {
      this.reloadFromDisk();
      const clean = String(title ?? "").trim();
      if (op === "add") {
        if (!clean) throw new Error("Titre de collection requis (--add <titre>)");
        const s = collectionSlug(clean);
        if (!s) throw new Error(`Titre de collection invalide: ${clean}`);
        if (!(this.collections ?? []).some((c) => c.slug === s)) {
          this.collections = [{ slug: s, title: clean }, ...(this.collections ?? [])];
        }
        this.persist();
        return s;
      }
      const target = (this.collections ?? []).find((c) => c.slug === slug);
      if (!target) throw new Error(`Collection inconnue: ${slug}`);
      if (op === "rename") {
        if (!clean) throw new Error("Nouveau titre requis (--title)");
        target.title = clean;
      } else if (op === "remove") {
        this.collections = this.collections.filter((c) => c.slug !== slug);
        for (const source of this.sources.values()) {
          source.collections = (source.collections ?? []).filter((x) => x !== slug);
        }
      } else {
        throw new Error(`Opération collection inconnue: ${op}`);
      }
      this.persist();
      return slug;
    });
  }

  // Étiqueter n'est pas une mise à jour de contenu : updatedAt inchangé
  // (sinon chaque tag remonterait la source dans « Récents »).
  tagSource(id, slug, off = false) {
    this.withLock(() => {
      this.reloadFromDisk();
      const entry = this.sources.get(id);
      if (!entry) throw new Error(`Source inconnue: ${id}`);
      if (!(this.collections ?? []).some((c) => c.slug === slug)) {
        throw new Error(`Collection inconnue: ${slug}`);
      }
      const set = new Set(entry.collections ?? []);
      if (off) set.delete(slug);
      else set.add(slug);
      entry.collections = [...set];
      this.persist();
    });
  }

  archiveSource(id, off = false) {
    this.withLock(() => {
      this.reloadFromDisk();
      const entry = this.sources.get(id);
      if (!entry) throw new Error(`Source inconnue: ${id}`);
      entry.archived = !off;
      this.persist();
    });
  }

  // Lots (plan 052) : UNE prise de verrou et UNE écriture pour N sources —
  // les ids inconnus sont ignorés (une sélection peut contenir une source
  // supprimée entre-temps), le compte appliqué est retourné.
  tagMany(ids, slug, off = false) {
    return this.withLock(() => {
      this.reloadFromDisk();
      if (!(this.collections ?? []).some((c) => c.slug === slug)) {
        throw new Error(`Collection inconnue: ${slug}`);
      }
      let applied = 0;
      for (const id of ids) {
        const entry = this.sources.get(id);
        if (!entry) continue;
        const set = new Set(entry.collections ?? []);
        if (off) set.delete(slug);
        else set.add(slug);
        entry.collections = [...set];
        applied += 1;
      }
      this.persist();
      return applied;
    });
  }

  archiveMany(ids, off = false) {
    return this.withLock(() => {
      this.reloadFromDisk();
      let applied = 0;
      for (const id of ids) {
        const entry = this.sources.get(id);
        if (!entry) continue;
        entry.archived = !off;
        applied += 1;
      }
      this.persist();
      return applied;
    });
  }

  async add({ kind, origin, title, text } = {}) {
    if (!KB_KINDS.has(kind)) {
      throw new Error(`Kind non pris en charge (v1: ${[...KB_KINDS].join(", ")}) : ${kind}`);
    }
    if (kind === "note") {
      const cleanTitle = String(title ?? "").trim();
      const body = String(text ?? "").trim();
      if (!cleanTitle || !body) throw new Error("Une note demande --title et --text");
      return this.upsertEntry({
        id: sourceId("note", cleanTitle), kind, title: cleanTitle, origin: null,
        pages: pagesFromText(body), meta: {},
      });
    }
    if (kind === "file") {
      const path = resolve(String(origin ?? ""));
      if (!origin || !existsSync(path)) throw new Error(`Fichier introuvable: ${origin}`);
      const ext = extname(path).toLowerCase();
      if (!TEXT_EXTS.has(ext)) {
        throw new Error(`Extension non prise en charge (v1: ${[...TEXT_EXTS].join(" ")} ; PDF via --kind pdf) : ${ext || path}`);
      }
      const stat = statSync(path);
      const pages = pagesFromText(readFileSync(path, "utf8"));
      if (!pages.length) throw new Error(`Fichier vide: ${path}`);
      return this.upsertEntry({
        id: sourceId("file", path), kind, title: title || basename(path), origin: path,
        pages, meta: { mtimeMs: stat.mtimeMs, size: stat.size },
      });
    }
    if (kind === "gbrain") {
      const slug = String(origin ?? "").trim();
      if (!slug || /\s/.test(slug)) throw new Error("Slug gbrain requis (--origin <slug>, sans espace)");
      const markdown = String(this.deps.runGbrain(["get", slug])).trim();
      if (!markdown || GBRAIN_NOT_FOUND.test(markdown)) {
        throw new Error(`Page gbrain introuvable: ${slug}`);
      }
      return this.upsertEntry({
        id: sourceId("gbrain", slug), kind,
        title: title || gbrainTitle(markdown, slug), origin: slug,
        pages: pagesFromText(markdown),
        meta: { slug, syncedAt: new Date().toISOString() },
      });
    }
    if (kind === "youtube") {
      const url = parseYoutubeUrl(origin);
      const fetched = this.deps.fetchYoutube(url.href);
      const pages = vttToPages(fetched.vtt);
      if (!pages.length) throw new Error("Aucun sous-titre exploitable pour cette vidéo");
      return this.upsertRaw({
        id: sourceId("youtube", url.href), kind,
        title: title || fetched.title || url.href, origin: url.href,
        chars: pages.reduce((sum, page) => sum + page.text.length, 0),
        meta: {
          segmentSeconds: YT_BUCKET_SECONDS, segments: pages.length,
          ...(fetched.duration ? { duration: fetched.duration } : {}),
          ...(fetched.channel ? { channel: fetched.channel } : {}),
        },
        cachePayload: { pages },
      });
    }
    if (kind === "folder") {
      const path = resolve(String(origin ?? ""));
      if (!origin || !existsSync(path) || !statSync(path).isDirectory()) {
        throw new Error(`Dossier introuvable: ${origin}`);
      }
      const { files, skipped } = scanFolder(path, this.readFolderFiles(sourceId("folder", path)) ?? []);
      if (!files.length) {
        throw new Error(`Aucun fichier texte (${[...FOLDER_EXTS].join(" ")}) dans ${path}`);
      }
      return this.upsertRaw({
        id: sourceId("folder", path), kind, title: title || basename(path), origin: path,
        chars: files.reduce((sum, file) => sum + file.chars, 0),
        meta: { files: files.length, ...(skipped ? { skipped } : {}) },
        cachePayload: { files },
      });
    }
    if (kind === "pdf") {
      const path = resolve(String(origin ?? ""));
      if (!origin || !existsSync(path)) throw new Error(`PDF introuvable: ${origin}`);
      if (!path.toLowerCase().endsWith(".pdf")) throw new Error(`--kind pdf attend un fichier .pdf : ${path}`);
      const stat = statSync(path);
      const extracted = this.deps.extractPdf(path, { cacheDir: this.pdfCacheDir });
      return this.upsertEntry({
        id: sourceId("pdf", path), kind, title: title || basename(path, ".pdf"), origin: path,
        pages: extracted.pages,
        meta: { pages: extracted.pages.length, mtimeMs: stat.mtimeMs, size: stat.size },
      });
    }
    if (kind === "zotero") {
      // Épinglage depuis la bibliothèque Zotero (plan 051) : l'origine
      // encode la pièce jointe — zotero://<pdfKey>/<pdfFile>[#itemKey].
      // Le PDF est résolu dans le stockage Zotero (garde anti-traversée),
      // extrait comme un pdf ; itemKey permet les liens profonds de citation
      // (#atelier-zotero-passage → page + surlignage dans le reader).
      const m = /^zotero:\/\/([^/]+)\/(.+?)(?:#([A-Za-z0-9]*))?$/.exec(String(origin ?? ""));
      if (!m) throw new Error("--kind zotero attend zotero://<pdfKey>/<pdfFile>[#itemKey]");
      const [, pdfKey, pdfFileRaw, zoteroKey] = m;
      const pdfFile = decodeURIComponent(pdfFileRaw);
      const storagePath = join(homedir(), "Zotero", "storage", pdfKey, pdfFile);
      const abs = (this.deps.resolveZotero ?? resolveZoteroPdf)(storagePath);
      const stat = statSync(abs);
      const extracted = this.deps.extractPdf(abs, { cacheDir: this.pdfCacheDir });
      return this.upsertEntry({
        id: sourceId("zotero", `${pdfKey}/${pdfFile}`), kind,
        title: title || basename(pdfFile, ".pdf"), origin: abs,
        pages: extracted.pages,
        meta: {
          pages: extracted.pages.length, mtimeMs: stat.mtimeMs, size: stat.size,
          pdfKey, pdfFile, ...(zoteroKey ? { zoteroKey } : {}),
        },
      });
    }
    // web : texte fourni (capture browser, page derrière login) sinon fetch
    const url = parseHttpUrl(origin);
    const provided = String(text ?? "").trim();
    let pageTitle = title || "";
    let body = provided;
    let contentType = "";
    if (!provided) {
      const fetched = await this.deps.fetchPage(url.href);
      const parsed = htmlToText(fetched.body);
      pageTitle = title || parsed.title;
      body = parsed.text;
      contentType = fetched.contentType ?? "";
    }
    body = body.slice(0, WEB_TEXT_MAX);
    if (!body) throw new Error(`Aucun texte extractible sur ${url.href}`);
    return this.upsertEntry({
      id: sourceId("web", url.href), kind, title: pageTitle || url.href, origin: url.href,
      pages: pagesFromText(body), meta: contentType ? { contentType } : {},
    });
  }

  // Re-lit les sources locales périmées (mtime/size) avant usage — fichiers
  // texte ET PDF (un PDF remplacé au même chemin est ré-extrait).
  ensureFresh(id) {
    const entry = this.sources.get(id);
    if (!entry) throw new Error(`Source inconnue: ${id}`);
    const stale = (stat) => stat.mtimeMs !== entry.meta?.mtimeMs || stat.size !== entry.meta?.size;
    if (entry.kind === "file" && entry.origin && existsSync(entry.origin)) {
      const stat = statSync(entry.origin);
      if (stale(stat)) {
        const pages = pagesFromText(readFileSync(entry.origin, "utf8"));
        if (pages.length) {
          this.upsertEntry({
            id, kind: "file", title: entry.title, origin: entry.origin,
            pages, meta: { mtimeMs: stat.mtimeMs, size: stat.size },
          });
        }
      }
    } else if ((entry.kind === "pdf" || entry.kind === "zotero") && entry.origin && existsSync(entry.origin)) {
      const stat = statSync(entry.origin);
      if (stale(stat) || !this.readPages(id)) {
        const extracted = this.deps.extractPdf(entry.origin, { cacheDir: this.pdfCacheDir });
        this.upsertEntry({
          id, kind: entry.kind, title: entry.title, origin: entry.origin,
          pages: extracted.pages,
          meta: { ...entry.meta, pages: extracted.pages.length, mtimeMs: stat.mtimeMs, size: stat.size },
        });
      }
    } else if (entry.kind === "folder" && entry.origin && existsSync(entry.origin)) {
      const previous = this.readFolderFiles(id) ?? [];
      const { files, skipped } = scanFolder(entry.origin, previous);
      if (folderFingerprint(previous) !== folderFingerprint(files)) {
        this.upsertRaw({
          id, kind: "folder", title: entry.title, origin: entry.origin,
          chars: files.reduce((sum, file) => sum + file.chars, 0),
          meta: { files: files.length, ...(skipped ? { skipped } : {}) },
          cachePayload: { files },
        });
      }
    }
    return this.sources.get(id);
  }

  // Fichiers d'un dossier, cache reconstruit quand l'origine le permet.
  folderFilesFor(id) {
    const entry = this.ensureFresh(id);
    const cached = this.readFolderFiles(id);
    if (cached) return cached;
    throw new Error(`Cache absent pour ${id} — ré-épingler la source`);
  }

  // Pages d'une source, en reconstruisant le cache quand l'origine le permet.
  pagesFor(id) {
    const entry = this.ensureFresh(id);
    const cached = this.readPages(id);
    if (cached) return cached;
    if (entry.kind === "file" && entry.origin && existsSync(entry.origin)) {
      const stat = statSync(entry.origin);
      const pages = pagesFromText(readFileSync(entry.origin, "utf8"));
      if (pages.length) {
        this.upsertEntry({
          id, kind: "file", title: entry.title, origin: entry.origin,
          pages, meta: { mtimeMs: stat.mtimeMs, size: stat.size },
        });
        return pages;
      }
    }
    throw new Error(`Cache absent pour ${id} — ré-épingler la source`);
  }

  search(id, query, { limit = 5 } = {}) {
    const entry = this.sources.get(id);
    if (!entry) throw new Error(`Source inconnue: ${id}`);
    const summary = { id: entry.id, title: entry.title, kind: entry.kind, origin: entry.origin ?? null, meta: entry.meta ?? {} };
    if (entry.kind === "folder") {
      const capped = Math.max(1, Math.min(10, limit));
      const files = this.folderFilesFor(id);
      const merged = [];
      for (const file of files) {
        for (const passage of searchPassages(file.pages, query, { limit: capped })) {
          merged.push({ ...passage, file: file.rel });
        }
      }
      merged.sort((a, b) => b.score - a.score);
      return { source: summary, passages: merged.slice(0, capped) };
    }
    const pages = this.pagesFor(id);
    const passages = searchPassages(pages, query, { limit });
    if (entry.kind === "youtube") {
      const seconds = entry.meta?.segmentSeconds ?? YT_BUCKET_SECONDS;
      return {
        source: summary,
        passages: passages.map((passage) => ({ ...passage, timestamp: (passage.page - 1) * seconds })),
      };
    }
    return { source: summary, passages };
  }

  fullText(id) {
    const entry = this.sources.get(id);
    if (entry?.kind === "folder") {
      return this.folderFilesFor(id)
        .map((file) => `# ${file.rel}\n\n${file.pages.map((page) => page.text).join("\n\n")}`)
        .join("\n\n");
    }
    return this.pagesFor(id).map((page) => page.text).join("\n\n");
  }
}

// Promotion vers gbrain (plan 049 T7) : une source épinglée qui mérite le
// corpus permanent part dans inbox/ via `gbrain capture` (titre + origine +
// extrait). NAS injoignable = erreur propre après timeout — jamais bloquant.
export function promoteToGbrain(store, id, { spawn = spawnSync, timeoutMs = 15_000 } = {}) {
  const entry = store.get(id);
  if (!entry) throw new Error(`Source inconnue: ${id}`);
  let extrait = "";
  try {
    extrait = Array.from(store.fullText(id)).slice(0, 700).join("");
  } catch {}
  const lines = [`${entry.title} — ${entry.origin ?? entry.kind}`];
  if (extrait) lines.push("", extrait);
  const run = spawn("gbrain", ["capture", lines.join("\n")], { encoding: "utf8", timeout: timeoutMs });
  if (run.error) throw new Error(`gbrain indisponible: ${run.error.message}`);
  if (run.status !== 0) {
    const message = String(run.stderr || run.stdout || "").trim();
    throw new Error(message || "gbrain capture: échec");
  }
  return { id, captured: true };
}

// Prépare les entrées du bloc <atelier-kb> (plan 049 T4) pour un thread.
// Jamais d'exception : une source illisible dégrade en fiche, un id inconnu
// est ignoré. L'id réservé "gbrain" est géré par l'appelant (withKbBlock).
export function kbBlockEntries(store, sourceIds = [], fullContent = []) {
  const ids = Array.isArray(sourceIds) ? sourceIds : [];
  const forced = Array.isArray(fullContent) ? fullContent : [];
  const entries = [];
  for (const id of ids) {
    if (id === "gbrain") continue;
    const known = store.get(id);
    if (!known) continue;
    const wantInline = known.chars <= KB_INLINE_MAX || forced.includes(id);
    let text = null;
    if (wantInline) {
      try {
        text = store.fullText(id); // rafraîchit mtime au passage (fichiers/PDF)
      } catch {
        text = null;
      }
    }
    const fresh = store.get(id) ?? known;
    entries.push({
      id: fresh.id,
      title: fresh.title,
      kind: fresh.kind,
      chars: fresh.chars,
      inline: Boolean(wantInline && text !== null),
      ...(wantInline && text !== null ? { text } : {}),
    });
  }
  return entries;
}
