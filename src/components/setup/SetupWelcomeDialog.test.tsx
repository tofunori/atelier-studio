// Fenêtre de bienvenue du premier lancement : règle de visibilité (ouverte
// sans agent prêt, JAMAIS pour qui en a un — le cas de l'auteur —, jamais
// après « Terminer »), la question unique (quel compte ?), le bouton qui
// installe et connecte depuis Atelier, le suivi des deux étapes, l'échec et
// l'écran « prêt ».
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
  openPath: vi.fn(async () => {}),
}));

import { openUrl } from "@tauri-apps/plugin-opener";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";
import { FakeWS } from "../../test/fixtures/sidecar";
import {
  CLAUDE_MISSING, CLAUDE_READY, CODEX_LOGGED_OUT, CODEX_MISSING, CODEX_READY, TOOLS, setupStatus,
} from "../../test/fixtures/setupEnvironment";
import { relaySidecarMessage } from "../../lib/sidecarRelays";
import {
  WELCOME_DONE_KEY,
  openSetupWelcome,
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

/** Socket ouverte et branchée sur le bus : les demandes du store partent. */
function serveur(): FakeWS {
  const ws = new FakeWS("ws://fixture-welcome");
  ws.readyState = 1;
  setWs(ws as unknown as WebSocket);
  return ws;
}

function envoye(ws: FakeWS): unknown[] {
  return ws.sent.map((raw) => JSON.parse(raw));
}

function run(agent: string, phase: string, extra: Record<string, unknown> = {}) {
  relay({ type: "setupRun", agent, phase, detail: null, url: null, error: null, ...extra });
}

/** Premier lancement type : rien d'installé, diagnostic des outils reçu. */
async function firstLaunch(onOpenFolder?: () => void) {
  renderUi(<SetupWelcomeHost onOpenFolder={onOpenFolder} />);
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

describe("accueil — une question, un bouton", () => {
  it("pose la seule question : deux cartes, Claude Code choisi, une action principale", async () => {
    const dialog = await firstLaunch();
    const cards = within(within(dialog).getByRole("radiogroup", { name: t("setup.pick-label") })).getAllByRole("radio");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAccessibleName(/Claude Code/);
    expect(cards[0]).toBeChecked();
    expect(cards[1]).toHaveAccessibleName(/Codex/);
    expect(cards[1]).not.toBeChecked();
    // ni rangées d'outils, ni commande : rien d'autre à comprendre ici
    for (const title of ["Homebrew", "Poppler", "LaTeX", "Zotero"]) {
      expect(within(dialog).queryByRole("group", { name: title })).toBeNull();
    }
    expect(within(dialog).getByText(t("setup.private-note"))).toBeInTheDocument();
    // une seule action principale, jamais grisée ; « Terminer » n'existe pas
    expect(within(dialog).getByRole("button", { name: t("setup.install-and-connect") }))
      .toHaveClass("ui-btn--primary");
    expect(within(dialog).queryByRole("button", { name: t("setup.finish") })).toBeNull();
  });

  it("un agent déjà installé est présélectionné, et le bouton dit « Se connecter »", async () => {
    renderUi(<SetupWelcomeHost />);
    relay(setupStatus([CLAUDE_MISSING, CODEX_LOGGED_OUT]));
    const dialog = await findWelcome();
    expect(within(dialog).getByRole("radio", { name: /Codex/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Codex/ }).textContent).toContain(t("setup.pick-installed"));
    expect(within(dialog).getByRole("button", { name: t("setup.sign-in") })).toHaveClass("ui-btn--primary");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Claude Code/ }));
    expect(within(dialog).getByRole("button", { name: t("setup.install-and-connect") })).toBeInTheDocument();
  });

  it("« Plus tard » ferme sans retenir l'accueil comme terminé", async () => {
    const dialog = await firstLaunch();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.later") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    expect(localStorage.getItem(WELCOME_DONE_KEY)).toBeNull();
  });

  it("sans aucun des deux comptes : où en créer un", async () => {
    const dialog = await firstLaunch();
    expect(within(dialog).queryByRole("button", { name: t("setup.create-claude") })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.no-account") }));
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.create-chatgpt") }));
    expect(openUrl).toHaveBeenCalledWith("https://chatgpt.com");
  });

  it("le bouton installe et connecte l'agent choisi depuis Atelier", async () => {
    const ws = serveur();
    const dialog = await firstLaunch();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Codex/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.install-and-connect") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRun", agent: "codex" });
    expect(await screen.findByRole("dialog", { name: t("setup.run-install-title", { agent: "Codex" }) }))
      .toBeInTheDocument();
  });

  it("serveur injoignable : la fenêtre le dit et reste sur le choix", async () => {
    const dialog = await firstLaunch();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.install-and-connect") }));
    expect(within(dialog).getByText(t("settings.sidecar-disconnected-notice"))).toBeInTheDocument();
    expect(within(dialog).getByRole("radiogroup", { name: t("setup.pick-label") })).toBeInTheDocument();
  });
});

