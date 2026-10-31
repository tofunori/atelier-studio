// Étiquettes de colonne des tableaux markdown : chaque cellule du corps reçoit
// l'en-tête de sa colonne en `data-label`. Quand le panneau du chat devient
// trop étroit pour un tableau de trois colonnes ou plus, App.css l'empile en
// fiches (une par rangée) et affiche ces étiquettes devant chaque valeur, au
// lieu de faire défiler le tableau horizontalement.

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const kids = (node: HastNode | undefined, tag: string) =>
  (node?.children ?? []).filter((child) => child.tagName === tag);

const textOf = (node: HastNode): string =>
  node.type === "text" ? node.value ?? "" : (node.children ?? []).map(textOf).join("");

function label(table: HastNode) {
  const head = kids(kids(table, "thead")[0], "tr")[0];
  const names = kids(head, "th").map((th) => textOf(th).replace(/\s+/g, " ").trim());
  if (!names.some(Boolean)) return;
  for (const row of kids(kids(table, "tbody")[0], "tr")) {
    kids(row, "td").forEach((td, i) => {
      if (!names[i]) return;
      td.properties = { ...td.properties, dataLabel: names[i] };
      // Un seul enfant pour la grille étiquette | valeur de la fiche : sans
      // lui, chaque nœud en ligne (italique, code) deviendrait une case.
      if (i > 0) td.children = [{ type: "element", tagName: "span", properties: {}, children: td.children ?? [] }];
    });
  }
}

function walk(node: HastNode) {
  if (node.tagName === "table") label(node);
  else node.children?.forEach(walk);
}

export default function rehypeTableLabels() {
  return (tree: HastNode) => walk(tree);
}
