import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isLongMessage, MessageContent } from "./MessageContent.tsx";

describe("MessageContent", () => {
  it("recognizes long responses", () => {
    expect(isLongMessage("court")).toBe(false);
    expect(isLongMessage("x".repeat(651))).toBe(true);
  });

  it("renders markdown and expands a long response", () => {
    render(<MessageContent text={`**Résultat**\n\n${"texte ".repeat(150)}`} />);
    expect(screen.getByText("Résultat").tagName).toBe("STRONG");
    const button = screen.getByRole("button", { name: "Afficher la suite" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Réduire" })).toHaveAttribute("aria-expanded", "true");
  });
});
