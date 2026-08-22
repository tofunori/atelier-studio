// Caractérisation de la timeline Chat (plan 015, slice 4) — écrite AVANT
// l'extraction : streaming, ordre outils/texte, running→done, changement de
// thread, ancrage du scroll, markdown/Mermaid, review/usage par tour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { ThinkingBlock } from "./turnParts";
import { renderUi, resetTestState } from "../../test/render";
import { events, makeTurnEvents, FIXED_TS } from "../../test/fixtures";
import type { AgentEvent } from "../../lib/ws";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [],
    workingSince: null,
    commands: [],
    files: [],
    recentFiles: [],
    zoteroItems: [],
    injectText: null,
    onInjected: vi.fn(),
    attachments: [],
    onRemoveAttachment: vi.fn(),
    onQuote: vi.fn(),
    threadId: "thread-A",
    onPasteImage: vi.fn(),
    onPasteText: vi.fn(),
    onStop: vi.fn(),
    layout: "chat",
    onToggleExpand: vi.fn(),
    usage: null,
    onRevert: vi.fn(),
    onFork: vi.fn(),
    onEditSend: vi.fn(),
    onNewChat: vi.fn(),
    onOpenProject: vi.fn(),
    highlights: [],
    defaults: {
      defaultProvider: "claude",
      defaultModel: {},
      defaultEffort: {},
      defaultPermissionMode: "bypassPermissions",
    },
    pins: [],
    onStylePin: vi.fn(),
    onTogglePin: vi.fn(),
    disabled: false,
    onSubmit: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  resetTestState();
});
afterEach(() => {
  cleanup();
});

