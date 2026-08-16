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

function splitTextNode(value: string): HastNode[] {
  const parts = value.split(/(\s+)/);
  const out: HastNode[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) out.push({ type: "text", value: part });
    else out.push(wordSpan(part));
  }
  return out;
}

function walk(node: HastNode): void {
  if (!node.children) return;
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.trim() !== "") {
      next.push(...splitTextNode(child.value));
      continue;
    }
    if (child.type === "element" && !isSkipped(child)) walk(child);
    next.push(child);
  }
  node.children = next;
}

/** Plugin rehype : `[…plugins, rehypeWordFade]` sur le bloc de queue. */
export default function rehypeWordFade() {
  return (tree: HastNode) => {
    walk(tree);
  };
}
