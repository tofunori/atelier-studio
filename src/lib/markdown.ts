// Préparation pure du markdown avant ReactMarkdown : normalisation des
// délimiteurs LaTeX et durcissement du markdown partiel reçu en streaming.
// Aucune dépendance React/DOM ici — fonctions testables isolément.

type Segment = { code: boolean; value: string };

/**
 * Découpe `text` en segments code/prose en respectant les fences ``` puis
 * l'inline code ` ` (backtick simple). Les segments `code: true` ne doivent
 * jamais être transformés par les fonctions de prose ci-dessous.
 */
export function splitCodeSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const n = text.length;
  // `start` : début du segment de prose pas encore poussé dans `segments`.
  // `scan` : position à partir de laquelle chercher le prochain backtick —
  // distinct de `start` uniquement quand un backtick isolé (jamais refermé)
  // reste littéral en prose : on avance `scan` sans flusher `start`.
  let start = 0;
  let scan = 0;

  while (scan < n) {
    const tick = text.indexOf("`", scan);
    if (tick === -1) break;

    if (text.startsWith("```", tick)) {
      const end = text.indexOf("```", tick + 3);
      if (start < tick) segments.push({ code: false, value: text.slice(start, tick) });
      if (end === -1) {
        // fence jamais refermée : le reste du texte est du code, jamais touché
        segments.push({ code: true, value: text.slice(tick) });
        return segments;
      }
      segments.push({ code: true, value: text.slice(tick, end + 3) });
      start = end + 3;
      scan = start;
      continue;
    }

    const end = text.indexOf("`", tick + 1);
    if (end === -1) {
      // backtick isolé, jamais refermé : caractère littéral, on reste en prose
      scan = tick + 1;
      continue;
    }
    if (start < tick) segments.push({ code: false, value: text.slice(start, tick) });
    segments.push({ code: true, value: text.slice(tick, end + 1) });
    start = end + 1;
    scan = start;
  }

  if (start < n) segments.push({ code: false, value: text.slice(start, n) });
  return segments;
}

// \[...\] avant \(...\) : ordre indifférent, les motifs ne se chevauchent pas.
const DISPLAY_MATH_RE = /\\\[([\s\S]*?)\\\]/g;
const INLINE_MATH_RE = /\\\(([\s\S]*?)\\\)/g;

function transformMathDelimiters(prose: string): string {
  return prose
    .replace(DISPLAY_MATH_RE, (_match, inner: string) => `$$${inner}$$`)
    .replace(INLINE_MATH_RE, (_match, inner: string) => `$${inner}$`);
}

/**
 * Convertit les délimiteurs LaTeX \(...\) et \[...\] (émis par les modèles)
 * en $...$ et $$...$$ (compris par remark-math), sans jamais toucher au
 * contenu d'un bloc de code ni de l'inline code.
 */
export function normalizeMathDelimiters(text: string): string {
  if (!text) return text;
  return splitCodeSegments(text)
    .map((seg) => (seg.code ? seg.value : transformMathDelimiters(seg.value)))
    .join("");
}

/**
 * Retire le contenu des blocs ``` (fences supposées déjà équilibrées) — sert
 * uniquement à compter les backticks simples "hors code" ci-dessous, sans
 * dupliquer le scanner de segments utilisé pour la normalisation LaTeX.
 */
function stripFencedBlocks(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("```", i);
    if (start === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, start);
    const end = text.indexOf("```", start + 3);
    if (end === -1) break; // ne devrait pas arriver : fences déjà équilibrées
    i = end + 3;
  }
  return result;
}

// Lien/image en cours de frappe, EN FIN DE TEXTE seulement : "[label](" ou
// "[label](url-partielle". Le href exclut les espaces — une vraie URL n'en
// contient pas, donc un espace après "(" signale une phrase qui continue
// (lien en milieu de texte), qu'on laisse intact.
const DANGLING_LINK_RE = /!?\[([^\]\n]*)\]\(([^)\s]*)$/;

// Puce de liste "* item" en tête de ligne : jamais une emphase, on la retire
// avant de compter les astérisques restants.
const LIST_BULLET_STAR_RE = /^[ \t]*\*(?=[ \t]|$)/gm;
// "2 * 3" / "2 ** 3" : astérisque(s) entouré(s) d'espaces des deux côtés —
// jamais flanquant au sens CommonMark, donc jamais une emphase en cours.
const NON_FLANKING_DOUBLE_STAR_RE = /(?<=\s)\*\*(?=\s)/g;
const NON_FLANKING_STAR_RE = /(?<=\s)\*(?=\s)/g;

/**
 * Durcit un markdown partiel (bulle en streaming, ou bloc de queue en
 * streaming — plan 066 L1) pour un rendu propre pendant la frappe :
 * fence/backtick non fermés, gras/italique non fermés, lien/image pendant en
 * fin de texte. Jamais appliqué au texte final (message complet).
 *
 * Heuristique volontairement légère (inspiration Streamdown/remend, pas un
 * moteur CommonMark complet) : elle ferme le dernier marqueur ouvert en fin
 * de chaîne, sans reproduire les règles de délimiteurs flanquants — un `*`
 * isolé au milieu d'une phrase déjà close pourrait donc, dans un cas
 * pathologique, être mal compté ; les cas courants (multiplication espacée,
 * puces de liste, fences, code inline) sont explicitement gardés.
 */
export function hardenPartialMarkdown(text: string): string {
  if (!text) return text;
  let result = text;

  const fenceCount = (result.match(/```/g) || []).length;
  const insideOpenFence = fenceCount % 2 === 1;

  // un lien pendant à l'intérieur d'une fence non refermée est du code, pas
  // un lien : on ne le touche pas tant que la fence n'a pas été refermée.
  if (!insideOpenFence) {
    const m = DANGLING_LINK_RE.exec(result);
    if (m) result = result.slice(0, m.index) + m[1];
  }
  if (insideOpenFence) {
    result += "\n```";
  }

  const outsideFences = stripFencedBlocks(result);
  const strayBackticks = (outsideFences.match(/`/g) || []).length;
  const insideInlineCode = strayBackticks % 2 === 1;

  // gras/italique : jamais retouchés à l'intérieur d'une fence (déjà exclue
  // par stripFencedBlocks) ni d'un code inline en cours (caractères
  // littéraux, pas de syntaxe) — seule la prose hors code compte.
  if (!insideOpenFence && !insideInlineCode) {
    let prose = outsideFences.replace(LIST_BULLET_STAR_RE, " ");
    prose = prose.replace(NON_FLANKING_DOUBLE_STAR_RE, "  ");
    const strongCount = (prose.match(/\*\*/g) || []).length;
    if (strongCount % 2 === 1) result += "**";
    prose = prose.replace(/\*\*/g, "").replace(NON_FLANKING_STAR_RE, " ");
    const singleStarCount = (prose.match(/\*/g) || []).length;
    if (singleStarCount % 2 === 1) result += "*";
  }

  if (insideInlineCode) result += "`";

  return result;
}
