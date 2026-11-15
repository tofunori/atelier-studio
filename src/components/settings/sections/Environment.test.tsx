// Section Environnement (premier lancement) : rangées agents et outils lues
// dans le store, action qui débloque chaque ligne (installer et connecter
// depuis Atelier, télécharger), suivi d'une installation dans la rangée,
// repli « commande à copier » quand le serveur est injoignable ou que
// l'installation échoue, et « Revérifier » unique pour toute la section.
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

const TOOLS_WITH_ZOTERO = TOOLS.map((tool) => tool.id === "zotero" ? { ...tool, found: true } : tool);

/** Socket ouverte ET branchée sur le bus : les demandes du store partent. */
function serveur(): FakeWS & WebSocket {
  const ws = fakeWsOuvert();
  setWs(ws);
  return ws;
}

function envoye(ws: FakeWS): unknown[] {
  return ws.sent.map((raw) => JSON.parse(raw));
}

function run(agent: string, phase: string, extra: Record<string, unknown> = {}) {
  relay({ type: "setupRun", agent, phase, detail: null, url: null, error: null, ...extra });
}

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
  it("liste Claude Code et Codex avec leur état, et les outils sans Homebrew", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]));
    relay({ type: "environmentStatus", tools: TOOLS });

    expect(within(row("Claude Code")).getByText(t("setup.ready"))).toBeInTheDocument();
    expect(within(row("Claude Code")).getByText("2.1.283")).toBeInTheDocument();
    expect(within(row("Codex")).getByText(t("setup.login-needed"))).toBeInTheDocument();
    for (const title of [t("setup.tool-git-title"), "LaTeX", "Zotero"]) {
      expect(row(title)).toBeInTheDocument();
    }
    // Codex a son installeur autonome : plus rien ne dépend de Homebrew ;
    // la lecture des PDF est livrée avec l'app : plus de rangée poppler
    for (const title of ["Homebrew", "Poppler"]) {
      expect(screen.queryByRole("group", { name: title })).toBeNull();
    }
    // TeX : la variante trouvée est dite
    expect(within(row("LaTeX")).getByText(t("setup.found-variant", { variant: "tectonic" }))).toBeInTheDocument();
    // un outil trouvé n'a pas d'action
    expect(within(row(t("setup.tool-git-title"))).queryByRole("button")).toBeNull();
  });

  it("Installer lance l'installation depuis Atelier et la rangée la suit, sans Terminal", () => {
    const opener = vi.fn(() => true);
    registerSetupTerminal(opener);
    const ws = serveur();
    renderUi(<Environment {...props({ ws })} />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    relay({ type: "environmentStatus", tools: TOOLS });

    fireEvent.click(within(row("Claude Code")).getByRole("button", { name: t("setup.install") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRun", agent: "claude" });
    expect(opener).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: t("setup.fallback-label") })).toBeNull();
    expect(within(row("Claude Code")).getByText(t("setup.installing"))).toBeInTheDocument();
    // l'autre agent garde son bouton
    expect(within(row("Codex")).getByRole("button", { name: t("setup.install") })).toBeInTheDocument();

    run("claude", "installing", { detail: "Downloading Claude Code…" });
    expect(row("Claude Code").textContent).toContain("Downloading Claude Code…");

    // connexion : la page s'ouvre dans le navigateur, et se rouvre d'ici
    relay(setupStatus([{ ...CLAUDE_READY, auth: "login_needed" }, CODEX_MISSING]));
    run("claude", "signing_in", { url: "https://claude.ai/oauth/authorize?x=1" });
    expect(within(row("Claude Code")).getByText(t("setup.signing-in"))).toBeInTheDocument();
    fireEvent.click(within(row("Claude Code")).getByRole("button", { name: t("setup.reopen-page") }));
    expect(openUrl).toHaveBeenCalledWith("https://claude.ai/oauth/authorize?x=1");

    fireEvent.click(within(row("Claude Code")).getByRole("button", { name: t("action.cancel") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRunCancel", agent: "claude" });

    run("claude", "ready");
    relay(setupStatus([CLAUDE_READY, CODEX_MISSING]));
    expect(within(row("Claude Code")).getByText(t("setup.ready"))).toBeInTheDocument();
    expect(within(row("Claude Code")).queryByRole("button")).toBeNull();
  });

  it("Se connecter ouvre la connexion depuis Atelier pour un agent déjà installé", () => {
    const ws = serveur();
    renderUi(<Environment {...props({ ws })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]));

    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.sign-in") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRun", agent: "codex" });
    // un agent prêt n'a aucune action
    expect(within(row("Claude Code")).queryByRole("button")).toBeNull();
  });

  it("échec : la fin de la sortie, la commande à coller, et Réessayer relance", () => {
    const ws = serveur();
    renderUi(<Environment {...props({ ws })} />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.install") }));
    run("codex", "failed", { error: "curl: (6) Could not resolve host: chatgpt.com" });

    expect(within(row("Codex")).getByText(t("setup.failed"))).toBeInTheDocument();
    expect(screen.getByText("curl: (6) Could not resolve host: chatgpt.com")).toBeInTheDocument();
    const fallback = screen.getByRole("group", { name: t("setup.fallback-label") });
    expect(fallback.textContent).toContain("https://chatgpt.com/codex/install.sh");

    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("action.retry") }));
    expect(envoye(ws).filter((msg) => (msg as { type?: string }).type === "setupRun")).toHaveLength(2);
    expect(within(row("Codex")).getByText(t("setup.installing"))).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: t("setup.fallback-label") })).toBeNull();
  });

  it("serveur injoignable : la connexion retombe sur la commande, binaire résolu", () => {
    const opener = vi.fn(() => true);
    registerSetupTerminal(opener);
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]));

    fireEvent.click(within(row("Codex")).getByRole("button", { name: t("setup.sign-in") }));
    expect(opener).toHaveBeenCalledWith("/Users/t/.local/bin/codex login", { kind: "login", origin: "environment" });
  });

  it("sans LaTeX, rien à installer : la première compilation télécharge tectonic", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay(setupStatus([CLAUDE_READY]));
    relay({ type: "environmentStatus", tools: TOOLS.map((tool) => tool.id === "tex" ? TEX_ON_DEMAND : tool) });

    expect(within(row("LaTeX")).getByText(t("setup.automatic"))).toBeInTheDocument();
    expect(within(row("LaTeX")).getByText(t("setup.tex-on-demand"), { exact: false })).toBeInTheDocument();
    expect(within(row("LaTeX")).queryByRole("button")).toBeNull();
  });

  it("Zotero absent : Télécharger ouvre la page officielle, et Intégrations est citée", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    relay({ type: "environmentStatus", tools: TOOLS });

    const zotero = row("Zotero");
    expect(zotero.textContent).toContain(t("setup.zotero-hint"));
    fireEvent.click(within(zotero).getByRole("button", { name: t("setup.download") }));
    expect(openUrl).toHaveBeenCalledWith("https://www.zotero.org/download/");
  });

  it("serveur injoignable, sans terminal intégré : la commande s'affiche à copier dans Terminal", async () => {
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
    relay({ type: "environmentStatus", tools: TOOLS_WITH_ZOTERO });
    expect(screen.getByRole("button", { name: t("settings.providers-recheck") })).not.toBeDisabled();
    expect(within(row("Zotero")).getByText(t("setup.found"))).toBeInTheDocument();
  });

  it("rouvre la fenêtre de bienvenue", () => {
    renderUi(<Environment {...props({ ws: fakeWsOuvert() })} />);
    fireEvent.click(within(row(t("setup.welcome-row"))).getByRole("button", { name: t("setup.welcome-open") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });
});
