// Base de connaissances Atelier (plan 049) : registre global de sources
// épinglées + cache d'extraction en pages, réutilisant le moteur de passages
// Zotero pour la recherche lexicale. Aucune dépendance externe.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { writeFileAtomic } from "./store.mjs";
import { extractPdfPages, searchPassages } from "./zotero_passages.mjs";

const REGISTRY_VERSION = 1;
const PAGES_CACHE_VERSION = 1;
export const KB_INLINE_MAX = 8000;
// T3: zotero — T6: folder — T7: gbrain (id réservé, hors registre) — T8: youtube
export const KB_KINDS = new Set(["file", "pdf", "web", "note"]);
const TEXT_EXTS = new Set([".md", ".tex", ".txt"]);
const WEB_TEXT_MAX = 300_000;
const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 10_000;

export function defaultKnowledgeDir() {
  const appDir = process.env.ATELIER_APP_DIR
    || join(homedir(), "Library", "Application Support", "atelier-studio");
  return join(appDir, "knowledge");
}

// Id déterministe par origine : ré-épingler la même source met à jour au lieu
// de dupliquer.
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

async function defaultFetchPage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "atelier-studio/kb", accept: "text/html,text/plain,*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Téléchargement échoué (HTTP ${res.status}) : ${url}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (/application\/pdf/i.test(contentType)) {
    throw new Error("URL de PDF : télécharger le fichier puis l'épingler avec --kind pdf");
  }
  return { body: await res.text(), contentType };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class KnowledgeStore {
  constructor(dir = defaultKnowledgeDir(), deps = {}) {
    this.dir = dir;
    this.registryPath = join(dir, "knowledge.json");
    this.cacheDir = join(dir, "cache");
    this.pdfCacheDir = join(dir, "pdf-cache");
    this.lockDir = join(dir, ".lock");
    this.deps = { fetchPage: defaultFetchPage, extractPdf: extractPdfPages, ...deps };
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
    if (!existsSync(this.registryPath)) return;
    try {
      for (const entry of JSON.parse(readFileSync(this.registryPath, "utf8")).sources ?? []) {
        if (entry && typeof entry.id === "string" && entry.id) this.sources.set(entry.id, entry);
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

  list() {
    return [...this.sources.values()]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  get(id) {
    return this.sources.get(id);
  }

  persist() {
    writeFileAtomic(
      this.registryPath,
      JSON.stringify({ version: REGISTRY_VERSION, sources: this.list() }, null, 2),
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

  upsertEntry({ id, kind, title, origin, pages, meta }) {
    return this.withLock(() => {
      this.reloadFromDisk();
      const prev = this.sources.get(id);
      const now = new Date().toISOString();
      const entry = {
        id,
        kind,
        title: title || prev?.title || "Sans titre",
        origin: origin ?? null,
        chars: pages.reduce((sum, page) => sum + page.text.length, 0),
        addedAt: prev?.addedAt ?? now,
        updatedAt: now,
        meta: meta ?? {},
      };
      this.sources.set(id, entry);
      writeFileAtomic(this.cachePath(id), JSON.stringify({ version: PAGES_CACHE_VERSION, pages }));
      this.persist();
      return { source: entry, refreshed: Boolean(prev) };
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
    } else if (entry.kind === "pdf" && entry.origin && existsSync(entry.origin)) {
      const stat = statSync(entry.origin);
      if (stale(stat) || !this.readPages(id)) {
        const extracted = this.deps.extractPdf(entry.origin, { cacheDir: this.pdfCacheDir });
        this.upsertEntry({
          id, kind: "pdf", title: entry.title, origin: entry.origin,
          pages: extracted.pages,
          meta: { pages: extracted.pages.length, mtimeMs: stat.mtimeMs, size: stat.size },
        });
      }
    }
    return this.sources.get(id);
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
    const pages = this.pagesFor(id);
    const entry = this.sources.get(id);
    return {
      source: { id: entry.id, title: entry.title, kind: entry.kind },
      passages: searchPassages(pages, query, { limit }),
    };
  }

  fullText(id) {
    return this.pagesFor(id).map((page) => page.text).join("\n\n");
  }
}
