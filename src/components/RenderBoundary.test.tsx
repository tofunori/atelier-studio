// Audit 2026-10-18, problème 14 : une exception de rendu dans un message ou
// dans le chat n'efface que cette partie ; « Recharger » la remonte.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Deferred, RenderBoundary } from "./RenderBoundary";
import { setLanguage, t } from "../lib/i18n";

let broken = true;
function Fragile() {
  if (broken) throw new Error("message illisible");
  return <p>message rétabli</p>;
}

describe("RenderBoundary", () => {
  beforeEach(() => {
    setLanguage("fr");
    broken = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("isole la partie fautive, garde ses voisines et la remonte au clic sur Recharger", () => {
    render(
      <div>
        <p>voisin intact</p>
        <RenderBoundary message={t("render.message-error")}><Fragile /></RenderBoundary>
      </div>,
    );
    expect(screen.getByText("voisin intact")).toBeInTheDocument();
    expect(screen.getByText(t("render.message-error"))).toBeInTheDocument();
    expect(screen.getByText("message illisible")).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: t("action.reload") }));
    expect(screen.getByText("message rétabli")).toBeInTheDocument();
    expect(screen.queryByText(t("render.message-error"))).toBeNull();
  });

  it("Deferred fait atteindre la frontière par une exception de la fonction de rendu elle-même", () => {
    render(
      <RenderBoundary>
        <Deferred render={() => { throw new Error("rangée cassée"); }} />
      </RenderBoundary>,
    );
    expect(screen.getByText(t("render.error"))).toBeInTheDocument();
  });
});
