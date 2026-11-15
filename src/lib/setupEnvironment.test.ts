// Store du premier lancement : relais WS → état, règle « un agent prêt »,
// ouverture automatique de l'accueil (une fois par lancement, jamais pour qui
// a déjà un agent prêt), « Revérifier » et plan d'installation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./wsBus", () => ({ wsSend: vi.fn(() => true) }));

import {
  RECHECK_TIMEOUT_MS,
  WELCOME_DONE_KEY,
  agentReady,
  cancelSetupRun,
  clearSetupRun,
  installPlan,
  normalizeProviders,
  normalizeTools,
  recheckAll,
  registerSetupTerminal,
  resetSetupEnvironmentForTests,
  runSetupCommand,
  sendSetupRunInput,
  setupEnvironmentSnapshot,
  setupRunActive,
  shellQuote,
  shouldAutoShowWelcome,
  startSetupRun,
  subscribeSetupEnvironment,
  withResolvedBinary,
} from "./setupEnvironment";
import { relaySidecarMessage } from "./sidecarRelays";
import { wsSend } from "./wsBus";
import {
  CLAUDE_MISSING, CLAUDE_READY, CODEX_LOGGED_OUT, CODEX_MISSING, CODEX_READY, TOOLS, setupStatus,
} from "../test/fixtures/setupEnvironment";

const wsSendMock = vi.mocked(wsSend);

