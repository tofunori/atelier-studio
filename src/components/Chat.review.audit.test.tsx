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


describe("Codex A2 audit reproductions", () => {
  it("renders the structured error object emitted by the Rust backend", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "error-real", status: "done",
      verdict: "error", mode: "git", issues: [],
      error: { code: "REVIEW_UNSUPPORTED", message: "revue isolée non supportée" },
    }})));
    fireEvent.click(screen.getByText("Reviewer"));
    expect(screen.getByText("revue isolée non supportée")).toBeTruthy();
  });
  it("does not move an existing positive verdict onto the next completed turn", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns.slice(0, 3) })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-1", reviewId: "old", status: "done", verdict: "ok", issues: [],
    }})));
    expect(document.querySelector(".reviewer-bar.v-ok")).toBeTruthy();
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    expect(document.querySelector(".reviewer-bar.v-ok")).toBeNull();
  });
  it("restores a review even when getReviews arrives before getHistory", async () => {
    const view = renderUi(<Chat {...chatProps({ events: [] })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("reviews-list", { detail: {
      threadId: "thread-A", reviews: [{threadId: "thread-A", turnId: "turn-2", reviewId: "restored", status: "done", verdict: "inconclusive"}],
    }})));
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    expect(document.querySelector(".reviewer-bar")).not.toBeNull();
  });
  it("selects newest review from server descending order", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("reviews-list", { detail: {
      threadId: "thread-A", reviews: [
        {threadId: "thread-A", turnId: "turn-2", reviewId: "new", status: "done", verdict: "inconclusive"},
        {threadId: "thread-A", turnId: "turn-2", reviewId: "old", status: "done", verdict: "ok"},
      ],
    }})));
    expect(document.querySelector(".reviewer-bar.v-ok")).toBeNull();
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();
  });
  it("does not attribute an old result without turn identity", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", status: "done", verdict: "ok",
    }})));
    expect(document.querySelector(".reviewer-bar")).toBeNull();
  });
  it("hides the old verdict when the next turn starts, before it completes", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns.slice(0, 3) })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-1", reviewId: "old", status: "done", verdict: "ok",
    }})));
    expect(document.querySelector(".reviewer-bar.v-ok")).toBeTruthy();
    view.rerender(<Chat {...chatProps({ events: twoTurns.slice(0, 4) })} />);
    expect(document.querySelector(".reviewer-bar")).toBeNull();
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
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();
  });
  it("keeps thread identities separate across selection changes", async () => {
    const view = renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "latest", status: "done", verdict: "inconclusive",
    }})));
    view.rerender(<Chat {...chatProps({ threadId: "thread-B", events: twoTurns })} />);
    expect(document.querySelector(".reviewer-bar")).toBeNull();
    view.rerender(<Chat {...chatProps({ events: twoTurns })} />);
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();
  });

  it("clears correction state when the replacement review completes", async () => {
    renderUi(<Chat {...chatProps({ events: twoTurns })} />);
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "before-fix", status: "done", verdict: "issues",
      issues: [{claim: "check", problem: "problem", severity: "review"}],
    }})));
    fireEvent.click(screen.getByText("Reviewer"));
    fireEvent.click(screen.getByRole("button", { name: t("review.correct") }));
    await act(async () => window.dispatchEvent(new CustomEvent("review-result", { detail: {
      threadId: "thread-A", turnId: "turn-2", reviewId: "after-fix", status: "done", verdict: "issues",
      issues: [{claim: "remaining", problem: "problem", severity: "review"}],
    }})));
    fireEvent.click(screen.getByText("Reviewer"));
    expect((screen.getByRole("button", { name: t("review.correct") }) as HTMLButtonElement).disabled).toBe(false);
  });

});
