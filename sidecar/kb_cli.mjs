// CLI terminal de la base de connaissances (plan 049) — JSON sur stdout,
// erreurs sur stderr + exit 1, comme atelier-zotero-passages.
import { pathToFileURL } from "node:url";
import { KnowledgeStore, defaultKnowledgeDir, parseGbrainSearch, runGbrain } from "./knowledge.mjs";

const COMMANDS = new Set(["add", "list", "remove", "search", "gbrain-search"]);
const USAGE = [
  "Usage: atelier-kb <add|list|remove|search|gbrain-search> [options]",
  "  add    --kind file|pdf|web|youtube|note|folder|gbrain [--origin <chemin|url|slug>] [--title <t>] [--text <t>]",
  "         (--text - lit le texte sur stdin — gros contenus, capture browser)",
  "  list",
  "  remove --id <id>",
  "  search --id <id> --query <question> [--limit 5]",
  "  gbrain-search --query <mots-clés> [--limit 12]   (corpus NAS)",
  `Option commune: --dir <répertoire> (défaut: ${defaultKnowledgeDir()})`,
].join("\n");

async function readAllStdin(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

// Citations (plan 049 T5) : chaque passage porte `location`, `cite` (la forme
// exacte exigée par le bloc <atelier-kb>) et un lien ouvrable quand il existe.
// T6 ajoute passage.file (dossiers), T8 passage.timestamp (YouTube).
function decoratePassage(source, passage) {
  const out = { ...passage };
  if (typeof passage.timestamp === "number") {
    const mm = Math.floor(passage.timestamp / 60);
    const ss = String(Math.floor(passage.timestamp % 60)).padStart(2, "0");
    out.location = `${mm}:${ss}`;
    out.cite = `[kb:${source.id} · ${mm}:${ss}]`;
    if (source.origin) {
      const sep = source.origin.includes("?") ? "&" : "?";
      out.markdownLink = `[Ouvrir à ${mm}:${ss}](${source.origin}${sep}t=${Math.floor(passage.timestamp)}s)`;
    }
    return out;
  }
  if (passage.file) {
    out.location = passage.file;
    out.cite = `[kb:${source.id} · ${passage.file}]`;
    return out;
  }
  if (source.kind === "pdf") {
    out.location = `p.${passage.page}`;
    out.cite = `[kb:${source.id} · p.${passage.page}]`;
    return out;
  }
  if (source.kind === "gbrain" && source.origin) {
    out.location = source.origin;
    out.cite = `[kb:${source.id} · ${source.origin}]`;
    return out;
  }
  out.location = null;
  out.cite = `[kb:${source.id}]`;
  if (source.kind === "web" && source.origin) {
    out.markdownLink = `[Ouvrir la page](${source.origin})`;
  } else if (source.kind === "file" && source.origin) {
    out.markdownLink = `[${source.origin}](${source.origin})`;
  }
  return out;
}

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
  // Registre récupéré d'une corruption : signalé dans chaque réponse.
  const flag = (payload) => (store.warning ? { ...payload, warning: store.warning } : payload);
  if (command === "list") {
    const sources = store.list();
    return flag({ ok: true, count: sources.length, sources });
  }
  if (command === "remove") {
    if (!options.id) throw new Error("Argument requis: --id");
    store.remove(options.id);
    return flag({ ok: true, removed: options.id });
  }
  if (command === "gbrain-search") {
    if (!options.query) throw new Error("Argument requis: --query");
    const limit = Math.max(1, Math.min(25, Number(options.limit) || 12));
    const raw = (deps.runGbrain ?? runGbrain)(["search", options.query]);
    const results = parseGbrainSearch(raw).slice(0, limit);
    return { ok: true, query: options.query, count: results.length, results };
  }
  if (command === "search") {
    for (const required of ["id", "query"]) {
      if (!options[required]) throw new Error(`Argument requis: --${required}`);
    }
    const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
    const { source, passages } = store.search(options.id, options.query, { limit });
    const decorated = passages.map((passage) => decoratePassage(source, passage));
    return flag({ ok: true, source, query: options.query, count: decorated.length, passages: decorated });
  }
  const text = options.text === "-" ? await readAllStdin(deps.stdin) : options.text;
  const { source, refreshed } = await store.add({
    kind: options.kind, origin: options.origin, title: options.title, text,
  });
  return flag({ ok: true, source, refreshed });
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
