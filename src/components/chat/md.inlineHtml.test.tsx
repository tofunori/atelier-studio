// Rendu Markdown du chat au niveau de ce que Claude écrit vraiment (audit
// 2026-09-25) : HTML en ligne courant, notes de bas de page, item de liste à
// plusieurs paragraphes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import { MD_COMPONENTS, MD_REMARK_PLUGINS, MdBody } from "./md";

afterEach(cleanup);

const renderMd = (text: string) => render(
  <div className="chat-md">
    <MdBody
      text={text}
      streaming={false}
      components={MD_COMPONENTS}
      remarkPlugins={MD_REMARK_PLUGINS}
      rehypePlugins={[]}
    />
  </div>,
);

describe("markdown — HTML en ligne", () => {
  it("rend <br>, <sup>, <sub>, <kbd>, <mark> au lieu de les afficher", () => {
    const { container } = renderMd(
      "Aire en km<sup>2</sup>, CO<sub>2</sub>, <kbd>Cmd</kbd>+<kbd>R</kbd>, <mark>clé</mark>.\n\n| A | B |\n|---|---|\n| haut<br>bas | x |",
    );
    expect(container.querySelector("sup")?.textContent).toBe("2");
    expect(container.querySelector("sub")?.textContent).toBe("2");
    expect([...container.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Cmd", "R"]);
    expect(container.querySelector("mark")?.textContent).toBe("clé");
    expect(container.querySelector("td br")).not.toBeNull();
    expect(container.textContent).not.toMatch(/<\/?(?:sup|sub|kbd|mark|br)>/);
  });

  it("garde le reste du HTML en texte, jamais injecté ; efface les commentaires", () => {
    const { container } = renderMd("avant <span onclick=\"x()\">a</span> <!-- note --> après <sup>non fermé");
    expect(container.querySelector("span[onclick]")).toBeNull();
    expect(container.textContent).toContain("<span onclick=\"x()\">");
    expect(container.textContent).not.toContain("note");
    expect(container.textContent).toContain("<sup>non fermé");
  });
});

describe("markdown — notes de bas de page", () => {
  it("relie l'appel et la note même séparés par d'autres paragraphes", () => {
    const { container } = renderMd("Valeur −0,41[^1].\n\nAutre paragraphe.\n\n[^1]: Williamson & Menounos (2021).");
    const appel = container.querySelector("sup a.md-footnote-ref") as HTMLAnchorElement;
    expect(appel.textContent).toBe("1");
    const note = container.querySelector("section.footnotes li");
    expect(note?.textContent).toContain("Williamson & Menounos (2021).");
    expect(container.textContent).not.toContain("[^1]");

    const cible = container.querySelector(`[id="${appel.getAttribute("href")!.slice(1)}"]`) as HTMLElement;
    const scroll = vi.fn();
    cible.scrollIntoView = scroll;
    fireEvent.click(appel);
    expect(scroll).toHaveBeenCalled();
    expect(container.querySelector("a.md-footnote-back svg")).not.toBeNull();
  });
});

describe("markdown — listes", () => {
  it("un item à plusieurs paragraphes et code indenté reste dans UNE liste numérotée", () => {
    const { container } = renderMd(
      "1. Relire.\n\n   Le paragraphe cite l'ancienne valeur.\n\n2. Relancer :\n\n   ```bash\n   python fig4.py\n   ```\n\n3. Vérifier S2.",
    );
    const listes = container.querySelectorAll("ol");
    expect(listes).toHaveLength(1);
    expect(listes[0].querySelectorAll(":scope > li")).toHaveLength(3);
    expect(listes[0].querySelector("li pre")).not.toBeNull();
  });
});
