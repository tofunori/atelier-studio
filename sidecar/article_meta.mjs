// Métadonnées d'article (plan 053) — ARRÊTER DE DEVINER quand une source
// d'autorité existe. Les heuristiques sur le texte converti se cassent sur
// chaque mise en page d'éditeur ; le DOI et la bibliothèque Zotero, eux,
// savent. Ordre : Zotero (curé à la main) → Crossref (par DOI) → texte.
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const CROSSREF_TIMEOUT_MS = 8000;
export const ZOTERO_TIMEOUT_MS = 5000;
const ZOTERO_FIELDS = ["title", "date", "publicationTitle", "DOI"];

export function zoteroDbPath({ home = homedir(), env = process.env } = {}) {
  return env.ATELIER_ZOTERO_DB || join(home, "Zotero", "zotero.sqlite");
}

// « …/Zotero/storage/8KQ2/aoki-2011.pdf » → { key: "8KQ2", file: "aoki-2011.pdf" }
export function zoteroStorageRef(path) {
  const m = /[/\\]Zotero[/\\]storage[/\\]([A-Z0-9]{8,})[/\\]([^/\\]+)$/i.exec(String(path ?? ""));
  return m ? { key: m[1], file: m[2] } : null;
}

function sqliteJson(db, sql, { spawn = nodeSpawnSync, timeout = ZOTERO_TIMEOUT_MS } = {}) {
  // immutable=1 : Zotero garde la base verrouillée quand il tourne, et on ne
  // fait que lire — jamais de copie, jamais d'écriture.
  const run = spawn("sqlite3", [`file:${db}?immutable=1`, "-json", sql], { encoding: "utf8", timeout });
  if (run.error || run.status !== 0) return [];
  const out = String(run.stdout ?? "").trim();
  if (!out) return [];
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Métadonnées de l'entrée parente d'une pièce jointe Zotero.
export function zoteroMeta(path, deps = {}) {
  const ref = zoteroStorageRef(path);
  if (!ref) return null;
  const db = deps.zoteroDb ?? zoteroDbPath();
  if (!existsSync(db)) return null;
  const key = sqlQuote(ref.key);
  const fields = ZOTERO_FIELDS.map(sqlQuote).join(", ");
  const rows = sqliteJson(db, `
    select f.fieldName as name, v.value as value
    from items a
    join itemAttachments ia on ia.itemID = a.itemID
    join itemData d on d.itemID = ia.parentItemID
    join itemDataValues v on v.valueID = d.valueID
    join fields f on f.fieldID = d.fieldID
    where a.key = ${key} and f.fieldName in (${fields});`, deps);
  if (!rows.length) return null;
  const authors = sqliteJson(db, `
    select c.lastName as last, c.firstName as first
    from items a
    join itemAttachments ia on ia.itemID = a.itemID
    join itemCreators ic on ic.itemID = ia.parentItemID
    join creators c on c.creatorID = ic.creatorID
    where a.key = ${key}
    order by ic.orderIndex;`, deps);
  const value = (name) => rows.find((row) => row.name === name)?.value ?? "";
  const date = value("date");
  const year = /\b(19|20)\d{2}\b/.exec(date)?.[0];
  const title = value("title");
  if (!title) return null;
  return {
    title,
    authors: authors
      .map((row) => [row.last, row.first].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; "),
    journal: value("publicationTitle"),
    doi: value("DOI"),
    year: year ? Number(year) : null,
  };
}

// Crossref : le DOI est le seul motif non ambigu d'un PDF scientifique, et
// l'API répond une notice propre. En-tête poli (usage recommandé).
export async function crossrefMeta(doi, {
  fetchJson,
  timeout = CROSSREF_TIMEOUT_MS,
  mailto = "laurentstpierrethierry@gmail.com",
} = {}) {
  const clean = String(doi ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  if (!/^10\.\d{4,9}\//.test(clean)) return null;
  const url = `https://api.crossref.org/works/${encodeURIComponent(clean)}?mailto=${encodeURIComponent(mailto)}`;
  let payload = null;
  try {
    if (fetchJson) {
      payload = await fetchJson(url);
    } else {
      const response = await fetch(url, {
        headers: { "User-Agent": `atelier-studio (mailto:${mailto})` },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) return null;
      payload = await response.json();
    }
  } catch {
    // hors ligne, DOI inconnu, API lente : on garde ce qu'on avait
    return null;
  }
  const work = payload?.message;
  const title = Array.isArray(work?.title) ? work.title[0] : work?.title;
  if (!title) return null;
  const parts = work.published?.["date-parts"]?.[0]
    ?? work["published-print"]?.["date-parts"]?.[0]
    ?? work["published-online"]?.["date-parts"]?.[0]
    ?? work.issued?.["date-parts"]?.[0]
    ?? [];
  const container = Array.isArray(work["container-title"])
    ? work["container-title"][0]
    : work["container-title"];
  return {
    abstract: work.abstract ? String(work.abstract) : "",
    title: String(title).replace(/\s+/g, " ").trim(),
    authors: (work.author ?? [])
      .map((person) => (person.family
        ? [person.family, person.given].filter(Boolean).join(", ")
        : person.name ?? ""))
      .filter(Boolean)
      .join("; "),
    journal: container ? String(container) : "",
    doi: work.DOI ? String(work.DOI) : clean,
    year: Number(parts[0]) || null,
  };
}

// Une source ne vaut que par ce qu'elle apporte : on ne remplace un champ
// deviné que par un champ non vide, et on garde le DOI lu dans le PDF quand
// la source n'en donne pas.
function merge(base, extra) {
  const out = { ...base };
  for (const key of ["title", "authors", "journal", "doi", "year"]) {
    const value = extra?.[key];
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

/**
 * Enrichit les métadonnées devinées. Retourne { meta, source } où source vaut
 * "zotero", "crossref" ou "texte" — la fiche l'affiche pour dire quand relire.
 */
export async function resolveArticleMeta({ path = "", guessed = {} } = {}, deps = {}) {
  const fromZotero = deps.zoteroMeta ? deps.zoteroMeta(path, deps) : zoteroMeta(path, deps);
  if (fromZotero) {
    // Zotero d'abord : c'est la notice que Thierry a déjà corrigée à la main
    return { meta: merge(guessed, fromZotero), source: "zotero" };
  }
  const doi = guessed.doi || basename(String(path));
  const fromCrossref = await (deps.crossrefMeta ?? crossrefMeta)(guessed.doi || doi, deps);
  if (fromCrossref) return { meta: merge(guessed, fromCrossref), source: "crossref" };
  return { meta: guessed, source: "texte" };
}
