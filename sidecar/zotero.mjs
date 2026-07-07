import { DatabaseSync } from "node:sqlite";
import { copyFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";

// Bibliothèque Zotero — lecture directe de zotero.sqlite (copie fraîche,
// readonly : fonctionne que Zotero soit ouvert ou non ; jamais d'écriture
// dans la base de Zotero).

const ZOTERO_DIR = join(homedir(), "Zotero");
const SRC_DB = join(ZOTERO_DIR, "zotero.sqlite");
const CACHE_DIR = join(homedir(), "Library/Application Support/atelier-studio");
const COPY_DB = join(CACHE_DIR, "zotero-read.sqlite");

let db = null;
let copiedMtime = 0;

export function available() {
  return existsSync(SRC_DB);
}

function ensureFresh() {
  if (!available()) throw new Error("Zotero introuvable (~/Zotero/zotero.sqlite)");
  const mtime = statSync(SRC_DB).mtimeMs;
  if (!db || mtime !== copiedMtime) {
    mkdirSync(CACHE_DIR, { recursive: true });
    if (db) { try { db.close(); } catch {} db = null; }
    copyFileSync(SRC_DB, COPY_DB);
    const wal = SRC_DB + "-wal";
    try { if (existsSync(wal)) copyFileSync(wal, COPY_DB + "-wal"); } catch {}
    db = new DatabaseSync(COPY_DB, { readOnly: true });
    copiedMtime = mtime;
  }
  return db;
}

const BASE_SQL = `
  SELECT i.itemID, i.key, i.dateAdded,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'title'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS title,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'date'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS rawDate,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'publicationTitle'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS publication,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'DOI'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS doi,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'abstractNote'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS abstract,
    (SELECT GROUP_CONCAT(c.lastName, ', ') FROM itemCreators ic
       JOIN creators c ON c.creatorID = ic.creatorID
     WHERE ic.itemID = i.itemID ORDER BY ic.orderIndex) AS creators,
    (SELECT GROUP_CONCAT(t.name, '') FROM itemTags it
       JOIN tags t ON t.tagID = it.tagID WHERE it.itemID = i.itemID) AS tags,
    (SELECT ia.path FROM itemAttachments ia
     WHERE ia.parentItemID = i.itemID AND ia.contentType = 'application/pdf'
       AND ia.path LIKE 'storage:%' LIMIT 1) AS pdfPath,
    (SELECT ai.key FROM itemAttachments ia JOIN items ai ON ai.itemID = ia.itemID
     WHERE ia.parentItemID = i.itemID AND ia.contentType = 'application/pdf'
       AND ia.path LIKE 'storage:%' LIMIT 1) AS pdfKey
  FROM items i
  JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
  WHERE t.typeName NOT IN ('attachment', 'note', 'annotation')
    AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
`;

function rowToItem(r) {
  const year = /(\d{4})/.exec(r.rawDate ?? "")?.[1] ?? "";
  const tags = (r.tags ?? "").split("").filter(Boolean);
  return {
    key: r.key,
    dateAdded: r.dateAdded ?? "",
    title: r.title ?? "(sans titre)",
    creators: r.creators ?? "",
    year,
    publication: r.publication ?? "",
    doi: r.doi ?? "",
    abstract: r.abstract ?? "",
    tags,
    hasPdf: !!r.pdfPath,
    pdfKey: r.pdfKey ?? null,
    pdfFile: r.pdfPath ? r.pdfPath.replace(/^storage:/, "") : null,
  };
}

export function search({ query = "", collectionId = null, tag = null, limit = 400 } = {}) {
  const d = ensureFresh();
  let sql = BASE_SQL;
  const params = [];
  if (collectionId) {
    sql += ` AND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID = ?)`;
    params.push(collectionId);
  }
  if (tag) {
    sql += ` AND i.itemID IN (SELECT itemID FROM itemTags it JOIN tags t ON t.tagID = it.tagID WHERE t.name = ?)`;
    params.push(tag);
  }
  sql += ` ORDER BY i.dateModified DESC LIMIT 2000`;
  let rows = d.prepare(sql).all(...params).map(rowToItem);
  const q = query.trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/);
    rows = rows.filter((it) => {
      const hay = `${it.title} ${it.creators} ${it.year} ${it.publication} ${it.tags.join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  return rows.slice(0, limit);
}

export function collections() {
  const d = ensureFresh();
  return d.prepare(`
    SELECT collectionID AS id, collectionName AS name, parentCollectionID AS parent
    FROM collections
    WHERE collectionID NOT IN (SELECT collectionID FROM deletedCollections)
    ORDER BY collectionName COLLATE NOCASE
  `).all();
}

/** Chemin absolu du PDF d'un item (clé de l'ATTACHMENT). Vérifie le confinement. */
export function pdfAbsolutePath(pdfKey, pdfFile) {
  if (!/^[A-Z0-9]{8}$/i.test(pdfKey ?? "")) return null;
  const clean = String(pdfFile ?? "").replace(/[/\\]/g, "");
  if (!clean.toLowerCase().endsWith(".pdf")) return null;
  const p = join(ZOTERO_DIR, "storage", pdfKey, clean);
  return existsSync(p) ? p : null;
}

/** Clé BibTeX approx (auteur+année) — remplacée par Better BibTeX si présent plus tard. */
export function citeKey(item) {
  const first = (item.creators ?? "").split(",")[0]?.trim().toLowerCase().replace(/[^a-z]/g, "") || "ref";
  return `${first}${item.year || ""}`;
}

// détection de doublons : MD5 (storageHash Zotero, sinon calculé) + nom de fichier
const _md5Cache = new Map(); // chemin absolu -> md5
function fileMd5(p) {
  if (_md5Cache.has(p)) return _md5Cache.get(p);
  const h = createHash("md5").update(readFileSync(p)).digest("hex");
  _md5Cache.set(p, h);
  return h;
}

/** Cherche un PDF identique déjà dans Zotero. Renvoie le titre du parent ou null. */
export function findDuplicate(absPath) {
  const d = ensureFresh();
  if (!d) return null;
  const md5 = fileMd5(absPath);
  const base = basename(absPath).toLowerCase();
  const rows = d.prepare(`
    SELECT ia.path, ia.storageHash, ai.key AS attKey,
      COALESCE((SELECT v.value FROM itemData dd
         JOIN fields f ON f.fieldID = dd.fieldID AND f.fieldName = 'title'
         JOIN itemDataValues v ON v.valueID = dd.valueID
       WHERE dd.itemID = ia.parentItemID), ia.path) AS parentTitle
    FROM itemAttachments ia
    JOIN items ai ON ai.itemID = ia.itemID
    WHERE ia.contentType = 'application/pdf' AND ia.path LIKE 'storage:%'
      AND ai.itemID NOT IN (SELECT itemID FROM deletedItems)
  `).all();
  for (const r of rows) {
    const fname = String(r.path).replace(/^storage:/, "");
    if (r.storageHash && r.storageHash === md5) return String(r.parentTitle);
    if (fname.toLowerCase() === base) {
      // même nom : confirmer par hash du fichier stocké s'il n'a pas de storageHash
      if (r.storageHash) return String(r.parentTitle);
      const stored = join(ZOTERO_DIR, "storage", r.attKey, fname);
      try {
        if (existsSync(stored) && fileMd5(stored) === md5) return String(r.parentTitle);
      } catch {}
      return String(r.parentTitle); // même nom, hash illisible : prudence, considérer doublon
    }
    if (!r.storageHash) {
      const stored = join(ZOTERO_DIR, "storage", r.attKey, fname);
      try {
        if (existsSync(stored) && fileMd5(stored) === md5) return String(r.parentTitle);
      } catch {}
    }
  }
  return null;
}

/** Ajoute des PDF à Zotero via l'API locale du connecteur (port 23119).
 *  Zotero doit tourner ; il importe le fichier puis reconnaît les métadonnées. */
export async function addPdfs(paths = []) {
  const results = [];
  for (const p of paths) {
    const name = basename(String(p));
    try {
      const dup = findDuplicate(String(p));
      if (dup) {
        results.push({ name, ok: false, error: "duplicate", match: dup });
        continue;
      }
      const data = readFileSync(String(p));
      const res = await fetch("http://127.0.0.1:23119/connector/saveStandaloneAttachment", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Metadata": JSON.stringify({
            url: pathToFileURL(String(p)).href,
            title: name,
            sessionID: randomUUID().slice(0, 8),
          }),
        },
        body: data,
      });
      results.push({ name, ok: res.status === 201, status: res.status });
    } catch (e) {
      const off = /ECONNREFUSED|fetch failed/i.test(String(e));
      results.push({ name, ok: false, error: off ? "zotero-off" : String(e) });
    }
  }
  return results;
}
