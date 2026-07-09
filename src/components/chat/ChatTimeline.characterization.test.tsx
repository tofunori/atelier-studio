// Caractérisation de la timeline Chat (plan 015, slice 4) — écrite AVANT
// l'extraction : streaming, ordre outils/texte, running→done, changement de
// thread, ancrage du scroll, markdown/Mermaid, review/usage par tour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";

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

  it("un outil est résumé en groupe (avant OU après un texte) et se déplie au clic", () => {
    // réalité : les outils consécutifs sont regroupés en une ligne résumée
    // (façon Codex) — le détail n'apparaît qu'en dépliant le groupe
    const before = [events.user(), events.tool({ id: "t1", detail: "avant.csv" }), events.text("Réponse.")];
    const after = [events.user(), events.text("Réponse."), events.tool({ id: "t2", detail: "apres.csv" })];

    const first = renderUi(<Chat {...chatProps({ events: before })} />);
    expect(screen.getByText("Réponse.")).toBeTruthy();
    const row1 = document.querySelector(".tool-group-row") as HTMLElement;
    expect(row1).toBeTruthy();
    expect(screen.queryByText(/avant\.csv/)).toBeNull(); // replié par défaut
    act(() => { row1.click(); });
    expect(screen.getByText(/avant\.csv/)).toBeTruthy();
    first.unmount();

    renderUi(<Chat {...chatProps({ events: after })} />);
    expect(screen.getByText("Réponse.")).toBeTruthy();
    const row2 = document.querySelector(".tool-group-row") as HTMLElement;
    act(() => { row2.click(); });
    expect(screen.getByText(/apres\.csv/)).toBeTruthy();
  });

  it("un groupe running devient done : la capsule remplace l'attente", () => {
    const { rerender } = renderUi(
      <Chat {...chatProps({ workingSince: FIXED_TS, events: [events.user(), events.started()] })} />,
    );
    expect(document.querySelector(".working")).toBeTruthy();

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

  it("scroll : remonter détache le suivi (pas de vol de position), le bouton ↓ apparaît", () => {
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
    expect(document.querySelector(".jump-pill")).toBeTruthy();
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
    expect(document.querySelector("pre code, .code-block")).toBeTruthy();
    expect(screen.getByText(/albedo_trends\.py/)).toBeTruthy();
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
