// Retrouve un passage de texte dans un sous-arbre DOM et le rend en Range(s).
//
// PIÈGE (2026-08-22) : la version d'origine cherchait `indexOf` NŒUD PAR NŒUD.
// Toute sélection traversant du gras, un lien ou deux paragraphes ne matchait
// donc jamais — c'est-à-dire la majorité des sélections réelles dans le chat,
// où le markdown coupe le texte en dizaines de nœuds. On aplatit désormais le
// sous-arbre en une chaîne normalisée (runs d'espaces → une espace, ce qui
// absorbe aussi les "\n" que `Selection.toString()` insère entre blocs), en
// gardant pour chaque caractère son (nœud, offset) d'origine.

type CharMap = { nodes: Text[]; offsets: number[] };

// Les blocs ne portent aucun espace dans le DOM (« <p>a</p><p>b</p> » = "ab"),
// alors que Selection.toString() y met un saut de ligne. On rétablit la
// frontière pour que les deux chaînes se correspondent.
const BLOCKS = new Set([
  "P", "DIV", "LI", "UL", "OL", "PRE", "BLOCKQUOTE", "SECTION", "ARTICLE",
  "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "TR", "TD", "TH", "HR", "BR",
]);

function blockOf(node: Node): Element | null {
  let el = node.parentElement;
  while (el && !BLOCKS.has(el.tagName)) el = el.parentElement;
  return el;
}

function flatten(root: HTMLElement, mathSelection = false): { text: string; map: CharMap } {
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let text = "";
  let block: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Annotation controls are UI, not part of the quoted message.
    if (node.parentElement?.closest(".anno-badge")) continue;
    // Selection.toString() omits KaTeX's hidden TeX source. Keep the MathML
    // and visual text for compatibility with selections already saved by WebKit.
    if (mathSelection && node.parentElement?.closest(".katex annotation")) continue;
    const own = blockOf(node);
    if (!mathSelection && text && own !== block && !text.endsWith(" ")) {
      // espace de frontière : jamais une extrémité de match (le besoin est trimé)
      text += " ";
      nodes.push(node as Text);
      offsets.push(0);
    }
    block = own;
    const raw = node.textContent ?? "";
    for (let i = 0; i < raw.length; i += 1) {
      const isSpace = /\s/.test(raw[i]);
      if (mathSelection && isSpace) continue;
      // un run d'espaces (quelle qu'en soit la forme) compte pour une espace
      if (isSpace && text.endsWith(" ")) continue;
      text += isSpace ? " " : raw[i];
      nodes.push(node as Text);
      offsets.push(i);
    }
  }
  return { text, map: { nodes, offsets } };
}

function normalize(needle: string): string {
  return needle.replace(/\s+/g, " ").trim();
}

export function findTextRanges(root: HTMLElement, needle: string): Range[] {
  const target = normalize(needle);
  if (!target) return [];
  const exact = rangesIn(flatten(root), target);
  if (exact.length || !root.querySelector(".katex")) return exact;
  // Browser selection inserts layout whitespace around superscripts. Only
  // accept this fallback for ranges actually crossing a rendered formula.
  const math = [...root.querySelectorAll(".katex")];
  const projected = flatten(root, true);
  const indices = [...target.matchAll(/\S/g)].map(match => match.index!);
  return rangesIn(projected, target.replace(/\s/g, ""), at => {
    // Ignore layout whitespace only at a formula. Prose still distinguishes
    // "can not" from "cannot", even when the same selection includes math.
    for (let i=1; i<indices.length; i++) {
      const left = projected.map.nodes[at+i-1], right = projected.map.nodes[at+i];
      if (left.parentElement?.closest(".katex") || right.parentElement?.closest(".katex")) continue;
      const gap = document.createRange();
      gap.setStart(left, projected.map.offsets[at+i-1]+1);
      gap.setEnd(right, projected.map.offsets[at+i]);
      const space = /\s/.test(gap.toString()) || blockOf(left)!==blockOf(right);
      if (space !== /\s/.test(target.slice(indices[i-1]+1,indices[i]))) return false;
    }
    return true;
  })
    .filter(range => math.some(el => range.intersectsNode(el)));
}

function rangesIn({ text, map }: { text: string; map: CharMap }, target: string, accept = (_at: number) => true): Range[] {
  const out: Range[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(target, from);
    if (at < 0) break;
    if (!accept(at)) { from=at+target.length; continue; }
    const last = at + target.length - 1;
    const range = document.createRange();
    range.setStart(map.nodes[at], map.offsets[at]);
    range.setEnd(map.nodes[last], map.offsets[last] + 1);
    out.push(range);
    from = at + target.length;
  }
  return out;
}
