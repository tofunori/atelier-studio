// HTML en ligne des réponses (plan 066 suite) : sans rehype-raw, react-markdown
// affiche tout HTML comme du texte — « Plus forte baisse<br>depuis 2015 » dans
// une cellule de tableau, « m<sup>2</sup> », « <kbd>Cmd</kbd> » sortaient
// littéralement. Ce plugin remark traduit une courte liste de balises
// inoffensives en nœuds mdast ; le reste du HTML garde l'affichage texte (rien
// n'est jamais injecté tel quel dans le DOM). Les commentaires HTML, invisibles
// dans tout rendu Markdown, disparaissent.

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };

/** Balises appariées acceptées, rendues sous le même nom. */
const PAIRED = new Set(["sup", "sub", "kbd", "mark", "u", "ins", "del", "s", "b", "strong", "i", "em", "small"]);
const BREAK = /^<br\s*\/?>$/i;
const COMMENT = /^<!--[\s\S]*-->$/;
const OPEN = /^<([a-z]+)>$/i;
const CLOSE = /^<\/([a-z]+)>$/i;

function htmlValue(node: Node): string | null {
  return node.type === "html" && typeof node.value === "string" ? node.value.trim() : null;
}

function transform(children: Node[], inline: boolean): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    const html = htmlValue(node);
    if (html != null) {
      if (COMMENT.test(html)) continue;
      if (BREAK.test(html)) {
        // Un `<br>` seul sur sa ligne est un bloc HTML : une ligne vide suffit.
        if (inline) out.push({ type: "break" });
        continue;
      }
      const open = inline ? OPEN.exec(html) : null;
      const tag = open?.[1].toLowerCase();
      if (tag && PAIRED.has(tag)) {
        const end = children.findIndex((next, j) => {
          if (j <= i) return false;
          const close = CLOSE.exec(htmlValue(next) ?? "");
          return close != null && close[1].toLowerCase() === tag;
        });
        if (end > i) {
          out.push({ type: "inlineHtmlElement", data: { hName: tag }, children: transform(children.slice(i + 1, end), true) });
          i = end;
          continue;
        }
      }
      out.push(node);
      continue;
    }
    if (node.children) {
      out.push({ ...node, children: transform(node.children, inline || isPhrasingParent(node.type)) });
    } else out.push(node);
  }
  return out;
}

/** Parents dont les enfants sont du texte en ligne (HTML en ligne). */
function isPhrasingParent(type: string): boolean {
  return type === "paragraph" || type === "heading" || type === "tableCell"
    || type === "emphasis" || type === "strong" || type === "delete" || type === "link"
    || type === "linkReference" || type === "inlineHtmlElement";
}

export default function remarkInlineHtml() {
  return (tree: Node) => {
    if (tree.children) tree.children = transform(tree.children, false);
  };
}
