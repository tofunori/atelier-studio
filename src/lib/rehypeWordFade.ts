// Fade par mots du streaming (plan 067) : enveloppe chaque mot des nœuds
// texte du bloc de queue dans <span class="sw"> pour que le CSS anime son
// apparition (word-in, App.css). Appliqué par MdBody au SEUL dernier bloc
// pendant le streaming — jamais au rendu final. Les blancs restent des nœuds
// texte nus : la sélection et le copier-coller sont inchangés. Les spans sont
// positionnellement stables quand on ajoute des mots sans restructurer le
// Markdown : React conserve alors les nœuds DOM déjà montés et leur fondu
// ne redémarre pas lorsque la fenêtre d'animation avance.

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
// besoin d'un span animé. On borne la classe d'animation, mais on conserve
// les spans des mots anciens : les remplacer par du texte nu décale les
// clés positionnelles de ReactMarkdown et réaffecte le DOM des mots suivants.
const FADE_WINDOW = 40;

function isSkipped(node: HastNode): boolean {
  if (node.tagName && SKIP_TAGS.has(node.tagName)) return true;
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? [cls] : [];
  return list.some((c) => String(c).includes("katex"));
}

function wordSpan(word: string, animated: boolean): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: { className: animated ? ["sw"] : [] },
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
    // La structure reste identique quand la fenêtre avance ; seule la
    // classe du mot sortant est retirée, sans remonter les mots suivants.
    out.push(wordSpan(part, cursor.current >= threshold));
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
    // anime que ceux dont l'index atteint (total - FADE_WINDOW) — les
    // FADE_WINDOW derniers dans l'ordre du document. Si le bloc a moins de
    // FADE_WINDOW mots, le seuil est ≤ 0 et tous les mots sont enveloppés
    // (comportement identique à avant le bornage).
    const total = countWords(tree);
    const threshold = total - FADE_WINDOW;
    walk(tree, { current: 0 }, threshold);
  };
}