describe("accueil — installation et connexion", () => {
  async function started() {
    const ws = serveur();
    const dialog = await firstLaunch();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.install-and-connect") }));
    return { ws, dialog };
  }

  it("suit les deux étapes, rouvre la page de connexion, envoie un code, s'annule", async () => {
    const { ws, dialog } = await started();
    run("claude", "installing", { detail: "Downloading Claude Code…" });
    expect(dialog).toHaveAccessibleName(t("setup.run-install-title", { agent: "Claude Code" }));
    expect(within(dialog).getByText("Downloading Claude Code…")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: t("setup.reopen-page") })).toBeNull();

    relay(setupStatus([{ ...CLAUDE_READY, auth: "login_needed" }, CODEX_MISSING]));
    run("claude", "signing_in", { url: "https://claude.ai/oauth/authorize?x=1" });
    expect(dialog).toHaveAccessibleName(t("setup.run-login-title", { account: "Claude" }));
    expect(within(dialog).getByText(t("setup.step-version", { version: "2.1.283" }))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.reopen-page") }));
    expect(openUrl).toHaveBeenCalledWith("https://claude.ai/oauth/authorize?x=1");

    // la page affiche un code : un champ, une ligne envoyée au serveur
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.code-toggle") }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: t("setup.code-label") }), { target: { value: " abc-123 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("action.send") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRunInput", agent: "claude", text: "abc-123" });

    fireEvent.click(within(dialog).getByRole("button", { name: t("action.cancel") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRunCancel", agent: "claude" });
    run("claude", "cancelled");
    expect(dialog).toHaveAccessibleName(t("setup.welcome-title"));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });

  it("échec : la fin de la sortie, Réessayer, la commande à la main, et Retour au choix", async () => {
    const { ws, dialog } = await started();
    run("claude", "failed", { error: "curl: (6) Could not resolve host: claude.ai" });
    expect(dialog).toHaveAccessibleName(t("setup.run-failed-title", { agent: "Claude Code" }));
    expect(within(dialog).getByText("curl: (6) Could not resolve host: claude.ai")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.manual") }));
    expect(within(dialog).getByRole("group", { name: t("setup.fallback-label") }).textContent)
      .toContain("curl -fsSL https://claude.ai/install.sh | bash");

    fireEvent.click(within(dialog).getByRole("button", { name: t("action.retry") }));
    expect(envoye(ws).filter((msg) => (msg as { type?: string }).type === "setupRun")).toHaveLength(2);
    expect(dialog).toHaveAccessibleName(t("setup.run-install-title", { agent: "Claude Code" }));

    run("claude", "failed", { error: "encore" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.back") }));
    expect(dialog).toHaveAccessibleName(t("setup.welcome-title"));
  });

  it("fermée pendant l'installation, la fenêtre la retrouve à la réouverture", async () => {
    const { dialog } = await started();
    run("claude", "installing", { detail: "Installing…" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("action.close") }));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    act(() => { openSetupWelcome(); });
    expect(await screen.findByRole("dialog", { name: t("setup.run-install-title", { agent: "Claude Code" }) }))
      .toBeInTheDocument();
  });
});

describe("accueil — un agent est prêt", () => {
  async function ready(onOpenFolder?: () => void) {
    const ws = serveur();
    const dialog = await firstLaunch(onOpenFolder);
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.install-and-connect") }));
    run("claude", "ready");
    relay(setupStatus([CLAUDE_READY, CODEX_MISSING]));
    return { ws, dialog };
  }

  it("la fenêtre le dit, reste ouverte, et propose d'ouvrir un dossier", async () => {
    const onOpenFolder = vi.fn();
    const { dialog } = await ready(onOpenFolder);
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
    expect(dialog).toHaveAccessibleName(t("setup.ready-title", { agent: "Claude Code" }));
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(t("setup.open-folder")) }));
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(WELCOME_DONE_KEY)).toBe("1");
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("montre aussi Zotero et l'autre agent, qui s'installe du même geste", async () => {
    const { ws, dialog } = await ready();
    expect(within(dialog).getByText(t("setup.also-here"))).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Zotero" })).toBeInTheDocument();
    // l'agent prêt n'est pas répété ; ni Homebrew ni LaTeX n'apparaissent
    for (const title of ["Claude Code", "Homebrew", "LaTeX"]) {
      expect(within(dialog).queryByRole("group", { name: title })).toBeNull();
    }
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Codex" }))
      .getByRole("button", { name: t("setup.install") }));
    expect(envoye(ws)).toContainEqual({ type: "setupRun", agent: "codex" });
    expect(dialog).toHaveAccessibleName(t("setup.run-install-title", { agent: "Codex" }));
  });

  it("« Terminer » retient l'accueil comme terminé", async () => {
    const { dialog } = await ready();
    fireEvent.click(within(dialog).getByRole("button", { name: t("setup.finish") }));
    expect(localStorage.getItem(WELCOME_DONE_KEY)).toBe("1");
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("rouverte depuis les Réglages avec un agent déjà prêt : l'écran « prêt », sans installation", async () => {
    renderUi(<SetupWelcomeHost />);
    relay(setupStatus([CLAUDE_READY, CODEX_READY]));
    act(() => { openSetupWelcome(); });
    const dialog = await screen.findByRole("dialog", { name: t("setup.ready-title", { agent: "Claude Code" }) });
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    // sans action d'ouverture fournie, pas de carte « Ouvrir un dossier »
    expect(within(dialog).queryByRole("button", { name: new RegExp(t("setup.open-folder")) })).toBeNull();
  });
});
