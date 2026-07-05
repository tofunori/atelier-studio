import { appendFile, mkdir, readFile } from "node:fs/promises";
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