describe("timeline Chat — caractérisation avant extraction", () => {
  it("texte streamé : un seul bloc, jamais dupliqué, caret pendant le run", async () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({
        workingSince: FIXED_TS,
        events: [events.user(), { kind: "streaming", text: "Je regarde les don", ts: FIXED_TS + 100 } as AgentEvent],
      })} />,
    );
    const streamBlocks = () =>
      [...document.querySelectorAll(".msg-wrap .msg")].filter((el) =>
        el.textContent?.includes("Je regarde les"));
    expect(streamBlocks()).toHaveLength(1);
    // plan 066 L2 : le bubble content du chat rend désormais via la famille
    // "chat-md" (App.css) plutôt que le moteur shadcn/typeset — inchangé
    // ailleurs (AgentActivity, SourceReader).
    expect(streamBlocks()[0].classList.contains("chat-md")).toBe(true);
    expect(document.querySelector(".stream-caret")).toBeTruthy();

    // le flux grandit : toujours UN SEUL bloc streaming
    rerender(
      <Chat {...chatProps({
        workingSince: FIXED_TS,
        events: [events.user(), { kind: "streaming", text: "Je regarde les données d'albédo", ts: FIXED_TS + 200 } as AgentEvent],
      })} />,
    );
    expect(streamBlocks()).toHaveLength(1);
    // la cadence est lissée (~90 ms, useSmoothedStream) : le delta s'affiche
    // au prochain flush, pas au re-render — d'où l'attente.
    await waitFor(() => expect(streamBlocks()[0].textContent).toContain("données d'albédo"));
  });

  it("compose la timeline virtualisée LegendList avec des lignes stables", () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const viewport = document.querySelector(".messages") as HTMLElement;
    const content = viewport.querySelector(":scope > .legend-list-content-container") as HTMLElement;
    const rows = content.querySelectorAll(".timeline-virtual-row");

    expect(viewport).toBeTruthy();
    expect(content).toBeTruthy();
    expect(rows.length).toBeGreaterThan(0);
    expect([...rows].every((row) => row.hasAttribute("data-message-id"))).toBe(true);
  });

  it("révèle le premier tour seulement après stabilisation de la liste", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    try {
      const { rerender } = renderUi(<Chat {...chatProps()} />);
      rerender(
        <Chat {...chatProps({
          events: [events.user("Premier message")],
          workingSince: FIXED_TS,
        })} />,
      );

      const viewport = document.querySelector(".messages") as HTMLElement;
      expect(viewport).toHaveClass("is-first-turn-settling");
      expect(viewport).toHaveAttribute("data-first-turn-settling", "true");
      await waitFor(() => {
        expect(viewport).not.toHaveClass("is-first-turn-settling");
        expect(viewport).not.toHaveAttribute("data-first-turn-settling");
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("virtualise un long transcript au lieu de monter toutes les lignes", () => {
    const longTranscript = Array.from({ length: 400 }, (_, index) => (
      index % 2 === 0 ? events.user(`Question ${index}`) : events.text(`Réponse ${index}`)
    ));
    renderUi(<Chat {...chatProps({ events: longTranscript })} />);

    const mountedRows = document.querySelectorAll(".timeline-virtual-row");
    expect(mountedRows.length).toBeGreaterThan(0);
    expect(mountedRows.length).toBeLessThan(80);
    expect(screen.getByText("Réponse 399")).toBeTruthy();
  });

  it("porte les tours dans Message et les surfaces dans Bubble", () => {
    renderUi(<Chat {...chatProps({ events: [events.user(), events.text("Réponse structurée")] })} />);

    const userMessage = document.querySelector('[data-slot="message"][data-align="end"]') as HTMLElement;
    const userBubble = userMessage.querySelector('[data-slot="bubble"][data-variant="secondary"]');
    expect(userMessage.querySelector('[data-slot="message-content"].user-wrap')).toBeTruthy();
    expect(userBubble?.querySelector('[data-slot="bubble-content"].user-bubble')).toBeTruthy();

    const assistantMessage = document.querySelector('[data-slot="message"][data-align="start"]') as HTMLElement;
    const assistantBubble = assistantMessage.querySelector('[data-slot="bubble"][data-variant="ghost"]');
    expect(assistantMessage.querySelector('[data-slot="message-content"].msg-wrap')).toBeTruthy();
    // plan 066 L2 : "chat-md" remplace "typeset-chat" pour ce bubble content.
    expect(assistantBubble?.querySelector('[data-slot="bubble-content"].chat-md')).toBeTruthy();
    expect(assistantMessage.querySelector('[data-slot="message-footer"].msg-actions.is-persistent')).toBeTruthy();
  });

  it("confirme visuellement la copie d'un message et nomme toutes les petites actions", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderUi(<Chat {...chatProps({ events: [events.user("Question"), events.text("Réponse à copier")] })} />);

    const copyButtons = screen.getAllByRole("button", { name: /^(Copier|Copy)$/ });
    expect(copyButtons).toHaveLength(2);
    act(() => { copyButtons[1].click(); });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Réponse à copier"));
    const confirmed = await screen.findByRole("button", { name: /^(Copié dans le presse-papiers|Copied to clipboard)$/ });
    expect(confirmed.classList.contains("is-confirmed")).toBe(true);
    expect(screen.getByRole("button", { name: /^(Fork : nouveau chat à partir d'ici|Fork: new chat from here)$/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^(Épingler comme chapitre|Pin as chapter)$/ })).toHaveLength(2);
  });

  it("un outil est résumé en groupe (avant OU après un texte) et se déplie au clic", () => {
    // réalité : les outils consécutifs sont regroupés en une ligne résumée
    // (façon Codex) — le détail n'apparaît qu'en dépliant le groupe
    const before = [events.user(), events.tool({ id: "t1", detail: "avant.csv" }), events.text("Réponse.")];
    const after = [events.user(), events.text("Réponse."), events.tool({ id: "t2", detail: "apres.csv" })];

    const first = renderUi(<Chat {...chatProps({ events: before })} />);
    expect(screen.getByText("Réponse.")).toBeTruthy();
    const row1 = document.querySelector(".ui-activity-trigger") as HTMLElement;
    expect(row1).toBeTruthy();
    expect(row1.getAttribute("data-slot")).toBe("collapsible-trigger");
    expect(row1.closest('[data-slot="collapsible"]')).toBeTruthy();
    expect(row1.getAttribute("aria-expanded")).toBe("false");
    // Replié par défaut : le corps du disclosure est démonté (le libellé, lui,
    // peut nommer le fichier — nommage Hermes des singletons).
    expect(document.querySelector('[data-slot="collapsible-content"].ui-activity-detail')).toBeNull();
    act(() => { row1.click(); });
    expect(document.querySelector(".ui-activity-trigger")?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-slot="collapsible-content"].ui-activity-detail')).toBeTruthy();
    expect(screen.getAllByText(/avant\.csv/).length).toBeGreaterThan(0);
    first.unmount();

    renderUi(<Chat {...chatProps({ events: after })} />);
    expect(screen.getByText("Réponse.")).toBeTruthy();
    const row2 = document.querySelector(".ui-activity-trigger") as HTMLElement;
    act(() => { row2.click(); });
    expect(screen.getAllByText(/apres\.csv/).length).toBeGreaterThan(0);
  });

  it("un groupe running devient done : la capsule remplace l'attente", () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({ workingSince: FIXED_TS, events: [events.user(), events.started()] })} />,
    );
    expect(document.querySelector(".working")).toBeTruthy();
    expect(document.querySelector(".working-header .working-divider")).toBeTruthy();
    expect(document.querySelector(".working-spin")).toBeNull();
    // Début de tour, rien reçu : aucune ligne de pensée inventée — le pulse et
    // le chrono suffisent (« ya réflexion mais ya aucune réflexion là »).
    expect(document.querySelectorAll(".thinking-live-indicator")).toHaveLength(0);

    rerender(<Chat {...chatProps({ workingSince: null, events: makeTurnEvents() })} />);
    expect(document.querySelector(".working")).toBeNull();
    expect(document.querySelector(".done")).toBeTruthy();
    expect(document.querySelector("#last-done")).toBeTruthy();
  });

  it("changement de thread : la timeline est remplacée, rien ne fuit", () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({ threadId: "A", events: [events.user("Question du fil A")] })} />,
    );
    // depuis la marge annotée, l'aperçu d'un prompt vit aussi dans le rail de
    // navigation : ces assertions portent sur le transcript lui-même
    const transcript = () => within(document.querySelector(".messages") as HTMLElement);
    expect(transcript().getByText("Question du fil A")).toBeTruthy();

    rerender(<Chat {...chatProps({ threadId: "B", events: [events.user("Question du fil B")] })} />);
    expect(screen.queryByText("Question du fil A")).toBeNull();
    expect(transcript().getByText("Question du fil B")).toBeTruthy();
  });

  it("scroll : le retour au bas apparaît seulement quand la lecture s'en éloigne", () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    expect(messages).toBeTruthy();
    const endButton = document.querySelector(".ui-scroll-to-bottom") as HTMLButtonElement;
    expect(endButton).toHaveAttribute("data-active", "false");
    expect(screen.queryByText("Your last message")).toBeNull();

    // simuler une remontée loin du bas (jsdom : géométrie contrôlée à la main)
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });
    messages.scrollTop = 100; // fromBottom = 1500 > 200
    act(() => {
      messages.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(endButton).toHaveAttribute("data-active", "true");
    expect(endButton?.closest(".timeline-scroll-wrap")).toBeTruthy();
  });

  it("scroll : une nouvelle réponse est ajoutée sans perdre la commande de bord bas", async () => {
    const { rerender } = renderUi(<Chat {...chatProps({ events: [events.user()] })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });

    messages.scrollTop = 100;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });
    expect(document.querySelector(".ui-scroll-to-bottom")).toHaveAttribute("data-active", "true");

    messages.scrollTop = 1550; // 50 px du bas : rattache le suivi (seuil actuel 80)
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });

    rerender(<Chat {...chatProps({ events: [events.user(), events.text("Nouvelle réponse")] })} />);
    await waitFor(() => expect(screen.getByText("Nouvelle réponse")).toBeTruthy());
    expect(document.querySelector(".ui-scroll-to-bottom")).toHaveAttribute("data-active", "true");
  });

  it("scroll : un nouveau tour ne rebobine pas la lecture vers une ancre utilisateur", async () => {
    const nativeRect = HTMLElement.prototype.getBoundingClientRect;
    const rect = (top: number, height: number): DOMRect => ({
      top,
      bottom: top + height,
      left: 0,
      right: 760,
      width: 760,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("messages")) return rect(0, 400);
      const id = this.dataset.messageId;
      const viewport = document.querySelector(".messages") as HTMLElement | null;
      const scrollTop = viewport?.scrollTop ?? 0;
      if (id === "message-0") return rect(-scrollTop, 60);
      if (id === "message-1") return rect(100 - scrollTop, 60);
      if (id === "message-2") return rect(1200 - scrollTop, 60);
      return nativeRect.call(this);
    });

    try {
      const initialEvents = [events.user("Premier tour"), events.text("Première réponse")];
      const { rerender } = renderUi(<Chat {...chatProps({ events: initialEvents })} />);
      const messages = document.querySelector(".messages") as HTMLElement;
      Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });

      messages.scrollTop = 300;
      act(() => {
        messages.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
        messages.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      rerender(
        <Chat {...chatProps({
          events: [...initialEvents, events.user("Nouveau tour")],
        })} />,
      );

      await waitFor(() => expect(messages.scrollTop).toBe(300));
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("navigation du fil : le bouton compact revient au bord bas puis disparaît", async () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });

    messages.scrollTop = 100;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });

    const scrollTo = vi.spyOn(messages, "scrollTo");
    const endButton = document.querySelector(".ui-scroll-to-bottom") as HTMLButtonElement;
    expect(endButton).toHaveAttribute("data-active", "true");
    act(() => { endButton.click(); });
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    expect(endButton).toHaveAttribute("data-active", "false");
  });

  it("scroll : pendant un travail éloigné du bas, le bouton montre trois points", () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents(), workingSince: FIXED_TS })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });
    messages.scrollTop = 100;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });

    expect(document.querySelector(".ui-scroll-to-bottom")).toHaveAttribute("data-active", "true");
    expect(document.querySelectorAll(".ui-scroll-working-dots > span")).toHaveLength(3);
  });

  it("markdown, code et liens fichier conservent leur rendu", () => {
    renderUi(
      <Chat {...chatProps({
        events: [
          events.user(),
          events.text("Du **gras**, du `code` :\n\n```python\nprint('albedo')\n```\n\nVoir analysis/albedo_trends.py:12"),
        ],
      })} />,
    );
    expect(screen.getByText("gras").tagName).toBe("STRONG");
    // plan 066 L2 : "chat-md" remplace "typeset typeset-chat" sur le message.
    expect(document.querySelector(".msg.chat-md")).toBeTruthy();
    expect(document.querySelector(".codeblock.not-typeset pre code")).toBeTruthy();
    expect(screen.getByText(/albedo_trends\.py/)).toBeTruthy();
  });

  it("markdown riche : tableau fluide sans scroll horizontal et référence fichier interactive", () => {
    renderUi(
      <Chat {...chatProps({
        events: [
          events.user(),
          events.text([
            "| Saison | Albédo |",
            "| --- | ---: |",
            "| Hiver | 0.72 |",
            "",
            "[`analysis/albedo_trends.py:12`](analysis/albedo_trends.py:12)",
          ].join("\n")),
        ],
      })} />,
    );
    expect(document.querySelector(".md-table table")).toBeTruthy();
    expect(document.querySelector(".md-table.typeset-scroll")).toBeNull();
    const fileRef = screen.getByRole("button", { name: "analysis/albedo_trends.py:12" });
    expect(fileRef.classList.contains("file-ref")).toBe(true);
  });

  it("rend les liens de figures PNG et PDF comme des fichiers interactifs", () => {
    renderUi(
      <Chat {...chatProps({
        events: [
          events.user(),
          events.text([
            "- [Figure PNG](outputs/figures/albedo_annuel.png)",
            "- [Figure PDF](outputs/figures/albedo_annuel.pdf)",
          ].join("\n")),
        ],
      })} />,
    );

    expect(screen.getByRole("button", { name: "Figure PNG" })).toHaveClass("file-ref");
    expect(screen.getByRole("button", { name: "Figure PDF" })).toHaveClass("file-ref");
  });

  it("review et usage restent associés au bon tour (badge sur le DERNIER done)", () => {
    const twoTurns = [
      events.user("Premier ?"), events.text("Un."), events.done(),
      events.user("Deuxième ?"), events.text("Deux."), events.done({ result: "fin 2" }),
    ];
    renderUi(<Chat {...chatProps({ events: twoTurns, usage: { context: 1000, output: 200, cost: null, turns: 2 } })} />);

    const dones = document.querySelectorAll(".done");
    expect(dones).toHaveLength(2);
    // seul le DERNIER done porte l'ancre #last-done (bouton verify/badge review)
    expect(dones[1].id).toBe("last-done");
    expect(dones[0].id).toBe("");
    expect(document.querySelectorAll("#last-done")).toHaveLength(1);
    // « Vérifier ce tour » retiré (demande Thierry 2026-08-21) : plus de
    // bouton manuel — le badge review reste piloté par les déclencheurs auto.
    expect(document.querySelector(".done-verify")).toBeNull();
  });
});

