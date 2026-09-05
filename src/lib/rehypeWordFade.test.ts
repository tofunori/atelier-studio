// Test unitaire du plugin rehype de fondu par mots (rehypeWordFade.ts).
// Task 5 (perf lot 2) : borne le nombre de <span class="sw"> animés aux
// FADE_WINDOW (40) DERNIERS mots du bloc — au-delà, spans sans animation.
// Appelle directement le transformer sur un arbre HAST minimal (pas besoin
// du pipeline unified complet, cf. src/components/chat/md.wordFade.test.tsx
// pour la couverture d'intégration via MdBody/ReactMarkdown).
import { describe, expect, it } from "vitest";
import rehypeWordFade from "./rehypeWordFade";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function textTree(text: string): HastNode {
  return { type: "root", children: [{ type: "text", value: text }] };
}

function transform(tree: HastNode): HastNode {
  (rehypeWordFade() as (tree: HastNode) => void)(tree);
  return tree;
}

/** Parcourt l'arbre en ordre document et rend le texte des spans "sw" et le
 * texte intégral (spans + nœuds texte nus), pour vérifier ordre/contenu. */
function walkSwWords(node: HastNode, out: string[]): void {
  for (const child of node.children ?? []) {
    if (
      child.type === "element"
      && child.tagName === "span"
      && Array.isArray(child.properties?.className)
      && (child.properties!.className as unknown[]).includes("sw")
    ) {
      out.push((child.children ?? []).map((c) => c.value ?? "").join(""));
      continue;
    }
    walkSwWords(child, out);
  }
}

function swWords(tree: HastNode): string[] {
  const out: string[] = [];
  walkSwWords(tree, out);
  return out;
}

function fullText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(fullText).join("");
}

describe("rehypeWordFade — fenêtre bornée aux 40 derniers mots", () => {
  it("300 mots ⇒ ≤ 40 spans animés (exactement 40, pas 300)", () => {
    const words = Array.from({ length: 300 }, (_, i) => `mot${i + 1}`);
    const tree = transform(textTree(words.join(" ")));
    expect(swWords(tree).length).toBeLessThanOrEqual(40);
    expect(swWords(tree).length).toBe(40);
  });

  it("seuls les 40 DERNIERS mots sont animés, les spans précédents restent en place", () => {
    const words = Array.from({ length: 50 }, (_, i) => `mot${i + 1}`);
    const tree = transform(textTree(words.join(" ")));
    expect(swWords(tree)).toEqual(words.slice(10)); // indices 10..49 = les 40 derniers
    expect(tree.children?.filter((child) => child.tagName === "span")).toHaveLength(50);
  });

  it("ordre et texte intégral inchangés après bornage (sélection/copier-coller stables)", () => {
    const words = Array.from({ length: 300 }, (_, i) => `mot${i + 1}`);
    const original = words.join(" ");
    const tree = transform(textTree(original));
    expect(fullText(tree)).toBe(original);
  });

  it("un bloc de moins de 40 mots enveloppe tous les mots (comportement inchangé pour les petits blocs)", () => {
    const words = ["Un", "petit", "bloc", "de", "six", "mots"];
    const tree = transform(textTree(words.join(" ")));
    expect(swWords(tree)).toEqual(words);
  });

  it("exactement 40 mots enveloppe tous les mots (limite)", () => {
    const words = Array.from({ length: 40 }, (_, i) => `mot${i + 1}`);
    const tree = transform(textTree(words.join(" ")));
    expect(swWords(tree)).toEqual(words);
  });
});
