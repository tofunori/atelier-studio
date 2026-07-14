import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextViewer } from "./TextViewer.tsx";

describe("TextViewer selection action", () => {
  it("shows a disabled add-selection action until text is selected", () => {
    render(
      <TextViewer
        text={"const a = 1;\nconst b = 2;"}
        name="model.ts"
        onAddSelection={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Ajouter la sélection" })).toBeDisabled();
    expect(document.querySelector('[data-line="2"]')).not.toBeNull();
  });
});
