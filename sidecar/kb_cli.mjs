// CLI terminal de la base de connaissances (plan 049) — JSON sur stdout,
// erreurs sur stderr + exit 1, comme atelier-zotero-passages.
import { pathToFileURL } from "node:url";
import { KnowledgeStore, defaultKnowledgeDir, parseGbrainSearch, promotePage, runGbrain } from "./knowledge.mjs";
import { passageLink } from "./zotero_passages.mjs";

const COMMANDS = new Set(["add", "list", "remove", "search", "gbrain-search", "promote-page", "collection", "tag", "archive"]);
const USAGE = [
  "Usage: atelier-kb <add|list|remove|search|gbrain-search|promote-page> [options]",
  "  add    --kind file|pdf|web|youtube|note|folder|gbrain [--origin <chemin|url|slug>] [--title <t>] [--text <t>]",
  "         (--text - lit le texte sur stdin — gros contenus, capture browser)",
  "  list",
  "  remove --id <id>",
  "  search --id <id> --query <question> [--limit 5]",
  "  gbrain-search --query <mots-clés> [--limit 12]   (corpus NAS)",
  "  promote-page --id <id> [--slug atelier/…] [--write]   (page directe gbrain)",
  "  collection --add <titre> | --rename <slug> --title <t> | --remove <slug>",
  "  tag (--id <id> | --ids a,b,c) --collection <slug> [--off]",
  "  archive (--id <id> | --ids a,b,c) [--off]",
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
  if (source.kind === "pdf" || source.kind === "zotero") {
    out.location = `p.${passage.page}`;
    out.cite = `[kb:${source.id} · p.${passage.page}]`;
    const meta = source.meta ?? {};
    if (source.kind === "zotero" && meta.zoteroKey && meta.pdfKey && meta.pdfFile) {
      // même ancre que les passages Zotero : ouvre le PDF à la page, surligné
      out.markdownLink = `[Ouvrir le passage — p. ${passage.page}](${passageLink({
        zoteroKey: meta.zoteroKey, pdfKey: meta.pdfKey, pdfFile: meta.pdfFile,
        page: passage.page, quote: passage.quote,
      })})`;
    }
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
    if (key === "--write" || key === "--archived" || key === "--off") {
      options[key.slice(2)] = true;
      continue;
    }
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
    const sources = store.list({
      collection: options.collection || null,
      archived: options.archived === true,
    });
    return flag({
      ok: true, count: sources.length, sources,
      collections: store.collections ?? [],
      archivedCount: store.listAll().length - store.list().length,
      archivedSources: store.list({ archived: true }),
    });
  }
  if (command === "collection") {
    if (options.add) {
      const slug = store.collectionOp({ op: "add", title: options.add });
      return flag({ ok: true, slug, collections: store.collections });
    }
    if (options.rename) {
      store.collectionOp({ op: "rename", slug: options.rename, title: options.title });
      return flag({ ok: true, slug: options.rename, collections: store.collections });
    }
    if (options.remove) {
      store.collectionOp({ op: "remove", slug: options.remove });
      return flag({ ok: true, removed: options.remove, collections: store.collections });
    }
    throw new Error(`collection: --add, --rename ou --remove requis\n${USAGE}`);
  }
  if (command === "tag") {
    if (!options.collection) throw new Error("Argument requis: --collection");
    if (options.ids) {
      const ids = String(options.ids).split(",").map((x) => x.trim()).filter(Boolean);
      const applied = store.tagMany(ids, options.collection, options.off === true);
      return flag({ ok: true, applied });
    }
    if (!options.id) throw new Error("Argument requis: --id (ou --ids a,b,c)");
    store.tagSource(options.id, options.collection, options.off === true);
    return flag({ ok: true, source: store.get(options.id) });
  }
  if (command === "archive") {
    if (options.ids) {
      const ids = String(options.ids).split(",").map((x) => x.trim()).filter(Boolean);
      const applied = store.archiveMany(ids, options.off === true);
      return flag({ ok: true, applied });
    }
    if (!options.id) throw new Error("Argument requis: --id (ou --ids a,b,c)");
    store.archiveSource(options.id, options.off === true);
    return flag({ ok: true, source: store.get(options.id) });
  }
  if (command === "remove") {
    if (!options.id) throw new Error("Argument requis: --id");
    store.remove(options.id);
    return flag({ ok: true, removed: options.id });
  }
  if (command === "promote-page") {
    if (!options.id) throw new Error("Argument requis: --id");
    return promotePage(store, {
      id: options.id,
      slug: options.slug,
      write: options.write === true,
    }, deps);
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
