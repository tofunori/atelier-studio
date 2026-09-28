// Section Environnement (premier lancement) : rangées agents et outils lues
// dans le store, action qui débloque chaque ligne (installer, se connecter,
// télécharger), règle « Homebrew d'abord », repli « commande à copier » sans
// terminal intégré, et « Revérifier » unique pour toute la section.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
  openPath: vi.fn(async () => {}),
}));

import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage, t } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import { FakeWS } from "../../../test/fixtures/sidecar";
import {
  CLAUDE_MISSING, CLAUDE_READY, CODEX_LOGGED_OUT, CODEX_MISSING, TEX_ON_DEMAND, TOOLS, setupStatus,
} from "../../../test/fixtures/setupEnvironment";
import { relaySidecarMessage } from "../../../lib/sidecarRelays";
import {
  registerSetupTerminal,
  resetSetupEnvironmentForTests,
  setupEnvironmentSnapshot,
} from "../../../lib/setupEnvironment";
import { setWs } from "../../../lib/wsBus";
import type { SectionProps } from "../shared";
import Environment from "./Environment";

function fakeWsOuvert(): FakeWS & WebSocket {
  const ws = new FakeWS("ws://fixture-environment");
  ws.readyState = 1;
  return ws as unknown as FakeWS & WebSocket;
}

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

function relay(msg: unknown) {
  act(() => { relaySidecarMessage(msg); });
}

/** La rangée (role=group, nommée par son titre) d'un agent ou d'un outil. */
function row(title: string): HTMLElement {
  return screen.getByRole("group", { name: title });
}

const TOOLS_WITH_BREW = TOOLS.map((tool) => tool.id === "homebrew"
  ? { ...tool, found: true, path: "/opt/homebrew/bin/brew" } : tool);

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
  resetSetupEnvironmentForTests();
  FakeWS.reset();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  setWs(null);
});