beforeEach(() => {
  localStorage.clear();
  resetSetupEnvironmentForTests();
  wsSendMock.mockReset();
  wsSendMock.mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("setupEnvironment — relais WS", () => {
  it("rien n'est connu avant le premier message", () => {
    const s = setupEnvironmentSnapshot();
    expect(s.providers).toBeNull();
    expect(s.tools).toBeNull();
    expect(s.welcomeOpen).toBe(false);
  });

  it("setupStatus et environmentStatus sont relayés au store, qui prévient ses abonnés", () => {
    const listener = vi.fn();
    const off = subscribeSetupEnvironment(listener);
    expect(relaySidecarMessage(setupStatus([CLAUDE_READY, CODEX_LOGGED_OUT]))).toBe(true);
    expect(relaySidecarMessage({ type: "environmentStatus", tools: TOOLS })).toBe(true);
    off();
    expect(listener).toHaveBeenCalled();
    const s = setupEnvironmentSnapshot();
    expect(s.providers?.map((p) => [p.id, p.auth, p.installCommand])).toEqual([
      ["claude", "ready", "curl -fsSL https://claude.ai/install.sh | bash"],
      ["codex", "login_needed", "brew install --cask codex"],
    ]);
    expect(s.providers?.[1].loginCommand).toBe("codex login");
    expect(s.tools?.map((tool) => [tool.id, tool.found])).toEqual([
      ["homebrew", false], ["git", true], ["tex", true], ["zotero", false],
    ]);
    expect(s.tools?.find((tool) => tool.id === "tex")?.detail).toBe("tectonic");
  });

  it("une entrée mal formée est ignorée ; un lien d'installation non https est retiré", () => {
    expect(normalizeProviders([null, 3, { label: "sans id" }, { id: "kimi" }])).toEqual([{
      id: "kimi", label: "kimi", kind: "cli", installed: false, version: null, binPath: null,
      auth: "unknown", loginCommand: null, installCommand: null,
    }]);
    // "poppler" d'un ancien serveur : la lecture des PDF est désormais livrée
    const tools = normalizeTools([
      { id: "inconnu", found: true }, { id: "poppler", found: false }, { id: "git", found: true, installUrl: "http://x" },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].installUrl).toBeNull();
  });
});

describe("agentReady", () => {
  it("vrai dès qu'un fournisseur est prêt, API compris", () => {
    expect(agentReady(null)).toBe(false);
    expect(agentReady([])).toBe(false);
    expect(agentReady(normalizeProviders([CLAUDE_MISSING, CODEX_LOGGED_OUT]))).toBe(false);
    expect(agentReady(normalizeProviders([CLAUDE_MISSING, CODEX_READY]))).toBe(true);
    expect(agentReady(normalizeProviders([{ id: "openrouter", kind: "api", auth: "ready", installed: true }]))).toBe(true);
  });
});

describe("accueil — ouverture automatique", () => {
  it("s'ouvre au premier setupStatus quand aucun agent n'est prêt et que l'accueil n'est pas terminé", () => {
    relaySidecarMessage(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
  });

  it("cas de l'auteur : Claude Code et Codex prêts, rien ne s'ouvre", () => {
    relaySidecarMessage(setupStatus([CLAUDE_READY, CODEX_READY]));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("ne s'ouvre pas quand l'accueil a été terminé (welcomeDone=1)", () => {
    localStorage.setItem(WELCOME_DONE_KEY, "1");
    relaySidecarMessage(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("la décision ne se prend qu'une fois par lancement (reconnexion, Revérifier)", () => {
    relaySidecarMessage(setupStatus([CLAUDE_READY]));
    relaySidecarMessage(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
  });

  it("stockage inaccessible : l'accueil s'ouvre quand même, sans lever", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqué"); });
    expect(() => relaySidecarMessage(setupStatus([CLAUDE_MISSING]))).not.toThrow();
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
    getItem.mockRestore();
  });

  it("règle pure : il faut une réponse du serveur", () => {
    expect(shouldAutoShowWelcome(null, false)).toBe(false);
    expect(shouldAutoShowWelcome([], false)).toBe(true);
    expect(shouldAutoShowWelcome([], true)).toBe(false);
  });
});

describe("recheckAll", () => {
  it("envoie refreshProviders et environmentStatus, et reste en attente jusqu'aux deux réponses", () => {
    expect(recheckAll()).toBe(true);
    expect(wsSendMock.mock.calls.map(([msg]) => (msg as { type: string }).type))
      .toEqual(["refreshProviders", "environmentStatus"]);
    expect(setupEnvironmentSnapshot().rechecking).toBe(true);
    // un second clic pendant l'attente n'envoie rien
    expect(recheckAll()).toBe(false);
    expect(wsSendMock).toHaveBeenCalledTimes(2);
    relaySidecarMessage(setupStatus([CLAUDE_READY]));
    expect(setupEnvironmentSnapshot().rechecking).toBe(true);
    relaySidecarMessage({ type: "environmentStatus", tools: TOOLS });
    expect(setupEnvironmentSnapshot().rechecking).toBe(false);
  });

  it("sans réponse, l'attente tombe au bout de 10 s", () => {
    vi.useFakeTimers();
    recheckAll();
    relaySidecarMessage(setupStatus([CLAUDE_READY]));
    vi.advanceTimersByTime(RECHECK_TIMEOUT_MS - 1);
    expect(setupEnvironmentSnapshot().rechecking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(setupEnvironmentSnapshot().rechecking).toBe(false);
  });

  it("socket fermée : rien n'est en attente", () => {
    wsSendMock.mockReturnValue(false);
    expect(recheckAll()).toBe(false);
    expect(setupEnvironmentSnapshot().rechecking).toBe(false);
  });
});

describe("runSetupCommand", () => {
  it("sans terminal intégré (aucun projet), retombe sur la copie", () => {
    expect(runSetupCommand("brew install --cask codex", { kind: "install", origin: "environment" })).toBe("copy");
  });

  it("confie la commande au lanceur enregistré par App, avec sa nature et son origine", () => {
    const opener = vi.fn(() => true);
    const off = registerSetupTerminal(opener);
    expect(runSetupCommand("codex login", { kind: "login", origin: "welcome" })).toBe("terminal");
    expect(opener).toHaveBeenCalledWith("codex login", { kind: "login", origin: "welcome" });
    off();
    expect(runSetupCommand("codex login", { kind: "login", origin: "welcome" })).toBe("copy");
  });

  it("un lanceur qui refuse laisse la copie", () => {
    registerSetupTerminal(() => false);
    expect(runSetupCommand("codex login", { kind: "login", origin: "models" })).toBe("copy");
  });
});

describe("commandes : Homebrew d'abord, binaires résolus", () => {
  const tools = normalizeTools(TOOLS);
  const withBrew = normalizeTools(TOOLS.map((tool) => tool.id === "homebrew"
    ? { ...tool, found: true, path: "/opt/homebrew/bin/brew" } : tool));

  it("une commande brew sans Homebrew installe d'abord Homebrew", () => {
    const plan = installPlan("brew install --cask codex", tools);
    expect(plan.homebrewFirst).toBe(true);
    expect(plan.command).toContain("Homebrew/install/HEAD/install.sh");
  });

  it("avec Homebrew, brew est appelé par son chemin (le PATH du shell peut l'ignorer)", () => {
    expect(installPlan("brew install --cask codex", withBrew)).toEqual({
      command: "/opt/homebrew/bin/brew install --cask codex", homebrewFirst: false,
    });
  });

  it("diagnostic pas encore reçu, ou commande sans brew : la commande part telle quelle", () => {
    expect(installPlan("brew install --cask codex", null)).toEqual({ command: "brew install --cask codex", homebrewFirst: false });
    const claude = "curl -fsSL https://claude.ai/install.sh | bash";
    expect(installPlan(claude, tools)).toEqual({ command: claude, homebrewFirst: false });
  });

  it("la commande de connexion vise le binaire détecté", () => {
    expect(withResolvedBinary("claude auth login", "/Users/t/.local/bin/claude"))
      .toBe("/Users/t/.local/bin/claude auth login");
    expect(withResolvedBinary("codex login", "/Applications/My Tools/codex"))
      .toBe("'/Applications/My Tools/codex' login");
    // autre binaire, ou chemin inconnu : inchangée
    expect(withResolvedBinary("grok login", "/usr/local/bin/kimi")).toBe("grok login");
    expect(withResolvedBinary("grok login", null)).toBe("grok login");
  });

  it("shellQuote n'entoure que ce qui doit l'être", () => {
    expect(shellQuote("/opt/homebrew/bin/brew")).toBe("/opt/homebrew/bin/brew");
    expect(shellQuote("/a b/it's")).toBe(`'/a b/it'\\''s'`);
  });
});

describe("setupEnvironment — installer et connecter un agent depuis Atelier", () => {
  const run = (patch: Record<string, unknown>) => relaySidecarMessage({ type: "setupRun", agent: "claude", ...patch });

  it("le lancement part une fois et s'affiche tout de suite", () => {
    expect(startSetupRun("claude")).toBe(true);
    expect(wsSendMock).toHaveBeenCalledWith({ type: "setupRun", agent: "claude" });
    expect(setupEnvironmentSnapshot().runs.claude?.phase).toBe("starting");
    // Deuxième clic pendant que ça tourne : rien ne repart.
    expect(startSetupRun("claude")).toBe(true);
    expect(wsSendMock).toHaveBeenCalledTimes(1);
  });

  it("une socket fermée ne laisse pas une installation fantôme à l'écran", () => {
    wsSendMock.mockReturnValue(false);
    expect(startSetupRun("codex")).toBe(false);
    expect(setupEnvironmentSnapshot().runs.codex).toBeUndefined();
  });

  it("suit les phases, garde la dernière ligne et l'adresse de connexion", () => {
    startSetupRun("claude");
    expect(run({ phase: "installing", detail: "Téléchargement…" })).toBe(true);
    run({ phase: "installing" });
    expect(setupEnvironmentSnapshot().runs.claude).toMatchObject({ phase: "installing", detail: "Téléchargement…" });
    run({ phase: "signing_in" });
    run({ phase: "signing_in", url: "https://claude.ai/oauth?x=1" });
    run({ phase: "signing_in" });
    expect(setupEnvironmentSnapshot().runs.claude).toMatchObject({
      phase: "signing_in", detail: null, url: "https://claude.ai/oauth?x=1",
    });
    expect(setupRunActive(setupEnvironmentSnapshot().runs.claude)).toBe(true);
    run({ phase: "ready" });
    expect(setupEnvironmentSnapshot().runs.claude).toEqual({ phase: "ready", detail: null, url: null, error: null });
    expect(setupRunActive(setupEnvironmentSnapshot().runs.claude)).toBe(false);
  });

  it("n'accepte qu'une adresse https, un agent et une phase connus", () => {
    startSetupRun("claude");
    run({ phase: "signing_in", url: "javascript:alert(1)" });
    expect(setupEnvironmentSnapshot().runs.claude?.url).toBeNull();
    relaySidecarMessage({ type: "setupRun", agent: "kimi", phase: "ready" });
    run({ phase: "inconnue" });
    expect(Object.keys(setupEnvironmentSnapshot().runs)).toEqual(["claude"]);
    expect(setupEnvironmentSnapshot().runs.claude?.phase).toBe("signing_in");
  });

  it("un échec garde ses dernières lignes, puis s'efface à la demande", () => {
    startSetupRun("codex");
    relaySidecarMessage({ type: "setupRun", agent: "codex", phase: "failed", error: "curl: (6) hôte introuvable" });
    expect(setupEnvironmentSnapshot().runs.codex).toMatchObject({ phase: "failed", error: "curl: (6) hôte introuvable" });
    clearSetupRun("codex");
    expect(setupEnvironmentSnapshot().runs.codex).toBeUndefined();
  });

  it("annuler et saisir un code ne partent que pendant une installation", () => {
    cancelSetupRun("claude");
    expect(sendSetupRunInput("claude", "1234")).toBe(false);
    expect(wsSendMock).not.toHaveBeenCalled();
    startSetupRun("claude");
    clearSetupRun("claude");
    expect(setupEnvironmentSnapshot().runs.claude?.phase).toBe("starting");
    run({ phase: "signing_in" });
    expect(sendSetupRunInput("claude", "  1234 ")).toBe(true);
    expect(wsSendMock).toHaveBeenLastCalledWith({ type: "setupRunInput", agent: "claude", text: "1234" });
    cancelSetupRun("claude");
    expect(wsSendMock).toHaveBeenLastCalledWith({ type: "setupRunCancel", agent: "claude" });
  });
});
