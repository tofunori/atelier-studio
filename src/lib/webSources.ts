// Moisson des sources d'un message : les recherches web ne renvoient JAMAIS
// d'URL de résultat dans leurs événements — les liens n'existent que dans le
// markdown de la réponse. Ce module est pur : aucun réseau, aucune donnée
// inventée, on ne montre que ce que le message contient déjà.

export type WebSource = { url: string; label: string | null; domain: string };

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL = /https?:\/\/[^\s<>()"']+/g;

/** Ponctuation de fin de phrase collée à une URL nue : elle n'en fait pas partie. */
function trimPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/, "");
}

/** Clé de dédoublonnage : même page, fragment et « / » final mis à part. */
function normalize(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = "";
    const s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function harvestWebSources(
  markdown: string,
  cap = 6,
): { sources: WebSource[]; more: number } {
  const found: WebSource[] = [];
  const seen = new Set<string>();
  const taken: Array<[number, number]> = [];

  const push = (rawUrl: string, label: string | null) => {
    const url = trimPunct(rawUrl);
    const key = normalize(url);
    const domain = key === null ? null : domainOf(url);
    if (key === null || domain === null || domain === "") return;
    if (seen.has(key)) return; // le premier vu garde son label
    seen.add(key);
    found.push({ url, label, domain });
  };

  for (const m of markdown.matchAll(MD_LINK)) {
    taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    push(m[2], m[1].trim() || null);
  }
  for (const m of markdown.matchAll(BARE_URL)) {
    const at = m.index ?? 0;
    if (taken.some(([a, b]) => at >= a && at < b)) continue; // déjà pris en lien markdown
    push(m[0], null);
  }

  return { sources: found.slice(0, cap), more: Math.max(0, found.length - cap) };
}
