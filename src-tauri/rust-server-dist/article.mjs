// Import d'article (plan 053) : PDF → markdown (MinerU, repli extraction
// locale) → fiche vérifiable → page gbrain. Deux étapes séparées par un
// BROUILLON SUR DISQUE, parce que le backend Rust relance `kb_cli.mjs` à
// chaque commande : aucun état ne survit en mémoire entre l'import et
// l'écriture. Rien n'entre dans le corpus sans confirmation explicite.
import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { GBRAIN_NOT_FOUND, defaultKnowledgeDir, parseGbrainSearch, runGbrain, slugifyTitle } from "./knowledge.mjs";
import { crossrefMeta, resolveArticleMeta } from "./article_meta.mjs";
import { extractPdfPages } from "./zotero_passages.mjs";

export const ARTICLE_DRAFT_DIR = "article-drafts";
// MinerU passe par l'API cloud : upload + conversion + téléchargement. Le
// script python plafonne son propre polling à 600 s ; on garde de la marge.
export const MINERU_TIMEOUT_MS = 900_000;
export const RAGDOC_TIMEOUT_MS = 120_000;
const ARTICLE_PAGE_MAX = 400_000;
const ARTICLE_PREVIEW_MAX = 4000;
const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;
const GBRAIN_SLUG_RE = /^[a-z0-9][a-z0-9/_.-]*$/i;
const RAGDOC_DIR = "/volume1/Services/mcp/ragdoc";
const RAGDOC_PYTHON = `${RAGDOC_DIR}/ragdoc-env-new/bin/python`;

// --- conversion -----------------------------------------------------------

// Le script du skill mineru-pdf (API cloud, token dans ~/.mineru_token).
// Absent ou sans token : on retombe sur l'extraction locale, jamais d'échec
// sec — un article lisible vaut mieux qu'un dialogue vide.
export function resolveMineru({ env = process.env, home = homedir() } = {}) {
  const override = env.ATELIER_MINERU_SCRIPT;
  const script = override || join(home, ".claude", "skills", "mineru-pdf", "mineru_convert.py");
  if (!existsSync(script)) return { script: null, reason: `script MinerU introuvable (${script})` };
  if (!existsSync(join(home, ".mineru_token"))) {
    return { script: null, reason: "token MinerU absent (~/.mineru_token)" };
  }
  return { script, reason: null };
}

// --- étapes de conversion -------------------------------------------------

// Le script MinerU raconte ce qu'il fait sur stdout ; on l'écoutait sans
// jamais le répéter, d'où l'impression de trou noir pendant les minutes de
// conversion. Chaque ligne connue devient une étape nommée.
const MINERU_STAGES = [
  [/^Uploading\b/i, () => ({ stage: "upload" })],
  [/^Upload complete/i, () => ({ stage: "converting" })],
  [/^Processing\.\.\.\s*\((\d+)s\)/i, (m) => ({ stage: "converting", seconds: Number(m[1]) })],
  [/^Conversion complete/i, () => ({ stage: "download" })],
  [/^Downloading result/i, () => ({ stage: "download" })],
  [/^Extracted (\d+) figures?/i, (m) => ({ stage: "figures", count: Number(m[1]) })],
  [/^Couche texte:.*is_ocr=(\w+)/i, (m) => ({ stage: "ocr", ocr: m[1] === "True" })],
];

export function mineruStage(line) {
  const text = String(line ?? "").trim();
  for (const [pattern, build] of MINERU_STAGES) {
    const match = pattern.exec(text);
    if (match) return build(match);
  }
  return null;
}

