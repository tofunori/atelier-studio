// Coordinateur et fils (2026-11-09) : un fil rangé sous une conversation
// s'ouvre à la place du chat, sous un fil d'Ariane qui ramène au parent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [], zoteroItems: [],
    injectText: null, onInjected: vi.fn(), attachments: [], onRemoveAttachment: vi.fn(), onQuote: vi.fn(),
    threadId: "fil-a", threadTitle: "Fil A · Résumé", onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(), onFork: vi.fn(),
    onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(), highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...over,
  };
}

describe("fil d'Ariane d'un fil rangé sous sa conversation", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); });
  afterEach(() => cleanup());

  it("nomme le parent et y ramène", () => {
    const onBack = vi.fn();
    renderUi(<Chat {...chatProps({ parentThread: { title: "Réviser le chapitre 2", onBack } })} />);
    const crumb = screen.getByRole("navigation", { name: t("chat.parent-crumb", { title: "Réviser le chapitre 2" }) });
    expect(crumb.textContent).toContain("Fil A · Résumé");
    fireEvent.click(screen.getByTitle(t("chat.parent-back", { title: "Réviser le chapitre 2" })));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("n'apparaît pas pour une conversation ordinaire", () => {
    renderUi(<Chat {...chatProps()} />);
    expect(document.querySelector(".chat-parent-crumb")).toBeNull();
  });
});
