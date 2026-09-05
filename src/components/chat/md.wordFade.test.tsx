// Fade par mots (plan 067) : le bloc de QUEUE en streaming enveloppe chaque
// mot dans <span class="sw"> (rehypeWordFade) ; les blocs clos et le rendu
// final n'en portent aucun ; le code (inline et bloc) n'est jamais découpé ;
// le texte extrait (sélection/copie) reste strictement identique.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import remarkGfm from "remark-gfm";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, MdBody } from "./md";

afterEach(cleanup);

const REMARK = [remarkGfm];
const REHYPE: any[] = [];

function renderBody(text: string, streaming: boolean) {
  return render(
    <MdBody
      text={text}
      streaming={streaming}
      components={streaming ? MD_COMPONENTS_STREAMING : MD_COMPONENTS}
      remarkPlugins={REMARK}
      rehypePlugins={REHYPE}
    />,
  );
}

describe("MdBody — fade par mots du bloc de queue (plan 067)", () => {
  it("conserve les éléments des mots quand la fenêtre de fondu avance", () => {
    const words = Array.from({ length: 65 }, (_, i) => `mot${i}`);
    const body = (count: number) => <MdBody text={words.slice(0, count).join(" ")}
      streaming components={MD_COMPONENTS_STREAMING} remarkPlugins={REMARK} rehypePlugins={REHYPE} />;
    const { container, rerender } = render(body(39));
    for (let count = 40; count <= words.length; count++) {
      const previous = new Map([...container.querySelectorAll("p > span")]
        .map((node) => [node.textContent, node]));
      rerender(body(count));
      const animated = [...container.querySelectorAll("span.sw")];
      expect(animated).toHaveLength(Math.min(count, 40));
      for (const node of container.querySelectorAll("p > span")) {
        if (previous.has(node.textContent)) expect(node).toBe(previous.get(node.textContent));
      }
      expect(animated.map((node) => node.textContent)).toEqual(words.slice(Math.max(0, count - 40), count));
      expect(container.textContent).toBe(words.slice(0, count).join(" "));
    }
  });

  it("la queue en streaming enveloppe chaque mot dans span.sw, les blocs clos non", () => {
    const { container } = renderBody("Bloc déjà clos.\n\nLa queue en cours de frappe", true);
    const blocks = [...container.children];
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll(".sw").length).toBe(0);
    const words = [...blocks[1].querySelectorAll(".sw")].map((s) => s.textContent);
    expect(words).toEqual(["La", "queue", "en", "cours", "de", "frappe"]);
  });

  it("le texte extrait reste identique — les blancs sont des nœuds texte nus", () => {
    const { container } = renderBody("Un **mot** en gras et du texte", true);
    expect(container.textContent).toBe("Un mot en gras et du texte");
  });

  it("le code inline et les blocs de code ne sont jamais découpés", () => {
    const { container } = renderBody(
      "Voir `du code inline` ici\n\n```python\nprint(1)\n",
      true,
    );
    for (const sw of container.querySelectorAll(".sw")) {
      expect(sw.closest("code")).toBeNull();
      expect(sw.closest("pre")).toBeNull();
    }
    // le code lui-même est intact (aucun span à l'intérieur)
    const inline = container.querySelector("p code");
    expect(inline?.querySelectorAll(".sw").length).toBe(0);
    expect(inline?.textContent).toBe("du code inline");
  });

  it("rendu final (streaming=false) : aucun span.sw", () => {
    const { container } = renderBody("Un message terminé, sans aucun span.", false);
    expect(container.querySelectorAll(".sw").length).toBe(0);
  });

  it("les mots à l'intérieur d'un lien ou d'un gras de la queue sont wrappés sans casser la structure", () => {
    const { container } = renderBody("Du **gras multi mots** dans la queue", true);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("gras multi mots");
    expect(strong?.querySelectorAll(".sw").length).toBe(3);
  });
});
