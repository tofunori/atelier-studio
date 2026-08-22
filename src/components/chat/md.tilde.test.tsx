// Régression (capture Thierry 2026-08-22) : dans « Bands 3, 4 and 8 (10~m)
// are resampled … to the 20~m grid », les deux tildes LaTeX (espace
// insécable) se faisaient interpréter comme délimiteurs de barré GFM — la
// moitié de la phrase s'affichait rayée. singleTilde est désormais désactivé
// partout : le barré volontaire reste possible avec `~~texte~~`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MD_COMPONENTS, MD_REMARK_PLUGINS, MdBody } from "./md";

afterEach(cleanup);

const renderMd = (text: string) => render(
  <MdBody
    text={text}
    streaming={false}
    components={MD_COMPONENTS}
    remarkPlugins={MD_REMARK_PLUGINS}
    rehypePlugins={[]}
  />,
);

describe("markdown — tilde simple (LaTeX) vs barré GFM", () => {
  it("ne raye pas le texte entre deux tildes d'espace insécable", () => {
    const { container } = renderMd(
      "« Bands 3, 4 and 8 (10~m) are resampled by nearest neighbour to the 20~m grid of band 11 ».",
    );
    expect(container.querySelector("del")).toBeNull();
    expect(container.textContent).toContain("(10~m)");
    expect(container.textContent).toContain("20~m grid");
  });

  it("garde le barré volontaire en double tilde", () => {
    const { container } = renderMd("avant ~~rayé exprès~~ après");
    expect(container.querySelector("del")?.textContent).toBe("rayé exprès");
  });
});
