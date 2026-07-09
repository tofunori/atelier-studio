// Caractérisation du composer (plan 015, slice 5) : raccourcis d'envoi,
// composition IME, suggestions, stop pendant un run, suppression d'attachment.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { FIXED_TS } from "../../test/fixtures";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-A",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...over,
  };
}

const ta = () => document.querySelector(".composer textarea") as HTMLTextAreaElement;

beforeEach(resetTestState);
afterEach(cleanup);

describe("composer — caractérisation", () => {
  it("Enter envoie (prompt + provider/mode), Shift+Enter ne soumet pas", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit })} />);

    fireEvent.change(ta(), { target: { value: "analyse l'albédo" } });
    fireEvent.keyDown(ta(), { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [prompt, provider, , , permissionMode, mode] = onSubmit.mock.calls[0];
    expect(prompt).toBe("analyse l'albédo");
    expect(provider).toBe("claude");
    expect(permissionMode).toBe("bypassPermissions");
    expect(mode).toBe("steer");
    expect(ta().value).toBe(""); // champ vidé après envoi
  });

  it("IME : Enter pendant une composition (isComposing) N'ENVOIE PAS", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit })} />);

    fireEvent.change(ta(), { target: { value: "こんにちは" } });
    // Enter de validation du candidat IME : keydown avec isComposing=true
    fireEvent.keyDown(ta(), { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();

    // Enter réel après composition
    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Échap pendant un run déclenche Stop (sans toucher au texte)", () => {
    const onStop = vi.fn();
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS, onStop })} />);
    fireEvent.change(ta(), { target: { value: "brouillon en cours" } });
    fireEvent.keyDown(ta(), { key: "Escape" });
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(ta().value).toBe("brouillon en cours");
  });

  it("suggestions : Enter applique la suggestion au lieu d'envoyer", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit, commands: [{ name: "recherche", source: "user" }] })} />);

    fireEvent.change(ta(), { target: { value: "/rech" } });
    expect(document.querySelector(".suggest")).toBeTruthy();

    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(ta().value).toContain("/recherche");
  });

  it("attachments : chips visibles, suppression au clavier (bouton natif)", () => {
    const onRemoveAttachment = vi.fn();
    renderUi(<Chat {...chatProps({
      onRemoveAttachment,
      attachments: [
        { name: "fig3_spatial.svg", lines: null, text: "…" },
        { name: "notes.md", lines: "12", text: "…" },
      ],
    })} />);

    expect(screen.getByText("fig3_spatial")).toBeTruthy();
    expect(screen.getByText("notes")).toBeTruthy();

    const removeButtons = document.querySelectorAll(".chips-row .chip button.ghost");
    expect(removeButtons.length).toBe(2);
    act(() => { (removeButtons[0] as HTMLButtonElement).click(); });
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("disabled : la zone de saisie est inerte", () => {
    renderUi(<Chat {...chatProps({ disabled: true })} />);
    expect(ta().disabled).toBe(true);
  });
});
