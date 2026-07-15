import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const CACHE_VERSION = 2;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "de", "des", "du", "en", "et", "for", "from",
  "in", "is", "la", "le", "les", "of", "on", "or", "ou", "par", "pour", "que", "qui", "sur", "the",
  "to", "un", "une", "what", "with", "important", "importants", "passage", "passages", "article", "papier",
  "montre", "montrer", "show", "find", "trouve", "trouver", "leur", "leurs", "main", "key",
]);

const QUERY_EXPANSIONS = new Map([
  ["resultat", ["results", "finding", "findings", "conclusion", "conclusions", "concluded"]],
  ["resultats", ["results", "finding", "findings", "conclusion", "conclusions", "concluded"]],
  ["result", ["results", "finding", "findings", "conclusion", "conclusions", "concluded"]],
  ["results", ["results", "finding", "findings", "conclusion", "conclusions", "concluded"]],
  ["limite", ["limit", "limitation", "limitations", "caveat", "uncertainty"]],
  ["limites", ["limit", "limitation", "limitations", "caveat", "uncertainty"]],
  ["methode", ["method", "methods", "methodology", "approach"]],
  ["methodologie", ["method", "methods", "methodology", "approach"]],
  ["conclusion", ["conclusion", "conclusions", "implication", "implications"]],
  ["conclusions", ["conclusion", "conclusions", "implication", "implications"]],
]);

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  const base = normalizeSearchText(value).split(" ").filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return base.flatMap((word) => QUERY_EXPANSIONS.get(word) ?? [word]);
}

export function splitPdfPages(text) {
  return String(text ?? "").split("\f").map((page, index) => ({
    page: index + 1,
    text: page.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim(),
  })).filter((entry) => entry.text);
}

export function passageChunks(pages, { target = 760, overlap = 150 } = {}) {
  const chunks = [];
  for (const entry of pages) {
    const text = entry.text.replace(/([^\n])\n(?=[^\n])/g, "$1 ").replace(/\n{3,}/g, "\n\n");
    const paragraphs = text.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      if (paragraph.length <= target) {
        if (paragraph.length >= 70) chunks.push({ page: entry.page, text: paragraph });
        continue;
      }
      let start = 0;
      while (start < paragraph.length) {
        let end = Math.min(paragraph.length, start + target);
        if (end < paragraph.length) {
          const boundary = paragraph.lastIndexOf(". ", end);
          if (boundary > start + target * 0.55) end = boundary + 1;
        }
        const piece = paragraph.slice(start, end).trim();
        if (piece.length >= 70) chunks.push({ page: entry.page, text: piece });
        if (end >= paragraph.length) break;
        start = Math.max(start + 1, end - overlap);
        const nextBoundary = paragraph.indexOf(" ", start);
        if (nextBoundary >= 0 && nextBoundary < start + 40) start = nextBoundary + 1;
      }
    }
  }
  return chunks;
}

const SECTION_BONUS = /\b(abstract|summary|conclusion|conclusions|discussion|results?|findings?|limitations?|implications?|resume|resultats?|conclusion)\b/i;

function sentenceList(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'‘])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && /^[A-Z0-9“"'‘]/.test(sentence));
}

