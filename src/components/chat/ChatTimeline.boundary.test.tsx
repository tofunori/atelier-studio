// Frontières de rendu du chat (audit 2026-10-18, problème 14 ; relecture du
// 2026-10-19) : un message dont le rendu lève une exception cède la place à
// une notice « Recharger », ses voisins restent affichés.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

// Le rendu d'un texte d'assistant qui contient « BOOM » lève une exception,
// comme un message que le rendu ne sait pas afficher.
vi.mock("./turns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./turns")>();
  const Real = actual.AssistantText as unknown as (props: Record<string, unknown>) => React.ReactNode;
  function AssistantText(props: Record<string, unknown>) {
    const event = props.event as { text?: string };
    if (event.text?.includes("BOOM")) throw new Error("rendu impossible");
    return <Real {...props} />;
  }
  return { ...actual, AssistantText };
});

import type React from "react";
import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";
import { t } from "../../lib/i18n";

beforeEach(() => {
  resetTestState();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

describe("timeline Chat — frontière par message", () => {
  it("un message qui ne s'affiche pas laisse ses voisins et propose Recharger", async () => {
    renderUi(
      <Chat {...chatProps({
        events: [
          events.user("Première question.", FIXED_TS),
          events.text("Réponse lisible.", FIXED_TS + 100),
          events.done({ ts: FIXED_TS + 200 }),
          events.user("Seconde question.", FIXED_TS + 1000),
          events.text("BOOM : réponse illisible.", FIXED_TS + 1100),
          events.done({ ts: FIXED_TS + 1200 }),
        ],
      })} />,
    );
    await waitFor(() => expect(screen.getByText(t("render.message-error"))).toBeTruthy());
    // les voisins restent : questions et réponse lisible
    expect(screen.getAllByText(/Première question/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Seconde question/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText(/Réponse lisible/).length).toBeGreaterThan(0));
    // une seule notice : seul le message fautif a cédé
    expect(screen.getAllByText(t("render.message-error"))).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t("action.reload") }).length).toBeGreaterThan(0);
    // l'interface entière n'est pas remplacée
    expect(document.querySelector(".composer, textarea")).toBeTruthy();
  });
});
