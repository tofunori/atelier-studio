import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const { wsSendMock } = vi.hoisted(() => ({ wsSendMock: vi.fn((_msg: Record<string, unknown>) => true) }));
vi.mock("../lib/wsBus", () => ({ wsSend: wsSendMock }));

import QuickAsk from "./QuickAsk";
import { renderUi, resetTestState } from "../test/render";
import { makeProviderInfo } from "../test/fixtures";
import type { QaContext } from "../lib/quickAskContext";

const providers = [
  makeProviderInfo({ id: "claude", label: "Claude", models: ["claude-fable-5", "claude-sonnet-5"], defaultModel: "claude-fable-5" }),
  makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.6-luna", "gpt-5.5"], defaultModel: "gpt-5.5", efforts: ["low", "medium", "high", "xhigh", "max"] }),
  // Catalogue vivant tel que le CLI l'annonce : le libellé vient de
  // `modelLabels`, plus aucun nom Grok n'est codé en dur côté UI.
  makeProviderInfo({ id: "grok", label: "Grok", models: ["grok-4.6", "grok-4.5"], defaultModel: "grok-4.6", modelLabels: { "grok-4.6": "Grok 4.6", "grok-4.5": "Grok 4.5" }, efforts: ["minimal", "low", "medium", "high", "xhigh", "max"] }),
];

function renderQuickAsk(activeThreadId?: string, context?: QaContext) {
  return renderUi(
    <QuickAsk
      open
      minimized={false}
      draft=""
      activeThreadId={activeThreadId ?? null}
      context={context ?? null}
      providers={providers}
      defaultModels={{ grok: "grok-4.6" }}
      defaultEfforts={{ grok: "high" }}
      onMinimize={vi.fn()}
      onClose={vi.fn()}
      onInject={vi.fn()}
      onPromote={vi.fn()}
    />,
  );
}

beforeEach(() => {
  resetTestState();
  wsSendMock.mockClear();
});
afterEach(cleanup);

describe("Quick Ask", () => {
  it("utilise Grok 4.6 high par défaut lors de l'envoi", async () => {
    renderQuickAsk();
    expect(screen.getByText("Grok 4.6")).toBeTruthy();
    expect(screen.getByText("· High")).toBeTruthy();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Question rapide" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(wsSendMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "quickAsk",
      prompt: "Question rapide",
      provider: "grok",
      model: "grok-4.6",
      effort: "high",
    })));
  });

  it("ouvre un sélecteur complet provider, modèle et effort", async () => {
    renderQuickAsk();
    fireEvent.click(screen.getByRole("button", { name: /^(Modèle Quick Ask|Quick Ask model)$/ }));

    expect(await screen.findByRole("combobox", { name: "Provider" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^(Modèle|Model)$/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Effort" })).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Provider" }));
    expect(await screen.findByRole("option", { name: "Claude" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Codex" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Grok" })).toBeTruthy();
  });
});

describe("rendu des réponses", () => {
  function repondre(qaId: string, text: string) {
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: { qaId, event: { kind: "text", text } },
      }));
    });
  }

  it("rend les maths que le modèle écrit en \\[...\\], comme le chat", async () => {
    const { container } = renderQuickAsk();
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "et la formule ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const qaId = wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]?.qaId as string;
    repondre(qaId, "Le modèle :\n\n\\[ \\beta_{\\text{feu}} \\times x_{\\text{feu}} \\]");
    // la formule est composée — plus aucun délimiteur brut à l'écran
    await waitFor(() => expect(container.querySelector(".katex")).not.toBeNull(), { timeout: 4000 });
    expect(container.textContent).not.toContain("\\[");
  });
});

describe("modèle suivi", () => {
  it("part avec le modèle du fil actif, pas avec son propre défaut", () => {
    localStorage.setItem("atelier-studio.modelSel.thread:fil-1", JSON.stringify({
      activeProvider: "codex",
      byProvider: { codex: { model: "gpt-5.5", effort: "xhigh", permissionMode: "ask", fastMode: false } },
    }));
    const { container } = renderQuickAsk("fil-1");
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "et ça ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]).toMatchObject({
      provider: "codex", model: "gpt-5.5", effort: "xhigh",
    });
  });

  it("garde son propre choix quand aucun fil n'est actif", () => {
    const { container } = renderQuickAsk();
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "et ça ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]).toMatchObject({ provider: "grok", model: "grok-4.6" });
  });
});

describe("fenêtre redimensionnable", () => {
  it("offre les huit prises d'une fenêtre — quatre bords, quatre coins", () => {
    const { container } = renderQuickAsk();
    for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      expect(container.querySelector(`.qa-resize-${edge}`)).not.toBeNull();
    }
  });

  // Au-dessus de la galerie (une iframe), le pointeur quitte le document
  // parent dès qu'il la survole et le glissement se fige. La convention du
  // repo — body.dragging → iframe { pointer-events: none } — neutralise les
  // iframes le temps du geste. Le splitter et la biblio la posent déjà.
  it("neutralise les iframes pendant le geste, puis les rend", () => {
    const { container } = renderQuickAsk();
    fireEvent.mouseDown(container.querySelector(".qa-resize-se") as HTMLElement);
    expect(document.body.classList.contains("dragging")).toBe(true);
    fireEvent.mouseUp(window);
    expect(document.body.classList.contains("dragging")).toBe(false);
  });

  it("neutralise aussi les iframes pendant le déplacement de la fenêtre", () => {
    const { container } = renderQuickAsk();
    fireEvent.mouseDown(container.querySelector(".qa-head") as HTMLElement);
    expect(document.body.classList.contains("dragging")).toBe(true);
    fireEvent.mouseUp(window);
    expect(document.body.classList.contains("dragging")).toBe(false);
  });

  it("tirer le bord gauche recule l'origine et élargit", () => {
    const { container } = renderQuickAsk();
    const pop = container.querySelector(".qa-pop") as HTMLElement;
    pop.getBoundingClientRect = () => ({
      left: 100, top: 50, width: 640, height: 400, right: 740, bottom: 450, x: 100, y: 50,
      toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.mouseDown(container.querySelector(".qa-resize-w") as HTMLElement);
    fireEvent.mouseMove(window, { clientX: 40, clientY: 300 });
    fireEvent.mouseUp(window);
    const style = pop.getAttribute("style") ?? "";
    expect(style).toContain("left: 40px");
    expect(style).toContain("width: 700px");
  });
});

describe("contexte visible", () => {
  const ctx: QaContext = {
    selection: "partial pooling",
    message: "C'est ça le partial pooling : chaque zone emprunte à la moyenne.",
    role: "assistant",
    threadTitle: "Modèle hiérarchique",
  };

  it("garde la sélection sous les yeux une fois la question envoyée", () => {
    const { container } = renderQuickAsk(undefined, ctx);
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "explique" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // la puce d'édition a disparu (le contexte est parti avec la question)…
    expect(container.querySelector(".qa-ctx")).toBeNull();
    // …mais le tour garde la trace de ce sur quoi il porte
    expect(container.textContent).toContain("partial pooling");
  });
});
