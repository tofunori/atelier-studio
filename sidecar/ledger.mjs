import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const DEFAULT_DIR = join(homedir(), "Library", "Application Support", "atelier-studio", "ledger");

export function slugFor(projectRoot) {
  const base = basename(String(projectRoot ?? "").trim()) || "default";
  return base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function ledgerDir(baseDir) {
  return baseDir ?? process.env.ATELIER_LEDGER_DIR ?? DEFAULT_DIR;
}

function ledgerPath(projectRoot, baseDir) {
  return join(ledgerDir(baseDir), `${slugFor(projectRoot)}.jsonl`);
}

export async function append(projectRoot, entry, opts = {}) {
  const dir = ledgerDir(opts.baseDir);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await appendFile(ledgerPath(projectRoot, opts.baseDir), line, "utf8");
}

export async function get(projectRoot, limit = 200, opts = {}) {
  const max = Math.max(1, Math.min(1000, Number(limit) || 200));
  let text = "";
  try {
    text = await readFile(ledgerPath(projectRoot, opts.baseDir), "utf8");
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-max)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

/** Entrées récentes tous projets confondus (pour l'usage global).
 * N'avale que l'absence de dossier/fichier et les lignes corrompues, une à
 * une — jamais une erreur de programmation. */
export async function getAll(limit = 500, opts = {}) {
  const max = Math.max(1, Math.min(5000, Number(limit) || 500));
  const dir = ledgerDir(opts.baseDir);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return []; // aucun ledger encore écrit
  }
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".jsonl")) continue;
    let text;
    try {
      text = await readFile(join(dir, f), "utf8");
    } catch {
      continue; // fichier disparu entre readdir et lecture
    }
    for (const line of text.split(/\r?\n/).filter((l) => l.trim()).slice(-max)) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // ligne corrompue isolée : on garde le reste du fichier
      }
    }
  }
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, max);
}
