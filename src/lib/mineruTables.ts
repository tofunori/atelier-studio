// MinerU rend les tableaux en HTML brut (`<table><tr><td>…`), jamais en
// markdown. Le rendu de l'app échappe le HTML — sans conversion, on lirait les
// balises. Plutôt que d'autoriser le HTML brut (et de devoir l'assainir, sur du
// contenu produit par un convertisseur), on retranscrit ces tableaux en
// markdown GFM : remark-gfm les affiche, et les cellules sont échappées.

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

/** Contenu d'une cellule : entités décodées, balises internes ôtées, `|`
 *  échappé (sinon il coupe la colonne), retours à la ligne aplatis. */
export function cellText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function tableToMarkdown(inner: string): string | null {
  const rows: string[][] = [];
  for (const row of inner.matchAll(ROW_RE)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(CELL_RE)) cells.push(cellText(cell[2]));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return null;
  // Un tableau markdown est rectangulaire : on aligne sur la ligne la plus
  // large plutôt que de perdre des cellules en fin de ligne.
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const [head, ...body] = rows;
  const lignes = [
    `| ${pad(head).join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return `\n\n${lignes.join("\n")}\n\n`;
}

/** Remplace chaque `<table>` du markdown par son équivalent GFM. Le reste du
 *  document n'est pas touché : ce qui n'est pas un tableau reste tel quel. */
export function mineruTablesToMarkdown(markdown: string): string {
  return String(markdown ?? "").replace(TABLE_RE, (whole, inner: string) =>
    tableToMarkdown(inner) ?? whole);
}

export type PageFrontMatter = {
  title?: string;
  authors?: string;
  year?: number | null;
  journal?: string;
  doi?: string;
  origin?: string;
  converter?: string;
};

const SCALAR = /^([a-z_]+):\s*(.*)$/i;

/**
 * Front matter YAML d'une page gbrain → fiche d'en-tête. Analyse volontairement
 * étroite : scalaires, blocs pliés (`>-`) et listes à tirets, ce que produit
 * `buildArticlePage` et rien d'autre. Retourne aussi le corps, sans l'en-tête —
 * ouvrir un article sur douze lignes de YAML, c'est commencer par la plomberie.
 */
export function splitFrontMatter(markdown: string): { meta: PageFrontMatter; body: string } {
  const text = String(markdown ?? "");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  const lignes = m[1].split("\n");
  let clef = "";
  let plie: string[] = [];
  const vider = () => {
    if (clef && plie.length) meta[clef] = plie.join(" ").trim();
    plie = [];
  };
  for (const ligne of lignes) {
    if (/^\s/.test(ligne) && clef) {
      // continuation : bloc plié `>-` ou élément de liste `- '…'`
      plie.push(ligne.trim().replace(/^-\s*/, "").replace(/^'(.*)'$/, "$1"));
      continue;
    }
    vider();
    const s = SCALAR.exec(ligne);
    if (!s) { clef = ""; continue; }
    clef = s[1].toLowerCase();
    const valeur = s[2].trim();
    if (valeur === ">-" || valeur === "|" || valeur === "") continue;
    meta[clef] = valeur.replace(/^["'](.*)["']$/, "$1");
    clef = "";
  }
  vider();
  const annee = Number(meta.year);
  return {
    meta: {
      title: meta.title,
      authors: meta.authors,
      year: Number.isFinite(annee) ? annee : null,
      journal: meta.journal,
      doi: meta.doi,
      origin: meta.origin,
      converter: meta.converter,
    },
    body: text.slice(m[0].length),
  };
}
