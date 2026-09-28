// Fenêtre de bienvenue du premier lancement : règle de visibilité (ouverte
// sans agent prêt, JAMAIS pour qui en a un — le cas de l'auteur —, jamais
// après « Terminer »), contenu (agents, outils facultatifs), pied de fenêtre
// (Plus tard / Revérifier / Terminer) et commandes.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
  openPath: vi.fn(async () => {}),
}));

import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";
import { FakeWS } from "../../test/fixtures/sidecar";
import {
  CLAUDE_MISSING, CLAUDE_READY, CODEX_MISSING, CODEX_READY, TOOLS, setupStatus,
} from "../../test/fixtures/setupEnvironment";
import { relaySidecarMessage } from "../../lib/sidecarRelays";
import {
  WELCOME_DONE_KEY,
  closeSetupWelcome,
  registerSetupTerminal,
  resetSetupEnvironmentForTests,
  setupEnvironmentSnapshot,
} from "../../lib/setupEnvironment";
import { setWs } from "../../lib/wsBus";
import { SetupWelcomeHost } from "./SetupWelcomeHost";

const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

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

function relay(msg: unknown) {
  act(() => { relaySidecarMessage(msg); });
}

async function findWelcome() {
  return screen.findByRole("dialog", { name: t("setup.welcome-title") }, { timeout: 5000 });
}

/** Premier lancement type : rien d'installé, diagnostic des outils reçu. */
async function firstLaunch() {
  renderUi(<SetupWelcomeHost />);
  relay({ type: "environmentStatus", tools: TOOLS });
  relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
  return findWelcome();
}

describe("accueil — visibilité", () => {
  it("s'ouvre au premier setupStatus quand aucun agent n'est prêt", async () => {
    const dialog = await firstLaunch();
    expect(dialog.textContent).toContain(t("setup.welcome-intro"));
  });

  it("cas de l'auteur : Claude Code et Codex prêts — aucune fenêtre, rien de chargé", () => {
    const { container } = renderUi(<SetupWelcomeHost />);
    relay(setupStatus([CLAUDE_READY, CODEX_READY]));
    relay({ type: "environmentStatus", tools: TOOLS });
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("ne s'ouvre pas quand l'accueil a déjà été terminé", () => {
    localStorage.setItem(WELCOME_DONE_KEY, "1");
    renderUi(<SetupWelcomeHost />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("accueil — contenu et pied de fenêtre", () => {
  it("montre les deux agents et Zotero, seul outil facultatif", async () => {
    const dialog = await firstLaunch();
    for (const title of ["Claude Code", "Codex", "Zotero"]) {
      expect(within(dialog).getByRole("group", { name: title })).toBeInTheDocument();
    }
    // PDF livrés avec l'app, LaTeX téléchargé au besoin : rien à installer
    for (const title of ["Homebrew", "Poppler", "LaTeX"]) {
      expect(within(dialog).queryByRole("group", { name: title })).toBeNull();
    }
    expect(within(dialog).getByText(t("setup.welcome-optional"))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t("setup.finish") })).toBeDisabled();
  });

  it("« Plus tard » ferme sans retenir l'accueil comme terminé", async () => {
    const dialog = await firstLaunch();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.later") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    expect(localStorage.getItem(WELCOME_DONE_KEY)).toBeNull();
  });

  it("un agent devenu prêt après Revérifier : la fenêtre le dit, reste ouverte, et Terminer s'active", async () => {
    const ws = new FakeWS("ws://fixture-welcome");
    ws.readyState = 1;
    setWs(ws as unknown as WebSocket);
    const dialog = await firstLaunch();

    fireEvent.click(within(dialog).getByRole("button", { name: t("settings.providers-recheck") }));
    expect(ws.sentTypes()).toEqual(["refreshProviders", "environmentStatus"]);
    expect(within(dialog).getByRole("button", { name: t("settings.checking") })).toBeDisabled();

    relay(setupStatus([CLAUDE_READY, CODEX_MISSING]));
    relay({ type: "environmentStatus", tools: TOOLS });
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
    expect(within(dialog).getByText(t("setup.welcome-ready", { agent: "Claude Code" }))).toBeInTheDocument();
    expect(within(within(dialog).getByRole("group", { name: "Claude Code" })).getByText(t("setup.ready")))
      .toBeInTheDocument();

    const finish = within(dialog).getByRole("button", { name: t("setup.finish") });
    expect(finish).not.toBeDisabled();
    fireEvent.click(finish);
    expect(localStorage.getItem(WELCOME_DONE_KEY)).toBe("1");
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });
});

describe("accueil — commandes", () => {
  it("Installer part dans le terminal intégré quand il existe (App ferme alors la fenêtre)", async () => {
    const opener = vi.fn(() => {
      closeSetupWelcome();
      return true;
    });
    registerSetupTerminal(opener);
    const dialog = await firstLaunch();
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Claude Code" }))
      .getByRole("button", { name: t("setup.install") }));
    expect(opener).toHaveBeenCalledWith(
      "curl -fsSL https://claude.ai/install.sh | bash",
      { kind: "install", origin: "welcome" },
    );
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("sans projet ouvert, la commande s'affiche dans la fenêtre, qui reste ouverte", async () => {
    const dialog = await firstLaunch();
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Codex" }))
      .getByRole("button", { name: t("setup.install-homebrew-first") }));
    const fallback = within(dialog).getByRole("group", { name: t("setup.fallback-label") });
    expect(fallback.textContent).toContain("Homebrew/install/HEAD/install.sh");
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });
});