// Vue de la transcription (2026-08-21) : c'est `collapsedByDefault` — dérivé de
// la vue choisie — qui pilote le défaut, plus le direct. Réflexion/Détaillé
// (false) laissent le flux ouvert MÊME après le tour ; Normal (true) le replie
// en fenêtre. Le clic manuel garde toujours la main.
describe("ThinkingBlock — vue de la transcription", () => {
  it("suit collapsedByDefault et respecte un clic manuel", async () => {
    const { rerender } = renderUi(<ThinkingBlock text="je réfléchis longuement" live />);
    // défaut déplié (vue Réflexion/Détaillé) : le corps est déroulé
    expect(screen.getByText("je réfléchis longuement")).toBeTruthy();
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("true");

    // fin du tour : la vue dépliée le RESTE (flux complet façon Hermes)
    rerender(<ThinkingBlock text="je réfléchis longuement" live={false} />);
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("true");

    // un clic reprend la main et survit au changement d'état
    fireEvent.click(screen.getByRole("button"));
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("false");
    rerender(<ThinkingBlock text="je réfléchis encore" live={false} />);
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("vue Normal : replié en fenêtre, en direct comme après le tour", () => {
    const { rerender } = renderUi(<ThinkingBlock text="je réfléchis longuement" live collapsedByDefault />);
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".thinking-body.windowed")).toBeTruthy();
    rerender(<ThinkingBlock text="je réfléchis longuement" live={false} collapsedByDefault />);
    expect(document.querySelector(".thinking-head")?.getAttribute("aria-expanded")).toBe("false");
  });
});
