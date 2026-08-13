// Mode Fast Codex : niveau de SERVICE (service_tier `priority`), ni modèle ni
// effort. Un seul interrupteur entre le sélecteur de modèle et celui d'effort,
// présent pour Codex seulement ; son choix appartient à la conversation.
// Relâché = Standard (aucun niveau forcé), enfoncé = Fast.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { makeProviderInfo } from "../../test/fixtures";
import { t } from "../../lib/i18n";

const CODEX_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function codexProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-codex",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [], pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(),
    disabled: false, onSubmit: vi.fn(),
    threadProvider: "codex",
    defaults: {
      defaultProvider: "codex",
      defaultModel: { codex: "gpt-5.6-sol" },
      defaultEffort: { codex: "high" },
      defaultPermissionMode: "bypassPermissions",
    },
    providers: [makeProviderInfo({
      id: "codex", label: "Codex",
      models: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.1-codex"],
      defaultModel: "gpt-5.6-sol",
      efforts: CODEX_EFFORTS,
    })],
    ...over,
  };
}

const ta = () => document.querySelector(".composer textarea") as HTMLTextAreaElement;
const fastToggle = () => document.querySelector(".tier-toggle") as HTMLButtonElement | null;
const isFast = () => fastToggle()?.getAttribute("aria-pressed") === "true";

