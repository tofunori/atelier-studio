#!/usr/bin/env node
// Faux binaire gbrain pour fixtures de parité (plan 065 C2) — jamais le NAS
// réel. Reproduit juste assez du contrat observé dans knowledge.mjs/article.mjs
// pour figer un comportement déterministe et rejouable :
//   get <slug>        -> markdown stocké, ou "Error [page_not_found]: <slug>"
//   search <query>     -> lignes "[score] slug -- snippet" ou "No results."
//   put <slug>         -> lit stdin, stocke, imprime "OK <slug>"
//   list --type T -n N -> lignes slug\ttype\tdate\ttitre
//   capture <text>      -> imprime "Captured -> inbox/<hash>"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STORE = process.env.FAKE_GBRAIN_STORE;
if (!STORE) { process.stderr.write("FAKE_GBRAIN_STORE requis\n"); process.exit(2); }
mkdirSync(STORE, { recursive: true });
const dbPath = join(STORE, "db.json");
function loadDb() {
  try { return JSON.parse(readFileSync(dbPath, "utf8")); } catch { return { pages: {} }; }
}
function saveDb(db) { writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

const [cmd, ...rest] = process.argv.slice(2);
const db = loadDb();

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

if (cmd === "get") {
  const slug = rest[0];
  const page = db.pages[slug];
  if (!page) {
    process.stdout.write(`Error [page_not_found]: ${slug}\n`);
    process.exit(0);
  }
  process.stdout.write(page);
  process.exit(0);
} else if (cmd === "put") {
  const slug = rest[0];
  const markdown = readStdin();
  db.pages[slug] = markdown;
  saveDb(db);
  process.stdout.write(`OK ${slug}\n`);
  process.exit(0);
} else if (cmd === "search") {
  const query = rest[0] ?? "";
  const hits = Object.entries(db.pages).filter(([slug, md]) =>
    slug.toLowerCase().includes(query.toLowerCase()) || md.toLowerCase().includes(query.toLowerCase()));
  if (!hits.length) {
    process.stdout.write("No results.\n");
    process.exit(0);
  }
  for (const [slug, md] of hits) {
    const snippet = md.replace(/^---[\s\S]*?---/, "").trim().slice(0, 80).replace(/\n/g, " ");
    process.stdout.write(`[0.91] ${slug} -- ${snippet}\n`);
  }
  process.exit(0);
} else if (cmd === "list") {
  // list --type article -n 20
  const typeIdx = rest.indexOf("--type");
  const type = typeIdx >= 0 ? rest[typeIdx + 1] : "page";
  const nIdx = rest.indexOf("-n");
  const n = nIdx >= 0 ? Number(rest[nIdx + 1]) : 20;
  const rows = Object.keys(db.pages)
    .filter((slug) => slug.startsWith(`${type === "article" ? "articles" : type}/`))
    .slice(0, n)
    .map((slug) => {
      const md = db.pages[slug];
      const title = /^title:\s*"?([^"\n]+)"?/m.exec(md)?.[1] ?? slug;
      return `${slug}\tarticle\t2026-08-15\t${title}`;
    });
  process.stdout.write(`${rows.join("\n")}${rows.length ? "\n" : ""}`);
  process.exit(0);
} else if (cmd === "capture") {
  process.stdout.write("Captured -> inbox/fixture-capture\n");
  process.exit(0);
} else {
  process.stderr.write(`fake-gbrain: commande inconnue ${cmd}\n`);
  process.exit(1);
}
