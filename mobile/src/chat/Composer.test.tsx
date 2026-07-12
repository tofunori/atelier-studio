import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer.tsx";

describe("Composer", () => {
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
    expect(btn).toHaveTextContent("Stop");
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalled();
  });
});