beforeEach(resetTestState);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("composer — mode Fast (niveau de service Codex)", () => {
  it("le toggle apparaît pour Codex", () => {
    renderUi(<Chat {...codexProps()} />);
    const toggle = fastToggle();
    expect(toggle).toBeTruthy();
    expect(toggle!.textContent).toContain("Fast");
    expect(toggle!.getAttribute("aria-label")).toBe(t("chat.service-tier-fast"));
  });

  it("le toggle n'apparaît pas pour Claude ni pour Grok", () => {
    const view = renderUi(<Chat {...codexProps({
      threadId: "thread-claude",
      threadProvider: "claude",
      defaults: {
        defaultProvider: "claude",
        defaultModel: { claude: "claude-opus-5[1m]" },
        defaultEffort: { claude: "xhigh" },
        defaultPermissionMode: "bypassPermissions",
      },
      providers: [makeProviderInfo({
        models: ["claude-opus-5"], defaultModel: "claude-opus-5[1m]", efforts: CODEX_EFFORTS,
      })],
    })} />);
    expect(fastToggle()).toBeNull();
    // le sélecteur d'effort, lui, reste bien là : c'est un contrôle distinct
    expect(document.querySelector(".effort-pick .mp-effort")).toBeTruthy();

    view.rerender(<Chat {...codexProps({
      threadId: "thread-grok",
      threadProvider: "grok",
      defaults: {
        defaultProvider: "grok",
        defaultModel: { grok: "grok-4.5" },
        defaultEffort: { grok: "high" },
        defaultPermissionMode: "bypassPermissions",
      },
      providers: [makeProviderInfo({
        id: "grok", label: "Grok", models: ["grok-4.5"], defaultModel: "grok-4.5",
        efforts: CODEX_EFFORTS,
      })],
    })} />);
    expect(fastToggle()).toBeNull();
  });

  it("Standard est la valeur par défaut et rien n'est forcé à l'envoi", () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...codexProps({ onSubmit })} />);
    expect(isFast()).toBe(false);

    fireEvent.change(ta(), { target: { value: "analyse" } });
    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit.mock.calls[0][6]).toBe(false);
  });

  it("Fast + High : le tour part en Fast SANS toucher à l'effort ni au modèle", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...codexProps({ onSubmit })} />);
    const effortButton = document.querySelector(".effort-pick .mp-effort") as HTMLButtonElement;
    expect(effortButton.textContent).toContain("High");

    fireEvent.click(fastToggle()!);
    await waitFor(() => expect(isFast()).toBe(true));
    // ni le modèle ni l'effort n'ont bougé
    expect(effortButton.textContent).toContain("High");
    expect((document.querySelector(".model-pick .mp-btn") as HTMLElement).textContent)
      .toContain("GPT-5.6 Sol");

    fireEvent.change(ta(), { target: { value: "analyse" } });
    fireEvent.keyDown(ta(), { key: "Enter" });
    const [, provider, model, effort, , , fastMode] = onSubmit.mock.calls[0];
    expect(provider).toBe("codex");
    expect(model).toBe("gpt-5.6-sol");
    expect(effort).toBe("high");
    expect(fastMode).toBe(true);
  });

  it("Fast est persisté par conversation et restauré", async () => {
    const view = renderUi(<Chat {...codexProps({ threadId: "thread-fast" })} />);
    fireEvent.click(fastToggle()!);
    await waitFor(() => expect(isFast()).toBe(true));

    // un autre fil du même provider reste en Standard
    view.rerender(<Chat {...codexProps({ threadId: "thread-standard" })} />);
    await waitFor(() => expect(isFast()).toBe(false));

    // retour au premier fil : Fast restauré depuis la sélection mémorisée
    view.rerender(<Chat {...codexProps({ threadId: "thread-fast" })} />);
    await waitFor(() => expect(isFast()).toBe(true));

    const stored = JSON.parse(localStorage.getItem("atelier-studio.modelSel.thread:thread-fast") ?? "{}");
    expect(stored.byProvider.codex.fastMode).toBe(true);
  });

  it("recliquer relâche le toggle et revient au niveau par défaut", async () => {
    renderUi(<Chat {...codexProps()} />);
    fireEvent.click(fastToggle()!);
    await waitFor(() => expect(isFast()).toBe(true));
    fireEvent.click(fastToggle()!);
    await waitFor(() => expect(isFast()).toBe(false));
  });

  it("modèle Codex sans niveau Fast : contrôle désactivé et explication", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...codexProps({ onSubmit })} />);
    fireEvent.click(fastToggle()!);
    await waitFor(() => expect(isFast()).toBe(true));

    // gpt-5.1-codex n'annonce aucun service_tier dans le catalogue Codex
    fireEvent.click(document.querySelector(".model-pick .mp-btn") as HTMLButtonElement);
    fireEvent.click(screen.getByText("GPT-5.1 Codex"));
    await waitFor(() => expect(fastToggle()!.disabled).toBe(true));
    expect(isFast()).toBe(false);

    // rien n'est transmis au backend
    fireEvent.change(ta(), { target: { value: "analyse" } });
    fireEvent.keyDown(ta(), { key: "Enter" });
    expect(onSubmit.mock.calls[0][6]).toBe(false);
  });

  it("l'explication du niveau de service accompagne le contrôle", async () => {
    const view = renderUi(<Chat {...codexProps()} />);
    // modèle compatible : l'infobulle décrit le compromis vitesse/consommation
    fireEvent.focus(fastToggle()!);
    expect(screen.getByRole("tooltip").textContent).toBe(t("chat.service-tier-hint"));
    expect(screen.getByRole("tooltip").textContent).toMatch(/1[.,]5×/);

    // modèle sans niveau Fast : l'infobulle dit lequel et pourquoi
    view.rerender(<Chat {...codexProps({
      threadId: "thread-legacy",
      defaults: {
        defaultProvider: "codex",
        defaultModel: { codex: "gpt-5.1-codex" },
        defaultEffort: { codex: "high" },
        defaultPermissionMode: "bypassPermissions",
      },
    })} />);
    await waitFor(() => expect(fastToggle()!.disabled).toBe(true));
    fireEvent.focus(fastToggle()!);
    expect(screen.getByRole("tooltip").textContent)
      .toBe(t("chat.service-tier-unsupported", { model: "GPT-5.1 Codex" }));
  });

  // Régression : le survol (4 classes) l'emportait sur l'état actif
  // (3 classes) — le bouton restait gris tant que le curseur ne le quittait
  // pas, l'accent semblait donc arriver avec du retard. jsdom ne calcule pas
  // la cascade : l'invariant est vérifié sur la SOURCE.
  it("l'état actif du toggle bat la règle de survol dans la cascade", () => {
    const css = readFileSync(join(__dirname, "..", "..", "App.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css
      .split("}")
      .map((block) => block.split("{")[0].trim())
      .filter((selector) => selector.includes(".tier-toggle"));
    const weight = (selector: string) =>
      (selector.match(/\.[a-z0-9_-]+|\[[^\]]+\]|:(?!:)(?:hover|disabled|focus-visible)/gi) ?? []).length;
    const hover = selectors.filter((sel) => /:hover/.test(sel) && !/aria-pressed/.test(sel));
    const pressedHover = selectors.filter((sel) => /aria-pressed/.test(sel) && /:hover/.test(sel));
    expect(hover.length).toBeGreaterThan(0);
    expect(pressedHover.length).toBeGreaterThan(0);
    const maxHover = Math.max(...hover.flatMap((sel) => sel.split(",").map(weight)));
    const maxPressedHover = Math.max(...pressedHover.flatMap((sel) => sel.split(",").map(weight)));
    expect(maxPressedHover).toBeGreaterThan(maxHover);
  });
});