// Caractérisation du composer (plan 015, slice 5) : raccourcis d'envoi,
// composition IME, suggestions, stop pendant un run, suppression d'attachment.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("/model ouvre le sélecteur sans envoyer de prompt", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({
      onSubmit,
      threadProvider: "codex",
      providers: [makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.5"], defaultModel: "gpt-5.5" })],
    })} />);
    fireEvent.change(ta(), { target: { value: "/model" } });
    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector(".model-menu")).toBeTruthy();
  });

  it("/plan avec argument envoie le prompt en mode plan", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit, threadProvider: "codex" })} />);
    fireEvent.change(ta(), { target: { value: "/plan vérifie le protocole" } });
    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith(
      "vérifie le protocole",
      "codex",
      expect.any(String),
      expect.any(String),
      "plan",
      "steer",
    );
  });

  it("attachments : composants shadcn visibles et suppression accessible", () => {
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

    const removeButtons = document.querySelectorAll('.chips-row [data-slot="attachment-action"]');
    expect(removeButtons.length).toBe(2);
    act(() => { (removeButtons[0] as HTMLButtonElement).click(); });
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("disabled : la zone de saisie est inerte", () => {
    renderUi(<Chat {...chatProps({ disabled: true })} />);
    expect(ta().disabled).toBe(true);
  });

  it("auto-resize : suit le contenu puis plafonne à 220 px avec scroll", () => {
    renderUi(<Chat {...chatProps()} />);
    Object.defineProperty(ta(), "scrollHeight", { value: 96, configurable: true });
    fireEvent.change(ta(), { target: { value: "une ligne assez longue" } });
    expect(ta().style.height).toBe("96px");
    expect(ta().style.overflowY).toBe("");

    Object.defineProperty(ta(), "scrollHeight", { value: 320, configurable: true });
    fireEvent.change(ta(), { target: { value: "un contenu encore plus long" } });
    expect(ta().style.height).toBe("220px");
    expect(ta().style.overflowY).toBe("auto");
    expect(ta().scrollTop).toBe(320);
    expect((document.querySelector(".ta-backdrop") as HTMLElement).scrollTop).toBe(320);
  });

  it("backdrop : colore les mentions et reste synchronisé au scroll", () => {
    renderUi(<Chat {...chatProps({ commands: [{ name: "recherche", source: "user" }] })} />);
    fireEvent.change(ta(), { target: { value: "/recherche @src/App.tsx" } });
    const backdrop = document.querySelector(".ta-backdrop") as HTMLElement;
    expect(ta().className).toContain("tw:px-0");
    expect(ta().className).toContain("tw:py-0");
    expect(backdrop.textContent).toContain("/recherche");
    expect(backdrop.textContent).toContain("App.tsx");
    expect(backdrop.querySelector(".slash-cmd-inline")).toBeTruthy();
    expect(backdrop.querySelector(".at-mention")).toBeTruthy();
    ta().scrollTop = 48;
    fireEvent.scroll(ta());
    expect(backdrop.scrollTop).toBe(48);
  });

  it("Option+Entrée ouvre Quick Ask avec le brouillon sans soumettre", () => {
    const onSubmit = vi.fn();
    const onQuickAsk = vi.fn();
    window.addEventListener("quick-ask-open", onQuickAsk);
    renderUi(<Chat {...chatProps({ onSubmit })} />);
    fireEvent.change(ta(), { target: { value: "question rapide" } });
    fireEvent.keyDown(ta(), { key: "Enter", altKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onQuickAsk).toHaveBeenCalledTimes(1);
    expect((onQuickAsk.mock.calls[0][0] as CustomEvent).detail).toEqual({ draft: "question rapide" });
    window.removeEventListener("quick-ask-open", onQuickAsk);
  });

  it("collage long : crée un contexte compact au lieu de gonfler le textarea", () => {
    const onPasteText = vi.fn();
    renderUi(<Chat {...chatProps({ onPasteText })} />);
    const pasted = "x".repeat(1000);
    fireEvent.paste(ta(), {
      clipboardData: { items: [], getData: (type: string) => type === "text/plain" ? pasted : "" },
    });
    expect(onPasteText).toHaveBeenCalledWith(pasted);
    expect(ta().value).toBe("");
  });

  it("collage image : transmet le data URL au contexte", () => {
    const onPasteImage = vi.fn();
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,atelier";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", TestFileReader);
    renderUi(<Chat {...chatProps({ onPasteImage })} />);
    fireEvent.paste(ta(), {
      clipboardData: {
        items: [{ type: "image/png", getAsFile: () => new File(["png"], "capture.png", { type: "image/png" }) }],
        getData: () => "",
      },
    });
    expect(onPasteImage).toHaveBeenCalledWith("data:image/png;base64,atelier");
  });
});

