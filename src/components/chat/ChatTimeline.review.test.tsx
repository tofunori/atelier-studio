// Plan 080 A1 — faux positifs de revue : bandeau, détail développé, compact.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
import { setLanguage, t } from "../../lib/i18n";

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

async function mountReview(detail: Record<string, unknown>) {
  renderUi(
    <Chat
      {...chatProps({
        events: [events.user(), events.text(), events.done()].map((event, index) => ({
          ...event, meta: { schemaVersion: 1, eventId: `review-event-${index}`,
            threadId: "thread-A", turnId: "review-turn", provider: "codex",
            sequence: index + 1, ts: FIXED_TS + index, durable: true, origin: "provider" },
        })),
      })}
    />,
  );
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("review-result", {
        detail: { threadId: "thread-A", turnId: "review-turn", reviewId: "review-a1", status: "done", ...detail },
      }),
    );
  });
}

function expandDetail() {
  fireEvent.click(screen.getByText("Reviewer"));
}

function minimize() {
  fireEvent.click(screen.getByLabelText(t("review.minimize")));
}

function assertNoValidation() {
  expect(document.querySelector(".rm-ok")).toBeNull();
  expect(document.querySelector(".rb-verdict.ok")).toBeNull();
  expect(document.querySelector(".reviewer-bar.v-ok")).toBeNull();
  expect(document.querySelector(".reviewer-strip.v-ok")).toBeNull();
  expect(document.body.textContent).not.toContain(t("review.ok-detail"));
  expect(document.body.textContent).not.toContain(t("review.ok-bar"));
  expect(screen.queryByLabelText(t("review.ok"))).toBeNull();
}

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
});
afterEach(() => {
  cleanup();
});

describe("ChatTimeline review A1", () => {
  const inconclusiveCases: Array<{ name: string; detail: Record<string, unknown>; detailText?: string }> = [
    { name: "vide", detail: { verdict: "inconclusive", issues: [], mode: "git" } },
    { name: "espaces", detail: { verdict: "inconclusive", issues: [], mode: "git", text: "   " } },
    { name: "sortie sans champ attendu", detail: { verdict: "unparseable", issues: [] } },
    { name: "indisponible", detail: { verdict: "unavailable", issues: [] } },
    {
      name: "erreur provider",
      detail: { verdict: "error", issues: [], mode: "git", error: "codex unavailable" },
      detailText: "codex unavailable",
    },
    {
      name: "no findings mixte",
      detail: {
        verdict: "inconclusive",
        issues: [],
        mode: "git",
        text: "no findings dans X, mais erreur dans Y",
      },
      detailText: "no findings dans X, mais erreur dans Y",
    },
    { name: "verdict non concluant sans issue", detail: { verdict: "inconclusive", issues: [] } },
  ];

  it.each(inconclusiveCases)("$name : bandeau et détail sans validation", async ({ detail, detailText }) => {
    await mountReview(detail);
    expect(document.querySelector(".reviewer-bar")).toBeTruthy();
    assertNoValidation();
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();

    expandDetail();
    expect(document.querySelector(".reviewer-menu")).toBeTruthy();
    assertNoValidation();
    if (detail.mode === "git") {
      expect(screen.getByText(t("review.git-native"))).toBeTruthy();
    }
    if (detailText) {
      expect(screen.getByText(detailText)).toBeTruthy();
    } else if (!detail.error && !(typeof detail.text === "string" && detail.text.trim())) {
      expect(screen.getByText(t("review.inconclusive-detail"))).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: t("review.correct") })).toBeNull();

    minimize();
    const strip = document.querySelector(".reviewer-strip");
    expect(strip).toBeTruthy();
    expect(strip?.classList.contains("v-ok")).toBe(false);
    expect(strip?.getAttribute("aria-label")).toBe(t("review.inconclusive"));
    assertNoValidation();
  });

  it("un verdict ok explicite reste une validation (bandeau et détail)", async () => {
    await mountReview({ verdict: "ok", issues: [] });
    expect(document.querySelector(".reviewer-bar.v-ok")).toBeTruthy();
    expect(screen.getByText(t("review.ok-bar"))).toBeTruthy();

    expandDetail();
    expect(document.querySelector(".rm-ok")?.textContent).toBe(t("review.ok-detail"));
    expect(screen.queryByText(t("review.git-native"))).toBeNull();

    minimize();
    expect(document.querySelector(".reviewer-strip.v-ok")).toBeTruthy();
    expect(screen.getByLabelText(t("review.ok"))).toBeTruthy();
  });

  it("issues.length === 0 ne produit pas ok-detail si le verdict n'est pas ok", async () => {
    await mountReview({ verdict: "issues", issues: [] });
    expandDetail();
    assertNoValidation();
    expect(screen.getByText(t("review.inconclusive-detail"))).toBeTruthy();
  });

  it("ne recrée pas le badge de revue sur ResultCapsule", async () => {
    await mountReview({ verdict: "ok", issues: [] });
    expandDetail();
    const capsule = document.querySelector(".result-capsule");
    expect(capsule).toBeTruthy();
    expect(capsule?.querySelector(".rm-ok")).toBeNull();
    expect(capsule?.textContent).not.toContain(t("review.ok-detail"));
    expect(capsule?.textContent).not.toContain(t("review.ok-bar"));
  });
});
