// Préparation pure du markdown avant ReactMarkdown : normalisation des
// délimiteurs LaTeX et durcissement du markdown partiel reçu en streaming.
// Aucune dépendance React/DOM ici — fonctions testables isolément.

type Segment = { code: boolean; value: string };

/**
 * Découpe `text` en segments code/prose en respectant les fences ``` puis
 * l'inline code ` ` (backtick simple). Les segments `code: true` ne doivent
 * jamais être transformés par les fonctions de prose ci-dessous.
 */
function splitCodeSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      segments.push({ code: false, value: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = text.indexOf("```", i + 3);
      flush();
      if (end === -1) {
        // fence jamais refermée : le reste du texte est du code, jamais touché
        segments.push({ code: true, value: text.slice(i) });
        break;
      }
      segments.push({ code: true, value: text.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end === -1) {
        // backtick isolé, jamais refermé : caractère littéral, on reste en prose
        buf += text[i];
        i += 1;
        continue;
      }
      flush();
      segments.push({ code: true, value: text.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
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

/**
 * Durcit un markdown partiel (bulle en streaming) pour un rendu propre
 * pendant la frappe : fence/backtick non fermés + lien/image pendant en fin
 * de texte. Jamais appliqué au texte final (message complet).
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
  if (strayBackticks % 2 === 1) result += "`";

  return result;
}
