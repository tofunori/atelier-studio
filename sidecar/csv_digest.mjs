// CSV dans la base de connaissances — un tableau n'est PAS un texte. Verser
// 200 000 lignes dans une source noierait la fenêtre de contexte pour un
// résultat pire qu'un résumé : ce qu'on veut savoir d'un tableau, c'est ce
// qu'il y a dedans (colonnes, types, étendues, trous), pas sa 40 000ᵉ ligne.
// Petit fichier → tel quel. Gros fichier → profil + échantillon, en le disant.

export const CSV_FULL_MAX = 40_000;
export const CSV_HEAD_ROWS = 15;
export const CSV_TAIL_ROWS = 5;
const CSV_SNIFF_LINES = 20;
const CSV_EXAMPLES = 3;

/** Séparateur le plus régulier sur les premières lignes — pas le plus fréquent
 *  en tout : une colonne de prose pleine de virgules fausserait le compte. */
export function sniffDelimiter(raw) {
  const lines = String(raw ?? "").split("\n").filter((l) => l.trim()).slice(0, CSV_SNIFF_LINES);
  if (!lines.length) return ",";
  let best = { delim: ",", score: -1 };
  for (const delim of [",", ";", "\t", "|"]) {
    const counts = lines.map((line) => splitLine(line, delim).length);
    const first = counts[0];
    if (first < 2) continue;
    // régulier = toutes les lignes ont le même nombre de champs
    const constant = counts.every((n) => n === first);
    const score = (constant ? 1000 : 0) + first;
    if (score > best.score) best = { delim, score };
  }
  return best.delim;
}

/** Découpe une ligne en respectant les guillemets doubles (`""` échappe `"`). */
export function splitLine(line, delim) {
  const out = [];
  let field = "";
  let quoted = false;
  const text = String(line ?? "");
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Lignes logiques : un champ entre guillemets peut contenir des retours. */
export function parseRows(raw, delim) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const rows = [];
  let line = "";
  let quotes = 0;
  for (const chunk of text.split("\n")) {
    line = line ? `${line}\n${chunk}` : chunk;
    quotes += (chunk.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      if (line.trim()) rows.push(splitLine(line, delim));
      line = "";
    }
  }
  if (line.trim()) rows.push(splitLine(line, delim));
  return rows;
}

const NUM_RE = /^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}(?:-\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const BOOL_RE = /^(true|false|vrai|faux|oui|non|yes|no)$/i;

function classify(values) {
  const filled = values.filter((v) => v !== "" && v != null);
  if (!filled.length) return { type: "vide", filled: 0 };
  const nums = filled.filter((v) => NUM_RE.test(v));
  if (nums.length === filled.length) {
    const parsed = nums.map((v) => Number(String(v).replace(",", ".")));
    const min = Math.min(...parsed);
    const max = Math.max(...parsed);
    const mean = parsed.reduce((a, b) => a + b, 0) / parsed.length;
    return { type: "nombre", filled: filled.length, min, max, mean };
  }
  if (filled.every((v) => DATE_RE.test(v))) {
    const sorted = [...filled].sort();
    return { type: "date", filled: filled.length, min: sorted[0], max: sorted[sorted.length - 1] };
  }
  if (filled.every((v) => BOOL_RE.test(v))) return { type: "booléen", filled: filled.length };
  const distinct = new Set(filled);
  return {
    type: "texte",
    filled: filled.length,
    distinct: distinct.size,
    examples: [...distinct].slice(0, CSV_EXAMPLES),
  };
}

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|");
const round = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))));

function mdTable(header, rows) {
  const head = `| ${header.map(cell).join(" | ")} |`;
  const rule = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${header.map((_, i) => cell(r[i])).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

/**
 * Rend le texte à stocker pour un CSV. Petit fichier : son contenu, qui reste
 * la meilleure réponse possible. Gros fichier : ce qu'on peut en dire de vrai,
 * et l'aveu explicite de ce qui n'est pas montré — une source tronquée en
 * silence ferait répondre à côté avec aplomb.
 */
export function csvDigest(raw, { name = "tableau.csv", fullMax = CSV_FULL_MAX } = {}) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("Fichier CSV vide");
  const delim = sniffDelimiter(text);
  const rows = parseRows(text, delim);
  if (!rows.length) throw new Error("Fichier CSV vide");
  const nom = { ",": "virgule", ";": "point-virgule", "\t": "tabulation", "|": "barre" }[delim] ?? delim;
  const header = rows[0];
  const body = rows.slice(1);
  const entete = `${name} — ${body.length} ligne${body.length > 1 ? "s" : ""} × `
    + `${header.length} colonne${header.length > 1 ? "s" : ""} (séparateur : ${nom})`;

  if (text.length <= fullMax) {
    // assez petit pour être lu en entier : ne rien résumer
    return `${entete}\n\n\`\`\`csv\n${text}\n\`\`\``;
  }

  const profil = header.map((col, i) => {
    const info = classify(body.map((r) => r[i]));
    const trous = body.length - info.filled;
    let apercu = "";
    if (info.type === "nombre") apercu = `${round(info.min)} → ${round(info.max)} (moy. ${round(info.mean)})`;
    else if (info.type === "date") apercu = `${info.min} → ${info.max}`;
    else if (info.type === "texte") apercu = `${info.distinct} valeurs · ${info.examples.join(", ")}`;
    return [col || `(colonne ${i + 1})`, info.type, trous ? `${trous} vides` : "complète", apercu];
  });

  return [
    entete,
    "",
    "## Colonnes",
    "",
    mdTable(["colonne", "type", "remplissage", "étendue / valeurs"], profil),
    "",
    `## ${CSV_HEAD_ROWS} premières lignes`,
    "",
    mdTable(header, body.slice(0, CSV_HEAD_ROWS)),
    "",
    `## ${CSV_TAIL_ROWS} dernières lignes`,
    "",
    mdTable(header, body.slice(-CSV_TAIL_ROWS)),
    "",
    `> Aperçu : ${CSV_HEAD_ROWS + CSV_TAIL_ROWS} des ${body.length} lignes sont montrées. `
      + "Le fichier complet est sur disque, à l'origine de cette source.",
  ].join("\n");
}
