// Caractérisation du composer (plan 015, slice 5) : raccourcis d'envoi,
// composition IME, suggestions, stop pendant un run, suppression d'attachment.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { FIXED_TS, makeCapabilities, makeProviderInfo } from "../../test/fixtures";
import { t } from "../../lib/i18n";

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

// Plan 025, step 9 : catalogue et capabilities server-authoritative — les ids
// de modèles viennent du sidecar (info.models) et le composer ne montre que
// les contrôles supportés par capabilities.
describe("composer — catalogue et capabilities sidecar (plan 025, step 9)", () => {
  // Provider courant = codex : dans la cascade du menu modèle, la rangée du
  // provider courant est déjà « active » (repli), on déplie donc Claude en
  // cliquant sa rangée depuis un autre provider courant.
  function openClaudeModelList(claudeModels: string[]) {
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "codex", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      providers: [
        makeProviderInfo({ models: claudeModels }),
        makeProviderInfo({
          id: "codex", label: "Codex", models: ["gpt-5.5"], defaultModel: "gpt-5.5",
          capabilities: makeCapabilities({ goals: true, interactiveInput: true }),
        }),
      ],
    })} />);
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
    fireEvent.click(screen.getByText("Claude Code"));
  }

  it("un modèle présent dans info.models apparaît sans modification frontend", () => {
    openClaudeModelList(["claude-fable-5", "claude-nova-6-preview"]);
    // id inconnu du front : affiché tel quel, directement depuis le catalogue
    expect(screen.getByText("claude-nova-6-preview")).toBeTruthy();
    // id connu : libellé lisible (BUILTIN_MODEL_LABELS reste une map id→label)
    expect(screen.getByText("Fable 5")).toBeTruthy();
  });

  it("un modèle absent du catalogue n'apparaît pas (la liste hardcodée ne ressuscite pas)", () => {
    openClaudeModelList(["claude-fable-5"]);
    // claude-opus-4-8 / « Opus 4.8 » étaient dans l'ancienne liste MODELS
    expect(screen.queryByText("Opus 4.8")).toBeNull();
    expect(screen.queryByText("claude-opus-4-8")).toBeNull();
    expect(screen.queryByText("Sonnet 5")).toBeNull();
  });

  it("provider sans permissionModes : pas de sélecteur de permission", () => {
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "grok", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      providers: [makeProviderInfo({
        id: "grok", label: "Grok", models: ["grok-4.5"], defaultModel: "grok-4.5",
        efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
        capabilities: makeCapabilities({ permissions: false, permissionModes: [] }),
      })],
    })} />);
    expect(document.querySelector(".composer-bar .custom-select")).toBeNull();
  });

  it("claude avec permissionModes : sélecteur listant exactement les 4 modes", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    const trigger = document.querySelector(".composer-bar .custom-select-trigger") as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    const options = [...document.querySelectorAll(".composer-bar .custom-select-option")]
      .map((el) => el.textContent);
    expect(options).toEqual(["Full access", "Accept edits", "Ask (default)", "Plan mode"]);
  });
});

// Plan 020, étape 1 : contrats supplémentaires à préserver pendant la
// réorganisation de la barre (une seule action primaire, effort en popover).
describe("composer — caractérisation complémentaire (plan 020)", () => {
  it("choisir un modèle dans le menu met à jour le résumé provider·modèle", () => {
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "codex", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      providers: [
        makeProviderInfo({ models: ["claude-fable-5", "claude-sonnet-5"] }),
        makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.5"], defaultModel: "gpt-5.5" }),
      ],
    })} />);
    const btn = () => document.querySelector(".model-pick .mp-btn") as HTMLButtonElement;
    fireEvent.click(btn());
    fireEvent.click(screen.getByText("Claude Code"));
    fireEvent.click(screen.getByText("Sonnet 5"));
    expect(btn().textContent).toContain("Sonnet 5");
  });

  it("pendant un run sans texte : le bouton Stop appelle onStop", () => {
    const onStop = vi.fn();
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS, onStop })} />);
    const stop = document.querySelector(".send.stop") as HTMLButtonElement;
    expect(stop).toBeTruthy();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("pendant un run avec texte : la mise en file envoie mode='queue'", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS, onSubmit })} />);
    fireEvent.change(ta(), { target: { value: "à traiter ensuite" } });
    const queue = document.querySelector(".queue-btn") as HTMLButtonElement;
    expect(queue).toBeTruthy();
    fireEvent.click(queue);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][5]).toBe("queue");
  });
});

// Plan 020, étape 6 : hiérarchie de la barre — effort en popover (résumé
// visible), menus navigables au clavier (flèches + Échap → focus au bouton).
describe("composer — barre hiérarchisée (plan 020)", () => {
  it("l'effort courant reste résumé dans le bouton provider·modèle", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    expect(document.querySelector(".mp-btn .mp-effort-sum")).toBeTruthy();
  });

  it("le réglage d'effort vit dans le popover modèle et répond aux flèches", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    expect(document.querySelector(".ef-track")).toBeNull(); // pas dans la barre
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
    const track = document.querySelector(".ef-track") as HTMLElement;
    expect(track).toBeTruthy();
    const before = track.getAttribute("aria-valuenow");
    fireEvent.keyDown(track, { key: "ArrowRight" });
    const after = document.querySelector(".ef-track")!.getAttribute("aria-valuenow");
    expect(Number(after)).toBe(Number(before) + 1);
  });

  it("menu + : focus posé sur le premier item, flèches naviguent, Échap rend le focus", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    const plusBtn = screen.getByTitle(t("action.add-file-image")) as HTMLButtonElement;
    fireEvent.click(plusBtn);
    const items = document.querySelectorAll(".plus-up button.mp-item");
    expect(items.length).toBeGreaterThan(1);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.querySelector(".plus-up")!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.querySelector(".plus-up")!, { key: "Escape" });
    expect(document.querySelector(".plus-up")).toBeNull();
    expect(document.activeElement).toBe(plusBtn);
  });

  it("une seule action primaire : Envoyer au repos, Stop pendant le run", () => {
    const { unmount } = renderUi(<Chat {...chatProps()} />);
    expect(document.querySelectorAll(".composer-bar .send").length).toBe(1);
    unmount();
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS })} />);
    expect(document.querySelectorAll(".composer-bar .send").length).toBe(1);
    expect(document.querySelector(".composer-bar .send.stop")).toBeTruthy();
  });
});
