import { pathToFileURL } from "node:url";
import { extractPdfPages, passageLink, resolveZoteroPdf, searchCorpus, searchPassages } from "./zotero_passages.mjs";

const BOOLEAN_FLAGS = new Set(["corpus"]);

function parseArgs(argv) {
  const command = argv[0];
  if (command !== "search") {
    throw new Error(
      "Usage: atelier-zotero-passages search --pdf <path> --zotero-key <key> --pdf-key <key> --pdf-file <name> --query <question> [--limit 5]\n" +
      "   or: atelier-zotero-passages search --corpus --query <question> [--limit 5]",
    );
  }
  const options = {};
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Argument invalide: ${key}`);
    const name = key.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      options[name] = true;
      continue;
    }
    if (i + 1 >= argv.length) throw new Error(`Argument invalide: ${key}`);
    options[name] = argv[++i];
  }
  const required = options.corpus ? ["query"] : ["pdf", "zotero-key", "pdf-key", "pdf-file", "query"];
  for (const name of required) {
    if (!options[name]) throw new Error(`Argument requis: --${name}`);
  }
  return options;
}

export function runPassageSearch(argv, deps = {}) {
  const options = parseArgs(argv);
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
  if (options.corpus) {
    const corpus = (deps.searchCorpus ?? searchCorpus)({ query: options.query, limit });
    return { ok: true, corpus: true, query: options.query, count: corpus.results.length, results: corpus.results };
  }
  const pdfPath = (deps.resolvePdf ?? resolveZoteroPdf)(options.pdf);
  const extracted = (deps.extractPages ?? extractPdfPages)(pdfPath, {
    zoteroKey: options["zotero-key"], pdfKey: options["pdf-key"], pdfFile: options["pdf-file"],
  });
  const passages = searchPassages(extracted.pages, options.query, { limit }).map((entry) => ({
    ...entry,
    markdownLink: `[Ouvrir le passage — p. ${entry.page}](${passageLink({
      zoteroKey: options["zotero-key"], pdfKey: options["pdf-key"], pdfFile: options["pdf-file"],
      page: entry.page, quote: entry.quote,
    })})`,
  }));
  return { ok: true, pdf: pdfPath, cached: extracted.cached, query: options.query, count: passages.length, passages };
}

export function main(argv = process.argv.slice(2)) {
  try {
    process.stdout.write(`${JSON.stringify(runPassageSearch(argv))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
