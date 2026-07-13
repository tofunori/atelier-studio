import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer.tsx";

describe("Composer", () => {
  afterEach(cleanup);

  it("send calls onSend and clears", () => {
    const onSend = vi.fn();
    render(<Composer busy={false} onSend={onSend} onStop={() => {}} />);
    const ta = screen.getByLabelText("Message");
    fireEvent.change(ta, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(onSend).toHaveBeenCalledWith("Hello");
    expect((ta as HTMLTextAreaElement).value).toBe("");
  });

  it("busy shows Stop with same control", () => {
    const onStop = vi.fn();
    render(<Composer busy onSend={() => {}} onStop={onStop} />);
    const btn = screen.getByRole("button", { name: "Arrêter" });
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalled();
  });

  it("borne le composer à la largeur du viewport", () => {
    const { container } = render(
      <Composer busy={false} onSend={() => {}} onStop={() => {}} />,
    );
    const textarea = container.querySelector('textarea[aria-label="Message"]');
    if (!textarea) throw new Error("textarea Message introuvable");
    const group = textarea.closest('[data-slot="input-group"]');
    expect(group).toHaveClass("w-full", "min-w-0", "max-w-full", "overflow-hidden");
    expect(textarea).toHaveClass(
      "field-sizing-fixed",
      "w-0",
      "min-w-0",
      "max-w-full",
      "overflow-x-hidden",
    );
  });

  it("garde l'ajout de fichier dans le composeur sans rangée permanente", () => {
    const onAttach = vi.fn();
    render(
      <Composer
        busy={false}
        onSend={() => {}}
        onStop={() => {}}
        onAttach={onAttach}
        hasShelf={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Joindre un fichier" }));
    expect(onAttach).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Message").closest('[data-slot="input-group"]')).toContainElement(
      screen.getByRole("button", { name: "Joindre un fichier" }),
    );
  });
});
