// Plan 080 A2 — attribution au tour, reconnexion, périmètre Git.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "./Chat";
import { renderUi, resetTestState } from "../test/render";
import { events, FIXED_TS } from "../test/fixtures";
import { setLanguage, t } from "../lib/i18n";
import type { AgentEvent } from "../lib/ws";

function withTurn(event: AgentEvent, turnId: string, eventId: string, sequence: number): AgentEvent {
  return {
    ...event,
    meta: {
      schemaVersion: 1,
      eventId,
      provider: "codex",
      threadId: "thread-A",
      turnId,
      sequence,
      ts: FIXED_TS + sequence,
      durable: true,
      origin: "provider",
    },
  };
}

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
      defaultProvider: "codex",
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

const twoTurns: AgentEvent[] = [
  withTurn(events.user("un"), "turn-1", "u1", 1),
  withTurn(events.text("réponse 1"), "turn-1", "t1", 2),
  withTurn(events.done(), "turn-1", "d1", 3),
  withTurn(events.user("deux"), "turn-2", "u2", 4),
  withTurn(events.text("réponse 2"), "turn-2", "t2", 5),
  withTurn(events.done(), "turn-2", "d2", 6),
];

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
});
afterEach(() => {
  cleanup();
});

/** La ligne « Relecture » est-elle sous le tour dont la question suit ? */
function before(node: Element | null, text: string): boolean {
  // la bulle du fil, pas son repère dans la marge
  const bubble = screen.getByText(text, { selector: '[data-slot="bubble-content"], .chat-md *' });
  return !!node && (node.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("Chat review A2", () => {
  it("un résultat tardif du tour N s'affiche sous le tour N, pas sous le tour N+1", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("review-result", {
        detail: {
          threadId: "thread-A",
          turnId: "turn-1",
          reviewId: "rev-old",
          status: "done",
          verdict: "ok",
          mode: "claims",
        },
      }));
    });
    await screen.findByText(t("review.ok-bar"));
    const lines = document.querySelectorAll(".rv");
    expect(lines).toHaveLength(1);
    // sous la réponse 1, donc avant la question du tour 2
    expect(before(lines[0], "deux")).toBe(true);
    expect(before(lines[0], "réponse 1")).toBe(false);
  });

  it("recharge via getReviews la relecture de chaque tour relu", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("reviews-list", {
        detail: {
          type: "reviews",
          threadId: "thread-A",
          reviews: [
            { threadId: "thread-A", turnId: "turn-1", status: "done", verdict: "ok", mode: "claims" },
            {
              threadId: "thread-A",
              turnId: "turn-2",
              status: "done",
              verdict: "inconclusive",
              mode: "git",
            },
          ],
        },
      }));
    });
    // un « ok » sans identité de relecture (ancienne projection) ne valide rien
    expect(await screen.findAllByText(t("review.inconclusive"))).toHaveLength(2);
    expect(screen.queryByText(t("review.ok-bar"))).toBeNull();
    const lines = document.querySelectorAll(".rv");
    expect(before(lines[0], "deux")).toBe(true);
    expect(before(lines[1], "deux")).toBe(false);
    fireEvent.click(lines[1].querySelector(".rv-head")!);
    expect(screen.getByText(t("review.git-scope"))).toBeTruthy();
    expect(document.querySelector('.rv-state[data-outcome="passed"]')).toBeNull();
  });
});
