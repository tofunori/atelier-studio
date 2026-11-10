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

describe("Codex A2 audit reproductions", () => {
  it("renders the structured error object emitted by the Rust backend", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "error-real", status: "done",
      verdict: "error", mode: "git", issues: [],
      error: { code: "REVIEW_UNSUPPORTED", message: "revue isolée non supportée" },
    }})));
    fireEvent.click(await screen.findByText(t("review.name")));
    expect(screen.getByText("revue isolée non supportée")).toBeTruthy();
  });
  it("does not move an existing positive verdict onto the next completed turn", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns.slice(0, 3) })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-1", reviewId: "old", status: "done", verdict: "ok", issues: [],
    }})));
    await screen.findByText(t("review.ok-bar"));
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    // le verdict reste sous SON tour ; le tour suivant n'en hérite pas
    const lines = document.querySelectorAll(".rv");
    expect(lines).toHaveLength(1);
    expect(before(lines[0], "deux")).toBe(true);
  });
  it("restores a review even when getReviews arrives before getHistory", async () => {
    const view = renderUi(<Chat {...chatProps({ events: [] })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("reviews-list", { detail: {
      threadId: "thread-A", reviews: [{threadId: "thread-A", turnId: "turn-2", reviewId: "restored", status: "done", verdict: "inconclusive"}],
    }})));
    expect(document.querySelector(".rv")).toBeNull();
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    await screen.findByText(t("review.inconclusive"));
    expect(before(document.querySelector(".rv"), "deux")).toBe(false);
  });
  it("selects newest review from server descending order", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("reviews-list", { detail: {
      threadId: "thread-A", reviews: [
        {threadId: "thread-A", turnId: "turn-2", reviewId: "new", status: "done", verdict: "inconclusive"},
        {threadId: "thread-A", turnId: "turn-2", reviewId: "old", status: "done", verdict: "ok"},
      ],
    }})));
    expect(await screen.findByText(t("review.inconclusive"))).toBeTruthy();
    expect(document.querySelectorAll(".rv")).toHaveLength(1);
    expect(screen.queryByText(t("review.ok-bar"))).toBeNull();
  });
  it("does not attribute an old result without turn identity", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", status: "done", verdict: "ok",
    }})));
    expect(document.querySelector(".rv")).toBeNull();
  });
  it("keeps the verdict on its own turn when the next turn starts, before it completes", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns.slice(0, 3) })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-1", reviewId: "old", status: "done", verdict: "ok",
    }})));
    await screen.findByText(t("review.ok-bar"));
    view.rerender(<Chat {...chatProps({ events: twoTurns.slice(0, 4) })} />);
    const lines = document.querySelectorAll(".rv");
    expect(lines).toHaveLength(1);
    expect(before(lines[0], "deux")).toBe(true);
  });
  it("does not roll a terminal live update back to a stale running list entry", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "latest", status: "done", verdict: "inconclusive",
      createdAt: "2026-09-14T01:00:00Z", updatedAt: "2026-09-14T01:00:05Z",
    }})));
    await act(async () => window.dispatchEvent(new CustomEvent("reviews-list", { detail: {
      threadId: "thread-A", reviews: [{threadId: "thread-A", turnId: "turn-2", reviewId: "latest", status: "running",
        createdAt: "2026-09-14T01:00:00Z", updatedAt: "2026-09-14T01:00:01Z"}],
    }})));
    expect(await screen.findByText(t("review.inconclusive"))).toBeTruthy();
    expect(screen.queryByText(t("review.running"))).toBeNull();
  });
  it("keeps thread identities separate across selection changes", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "latest", status: "done", verdict: "inconclusive",
    }})));
    await screen.findByText(t("review.inconclusive"));
    view.rerender(<Chat {...chatProps({ threadId: "thread-B", events: twoTurns })} />);
    expect(document.querySelector(".rv")).toBeNull();
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    expect(await screen.findByText(t("review.inconclusive"))).toBeTruthy();
  });

  it("clears correction state when the replacement review completes", async () => {
    const asked: unknown[] = [];
    const onCorrect = (event: Event) => asked.push((event as CustomEvent).detail);
    window.addEventListener("correct-issues", onCorrect);
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "before-fix", status: "done", verdict: "issues",
      issues: [{claim: "check", problem: "problem", severity: "review"}],
    }})));
    // déplier ouvre le détail du premier échec, avec ses actions
    fireEvent.click(await screen.findByText(t("review.name")));
    fireEvent.click(screen.getByRole("button", { name: t("review.correct") }));
    window.removeEventListener("correct-issues", onCorrect);
    expect(asked).toEqual([{ threadId: "thread-A", issues: [{ claim: "check", problem: "problem", severity: "review" }] }]);
    // une seule demande par affirmation
    expect((screen.getByRole("button", { name: t("review.corrected") }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "after-fix", status: "done", verdict: "issues",
      issues: [{claim: "remaining", problem: "problem", severity: "review"}],
    }})));
    fireEvent.click(screen.getByText(t("review.name")));
    expect((screen.getByRole("button", { name: t("review.correct") }) as HTMLButtonElement).disabled).toBe(false);
  });

});
