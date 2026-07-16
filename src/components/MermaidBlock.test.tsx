import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { t } from "../lib/i18n";
import { MermaidBlock } from "./MermaidBlock";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async () => ({
      svg: '<svg viewBox="0 0 640 320" aria-label="test diagram"><rect width="640" height="320" /></svg>',
    })),
  },
}));

afterEach(() => {
  cleanup();
});

describe("MermaidBlock fullscreen", () => {
  it("ouvre le SVG déjà rendu dans un Dialog et le ferme sans modifier la vue inline", async () => {
    render(<MermaidBlock source={"flowchart LR\n  A --> B"} highlight={(raw) => raw} />);

    const expand = await screen.findByRole("button", { name: t("chat.mermaid-expand") });
    expect(document.querySelectorAll(".mermaid-svg-wrap svg")).toHaveLength(1);

    await act(async () => {
      fireEvent.click(expand);
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(t("chat.mermaid-fullscreen-title"))).toBeTruthy();
    expect(document.querySelectorAll(".mermaid-fullscreen-canvas svg")).toHaveLength(1);
    expect(document.querySelectorAll(".mermaid-svg-wrap svg")).toHaveLength(1);
    expect(screen.getByRole("button", { name: t("chat.mermaid-close-fullscreen") })).toHaveClass(
      "mermaid-fullscreen-close",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("chat.mermaid-close-fullscreen") }));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelectorAll(".mermaid-svg-wrap svg")).toHaveLength(1);
  });
});
