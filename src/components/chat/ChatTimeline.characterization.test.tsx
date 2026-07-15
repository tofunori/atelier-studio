// Caractérisation de la timeline Chat (plan 015, slice 4) — écrite AVANT
// l'extraction : streaming, ordre outils/texte, running→done, changement de
// thread, ancrage du scroll, markdown/Mermaid, review/usage par tour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
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
  it("texte streamé : un seul bloc, jamais dupliqué, caret pendant le run", () => {
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
    expect(streamBlocks()[0].classList.contains("typeset")).toBe(true);
    expect(streamBlocks()[0].classList.contains("typeset-chat")).toBe(true);
    expect(document.querySelector(".stream-caret")).toBeTruthy();

    // le flux grandit : toujours UN SEUL bloc streaming
    rerender(
      <Chat {...chatProps({
        workingSince: FIXED_TS,
        events: [events.user(), { kind: "streaming", text: "Je regarde les données d'albédo", ts: FIXED_TS + 200 } as AgentEvent],
      })} />,
    );
    expect(streamBlocks()).toHaveLength(1);
    expect(streamBlocks()[0].textContent).toContain("données d'albédo");
  });

  it("compose la timeline selon l'ordre officiel Provider → Root → Viewport → Content → Item", () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const root = document.querySelector('[data-slot="message-scroller"]') as HTMLElement;
    const viewport = root.querySelector(':scope > [data-slot="message-scroller-viewport"]') as HTMLElement;
    const content = viewport.querySelector(':scope > [data-slot="message-scroller-content"]') as HTMLElement;
    const children = [...content.children].filter((child) => !child.hasAttribute("data-message-scroller-spacer"));

    expect(root).toBeTruthy();
    expect(viewport.classList.contains("messages")).toBe(true);
    expect(content.classList.contains("messages-content")).toBe(true);
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((child) => child.getAttribute("data-slot") === "message-scroller-item")).toBe(true);
    expect(content.querySelector('[data-scroll-anchor="true"]')).toBeNull();
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
    expect(assistantBubble?.querySelector('[data-slot="bubble-content"].typeset-chat')).toBeTruthy();
    expect(assistantMessage.querySelector('[data-slot="message-footer"].msg-actions')).toBeTruthy();
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
    expect(screen.queryByText(/avant\.csv/)).toBeNull(); // replié par défaut
    act(() => { row1.click(); });
    expect(row1.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-slot="collapsible-content"].ui-activity-detail')).toBeTruthy();
    expect(screen.getByText(/avant\.csv/)).toBeTruthy();
    first.unmount();

    renderUi(<Chat {...chatProps({ events: after })} />);
    expect(screen.getByText("Réponse.")).toBeTruthy();
    const row2 = document.querySelector(".ui-activity-trigger") as HTMLElement;
    act(() => { row2.click(); });
    expect(screen.getByText(/apres\.csv/)).toBeTruthy();
  });

  it("un groupe running devient done : la capsule remplace l'attente", () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({ workingSince: FIXED_TS, events: [events.user(), events.started()] })} />,
    );
    expect(document.querySelector(".working")).toBeTruthy();
    expect(document.querySelector('[data-slot="marker"].working')).toBeTruthy();
    expect(document.querySelector('[data-slot="marker-icon"] .working-spin')).toBeTruthy();

    rerender(<Chat {...chatProps({ workingSince: null, events: makeTurnEvents() })} />);
    expect(document.querySelector(".working")).toBeNull();
    expect(document.querySelector(".done")).toBeTruthy();
    expect(document.querySelector("#last-done")).toBeTruthy();
  });

  it("changement de thread : la timeline est remplacée, rien ne fuit", () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({ threadId: "A", events: [events.user("Question du fil A")] })} />,
    );
    expect(screen.getByText("Question du fil A")).toBeTruthy();

    rerender(<Chat {...chatProps({ threadId: "B", events: [events.user("Question du fil B")] })} />);
    expect(screen.queryByText("Question du fil A")).toBeNull();
    expect(screen.getByText("Question du fil B")).toBeTruthy();
  });

  it("scroll : le contrôle officiel auto-géré est monté dans le scroller", () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    expect(messages).toBeTruthy();

    // simuler une remontée loin du bas (jsdom : géométrie contrôlée à la main)
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });
    messages.scrollTop = 100; // fromBottom = 1500 > 200
    act(() => {
      messages.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const endButton = document.querySelector('[data-slot="message-scroller-button"][data-direction="end"]');
    expect(endButton).toBeTruthy();
    expect(endButton?.closest('[data-slot="message-scroller"]')).toBeTruthy();
  });

  it("scroll : revenir près du bas rattache le suivi et une nouvelle réponse suit le bord bas", async () => {
    const { rerender } = renderUi(<Chat {...chatProps({ events: [events.user()] })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });

    messages.scrollTop = 100;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });
    expect(document.querySelector('[data-slot="message-scroller-button"]')).toBeTruthy();

    messages.scrollTop = 1550; // 50 px du bas : rattache le suivi (seuil actuel 80)
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });

    rerender(<Chat {...chatProps({ events: [events.user(), events.text("Nouvelle réponse")] })} />);
    // MessageScroller vise la position maximale valide (scrollHeight - viewport),
    // plutôt qu'une valeur hors plage ensuite clampée par le navigateur.
    await waitFor(() => expect(messages.scrollTop).toBe(1600));
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

  it("navigation du fil : les deux actions ciblent le dernier tour utilisateur et le bord bas", async () => {
    renderUi(<Chat {...chatProps({ events: makeTurnEvents() })} />);
    const messages = document.querySelector(".messages") as HTMLElement;
    Object.defineProperty(messages, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });

    messages.scrollTop = 100;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });

    // La commande officielle calcule la destination depuis les rectangles
    // réels. jsdom les met tous à zéro, donc on décrit ici le premier tour à
    // 100 px au-dessus du viewport, cohérent avec scrollTop=100.
    Object.defineProperty(messages, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, bottom: 400, left: 0, right: 760, width: 760, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const lastUserItem = document.querySelector('[data-message-id="message-0"]') as HTMLElement;
    Object.defineProperty(lastUserItem, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: -100, bottom: -40, left: 0, right: 760, width: 760, height: 60, x: 0, y: -100, toJSON: () => ({}) }),
    });
    const scrollerItems = document.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]');
    const lastItem = scrollerItems[scrollerItems.length - 1];
    Object.defineProperty(lastItem, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 1940 - messages.scrollTop,
        bottom: 2000 - messages.scrollTop,
        left: 0,
        right: 760,
        width: 760,
        height: 60,
        x: 0,
        y: 1940 - messages.scrollTop,
        toJSON: () => ({}),
      }),
    });

    const nav = document.querySelector(".ui-jumpnav") as HTMLElement;
    const buttons = nav.querySelectorAll("button");
    act(() => { (buttons[0] as HTMLButtonElement).click(); });
    await waitFor(() => expect(messages.scrollTop).toBe(0));

    const endButton = buttons[1] as HTMLButtonElement;
    act(() => { messages.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await waitFor(() => expect(endButton.dataset.active).toBe("true"));
    act(() => { endButton.click(); });
    await waitFor(() => expect(messages.scrollTop).toBe(1600));
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
    expect(document.querySelector(".msg.typeset.typeset-chat")).toBeTruthy();
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
    expect(document.querySelector(".done-verify")).toBeTruthy();
  });
});
