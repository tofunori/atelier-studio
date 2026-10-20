import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { MdThreadContext } from "./mdThread";

const sent: any[] = [];
vi.mock("../../lib/wsBus", () => ({
  wsSend: (obj: unknown) => { sent.push(obj); return true; },
  wsReady: () => true,
}));

import CellCite, { citedValue } from "./CellCite";

function answer(checks: unknown[]) {
  const ask = sent.find((m) => m.op === "verify");
  act(() => { window.dispatchEvent(new CustomEvent("kernel-command", { detail: { requestId: ask.requestId, result: { checks } } })); });
  return ask;
}

describe("citedValue", () => {
  it("prend le dernier nombre de la phrase avant la citation", () => {
    expect(citedValue("à 1,51 écart type ")).toBe("1,51");
    expect(citedValue("mais 0,73 au 1er juin dans le modèle ")).toBe("0,73");
    expect(citedValue("17e sur 22 en mesure (−0,88)")).toBe("−0,88");
    expect(citedValue("vaut 64 % ")).toBe("64 %");
    expect(citedValue("Rien ici. Puis du texte ")).toBeNull();
  });
});

describe("CellCite", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); sent.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it("vérifie les chiffres cités en un seul message et marque chaque pastille", async () => {
    renderUi(
      <MdThreadContext.Provider value="fil-cite">
        <p>à 1,51 écart type <CellCite cell={29} label="cellule 29" /> ; vaut 0,64 <CellCite cell={27} label="cellule 27" />.</p>
      </MdThreadContext.Provider>,
    );
    await act(async () => { vi.advanceTimersByTime(40); });
    const ask = answer([
      { cell: 29, value: "1,51", check: { status: "found" } },
      { cell: 27, value: "0,64", check: { status: "missing", closest: "0.61" } },
    ]);
    expect(ask.claims).toEqual([{ cell: 29, value: "1,51" }, { cell: 27, value: "0,64" }]);
    expect(sent.filter((m) => m.op === "verify")).toHaveLength(1);
    await act(async () => {});
    const [ok, warn] = screen.getAllByRole("button");
    expect(ok.getAttribute("data-state")).toBe("found");
    expect(warn.getAttribute("data-state")).toBe("missing");
    expect(warn.getAttribute("title")).toBe("0,64 introuvable dans la sortie de la cellule 27");
    vi.useRealTimers();
    fireEvent.click(warn);
    expect(await screen.findByText(/La cellule 27 affiche 0,61/u)).toBeTruthy();
    const focused = vi.fn();
    window.addEventListener("kernel-cell-focus", (e) => focused((e as CustomEvent).detail));
    fireEvent.click(screen.getByText("Ouvrir la cellule 27"));
    expect(focused).toHaveBeenCalledWith({ cell: 27 });
  });

  it("sans chiffre devant, la pastille ouvre seulement la cellule", () => {
    renderUi(<MdThreadContext.Provider value="fil-plain"><p>voir <CellCite cell={3} label="cellule 3" /></p></MdThreadContext.Provider>);
    expect(screen.getByRole("button").getAttribute("data-state")).toBe("plain");
    expect(sent.some((m) => m.op === "verify")).toBe(false);
  });
});
