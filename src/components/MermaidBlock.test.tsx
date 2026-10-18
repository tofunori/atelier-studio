import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { t } from "../lib/i18n";
import { MermaidBlock } from "./MermaidBlock";

afterEach(() => {
  cleanup();
});

describe("MermaidBlock (moteur Pele)", () => {
  it("dessine le diagramme avec le moteur réel, sans lien ni image", async () => {
    render(
      <MermaidBlock
        source={'flowchart LR\n  A[Albédo] --> B[Fonte]\n  click A "https://example.org"'}
        highlight={(raw) => raw}
      />,
    );
    await screen.findByRole("button", { name: t("chat.mermaid-expand") });
    await waitFor(() => expect(document.querySelector(".mermaid-svg-wrap svg.pele")).toBeTruthy());
    const svg = document.querySelector(".mermaid-svg-wrap svg.pele")!;
    expect(svg.textContent).toContain("Albédo");
    expect(svg.querySelector("a, image")).toBeNull();
  });

  it("retombe sur le bloc de code quand la syntaxe est invalide", async () => {
    render(<MermaidBlock source={"flowchart LR\n  A --> "} highlight={(raw) => raw} />);
    expect(await screen.findByText(t("chat.mermaid-invalid"))).toBeTruthy();
    expect(document.querySelector(".mermaid-svg-wrap")).toBeNull();
    expect(document.querySelector("pre code.language-mermaid")).toBeTruthy();
  });

  it("retombe sur le bloc de code pour un texte qui n'est pas un diagramme", async () => {
    render(<MermaidBlock source={"bonjour"} highlight={(raw) => raw} />);
    expect(await screen.findByText(t("chat.mermaid-invalid"))).toBeTruthy();
  });


  it("ouvre le SVG déjà rendu dans un Dialog et le ferme sans modifier la vue inline", async () => {
    render(<MermaidBlock source={"flowchart LR\n  A --> B"} highlight={(raw) => raw} />);

    const expand = await screen.findByRole("button", { name: t("chat.mermaid-expand") });
    await waitFor(() => expect(document.querySelectorAll(".mermaid-svg-wrap svg.pele")).toHaveLength(1));

    await act(async () => {
      fireEvent.click(expand);
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(t("chat.mermaid-fullscreen-title"))).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".mermaid-fullscreen-canvas svg.pele")).toHaveLength(1));
    expect(document.querySelectorAll(".mermaid-svg-wrap svg.pele")).toHaveLength(1);
    expect(screen.getByRole("button", { name: t("chat.mermaid-close-fullscreen") })).toHaveClass(
      "mermaid-fullscreen-close",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("chat.mermaid-close-fullscreen") }));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelectorAll(".mermaid-svg-wrap svg.pele")).toHaveLength(1);
  });
});
