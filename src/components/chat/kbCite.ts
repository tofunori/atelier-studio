// Citations de la base de connaissances (plan 052) : dans le texte rendu,
// « [kb:1d00b498 · p.4] » devient une pilule lisible portant le TITRE réel
// de la source — l'id hexadécimal reste dans l'historique brut, jamais à
// l'écran. Pur : la liste des sources est passée par l'appelant.
import type { KbSource } from "../../lib/kbSources";

const KB_CITE = /\[((?:kb:[0-9a-f]{6,12})(?:\s*[·,]\s*[^\]]*)?)\]/g;

function labelFor(part: string, sources: KbSource[]): string | null {
  const m = /^kb:([0-9a-f]{6,12})(?:\s*·\s*(.+))?$/.exec(part.trim());
  if (!m) return null;
  const [, id, loc] = m;
  const title = sources.find((s) => s.id === id)?.title;
  const short = title
    ? (title.length > 34 ? `${title.slice(0, 33)}…` : title)
    : `source ${id.slice(0, 6)}`;
  const clean = short.replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const label = loc ? `${clean} · ${loc.trim()}` : clean;
  return `[${label}](#atelier-kb-src?id=${id})`;
}

export function decorateKbCites(text: string, sources: KbSource[]): string {
  if (!text.includes("[kb:")) return text;
  return text.replace(KB_CITE, (whole, inner: string) => {
    // « kb:a · p.4 » ou « kb:a, kb:b » — chaque id devient sa pilule
    const parts = inner.split(/,\s*/).map((part) => labelFor(part, sources));
    if (parts.some((part) => part === null)) return whole;
    return (parts as string[]).join(" ");
  });
}
