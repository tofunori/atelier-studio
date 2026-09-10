import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderUi, resetTestState } from "../test/render";
import {
  AssistantUiPinnedMessageActions,
  derivePinLabel,
  isValidPinLabel,
} from "./AssistantUiPinnedMessageActions";

afterEach(() => {
  cleanup();
  resetTestState();
});

describe("AssistantUiPinnedMessageActions", () => {
  it("does not invent actions without a source message", () => {
    renderUi(
      <AssistantUiPinnedMessageActions
        sourceIndex={null}
        text="Une réponse"
        pins={[]}
        onTogglePin={vi.fn()}
        onStylePin={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks an existing pin and delegates toggle with the persisted label", () => {
    const onTogglePin = vi.fn();
    renderUi(
      <AssistantUiPinnedMessageActions
        sourceIndex={12}
        text="Réponse ignorée"
        pins={[{ index: 12, label: "Résultats à revoir" }]}
        onTogglePin={onTogglePin}
        onStylePin={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Désépingler le chapitre" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-pinned", "true");
    fireEvent.click(button);
    expect(onTogglePin).toHaveBeenCalledOnce();
    expect(onTogglePin).toHaveBeenCalledWith(12, "Résultats à revoir");
  });

  it("delegates a new pin with a plain-text derived label", () => {
    const onTogglePin = vi.fn();
    renderUi(
      <AssistantUiPinnedMessageActions
        sourceIndex={4}
        text={"## Résultats **validés**\n\nLes tests sont terminés."}
        pins={[]}
        onTogglePin={onTogglePin}
        onStylePin={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Épingler comme chapitre" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onTogglePin).toHaveBeenCalledWith(4, "Résultats validés Les tests sont terminés.");
  });

  it("edits the persisted label and offers unpin in the official popover", async () => {
    const onStylePin = vi.fn();
    const onTogglePin = vi.fn();
    renderUi(
      <AssistantUiPinnedMessageActions
        sourceIndex={8}
        text="Réponse"
        pins={[{ index: 8, label: "Avant", color: "#7aa2f7", style: "solid" }]}
        onTogglePin={onTogglePin}
        onStylePin={onStylePin}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifier l’épingle" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "Libellé de l’épingle" }), {
      target: { value: "Après" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onStylePin).toHaveBeenCalledWith(8, { label: "Après" });
    expect(screen.queryByRole("textbox", { name: "Couleur de l’épingle" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Style de l’épingle" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Modifier l’épingle" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Désépingler" }));
    expect(onTogglePin).toHaveBeenCalledWith(8, "Avant");
  });

  it("keeps the old label contract explicit", () => {
    expect(derivePinLabel("## **Titre**")).toBe("Titre");
    expect(isValidPinLabel(" Nom ")).toBe(true);
    expect(isValidPinLabel("   ")).toBe(false);
  });
});
