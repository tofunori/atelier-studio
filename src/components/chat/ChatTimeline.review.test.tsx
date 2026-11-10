// Plan 080 A1 — faux positifs de revue : ligne « Relecture » sous le tour,
// repliée puis dépliée (variante B, 2026-11-10).
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

let serial = 0;
async function mountReview(detail: Record<string, unknown>) {
  // une relecture neuve par test : le dépli est mémorisé par relecture
  serial += 1;
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
        detail: { threadId: "thread-A", turnId: "review-turn", reviewId: `review-a1-${serial}`, status: "done", ...detail },
      }),
    );
  });
  // la ligne est un chunk à part : elle arrive au rendu suivant
  await screen.findByText(t("review.name"));
}

const line = () => document.querySelector(".rv");

function toggleDetail() {
  fireEvent.click(screen.getByText(t("review.name")));
}

function assertNoValidation() {
  expect(document.querySelector('.rv-state[data-outcome="passed"]')).toBeNull();
  expect(document.body.textContent).not.toContain(t("review.ok-bar"));
  expect(document.body.textContent).not.toContain(t("review.n-passed", { n: 1 }));
  expect(document.body.textContent).not.toContain(t("review.state.passed"));
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

  it.each(inconclusiveCases)("$name : ligne et détail sans validation", async ({ detail, detailText }) => {
    await mountReview(detail);
    expect(line()).toBeTruthy();
    // repliée par défaut : une seule ligne, rien de déplié
    expect(document.querySelector(".rv-body")).toBeNull();
    assertNoValidation();
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();

    toggleDetail();
    expect(document.querySelector(".rv-body")).toBeTruthy();
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

    toggleDetail();
    expect(document.querySelector(".rv-body")).toBeNull();
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();
    assertNoValidation();
  });

  it("un verdict ok explicite reste une validation, sans rien à déplier", async () => {
    await mountReview({ verdict: "ok", issues: [] });
    expect(screen.getByText(t("review.ok-bar"))).toBeTruthy();
    expect(screen.queryByText(t("review.inconclusive"))).toBeNull();
    // aucune affirmation listée (ancien serveur) : la ligne n'est pas un bouton
    expect(line()?.querySelector("button")).toBeNull();
    expect(screen.queryByText(t("review.git-native"))).toBeNull();
  });

  it("issues.length === 0 ne produit pas de validation si le verdict n'est pas ok", async () => {
    await mountReview({ verdict: "issues", issues: [] });
    expect(screen.getByText(t("review.inconclusive"))).toBeTruthy();
    toggleDetail();
    assertNoValidation();
    expect(screen.getByText(t("review.inconclusive-detail"))).toBeTruthy();
  });

  it("la ligne vit sous le message, hors de ResultCapsule", async () => {
    await mountReview({ verdict: "ok", issues: [] });
    const capsule = document.querySelector(".result-capsule");
    expect(capsule).toBeTruthy();
    expect(capsule?.querySelector(".rv")).toBeNull();
    expect(capsule?.textContent).not.toContain(t("review.ok-bar"));
    // même rangée que la capsule du tour, juste au-dessus d'elle
    expect(line()?.compareDocumentPosition(capsule!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(line()?.closest(".timeline-virtual-row")).toBe(capsule?.closest(".timeline-virtual-row"));
  });

  it("rien ne s'affiche tant qu'aucune relecture n'existe", () => {
    renderUi(<Chat {...chatProps({ events: [events.user(), events.text(), events.done()] })} />);
    expect(line()).toBeNull();
    expect(screen.queryByText(t("review.name"))).toBeNull();
  });
});
