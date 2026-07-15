import { pathToFileURL } from "node:url";
import { extractPdfPages, passageLink, resolveZoteroPdf, searchPassages } from "./zotero_passages.mjs";

function parseArgs(argv) {
  const command = argv[0];
  if (command !== "search") throw new Error("Usage: atelier-zotero-passages search --pdf <path> --zotero-key <key> --pdf-key <key> --pdf-file <name> --query <question> [--limit 5]");
  const options = {};
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--") || i + 1 >= argv.length) throw new Error(`Argument invalide: ${key}`);
    options[key.slice(2)] = argv[++i];
  }
  for (const required of ["pdf", "zotero-key", "pdf-key", "pdf-file", "query"]) {
    if (!options[required]) throw new Error(`Argument requis: --${required}`);
  }
  return options;
}

export function runPassageSearch(argv, deps = {}) {
  const options = parseArgs(argv);
  const pdfPath = (deps.resolvePdf ?? resolveZoteroPdf)(options.pdf);
  const extracted = (deps.extractPages ?? extractPdfPages)(pdfPath);
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
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
