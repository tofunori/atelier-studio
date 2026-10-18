// Découpe et marquage du HTML coloré par hljs pour le diff du fil
// (refonte 2026-10-18) : fonctions pures, hors du fichier du composant.
import type { MarkRange } from "./lineDiff";

/** Découpe le HTML de hljs en lignes en refermant puis rouvrant les <span>
 * ouverts à chaque saut de ligne (chaînes et commentaires multilignes). */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (!part) continue;
    if (part === "\n") {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
    } else if (part.startsWith("<span")) {
      open.push(part);
      current += part;
    } else if (part === "</span>") {
      open.pop();
      current += part;
    } else current += part;
  }
  lines.push(current + "</span>".repeat(open.length));
  return lines;
}

/** Entoure de <mark> les plages [début, fin[ comptées en caractères du texte
 * (les entités HTML comptent pour un caractère). */
export function markHtml(html: string, ranges: MarkRange[]): string {
  if (!ranges.length) return html;
  let out = "";
  let pos = 0;
  const inRange = (at: number) => ranges.some(([from, to]) => at >= from && at < to);
  for (const part of html.split(/(<[^>]+>)/)) {
    if (!part) continue;
    if (part.startsWith("<")) { out += part; continue; }
    const chars = part.match(/&[#\w]+;|[\s\S]/gu) ?? [];
    let marked = false;
    for (const ch of chars) {
      const want = inRange(pos);
      if (want !== marked) { out += want ? "<mark>" : "</mark>"; marked = want; }
      out += ch;
      pos++;
    }
    if (marked) out += "</mark>";
  }
  return out;
}