// Plan 025, step 9 : catalogue et capabilities server-authoritative — les ids
// de modèles viennent du sidecar (info.models) et le composer ne montre que
// les contrôles supportés par capabilities.
describe("composer — catalogue et capabilities sidecar (plan 025, step 9)", () => {
  function openClaudeModelList(claudeModels: string[]) {
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      threadProvider: "claude",
      providers: [makeProviderInfo({ models: claudeModels })],
    })} />);
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
  }

  it("ouvre la liste du provider courant dès le premier clic", () => {
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "codex", defaultModel: { codex: "gpt-5.6" }, defaultEffort: { codex: "medium" }, defaultPermissionMode: "bypassPermissions" },
      providers: [makeProviderInfo({
        id: "codex", label: "Codex", models: ["gpt-5.6"], defaultModel: "gpt-5.6",
        efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
      })],
    })} />);
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
    const modelList = document.querySelector(".model-list") as HTMLElement;
    expect(modelList).toBeTruthy();
    expect(within(modelList).getByText("gpt-5.6")).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Codex" })).toHaveAttribute("aria-checked", "true");
  });

  it("restaure le modèle et l'effort propres à chaque chat", async () => {
    const defaults = {
      defaultProvider: "codex",
      defaultModel: { codex: "gpt-5.6-sol" },
      defaultEffort: { codex: "medium" },
      defaultPermissionMode: "bypassPermissions",
    };
    const providers = [makeProviderInfo({
      id: "codex", label: "Codex",
      models: ["gpt-5.6-sol", "gpt-5.5"], defaultModel: "gpt-5.6-sol",
      efforts: ["low", "medium", "high"],
    })];
    localStorage.setItem("atelier-studio.modelSel.thread:thread-A", JSON.stringify({
      provider: "codex", model: "gpt-5.6-sol", effort: "medium", permissionMode: "bypassPermissions",
    }));
    localStorage.setItem("atelier-studio.modelSel.thread:thread-B", JSON.stringify({
      provider: "codex", model: "gpt-5.5", effort: "high", permissionMode: "bypassPermissions",
    }));

    const view = renderUi(<Chat {...chatProps({ threadId: "thread-A", threadProvider: "codex", defaults, providers })} />);
    const modelButton = () => document.querySelector(".model-pick .mp-btn") as HTMLButtonElement;
    const effortButton = () => document.querySelector(".effort-pick .mp-effort") as HTMLButtonElement;
    await waitFor(() => expect(modelButton().textContent).toContain("GPT-5.6 Sol"));
    expect(effortButton().textContent).toContain("Medium");

    view.rerender(<Chat {...chatProps({ threadId: "thread-B", threadProvider: "codex", defaults, providers })} />);
    await waitFor(() => expect(modelButton().textContent).toContain("GPT-5.5"));
    expect(effortButton().textContent).toContain("High");

    view.rerender(<Chat {...chatProps({ threadId: "thread-A", threadProvider: "codex", defaults, providers })} />);
    await waitFor(() => expect(modelButton().textContent).toContain("GPT-5.6 Sol"));
    expect(effortButton().textContent).toContain("Medium");
  });

  it("un modèle présent dans info.models apparaît sans modification frontend", () => {
    openClaudeModelList(["claude-fable-5", "claude-nova-6-preview"]);
    // id inconnu du front : affiché tel quel, directement depuis le catalogue
    expect(screen.getByText("claude-nova-6-preview")).toBeTruthy();
    // id connu : libellé lisible (BUILTIN_MODEL_LABELS reste une map id→label)
    expect(screen.getByText("Fable 5")).toBeTruthy();
  });

  it("sélectionner n'importe quel modèle Claude active 1M par défaut", async () => {
    renderUi(<Chat {...chatProps({
      defaults: {
        defaultProvider: "claude",
        defaultModel: { claude: "claude-sonnet-5[1m]" },
        defaultEffort: { claude: "xhigh" },
        defaultPermissionMode: "bypassPermissions",
      },
      threadProvider: "claude",
      providers: [makeProviderInfo({
        models: ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-5"],
        defaultModel: "claude-sonnet-5[1m]",
        efforts: ["low", "medium", "high", "xhigh", "max"],
      })],
    })} />);
    const button = document.querySelector(".model-pick .mp-btn") as HTMLButtonElement;
    const effortButton = document.querySelector(".effort-pick .mp-effort") as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(screen.getByText("Opus 4.8"));
    await waitFor(() => expect(button.textContent).toContain("Opus 4.8 · 1M"));
    expect(effortButton.textContent).toContain("Extra High");
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
  it("change de provider et de modèle dans le même sélecteur", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({
      defaults: { defaultProvider: "codex", defaultModel: { codex: "gpt-5.5" }, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      threadProvider: "codex",
      onSubmit,
      providers: [
        makeProviderInfo({ models: ["claude-fable-5", "claude-sonnet-5"] }),
        makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.5", "gpt-5.6"], defaultModel: "gpt-5.5" }),
      ],
    })} />);
    const btn = () => document.querySelector(".model-pick .mp-btn") as HTMLButtonElement;
    fireEvent.click(btn());
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Claude/ }));
    fireEvent.click(screen.getByText("Sonnet 5"));
    expect(btn().textContent).toContain("Sonnet 5 · 1M");

    fireEvent.change(ta(), { target: { value: "continue avec Claude" } });
    fireEvent.submit(ta().closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith(
      "continue avec Claude", "claude", "claude-sonnet-5[1m]", expect.any(String), "bypassPermissions", "steer",
    );
  });

  it("résout le modèle Codex configuré même si le catalogue sidecar est momentanément absent", () => {
    renderUi(<Chat {...chatProps({
      defaults: {
        defaultProvider: "claude",
        defaultModel: { claude: "claude-sonnet-5", codex: "gpt-5.6-sol" },
        defaultEffort: { codex: "medium" },
        defaultPermissionMode: "bypassPermissions",
      },
      providers: [],
    })} />);
    const btn = () => document.querySelector(".model-pick .mp-btn") as HTMLButtonElement;
    fireEvent.click(btn());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Codex" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Default model — gpt-5\.6-sol · medium/ }));
    expect(btn().textContent).toContain("gpt-5.6-sol");
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

// Le modèle et l'effort ont chacun leur déclencheur : changer l'un ne doit
// jamais ouvrir le menu de l'autre.
describe("composer — barre hiérarchisée (plan 020)", () => {
  it("affiche deux boutons indépendants pour le modèle et l'effort", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    expect(document.querySelector(".model-pick .mp-model")).toBeTruthy();
    expect(document.querySelector(".effort-pick .mp-effort")).toBeTruthy();
    expect(document.querySelector(".mp-model .mp-effort-sum")).toBeNull();
  });

  it("le bouton effort ouvre seulement son popover et répond aux flèches", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    expect(document.querySelector(".ef-track")).toBeNull(); // pas dans la barre
    fireEvent.click(document.querySelector(".effort-pick .mp-effort") as HTMLButtonElement);
    const track = document.querySelector(".ef-track") as HTMLElement;
    expect(track).toBeTruthy();
    expect(document.querySelector(".model-menu")).toBeNull();
    const before = track.getAttribute("aria-valuenow");
    fireEvent.keyDown(track, { key: "ArrowRight" });
    const after = document.querySelector(".ef-track")!.getAttribute("aria-valuenow");
    expect(Number(after)).toBe(Number(before) + 1);
  });

  it("le bouton modèle ouvre seulement la liste des modèles", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    fireEvent.click(document.querySelector(".model-pick .mp-model") as HTMLButtonElement);
    expect(document.querySelector(".model-menu")).toBeTruthy();
    expect(document.querySelector(".ef-track")).toBeNull();
  });

  it("le favori modèle est un Toggle shadcn avec état pressed", () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
    const favorite = screen.getAllByLabelText(t("action.add-favorite"))[0] as HTMLButtonElement;
    expect(favorite).toHaveAttribute("data-slot", "toggle");
    expect(favorite).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(favorite);
    expect(favorite).toHaveAttribute("aria-pressed", "true");
  });

  it("menu + : le premier item est actif, flèches naviguent, Échap rend le focus", async () => {
    renderUi(<Chat {...chatProps({ providers: [makeProviderInfo()] })} />);
    const plusBtn = screen.getByTitle(t("action.add-file-image")) as HTMLButtonElement;
    fireEvent.click(plusBtn);
    const items = document.querySelectorAll('.plus-up [role="menuitem"], .plus-up [role="menuitemcheckbox"]');
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]).toHaveAttribute("data-highlighted");
    fireEvent.keyDown(document.querySelector(".plus-up")!, { key: "ArrowDown" });
    await waitFor(() => expect(items[1]).toHaveAttribute("data-highlighted"));
    fireEvent.keyDown(document.querySelector(".plus-up")!, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".plus-up")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(plusBtn));
  });

  it("compose InputGroup, son textarea officiel et les groupes d’actions dédiés", () => {
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS })} />);
    const group = document.querySelector('.composer [data-slot="input-group"]');
    expect(group).toBeTruthy();
    expect(group?.querySelector('textarea[data-slot="input-group-control"]')).toBe(ta());
    expect(group?.querySelector('.ta-backdrop[data-not-typeset]')).toBeTruthy();
    expect(group?.querySelector('[data-slot="input-group-addon"][data-align="block-end"]')).toBeTruthy();
    expect(group?.querySelector('.composer-tool-group[data-slot="button-group"]')).toBeTruthy();

    fireEvent.change(ta(), { target: { value: "à grouper" } });
    expect(group?.querySelector('.composer-submit-group[data-slot="button-group"]')).toBeTruthy();
  });

  it("une seule action primaire : Envoyer au repos, Stop pendant le run", () => {
    const { unmount } = renderUi(<Chat {...chatProps()} />);
    expect(document.querySelectorAll(".composer-bar .send").length).toBe(1);
    unmount();
    renderUi(<Chat {...chatProps({ workingSince: FIXED_TS })} />);
    expect(document.querySelectorAll(".composer-bar .send").length).toBe(1);
    expect(document.querySelector(".composer-bar .send.stop")).toBeTruthy();
  });

  it("goal : le menu ouvre l’éditeur et Enregistrer transmet l’objectif", () => {
    const onGoal = vi.fn();
    renderUi(<Chat {...chatProps({
      onGoal,
      threadProvider: "codex",
      defaults: { defaultProvider: "codex", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
      providers: [makeProviderInfo({
        id: "codex", label: "Codex",
        capabilities: makeCapabilities({ goals: true }),
      })],
    })} />);
    fireEvent.click(screen.getByTitle(t("action.add-file-image")));
    fireEvent.click(screen.getByText(t("goal.menu")));
    const goalInput = document.querySelector(".goal-editor input") as HTMLInputElement;
    expect(goalInput).toBeTruthy();
    fireEvent.change(goalInput, { target: { value: "Polir le compositeur" } });
    fireEvent.click(screen.getByText(t("goal.set")));
    expect(onGoal).toHaveBeenCalledWith("set", "Polir le compositeur", undefined);
  });

  it("contexte : l’indicateur expose un libellé et les métriques de session", () => {
    renderUi(<Chat {...chatProps({
      usage: { context: 150_000, output: 2_500, cost: 1.25, turns: 7, window: 200_000 },
    })} />);
    const indicator = screen.getByRole("button", { name: t("chat.context-window") });
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain("75");
    expect(indicator.textContent).toContain("7");
    expect(indicator.textContent).toContain("1.25");
  });
});