describe("Section Environnement", () => {
  it("liste Claude Code et Codex avec leur état, et les quatre outils", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]));
    relay({ type: "environmentStatus", tools: TOOLS });

    expect(within(row("Claude Code")).getByText(t("setup.ready"))).toBeInTheDocument();
    expect(within(row("Claude Code")).getByText("2.1.283")).toBeInTheDocument();
    expect(within(row("Codex")).getByText(t("setup.login-needed"))).toBeInTheDocument();
    for (const title of ["Homebrew", t("setup.tool-git-title"), "LaTeX", "Zotero"]) {
      expect(row(title)).toBeInTheDocument();
    }
    // la lecture des PDF est livrée avec l'app : plus de rangée poppler
    expect(screen.queryByRole("group", { name: "Poppler" })).toBeNull();
    // TeX : la variante trouvée est dite
    expect(within(row("LaTeX")).getByText(t("setup.found-variant", { variant: "tectonic" }))).toBeInTheDocument();
    expect(within(row("Homebrew")).getByText(t("setup.missing"))).toBeInTheDocument();
    // un outil trouvé n'a pas d'action
    expect(within(row(t("setup.tool-git-title"))).queryByRole("button")).toBeNull();
  });

  it("Installer confie la commande officielle au terminal intégré", () => {
    const opener = vi.fn(() => true);
    registerSetupTerminal(opener);
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    relay({ type: "environmentStatus", tools: TOOLS_WITH_BREW });

    fireEvent.click(within(row("Claude Code")).getByRole("button", { name: t("setup.install") }));
    expect(opener).toHaveBeenLastCalledWith(
      "curl -fsSL https://claude.ai/install.sh | bash",
      { kind: "install", origin: "environment" },
    );
    // Homebrew présent : brew est appelé par son chemin absolu
    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.install") }));
    expect(opener).toHaveBeenLastCalledWith(
      "/opt/homebrew/bin/brew install --cask codex",
      { kind: "install", origin: "environment" },
    );
    // commande prise par le terminal : rien à copier
    expect(screen.queryByRole("group", { name: t("setup.fallback-label") })).toBeNull();
  });

  it("sans Homebrew, Codex propose d'installer Homebrew d'abord", () => {
    const opener = vi.fn(() => true);
    registerSetupTerminal(opener);
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_MISSING]));
    relay({ type: "environmentStatus", tools: TOOLS });

    expect(within(row("Codex")).queryByRole("button", { name: t("setup.install") })).toBeNull();
    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.install-homebrew-first") }));
    expect(opener).toHaveBeenLastCalledWith(
      expect.stringContaining("Homebrew/install/HEAD/install.sh"),
      { kind: "install", origin: "environment" },
    );
  });

  it("sans LaTeX, rien à installer : la première compilation télécharge tectonic", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY]));
    relay({ type: "environmentStatus", tools: TOOLS.map((tool) => tool.id === "tex" ? TEX_ON_DEMAND : tool) });

    expect(within(row("LaTeX")).getByText(t("setup.automatic"))).toBeInTheDocument();
    expect(within(row("LaTeX")).getByText(t("setup.tex-on-demand"), { exact: false })).toBeInTheDocument();
    expect(within(row("LaTeX")).queryByRole("button")).toBeNull();
  });

  it("Se connecter lance la commande de connexion sur le binaire détecté", () => {
    const opener = vi.fn(() => true);
    registerSetupTerminal(opener);
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]));

    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.sign-in") }));
    expect(opener).toHaveBeenCalledWith("/opt/homebrew/bin/codex login", { kind: "login", origin: "environment" });
    // un agent prêt n'a aucune action
    expect(within(row("Claude Code")).queryByRole("button")).toBeNull();
  });

  it("Zotero absent : Télécharger ouvre la page officielle, et Intégrations est citée", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay({ type: "environmentStatus", tools: TOOLS });

    const zotero = row("Zotero");
    expect(zotero.textContent).toContain(t("setup.zotero-hint"));
    fireEvent.click(within(zotero).getByRole("button", { name: t("setup.download") }));
    expect(openUrl).toHaveBeenCalledWith("https://www.zotero.org/download/");
  });

  it("sans terminal intégré (aucun projet), la commande s'affiche à copier dans Terminal", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    relay({ type: "environmentStatus", tools: TOOLS });

    fireEvent.click(within(row("Claude Code")).getByRole("button", { name: t("setup.install") }));
    const fallback = screen.getByRole("group", { name: t("setup.fallback-label") });
    expect(within(fallback).getByText("curl -fsSL https://claude.ai/install.sh | bash")).toBeInTheDocument();
    expect(fallback.textContent).toContain(t("setup.fallback-hint"));

    await act(async () => {
      fireEvent.click(within(fallback).getByRole("button", { name: t("action.copy") }));
    });
    expect(writeText).toHaveBeenCalledWith("curl -fsSL https://claude.ai/install.sh | bash");
    expect(within(fallback).getByRole("button", { name: t("setup.copied") })).toBeInTheDocument();

    fireEvent.click(within(fallback).getByRole("button", { name: t("setup.open-terminal") }));
    expect(openPath).toHaveBeenCalledWith("/System/Applications/Utilities/Terminal.app");

    fireEvent.click(within(fallback).getByRole("button", { name: t("setup.hide-command") }));
    expect(screen.queryByRole("group", { name: t("setup.fallback-label") })).toBeNull();
  });

  it("un seul Revérifier : redemande agents et outils, en attente jusqu'aux deux réponses", () => {
    const ws = fakeWsOuvert();
    setWs(ws);
    renderUi(<Environment {...props({ ws })} />);
    relay(setupStatus([CLAUDE_READY]));
    relay({ type: "environmentStatus", tools: TOOLS });

    fireEvent.click(screen.getByRole("button", { name: t("settings.providers-recheck") }));
    expect(ws.sentTypes()).toEqual(["refreshProviders", "environmentStatus"]);
    const pending = screen.getByRole("button", { name: t("settings.checking") });
    expect(pending).toBeDisabled();

    relay(setupStatus([CLAUDE_READY]));
    expect(screen.getByRole("button", { name: t("settings.checking") })).toBeDisabled();
    relay({ type: "environmentStatus", tools: TOOLS_WITH_BREW });
    expect(screen.getByRole("button", { name: t("settings.providers-recheck") })).not.toBeDisabled();
    expect(within(row("Homebrew")).getByText(t("setup.found"))).toBeInTheDocument();
  });

  it("rouvre la fenêtre de bienvenue", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    fireEvent.click(within(row(t("setup.welcome-row"))).getByRole("button", { name: t("setup.welcome-open") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });
});
