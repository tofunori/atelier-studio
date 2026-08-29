// Fade par mots du streaming (plan 067) : enveloppe chaque mot des nœuds
// texte du bloc de queue dans <span class="sw"> pour que le CSS anime son
// apparition (word-in, App.css). Appliqué par MdBody au SEUL dernier bloc
// pendant le streaming — jamais au rendu final. Les blancs restent des nœuds
// texte nus : la sélection et le copier-coller sont inchangés. Les spans sont
// positionnellement stables d'un re-parse à l'autre (flux append-only), donc
// React conserve les nœuds DOM déjà montés et l'animation ne rejoue jamais
// sur un mot déjà affiché.

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// Le contenu de ces éléments n'est jamais découpé : le code (inline ou bloc)
// passe par ses propres renderers (coloration, refs fichier), et KaTeX émet
// des spans dont la structure interne ne doit pas bouger.
const SKIP_TAGS = new Set(["pre", "code", "script", "style"]);

// L'œil ne regarde que la frontière du streaming : au-delà des N derniers
// mots, le texte est déjà stable à l'écran depuis longtemps et n'a pas
// besoin d'un span animé. Un bloc de 300 mots produisait 300 <span> animés
// simultanément (mesuré à l'audit perf lot 2) ; on ne borne QUE le nombre
// de spans, jamais l'effet visuel à la frontière (les 40 derniers mots
// gardent exactement le même fondu).
const FADE_WINDOW = 40;

function isSkipped(node: HastNode): boolean {
  if (node.tagName && SKIP_TAGS.has(node.tagName)) return true;
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? [cls] : [];
  return list.some((c) => String(c).includes("katex"));
}

function wordSpan(word: string): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["sw"] },
    children: [{ type: "text", value: word }],
  };
}

/** Compte les mots (segmentation identique à splitTextNode) sans construire
 * d'arbre — première passe du bornage « 40 derniers mots ». */
function countWords(node: HastNode): number {
  if (!node.children) return 0;
  let count = 0;
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.trim() !== "") {
      for (const part of child.value.split(/(\s+)/)) {
        if (part && !/^\s+$/.test(part)) count++;
      }
      continue;
    }
    if (child.type === "element" && !isSkipped(child)) count += countWords(child);
  }
  return count;
}

/** Index courant du mot (ordre document) partagé entre les nœuds texte
 * traversés pendant la seconde passe. */
type WordCursor = { current: number };

function splitTextNode(value: string, cursor: WordCursor, threshold: number): HastNode[] {
  const parts = value.split(/(\s+)/);
  const out: HastNode[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out.push({ type: "text", value: part });
      continue;
    }
    // Seuls les mots dont l'index (0-based, ordre document) atteint le
    // seuil — c'est-à-dire les FADE_WINDOW derniers mots du bloc — sont
    // enveloppés dans un span animé ; les autres restent du texte nu.
    const wrap = cursor.current >= threshold;
    out.push(wrap ? wordSpan(part) : { type: "text", value: part });
    cursor.current++;
  }
  return out;
}

function walk(node: HastNode, cursor: WordCursor, threshold: number): void {
  if (!node.children) return;
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.trim() !== "") {
      next.push(...splitTextNode(child.value, cursor, threshold));
      continue;
    }
    if (child.type === "element" && !isSkipped(child)) walk(child, cursor, threshold);
    next.push(child);
  }
  node.children = next;
}

/** Plugin rehype : `[…plugins, rehypeWordFade]` sur le bloc de queue. */
export default function rehypeWordFade() {
  return (tree: HastNode) => {
    // Deux passes : on compte d'abord le total de mots du bloc, puis on ne
    // wrappe que ceux dont l'index atteint (total - FADE_WINDOW) — les
    // FADE_WINDOW derniers dans l'ordre du document. Si le bloc a moins de
    // FADE_WINDOW mots, le seuil est ≤ 0 et tous les mots sont enveloppés
    // (comportement identique à avant le bornage).
    const total = countWords(tree);
    const threshold = total - FADE_WINDOW;
    walk(tree, { current: 0 }, threshold);
  };
}
