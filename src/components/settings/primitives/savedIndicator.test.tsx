// Pastille « Enregistré » (lot 1) : la persistance existe déjà (localStorage
// + miroir disque) ; ce qui manquait, c'est le retour visuel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { SavedIndicator, useSavedFlash } from "./index";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

function Harness() {
  const { visible, flash } = useSavedFlash();
  return (
    <>
      <SavedIndicator visible={visible} />
      <button type="button" onClick={flash}>changer</button>
    </>
  );
}

describe("SavedIndicator", () => {
  it("annonce poliment sans voler le focus", () => {
    renderUi(<SavedIndicator visible={true} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Enregistré");
  });

  it("reste dans le document quand il est masqué, pour que aria-live fonctionne", () => {
    const { container } = renderUi(<SavedIndicator visible={false} />);
    const el = container.querySelector(".set-saved");
    expect(el).not.toBeNull();
    expect(el).not.toHaveClass("on");
  });

  it("un échec d'écriture disque dit ce qui s'est passé, pas juste une couleur", () => {
    renderUi(<SavedIndicator visible={true} failed={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("Non enregistré sur disque");
  });
});

describe("useSavedFlash", () => {
  it("flash() montre la pastille puis la masque après 1,6 s", () => {
    renderUi(<Harness />);
    expect(document.querySelector(".set-saved.on")).toBeNull();

    act(() => { screen.getByText("changer").click(); });
    expect(document.querySelector(".set-saved.on")).not.toBeNull();

    act(() => { vi.advanceTimersByTime(1600); });
    expect(document.querySelector(".set-saved.on")).toBeNull();
  });

  it("un second flash relance le délai au lieu de le cumuler", () => {
    renderUi(<Harness />);
    act(() => { screen.getByText("changer").click(); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { screen.getByText("changer").click(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector(".set-saved.on")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.querySelector(".set-saved.on")).toBeNull();
  });
});
