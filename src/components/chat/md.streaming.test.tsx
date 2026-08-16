// Non-régression du jitter de streaming (plan 066, L4) : un message markdown
// "piégé" (gras ouvert, fence ouverte, liste, tableau) livré chunk par
// chunk doit (a) ne JAMAIS retoucher le HTML d'un bloc déjà clos d'un chunk
// au suivant, (b) fermer gras/fence sur le bloc de queue pendant le stream,
// (c) ne rien réparer une fois streaming=false (message final).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import remarkGfm from "remark-gfm";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, MdBody, mdText } from "./md";

afterEach(cleanup);

const REMARK = [remarkGfm];
const REHYPE: any[] = [];

describe("MdBody — non-régression du jitter en streaming (plan 066, L4)", () => {
  it("un bloc déjà clos rend un HTML strictement identique d'un chunk au suivant", () => {
    // "Fixe." (bloc 0) se clôt dès le premier chunk et ne doit plus jamais
    // bouger ; "Stable aussi." (bloc 1) se clôt au chunk 1 et doit geler à
    // son tour à partir du chunk 2, pendant que la queue continue de changer
    // (gras ouvert → fermé → fence → liste → tableau).
    const chunks = [
      "Fixe.\n\nStable aussi.\n\nUn mot en **gras",
      "Fixe.\n\nStable aussi.\n\nUn mot en **gras** fini.\n\n```py",
      "Fixe.\n\nStable aussi.\n\nUn mot en **gras** fini.\n\n```python\nprint(1",
      "Fixe.\n\nStable aussi.\n\nUn mot en **gras** fini.\n\n```python\nprint(1)\n```\n\n- item un\n- item deux",
      "Fixe.\n\nStable aussi.\n\nUn mot en **gras** fini.\n\n```python\nprint(1)\n```\n\n- item un\n- item deux\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    ];

    const { container, rerender } = render(
      <MdBody text={chunks[0]} streaming components={MD_COMPONENTS_STREAMING} remarkPlugins={REMARK} rehypePlugins={REHYPE} />,
    );
    const topLevel = () => [...container.children];
    let block0Html = topLevel()[0]?.outerHTML;
    let block1Html: string | undefined;

    for (let i = 1; i < chunks.length; i += 1) {
      rerender(
        <MdBody text={chunks[i]} streaming components={MD_COMPONENTS_STREAMING} remarkPlugins={REMARK} rehypePlugins={REHYPE} />,
      );
      const blocks = topLevel();
      // bloc 0 ("Fixe.") : jamais retouché depuis le tout premier rendu
      expect(blocks[0]?.outerHTML).toBe(block0Html);
      if (i === 1) {
        // "Stable aussi." vient de se clore (chunk 1) : on capture sa
        // référence pour vérifier qu'elle NE BOUGE PLUS ensuite
        block1Html = blocks[1]?.outerHTML;
        expect(block1Html).toBeTruthy();
      } else {
        expect(blocks[1]?.outerHTML).toBe(block1Html);
      }
    }
    void block0Html;
  });

  it("un bloc figé ne relance PAS son pipeline ReactMarkdown (pas seulement un HTML final identique)", () => {
    // L'égalité d'outerHTML du test précédent prouverait un rendu correct
    // même SANS memo (React réconcilie vers le même DOM). Ce test vise le
    // mécanisme lui-même : on espionne le composant `p` et on vérifie que le
    // paragraphe "Fixe." n'est PAS ré-invoqué une fois son bloc figé — la
    // preuve que MdBlock (React.memo) a bien sauté le re-rendu, pas juste
    // que le résultat coïncidait par hasard.
    const renderLog: string[] = [];
    const SpyComponents = {
      ...MD_COMPONENTS_STREAMING,
      p: (props: any) => {
        renderLog.push(mdText(props.children));
        return (MD_COMPONENTS_STREAMING.p as any)(props);
      },
    };
    const chunks = [
      "Fixe.\n\nUn mot en **gras",
      "Fixe.\n\nUn mot en **gras** fini.",
      "Fixe.\n\nUn mot en **gras** fini et un peu plus.",
    ];
    const { rerender } = render(
      <MdBody text={chunks[0]} streaming components={SpyComponents} remarkPlugins={REMARK} rehypePlugins={REHYPE} />,
    );
    expect(renderLog).toContain("Fixe.");

    renderLog.length = 0;
    rerender(<MdBody text={chunks[1]} streaming components={SpyComponents} remarkPlugins={REMARK} rehypePlugins={REHYPE} />);
    expect(renderLog.some((t) => t === "Fixe.")).toBe(false);

    renderLog.length = 0;
    rerender(<MdBody text={chunks[2]} streaming components={SpyComponents} remarkPlugins={REMARK} rehypePlugins={REHYPE} />);
    expect(renderLog.some((t) => t === "Fixe.")).toBe(false);
  });

  it("réparation du bloc de queue : gras et fence ouverts se ferment pendant le streaming", () => {
    const { container } = render(
      <MdBody
        text={"Un mot en **gras"}
        streaming
        components={MD_COMPONENTS_STREAMING}
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
      />,
    );
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("gras");

    const { container: fenceContainer } = render(
      <MdBody
        text={"Avant.\n\n```python\nprint(1"}
        streaming
        components={MD_COMPONENTS_STREAMING}
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
      />,
    );
    const code = fenceContainer.querySelector(".codeblock code");
    expect(code?.textContent).toContain("print(1");
  });

  it("réparation coupée quand streaming=false : le markdown incomplet reste littéral", () => {
    const { container } = render(
      <MdBody
        text={"Un mot en **gras"}
        streaming={false}
        components={MD_COMPONENTS}
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
      />,
    );
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**gras");
  });
});
