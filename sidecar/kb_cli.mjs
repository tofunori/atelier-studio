// CLI terminal de la base de connaissances (plan 049) — JSON sur stdout,
// erreurs sur stderr + exit 1, comme atelier-zotero-passages.
import { pathToFileURL } from "node:url";
import { KnowledgeStore, defaultKnowledgeDir } from "./knowledge.mjs";

const COMMANDS = new Set(["add", "list", "remove", "search"]);
const USAGE = [
  "Usage: atelier-kb <add|list|remove|search> [options]",
  "  add    --kind file|pdf|web|note [--origin <chemin|url>] [--title <t>] [--text <t>]",
  "  list",
  "  remove --id <id>",
  "  search --id <id> --query <question> [--limit 5]",
  `Option commune: --dir <répertoire> (défaut: ${defaultKnowledgeDir()})`,
].join("\n");

function parseArgs(argv) {
  const command = argv[0];
  if (!COMMANDS.has(command ?? "")) throw new Error(USAGE);
  const options = {};
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--") || i + 1 >= argv.length) throw new Error(`Argument invalide: ${key}\n${USAGE}`);
    options[key.slice(2)] = argv[++i];
  }
  return { command, options };
}

export async function runKbCommand(argv, deps = {}) {
  const { command, options } = parseArgs(argv);
  const store = deps.store ?? new KnowledgeStore(options.dir || undefined, deps);
  if (command === "list") {
    const sources = store.list();
    return { ok: true, count: sources.length, sources };
  }
  if (command === "remove") {
    if (!options.id) throw new Error("Argument requis: --id");
    store.remove(options.id);
    return { ok: true, removed: options.id };
  }
  if (command === "search") {
    for (const required of ["id", "query"]) {
      if (!options[required]) throw new Error(`Argument requis: --${required}`);
    }
    const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
    const { source, passages } = store.search(options.id, options.query, { limit });
    return { ok: true, source, query: options.query, count: passages.length, passages };
  }
  const { source, refreshed } = await store.add({
    kind: options.kind, origin: options.origin, title: options.title, text: options.text,
  });
  return { ok: true, source, refreshed };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    process.stdout.write(`${JSON.stringify(await runKbCommand(argv))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
