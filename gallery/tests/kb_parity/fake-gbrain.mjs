#!/usr/bin/env node
// Faux binaire gbrain pour fixtures de parité (plan 065 C2) — jamais le NAS
// réel. Reproduit juste assez du contrat observé dans knowledge.mjs/article.mjs
// pour figer un comportement déterministe et rejouable :
//   get <slug>        -> markdown stocké, ou "Error [page_not_found]: <slug>"
//   search <query>     -> lignes "[score] slug -- snippet" ou "No results."
//   put <slug>         -> lit stdin, stocke, imprime "OK <slug>"
//   list --type T -n N -> lignes slug\ttype\tdate\ttitre (+ bannière parasite
//                          optionnelle, FAKE_GBRAIN_BANNER=1 — KBG-10/11)
//   capture <text>      -> imprime "Captured -> inbox/<hash>"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Mode panne (plan 065, vague 5, KBG-10/11/13) : simule un binaire gbrain
// injoignable/en échec, AVANT tout accès au store — runGbrain/run_gbrain
// (côté Node/Rust) doivent produire la même erreur, quelle que soit la
// commande demandée.
//   FAKE_GBRAIN_FAIL=1       -> échec immédiat (exit 1, message sur stderr)
//   FAKE_GBRAIN_FAIL=TIMEOUT -> ne répond jamais (le disjoncteur 20s de
//                                l'appelant doit tuer le process lui-même)
const FAIL_MODE = process.env.FAKE_GBRAIN_FAIL;
if (FAIL_MODE === "1") {
  process.stderr.write("fake-gbrain: panne simulee (fixture FAKE_GBRAIN_FAIL=1)\n");
  process.exit(1);
}
if (FAIL_MODE === "TIMEOUT") {
  // Ne jamais répondre : garde le process vivant sans produire de sortie ni
  // toucher au store, jusqu'à ce que l'appelant (spawnSync timeout /
  // spawn_with_timeout) tue ce process lui-même après GBRAIN_TIMEOUT_MS
  // (20s, les deux moteurs) — setInterval seul ne suffit pas à arrêter
  // l'exécution synchrone qui suit, d'où le early-exit via process ici.
  setInterval(() => {}, 1_000_000);
} else {
  const STORE = process.env.FAKE_GBRAIN_STORE;
  if (!STORE) { process.stderr.write("FAKE_GBRAIN_STORE requis\n"); process.exit(2); }
  mkdirSync(STORE, { recursive: true });
  const dbPath = join(STORE, "db.json");
  const loadDb = () => {
    try { return JSON.parse(readFileSync(dbPath, "utf8")); } catch { return { pages: {} }; }
  };
  const saveDb = (db) => writeFileSync(dbPath, JSON.stringify(db, null, 2));

  const [cmd, ...rest] = process.argv.slice(2);
  const db = loadDb();

  const readStdin = () => {
    try { return readFileSync(0, "utf8"); } catch { return ""; }
  };

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
    // Bannière d'auto-mise à jour du vrai CLI gbrain (KBG-10/11) : une ligne
    // SANS 4 colonnes tab-séparées, que parseArticleList/parse_article_list
    // doivent ignorer silencieusement plutôt que planter ou compter un
    // article fantôme.
    const banner = process.env.FAKE_GBRAIN_BANNER === "1"
      ? "gbrain 4.2.0 -> une nouvelle version est disponible (4.3.0)\n"
      : "";
    process.stdout.write(`${banner}${rows.join("\n")}${rows.length ? "\n" : ""}`);
    process.exit(0);
  } else if (cmd === "capture") {
    process.stdout.write("Captured -> inbox/fixture-capture\n");
    process.exit(0);
  } else {
    process.stderr.write(`fake-gbrain: commande inconnue ${cmd}\n`);
    process.exit(1);
  }
}