export function focusPassageQuote(text, query) {
  const queryTokens = [...new Set(tokens(query))];
  const candidates = sentenceList(text);
  if (!candidates.length) return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const ranked = candidates.map((sentence, index) => {
    const normalized = normalizeSearchText(sentence);
    let matched = 0;
    let occurrences = 0;
    for (const token of queryTokens) {
      const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      const count = normalized.match(re)?.length ?? 0;
      if (count) matched += 1;
      occurrences += Math.min(count, 3);
    }
    let score = matched * 8 + occurrences;
    if (/\b(we (find|found|show|demonstrate|estimate)|our results|we conclude|nous (montrons|estimons)|results? (show|indicate|suggest))\b/i.test(sentence)) score += 5;
    if (/\b\d+(?:[.,]\d+)?\s*(?:%|km|kg|gt|w\s*m|years?|ans?)\b/i.test(sentence)) score += 3;
    else if (/\b\d+[.,]\d+\b/.test(sentence)) score += 3;
    if (/root-mean-square/i.test(sentence)) score += 7;
    else if (/significant|increase|decrease|difference|correction|applicable|limitation/i.test(sentence)) score += 2;
    return { sentence, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0].sentence.slice(0, 500);
}

export function searchPassages(pages, query, { limit = 5 } = {}) {
  const queryTokens = [...new Set(tokens(query))];
  const normalizedQuery = normalizeSearchText(query);
  const generic = queryTokens.length === 0;
  const ranked = passageChunks(pages).map((chunk, index) => {
    const normalized = normalizeSearchText(chunk.text);
    let matched = 0;
    let occurrences = 0;
    for (const token of queryTokens) {
      const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      const count = normalized.match(re)?.length ?? 0;
      if (count) matched += 1;
      occurrences += Math.min(count, 4);
    }
    let score = matched * 7 + occurrences * 1.5;
    if (queryTokens.length > 1) score += (matched / queryTokens.length) * 8;
    if (normalizedQuery.length > 12 && normalized.includes(normalizedQuery)) score += 14;
    if (SECTION_BONUS.test(chunk.text)) score += generic ? 8 : 2;
    if (/\b(we (find|found|show|demonstrate|estimate)|our results|nous (montrons|estimons)|principal result)\b/i.test(chunk.text)) score += 3;
    if (/\b\d+(?:[.,]\d+)?\s*(?:%|km|kg|gt|w\s*m|years?|ans?)\b/i.test(chunk.text)) score += 1.5;
    score += Math.min(chunk.text.length, 800) / 1600;
    return { ...chunk, score, index };
  }).filter((entry) => generic || entry.score >= 7);

  ranked.sort((a, b) => b.score - a.score || a.page - b.page || a.index - b.index);
  const out = [];
  const perPage = new Map();
  for (const entry of ranked) {
    if ((perPage.get(entry.page) ?? 0) >= 2) continue;
    const duplicate = out.some((other) => normalizeSearchText(other.text).includes(normalizeSearchText(entry.text).slice(0, 120)));
    if (duplicate) continue;
    out.push({
      page: entry.page,
      quote: focusPassageQuote(entry.text, query),
      context: entry.text.slice(0, 900),
      score: Number(entry.score.toFixed(2)),
    });
    perPage.set(entry.page, (perPage.get(entry.page) ?? 0) + 1);
    if (out.length >= Math.max(1, Math.min(10, limit))) break;
  }
  return out;
}

export function resolveZoteroPdf(pdfPath, { storageRoot = join(homedir(), "Zotero", "storage") } = {}) {
  if (!pdfPath || !existsSync(pdfPath)) throw new Error("PDF Zotero introuvable");
  const root = realpathSync(storageRoot);
  const actual = realpathSync(resolve(pdfPath));
  const rel = relative(root, actual);
  if (!rel || rel.startsWith("..") || rel.includes(`${sep}..${sep}`)) throw new Error("PDF hors du stockage Zotero");
  if (!actual.toLowerCase().endsWith(".pdf")) throw new Error("Le fichier Zotero doit être un PDF");
  return actual;
}

function cachePathFor(pdfPath, cacheDir) {
  const key = createHash("sha256").update(pdfPath).digest("hex").slice(0, 24);
  return join(cacheDir, `${key}.json`);
}

export function extractPdfPages(pdfPath, {
  cacheDir = join(homedir(), "Library", "Application Support", "atelier-studio", "zotero-passages"),
  pdftotext = "pdftotext",
} = {}) {
  const stat = statSync(pdfPath);
  const cachePath = cachePathFor(pdfPath, cacheDir);
  try {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    if (cached.version === CACHE_VERSION && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs && Array.isArray(cached.pages)) {
      return { pages: cached.pages, cached: true, cachePath };
    }
  } catch {}

  let run = spawnSync(pdftotext, ["-enc", "UTF-8", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
  });
  if (run.error) throw new Error(`pdftotext indisponible: ${run.error.message}`);
  if (run.status !== 0) throw new Error(String(run.stderr || "Extraction PDF impossible").trim());
  let pages = splitPdfPages(run.stdout);
  // Certains PDF sans ordre logique n'exposent du texte qu'en conservant la
  // mise en page. Ce repli est moins bon pour les articles à deux colonnes,
  // donc il ne s'active que si l'extraction standard est vide.
  if (!pages.length) {
    run = spawnSync(pdftotext, ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8", maxBuffer: 96 * 1024 * 1024,
    });
    if (run.error) throw new Error(`pdftotext indisponible: ${run.error.message}`);
    if (run.status !== 0) throw new Error(String(run.stderr || "Extraction PDF impossible").trim());
    pages = splitPdfPages(run.stdout);
  }
  if (!pages.length) throw new Error("Aucun texte extractible dans ce PDF (OCR requis)");
  mkdirSync(cacheDir, { recursive: true });
  const tmp = join(dirname(cachePath), `.${basename(cachePath)}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, size: stat.size, mtimeMs: stat.mtimeMs, pages }));
  renameSync(tmp, cachePath);
  return { pages, cached: false, cachePath };
}

export function passageLink({ zoteroKey, pdfKey, pdfFile, page, quote }) {
  const params = new URLSearchParams({
    key: String(zoteroKey ?? ""),
    pdfKey: String(pdfKey ?? ""),
    file: String(pdfFile ?? ""),
    page: String(page),
    quote: String(quote ?? "").slice(0, 900),
  });
  return `#atelier-zotero-passage?${params.toString()}`;
}