// Remplace `spawnSync` : la conversion doit pouvoir parler pendant qu'elle
// dure. Rend la MÊME forme que spawnSync ({status, stdout, stderr, error})
// pour que les appelants et les tests existants ne changent pas de contrat.
export function runStreaming(command, args, { timeout = 0, onLine } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = nodeSpawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ status: null, stdout: "", stderr: "", error });
      return;
    }
    let stdout = "";
    let stderr = "";
    let pending = "";
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!onLine) continue;
        try { onLine(line); } catch { /* un abonné qui tombe n'arrête pas la conversion */ }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ status: null, stdout, stderr, error }));
    child.on("close", (status) => {
      if (pending && onLine) {
        try { onLine(pending); } catch { /* idem */ }
      }
      finish({ status, stdout, stderr, error: null });
    });
    if (timeout > 0) {
      timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* déjà mort */ }
        finish({ status: null, stdout, stderr, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) });
      }, timeout);
    }
  });
}

export function outputName(path) {
  const stem = slugifyTitle(basename(String(path)).replace(/\.pdf$/i, "")).slice(0, 40);
  const hash = createHash("sha1").update(String(path)).digest("hex").slice(0, 6);
  return `atelier-${stem || "article"}-${hash}`;
}

// Raison d'échec lisible : surtout PAS la dernière ligne de stdout — le script
// finit par « ✓ Figures: … », ce qui donnait des messages d'échec triomphants.
export function mineruFailure(run = {}) {
  if (run.error?.code === "ETIMEDOUT") return "délai dépassé";
  const lines = String(run.stderr || "").trim().split("\n").filter(Boolean);
  const spoken = [...lines].reverse().find((line) => /error|exception|traceback|refus|denied|quota/i.test(line))
    ?? lines.pop()
    ?? String(run.stdout || "").trim().split("\n").filter(Boolean)
      .reverse().find((line) => /error|échec|failed|quota/i.test(line));
  if (spoken) return spoken.trim().slice(0, 160);
  if (run.error?.message) return run.error.message.slice(0, 160);
  return typeof run.status === "number" && run.status !== 0
    ? `code ${run.status}`
    : "markdown introuvable en sortie";
}

// Retourne { markdown, converter, warning } — `converter` vaut "mineru" ou
// "local", `warning` explique la dégradation quand il y en a une.
export async function convertPdf(path, {
  spawn = runStreaming,
  python = "python3",
  timeout = MINERU_TIMEOUT_MS,
  extractPdf = extractPdfPages,
  cacheDir,
  mineru = resolveMineru(),
  // Étapes en direct. Sans abonné, la conversion se déroule comme avant.
  onProgress,
  // PIÈGE (vécu) : le script du skill écrit en dur dans /tmp/<nom>.md, alors
  // que os.tmpdir() vaut /var/folders/… sur macOS. Chercher au seul tmpdir()
  // faisait passer TOUTE conversion réussie pour un échec, et l'article
  // repartait en extraction locale (métadonnées en bouillie).
  tmp = ["/tmp", tmpdir()],
} = {}) {
  if (!existsSync(path)) throw new Error(`PDF introuvable: ${path}`);
  if (!/\.pdf$/i.test(path)) throw new Error(`Un PDF est attendu: ${path}`);
  let warning = mineru.reason;
  if (mineru.script) {
    const name = outputName(path);
    const run = await spawn(python, [mineru.script, path, name], {
      encoding: "utf8",
      timeout,
      onLine: onProgress ? (line) => {
        const stage = mineruStage(line);
        if (stage) onProgress(stage);
      } : undefined,
    });
    const roots = Array.isArray(tmp) ? tmp : [tmp];
    const produced = roots.map((root) => join(root, `${name}.md`)).find((file) => existsSync(file));
    if (!run.error && produced) {
      const markdown = readFileSync(produced, "utf8").trim();
      if (markdown) {
        try { rmSync(produced, { force: true }); } catch { /* le tmp survivra */ }
        return { markdown, converter: "mineru", warning: null };
      }
    }
    warning = `MinerU a échoué (${mineruFailure(run)}) — texte extrait localement`;
  }
  const extracted = extractPdf(path, cacheDir ? { cacheDir } : {});
  // extractPdfPages rend des { page, text } ; on tolère aussi des chaînes.
  const pages = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const markdown = pages
    .map((page) => String(typeof page === "string" ? page : page?.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!markdown) throw new Error("Aucun texte extrait de ce PDF (scan sans couche texte ?)");
  return { markdown, converter: "local", warning };
}

// --- métadonnées ----------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "on", "in", "to", "with", "from", "by",
  "using", "based", "over", "at", "its", "their", "un", "une", "des", "les",
  "la", "le", "de", "du", "et", "dans", "sur", "pour", "par", "aux",
  // verbes et liaisons qui n'identifient rien dans un slug
  "can", "may", "are", "is", "was", "were", "how", "what", "why", "not",
  "but", "into", "via", "toward", "towards", "between", "among", "peut",
]);

