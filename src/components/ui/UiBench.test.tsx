// UiBench (plan 016, étape 5) — le banc rend les douze primitives sans
// erreur (gate « RTL renders OK » avant captures dans l'app).
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { UiBench } from "./UiBench";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("UiBench", () => {
  it("rend une section par primitive (12) et les contrôles interactifs clés", () => {
    render(<UiBench />);
    for (const section of [
      "Button",
      "IconButton",
      "Tooltip",
      "Menu",
      "Popover",
      "SegmentedControl",
      "SurfaceHeader",
      "EmptyState",
      "InlineNotice",
      "StatusBadge",
      "InspectorPanel",
      "ContextChip",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    }
    // témoins interactifs : bascule de thème, radiogroup layout, alert d'erreur
    expect(screen.getByRole("radiogroup", { name: "Thème" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Disposition" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Serveur galerie injoignable.");
    expect(screen.getByRole("button", { name: "Retirer fig3_albedo.pdf" })).toBeInTheDocument();
  });
});
