import { watchFile, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const QUOTE_FILE = join(homedir(), ".claude/fig-last-quote.txt");

/** Surveille le fichier d'annotation/citation d'atelier (fig-annotate-server)
 *  et pousse chaque nouveau contenu aux clients. */
export function watchAnnotations(broadcast) {
  let last = existsSync(QUOTE_FILE) ? readFileSync(QUOTE_FILE, "utf8") : "";
  watchFile(QUOTE_FILE, { interval: 1000 }, () => {
    try {
      const content = readFileSync(QUOTE_FILE, "utf8");
      if (content && content !== last) {
        last = content;
        broadcast({ type: "annotation", text: content });
      }
    } catch {}
  });
}