// MinerU rend les appels de note en `<sup>1</sup>` et échappe les astérisques :
// sans nettoyage, la ligne d'auteurs ressemble à du bruit numéroté.
function cleanLine(line) {
  return String(line)
    .replace(/<[^>]+>/g, "")
    .replace(/^#+\s*/, "")
    .replace(/\\([*_])/g, "")
    .replace(/[*_`]/g, "")
    .trim();
}

// Lignes d'appareil éditorial : ni titre, ni auteurs, jamais.
const BOILERPLATE = /^(published|received|accepted|doi|abstract|keywords?|citation|edited by|reviewed by|correspondence|specialty section|open access|methods|results|introduction|original research|this article was submitted)\b/i;

const AFFILIATION = /universit|institut|department|départ|laborator|\blab\b|research cent|centre|college|academy|school of|@/i;

function looksLikeAuthors(line) {
  if (line.length < 6 || line.length > 400) return false;
  if (BOILERPLATE.test(line) || AFFILIATION.test(line)) return false;
  // « Aoki, T.; Kuchiki, K. », « T. Aoki and K. Kuchiki », « O. Stojanović1*, … »
  const names = line.match(/[A-ZÀ-Ý][a-zà-ÿ'’-]{1,}/g) ?? [];
  return names.length >= 2
    && (/[;,]/.test(line) || /\band\b|\bet\b/i.test(line))
    && !/^\d/.test(line);
}

// Heuristiques volontairement simples : tout est éditable dans la fiche, une
// devinette approximative fait gagner plus de temps qu'un champ vide.
export function parseArticleMeta(markdown, { filename = "" } = {}) {
  const text = String(markdown ?? "");
  const head = text.slice(0, 6000);
  const lines = head.split("\n").map(cleanLine).filter(Boolean);

  const doiRaw = /\b10\.\d{4,9}\/\S+/i.exec(head)?.[0] ?? "";
  const doi = doiRaw.replace(/[.,;:)\]]+$/, "");

  let title = "";
  const fromHash = head.split("\n").find((line) => /^#\s+\S/.test(line));
  if (fromHash) {
    title = cleanLine(fromHash);
  } else {
    // Extraction locale : le titre arrive coupé sur plusieurs lignes courtes.
    // On recolle le premier bloc utile plutôt que d'en garder un fragment.
    const start = lines.findIndex((line) => line.length >= 12 && !BOILERPLATE.test(line) && !AFFILIATION.test(line));
    if (start >= 0) {
      const block = [];
      for (const line of lines.slice(start, start + 5)) {
        if (BOILERPLATE.test(line) || AFFILIATION.test(line) || looksLikeAuthors(line)) break;
        block.push(line);
        if (/[.?!]$/.test(line) || block.join(" ").length > 120) break;
      }
      title = block.join(" ");
    }
  }
  if (!title) title = basename(String(filename)).replace(/\.(pdf|md)$/i, "").replace(/[_-]+/g, " ").trim();
  title = title.replace(/\s+/g, " ").slice(0, 300);

  const titleAt = lines.findIndex((line) => title.startsWith(line) || line === title);
  const authorLine = lines.slice(Math.max(titleAt, 0) + 1, Math.max(titleAt, 0) + 8).find(looksLikeAuthors) ?? "";
  // les appels de note restent collés aux noms après nettoyage des balises
  const authors = authorLine.replace(/(\p{L})\d+/gu, "$1").replace(/\s+,/g, ",").trim();

  // Année de publication d'abord (« Published: 11 January 2022 »), sinon la
  // plus récente rencontrée — un DOI porte souvent l'année de soumission.
  const published = /\b(?:published|publié)\b[^\n]{0,40}?\b((?:19|20)\d{2})\b/i.exec(head)?.[1];
  const years = head.match(/\b(19|20)\d{2}\b/g) ?? [];
  const year = Number(published ?? (years.length ? years.sort((a, b) => Number(b) - Number(a))[0] : NaN));

  // « a section of the journal Frontiers in Environmental Science » : la revue
  // se nomme elle-même. Sinon, une ligne courte qui parle revue et PAS labo.
  const named = /\bjournal\s+([A-ZÀ-Ý][^\n.;]{3,60})/.exec(head)?.[1]?.trim();
  const journal = named ?? lines.slice(0, 25).find((line) => (
    line !== title && line.length < 120 && !AFFILIATION.test(line)
    && /journal|revue|proc\.|trans\.|letters|rev\.|geophys|cryosphere|remote sens|frontiers/i.test(line)
  )) ?? "";

  return {
    title, authors, journal, doi,
    year: Number.isFinite(year) && year <= new Date().getFullYear() + 1 ? year : null,
  };
}

// Nom de famille du premier auteur, quelle que soit la forme d'écriture.
export function firstAuthorSlug(authors) {
  const clean = String(authors ?? "").replace(/(\p{L})\d+/gu, "$1").trim();
  if (!clean) return "";
  // « Aoki, T.; … » — la virgule sépare le nom de ses initiales
  const initialsForm = /^([^,;]+),\s*(?:[A-ZÀ-Ý]\.?\s*){1,4}(?:[;,]|$)/.exec(clean);
  const first = initialsForm
    ? initialsForm[1]
    : clean.split(/;|\band\b|\bet\b|,/i)[0] ?? clean;
  // « Olivera Stojanović » — le nom de famille est le dernier mot plein
  const family = first.trim().split(/\s+/).filter((part) => !/^[A-ZÀ-Ý]\.?$/.test(part)).pop() ?? first;
  return slugifyTitle(family).split("-")[0] ?? "";
}

export function titleWords(title, max = 4) {
  return slugifyTitle(title)
    .split("-")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .slice(0, max)
    .join("-");
}

export function articleSlug({ authors, year, title } = {}) {
  const parts = [firstAuthorSlug(authors), year ? String(year) : "", titleWords(title)]
    .filter(Boolean);
  const tail = parts.join("-") || slugifyTitle(title) || "sans-titre";
  return `articles/${tail.slice(0, 70).replace(/-+$/, "")}`;
}

// Convention de nommage du corpus ragdoc : Auteur_Annee_MotsCles.
export function ragdocName({ authors, year, title } = {}) {
  const author = firstAuthorSlug(authors);
  const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  const words = titleWords(title, 4).split("-").filter(Boolean).map(cap).join("_");
  return [author ? cap(author) : "Article", year ? String(year) : "sd", words || "Sans_Titre"]
    .join("_")
    .slice(0, 100);
}

// --- page markdown --------------------------------------------------------

function yamlList(value) {
  const items = String(value ?? "")
    .split(/;|(?<=\.)\s*,\s*(?=[A-ZÀ-Ý])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return items.length ? `[${items.map((item) => JSON.stringify(item)).join(", ")}]` : "[]";
}

export function buildArticlePage(meta, body, { origin = "", converter = "" } = {}) {
  const text = String(body ?? "");
  const scalars = Array.from(text);
  const capped = scalars.length > ARTICLE_PAGE_MAX
    ? `${scalars.slice(0, ARTICLE_PAGE_MAX).join("")}\n[…tronqué]`
    : text;
  const front = [
    "---",
    `title: ${JSON.stringify(String(meta?.title ?? "").trim())}`,
    `authors: ${yamlList(meta?.authors)}`,
  ];
  if (meta?.year) front.push(`year: ${Number(meta.year)}`);
  if (meta?.journal) front.push(`journal: ${JSON.stringify(String(meta.journal).trim())}`);
  if (meta?.doi) front.push(`doi: ${JSON.stringify(String(meta.doi).trim())}`);
  if (origin) front.push(`origin: ${JSON.stringify(origin)}`);
  front.push(`captured: ${new Date().toISOString().slice(0, 10)}`);
  front.push("from: atelier");
  if (converter) front.push(`converter: ${converter}`);
  front.push("type: article");
  front.push("---");
  return `${front.join("\n")}\n\n${capped}\n`;
}

// --- brouillons -----------------------------------------------------------

export function draftDir(dir = defaultKnowledgeDir()) {
  return join(dir, ARTICLE_DRAFT_DIR);
}

// Un brouillon oublié (dialogue fermé, app tuée) ne doit pas s'accumuler.
export function pruneDrafts(dir = defaultKnowledgeDir(), { now = Date.now(), ttl = DRAFT_TTL_MS } = {}) {
  const root = draftDir(dir);
  if (!existsSync(root)) return 0;
  let dropped = 0;
  for (const name of readdirSync(root)) {
    const file = join(root, name);
    try {
      if (now - statSync(file).mtimeMs > ttl) { rmSync(file, { force: true }); dropped += 1; }
    } catch { /* course avec un autre process : sans importance */ }
  }
  return dropped;
}

export function saveDraft(dir, markdown) {
  const root = draftDir(dir);
  mkdirSync(root, { recursive: true });
  pruneDrafts(dir);
  const id = createHash("sha1").update(String(markdown)).digest("hex").slice(0, 12);
  writeFileSync(join(root, `${id}.md`), String(markdown), "utf8");
  return id;
}

export function readDraft(dir, id) {
  if (!/^[a-f0-9]{12}$/.test(String(id ?? ""))) throw new Error(`Brouillon invalide: ${id}`);
  const file = join(draftDir(dir), `${id}.md`);
  if (!existsSync(file)) throw new Error("Brouillon expiré — relancer la conversion du PDF");
  return readFileSync(file, "utf8");
}

export function dropDraft(dir, id) {
  try { rmSync(join(draftDir(dir), `${String(id)}.md`), { force: true }); } catch { /* déjà parti */ }
}

// --- orchestration --------------------------------------------------------

function probeExists(slug, run) {
  const probe = String(run(["get", slug])).trim();
  return Boolean(probe) && !GBRAIN_NOT_FOUND.test(probe);
}

// Liste des articles du corpus — `gbrain list --type article` rend des lignes
// « slug<TAB>type<TAB>date<TAB>titre ». Les bannières d'auto-mise à jour du
// CLI se glissent sur stdout : tout ce qui n'a pas 4 colonnes est ignoré.
export function parseArticleList(output) {
  return String(output ?? "")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length >= 4 && cells[0].includes("/"))
    .map(([slug, type, date, ...rest]) => ({
      slug: slug.trim(),
      type: type.trim(),
      date: date.trim(),
      title: rest.join("\t").trim(),
    }));
}

export function listArticles({ limit = 20, type = "article" } = {}, deps = {}) {
  const run = deps.runGbrain ?? runGbrain;
  const capped = Math.max(1, Math.min(100, Number(limit) || 20));
  const articles = parseArticleList(run(["list", "--type", type, "-n", String(capped)]));
  // les plus récents d'abord : gbrain trie par slug, pas par date
  return articles.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, capped);
}

// Doublons : le slug exact ne suffit pas — le même article entre souvent sous
// un slug différent (auteur abrégé, titre tronqué, import d'il y a deux ans).
// On interroge le corpus par DOI (identifiant fort) puis par titre, en
// exigeant un recouvrement franc des mots pour ne pas crier au loup.
export const DUPLICATE_OVERLAP = 0.6;

export function findDuplicates({ meta = {}, slug = "" } = {}, run = runGbrain, { limit = 5 } = {}) {
  const found = new Map();
  const add = (result, why) => {
    if (!result?.slug || result.slug === slug || found.has(result.slug)) return;
    found.set(result.slug, { slug: result.slug, snippet: result.snippet ?? "", why });
  };
  const search = (query) => {
    try {
      return parseGbrainSearch(String(run(["search", query])));
    } catch {
      // corpus injoignable : pas de doublon détectable, pas d'échec non plus
      return [];
    }
  };
  if (meta.doi) for (const result of search(meta.doi)) add(result, "doi");
  const words = titleWords(meta.title, 8).split("-").filter(Boolean);
  if (words.length >= 3) {
    for (const result of search(words.join(" "))) {
      const hay = `${result.slug} ${result.snippet ?? ""}`.toLowerCase();
      const hits = words.filter((word) => hay.includes(word)).length;
      if (hits / words.length >= DUPLICATE_OVERLAP) add(result, "titre");
    }
  }
  return [...found.values()].slice(0, limit);
}

// Étape 1 : PDF → brouillon + fiche. Aucune écriture gbrain, seulement la
// sonde d'existence du slug proposé et la recherche de doublons.
export async function importArticle({ path, dir = defaultKnowledgeDir() } = {}, deps = {}) {
  if (!path) throw new Error("Argument requis: --path");
  // Un abonné aux étapes ne change rien au résultat : il permet seulement à
  // l'interface de dire où en est une conversion qui dure des minutes.
  const step = typeof deps.onProgress === "function" ? deps.onProgress : () => {};
  const { markdown, converter, warning } = await convertPdf(path, deps);
  const guessed = parseArticleMeta(markdown, { filename: path });
  // Zotero puis Crossref avant de composer le slug : deviner le nom de
  // famille sur un titre bancal produisait des slugs à jeter.
  step({ stage: "meta" });
  const resolve = deps.resolveArticleMeta ?? resolveArticleMeta;
  const { meta, source: metaSource } = await resolve({ path, guessed }, deps);
  const slug = articleSlug(meta);
  const draftId = saveDraft(dir, markdown);
  const page = buildArticlePage(meta, markdown, { origin: path, converter });
  const scalars = Array.from(page);
  const preview = scalars.length > ARTICLE_PREVIEW_MAX
    ? `${scalars.slice(0, ARTICLE_PREVIEW_MAX).join("")}\n[…]`
    : page;
  step({ stage: "duplicates" });
  let exists = false;
  let probeError = null;
  try {
    exists = probeExists(slug, deps.runGbrain ?? runGbrain);
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error);
  }
  const duplicates = probeError ? [] : findDuplicates({ meta, slug }, deps.runGbrain ?? runGbrain);
  return {
    ok: true, draftId, path, meta, slug, exists, converter, duplicates, metaSource,
    chars: Array.from(markdown).length, preview,
    warning: warning ?? probeError ?? null,
  };
}

// Crossref rend parfois le résumé en JATS (<jats:p>…</jats:p>) : on le rend
// lisible plutôt que de le recracher balisé.
export function abstractText(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Import par DOI (plan 054) : la moitié du temps on a la référence avant le
// PDF. La page est une FICHE DE RÉFÉRENCE — métadonnées + résumé quand
// Crossref en donne un — et elle le dit, pour qu'on ne la prenne pas pour un
// article intégral.
export async function importDoi({ doi, dir = defaultKnowledgeDir() } = {}, deps = {}) {
  const clean = String(doi ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  if (!/^10\.\d{4,9}\//.test(clean)) throw new Error(`DOI invalide: ${doi}`);
  const meta = await (deps.crossrefMeta ?? crossrefMeta)(clean, deps);
  if (!meta) throw new Error(`DOI introuvable chez Crossref (ou hors ligne) : ${clean}`);
  const abstract = abstractText(deps.abstract ?? meta.abstract);
  const body = abstract
    ? `## Résumé\n\n${abstract}\n`
    : "_Fiche de référence — aucun texte intégral. Déposer le PDF pour l'ajouter._\n";
  const draftId = saveDraft(dir, body);
  const slug = articleSlug(meta);
  const page = buildArticlePage(meta, body, { origin: `doi:${clean}`, converter: "crossref" });
  let exists = false;
  let probeError = null;
  try {
    exists = probeExists(slug, deps.runGbrain ?? runGbrain);
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error);
  }
  return {
    ok: true, draftId, path: `doi:${clean}`, meta, slug, exists,
    converter: "crossref", metaSource: "crossref",
    duplicates: probeError ? [] : findDuplicates({ meta, slug }, deps.runGbrain ?? runGbrain),
    chars: Array.from(body).length, preview: page,
    warning: probeError ?? (abstract ? null : "Aucun résumé chez Crossref — fiche de référence sans texte"),
  };
}

// Copie vers le corpus ragdoc du NAS : transfert synchrone (rapide), puis
// indexation DÉTACHÉE — l'indexation complète prend des minutes et ne doit
// pas retenir le dialogue. Échec non bloquant, toujours rapporté.
export function copyToRagdoc(name, markdown, { spawn = nodeSpawnSync, timeout = RAGDOC_TIMEOUT_MS, host = "nas" } = {}) {
  const safe = String(name).replace(/[^A-Za-z0-9_.-]/g, "_");
  const put = spawn("ssh", [host, `cat > '${RAGDOC_DIR}/articles_markdown/${safe}.md'`], {
    encoding: "utf8", input: markdown, timeout,
  });
  if (put.error || put.status !== 0) {
    const detail = put.error?.code === "ETIMEDOUT"
      ? "délai dépassé"
      : String(put.stderr || put.error?.message || "échec").trim().slice(0, 160);
    return { ok: false, message: `ragdoc: transfert impossible (${detail})` };
  }
  const index = spawn("ssh", [host,
    `cd '${RAGDOC_DIR}' && nohup '${RAGDOC_PYTHON}' scripts/index_incremental.py >/dev/null 2>&1 &`,
  ], { encoding: "utf8", timeout: 20_000 });
  return {
    ok: true, file: `${safe}.md`,
    indexing: !index.error && index.status === 0,
  };
}

// Étape 2 : brouillon + métadonnées corrigées → page gbrain. `gbrain put`
// chunke et embed lui-même ; l'existence est re-sondée pour que l'UI ne
// promette jamais une création là où elle remplace.
export function writeArticle({
  draftId, slug, meta = {}, origin = "", converter = "", ragdoc = false,
  dir = defaultKnowledgeDir(),
} = {}, deps = {}) {
  const run = deps.runGbrain ?? runGbrain;
  const body = readDraft(dir, draftId);
  const target = String(slug ?? "").trim() || articleSlug(meta);
  if (!GBRAIN_SLUG_RE.test(target) || /\s/.test(target)) throw new Error(`Slug invalide: ${target}`);
  const markdown = buildArticlePage(meta, body, { origin, converter });
  const existed = probeExists(target, run);
  const out = String(run(["put", target], { input: markdown }));
  if (GBRAIN_NOT_FOUND.test(out) || /^Error \[/m.test(out)) {
    throw new Error(out.trim().slice(0, 300));
  }
  let ragdocResult = null;
  if (ragdoc) {
    try {
      ragdocResult = copyToRagdoc(ragdocName(meta), markdown, deps);
    } catch (error) {
      ragdocResult = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  dropDraft(dir, draftId);
  return { ok: true, slug: target, written: true, updated: existed, ragdoc: ragdocResult };
}
