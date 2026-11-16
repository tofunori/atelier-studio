import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegateRow } from "./DelegateRow";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

describe("DelegateRow", () => {
  it("pendant le travail : le nom, la tâche, l'anneau et le chrono, sans texte du spécialiste", () => {
    const { container } = render(
      <DelegateRow name="@Code" task="Pondérations du panel" state="running" since={Date.now() - 72_000} onOpen={() => {}} />,
    );
    expect(screen.getByText("@Code travaille")).toBeTruthy();
    expect(screen.getByText("Pondérations du panel")).toBeTruthy();
    expect(container.querySelector(".tool-run-ring")).toBeTruthy();
    expect(container.querySelector(".tool-duration")?.textContent).toBe("1 min 12 s");
  });

  it("une fois fini : « a rendu son rapport », la durée, et le clic ouvre son fil", () => {
    const onOpen = vi.fn();
    render(<DelegateRow name="@Code" task="Pondérations du panel" state="done" durationMs={184_000} onOpen={onOpen} />);
    expect(screen.getByText("@Code a rendu son rapport")).toBeTruthy();
    expect(screen.getByText("3 min 4 s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir le fil de @Code/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("arrêté sans rapport : rangée grisée", () => {
    const { container } = render(<DelegateRow name="@Code" state="waiting" onOpen={() => {}} />);
    expect(screen.getByText("@Code s’est arrêté sans rapport")).toBeTruthy();
    expect(container.querySelector(".delegate-row")?.classList.contains("is-soft")).toBe(true);
  });
});
