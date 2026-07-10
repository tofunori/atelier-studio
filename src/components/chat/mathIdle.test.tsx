// Maths hors du chemin critique (plan 022) : remark-math + rehype-katex se
// chargent à l'idle. Contrat : avant chargement, $x^2$ reste du texte brut
// (jamais de contenu perdu) ; une fois les plugins arrivés, le même message
// s'upgrade en rendu KaTeX sans intervention.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ReactMarkdown from "react-markdown";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MD_COMPONENTS, useMdPlugins } from "./md";

function MathMessage(p: { text: string }) {
  const plugins = useMdPlugins();
  return (
    <ReactMarkdown
      remarkPlugins={plugins.remark}
      rehypePlugins={plugins.rehype}
      components={MD_COMPONENTS}
    >
      {p.text}
    </ReactMarkdown>
  );
}

describe("chargement idle des maths (plan 022)", () => {
  it("upgrade $x^2$ en KaTeX une fois les plugins chargés — texte brut avant, jamais perdu", async () => {
    const { container } = render(<MathMessage text={"La formule $x^2$ est simple."} />);
    // avant l'upgrade le contenu est visible en texte brut (dollars inclus ou non)
    expect(container.textContent).toContain("La formule");
    // l'idle-load (requestIdleCallback ou setTimeout fallback) finit par livrer KaTeX
    await waitFor(
      () => expect(container.querySelector(".katex")).not.toBeNull(),
      { timeout: 4000 },
    );
    // le texte environnant survit à l'upgrade
    expect(screen.getByText(/La formule/)).toBeTruthy();
  });
});
