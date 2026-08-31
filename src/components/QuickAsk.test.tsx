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

  // Un turn codex qui échoue en amont (effort refusé par le provider, clé
  // invalide…) ne produit AUCUN événement `error` : seulement `done` avec
  // ok:false et le détail dans `result`. Le réducteur l'ignorait et la
  // fenêtre restait muette (capture Thierry 2026-08-29 : ollama-cloud +
  // xhigh → 400 silencieux).
  it("affiche l'échec quand le turn se termine par done ok:false", () => {
    const { container } = renderQuickAsk();
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "pourquoi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const qaId = wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]?.qaId as string;
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: {
          qaId,
          event: {
            kind: "done", ok: false,
            result: JSON.stringify({ error: { message: "Provider error 400: invalid reasoning value: 'xhigh'" } }),
          },
        },
      }));
    });
    expect(container.textContent).toContain("⚠ Provider error 400: invalid reasoning value: 'xhigh'");
    // et la fenêtre est prête pour une nouvelle question
    fireEvent.change(input, { target: { value: "encore" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(wsSendMock.mock.calls.length).toBe(2);
  });

  it("affiche un échec générique quand done ok:false n'a pas de détail", () => {
    const { container } = renderQuickAsk();
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "pourquoi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const qaId = wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]?.qaId as string;
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: { qaId, event: { kind: "done", ok: false, result: "" } },
      }));
    });
    expect(container.querySelector(".qa-msg.assistant")?.textContent).toContain("⚠");
  });

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

describe("sélection dans la réponse", () => {
  // La capsule existait seulement dans le chat principal : surligner un
  // passage de la réponse du Quick Ask n'offrait rien (capture Thierry
  // 2026-08-31). Ici « Ajouter au chat » vise le Quick Ask lui-même.
  function selectionner(node: Node, text: string) {
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => text,
      rangeCount: 1,
      getRangeAt: () => ({
        startContainer: node,
        getBoundingClientRect: () => ({ left: 100, width: 40, top: 200 }),
      }),
      removeAllRanges: () => {},
    } as unknown as Selection);
  }

  it("pose le passage surligné en contexte de la question suivante", async () => {
    const { container } = renderQuickAsk();
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: { qaId: wsSendMock.mock.calls[0]?.[0]?.qaId ?? "", event: { kind: "text", text: "x" } },
      }));
    });
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "explique" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const qaId = wsSendMock.mock.calls[0][0].qaId as string;
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: { qaId, event: { kind: "text", text: "Le partial pooling emprunte à la moyenne." } },
      }));
    });

    const reponse = container.querySelector('[data-qa-msg="1"]') as HTMLElement;
    selectionner(reponse.firstChild ?? reponse, "partial pooling");
    fireEvent.mouseUp(container.querySelector(".qa-body") as HTMLElement);

    await waitFor(() => expect(screen.getByText("Add to chat")).toBeTruthy());
    fireEvent.mouseDown(screen.getByText("Add to chat"));

    // la puce de contexte du Quick Ask porte le passage — rien n'est parti
    // vers le chat principal
    await waitFor(() => expect(container.querySelector(".qa-ctx")?.textContent).toContain("partial pooling"));

    wsSendMock.mockClear();
    fireEvent.change(input, { target: { value: "et donc ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const prompt = wsSendMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Le partial pooling emprunte à la moyenne.");
    expect(prompt).toContain("partial pooling");
  });
});

describe("historique", () => {
  const RECENTS = "atelier-studio.qaRecents";
  function recents() { return JSON.parse(localStorage.getItem(RECENTS) ?? "[]"); }

  function conversation(container: HTMLElement) {
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "pourquoi ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const qaId = wsSendMock.mock.calls[wsSendMock.mock.calls.length - 1]?.[0]?.qaId as string;
    act(() => {
      window.dispatchEvent(new CustomEvent("qa-event", {
        detail: { qaId, event: { kind: "text", text: "parce que." } },
      }));
    });
  }

  // Le balai promettait « l'ancienne reste dans les récents » (commit
  // fcdb52af) sans jamais l'archiver.
  it("le balai archive la conversation avant d'en ouvrir une neuve", () => {
    const { container } = renderQuickAsk();
    conversation(container);
    fireEvent.click(container.querySelector(".qa-clear-btn") as HTMLElement);
    expect(recents()).toHaveLength(1);
    expect(recents()[0].msgs[0].text).toBe("pourquoi ?");
  });

  // Thierry minimise ou ferme la fenêtre sans jamais passer par close() :
  // sans archivage au démontage, l'historique restait vide À VIE (ui.json du
  // 2026-08-26 : qaSelection et qaBox présents, qaRecents absent).
  it("archive la conversation quand la fenêtre disparaît", () => {
    const { container, unmount } = renderQuickAsk();
    conversation(container);
    expect(recents()).toHaveLength(0);
    unmount();
    expect(recents()).toHaveLength(1);
  });

  it("n'archive rien tant qu'aucune réponse n'est arrivée", () => {
    const { container, unmount } = renderQuickAsk();
    const input = container.querySelector(".qa-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "sans réponse" } });
    fireEvent.keyDown(input, { key: "Enter" });
    unmount();
    expect(recents()).toHaveLength(0);
  });
});
