import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegateRow } from "./DelegateRow";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

describe("DelegateRow", () => {
  it("pendant le travail : initiale, nom, état, tâche dessous, anneau et chrono", () => {
    const { container } = render(
      <DelegateRow name="Code" task="Pondérations du panel" state="running" since={Date.now() - 72_000} onOpen={() => {}} />,
    );
    expect(container.querySelector(".delegate-row-avatar")?.textContent).toBe("C");
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.getByText("travaille")).toBeTruthy();
    expect(container.querySelector(".delegate-row-task")?.textContent).toBe("Pondérations du panel");
    expect(container.querySelector(".tool-run-ring")).toBeTruthy();
    expect(container.querySelector(".delegate-row-time")?.textContent).toBe("1 min 12 s");
  });

  it("une fois fini : « a rendu son rapport », la durée, et le clic ouvre son fil", () => {
    const onOpen = vi.fn();
    render(<DelegateRow name="Code" task="Pondérations du panel" state="done" reports={1} durationMs={184_000} onOpen={onOpen} />);
    expect(screen.getByText("a rendu son rapport")).toBeTruthy();
    expect(screen.getByText("3 min 4 s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir le fil de Code/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deux rapports du même spécialiste se disent sur la rangée", () => {
    render(<DelegateRow name="Nature" state="done" reports={2} />);
    expect(screen.getByText("a rendu 2 rapports")).toBeTruthy();
  });

  it("une carte à lancer : « attend ton feu vert » avec sa pastille", () => {
    const { container } = render(<DelegateRow name="Code" state="needs-you" onOpen={() => {}} />);
    expect(screen.getByText("attend ton feu vert")).toBeTruthy();
    expect(container.querySelector(".delegate-row-dot")).toBeTruthy();
  });

  it("arrêté sans rapport : état éteint", () => {
    const { container } = render(<DelegateRow name="Code" state="waiting" onOpen={() => {}} />);
    expect(screen.getByText("s’est arrêté sans rapport")).toBeTruthy();
    expect(container.querySelector(".delegate-row")?.getAttribute("data-state")).toBe("waiting");
  });
});
