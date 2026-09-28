// Premier lancement, côté App : la fenêtre de bienvenue ne s'ouvre jamais
// pour qui a déjà un agent prêt (ni fenêtre, ni bandeau — le cas de
// l'auteur), et une commande d'installation part dans le terminal intégré
// quand un projet est ouvert — sinon elle retombe sur la copie.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), confirm: vi.fn(async () => true) }));
vi.mock("./lib/notify", () => ({
  init: vi.fn(async () => {}),
  notifyRunDone: vi.fn(async () => {}),
  notifyReview: vi.fn(async () => {}),
  notifyArticleReady: vi.fn(async () => {}),
}));

import App from "./App";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import {
  resetSetupEnvironmentForTests,
  runSetupCommand,
  setupEnvironmentSnapshot,
} from "./lib/setupEnvironment";
import {
  CLAUDE_MISSING, CLAUDE_READY, CODEX_MISSING, CODEX_READY, TOOLS, setupStatus,
} from "./test/fixtures/setupEnvironment";

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16);
    await flushMicrotasks(10);
  });
}

async function mountConnected() {
  renderUi(<App />);
  await settle();
  const sock = FakeWS.last();
  await act(async () => { sock.open(); });
  await settle();
  return sock;
}

function catalog(ok: { claude: boolean; codex: boolean }) {
  return {
    type: "providerStatus",
    providers: [
      { id: "claude", label: "Claude Code", ok: ok.claude, kind: "cli", models: ["claude-opus-5"], efforts: [] },
      { id: "codex", label: "Codex", ok: ok.codex, kind: "cli", models: ["gpt-5.6-sol"], efforts: [] },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  resetSetupEnvironmentForTests();
  FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
});
afterEach(() => {
  cleanup();
  resetSetupEnvironmentForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("App — premier lancement", () => {
  it("la connexion demande l'état des agents et le diagnostic des outils", async () => {
    const sock = await mountConnected();
    expect(sock.sentTypes()).toEqual(expect.arrayContaining(["setupStatus", "environmentStatus"]));
  });

  it("cas de l'auteur : agents prêts — ni fenêtre de bienvenue, ni bandeau", async () => {
    localStorage.setItem("atelier-studio.projects", JSON.stringify(["/Users/t/projet"]));
    const sock = await mountConnected();
    await act(async () => {
      sock.emit(catalog({ claude: true, codex: true }));
      sock.emit(setupStatus([CLAUDE_READY, CODEX_READY]));
      sock.emit({ type: "environmentStatus", tools: TOOLS });
    });
    await settle();
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    expect(document.querySelector(".setup-welcome-dialog")).toBeNull();
    expect(document.querySelector(".chat-notice-trigger")).toBeNull();
  });

  it("Mac neuf : la fenêtre s'ouvre au premier setupStatus", async () => {
    const sock = await mountConnected();
    await act(async () => {
      sock.emit(catalog({ claude: false, codex: false }));
      sock.emit(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
      sock.emit({ type: "environmentStatus", tools: TOOLS });
      await vi.dynamicImportSettled();
    });
    await act(async () => {
      for (let i = 0; i < 20 && !document.querySelector(".setup-welcome-dialog"); i++) {
        await vi.advanceTimersByTimeAsync(50);
        await flushMicrotasks(10);
      }
    });
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);
    expect(document.querySelector(".setup-welcome-dialog")).not.toBeNull();
  });

  it("sans projet ouvert, pas de terminal intégré : la commande retombe sur la copie", async () => {
    await mountConnected();
    let result: string | null = null;
    act(() => { result = runSetupCommand("brew install --cask codex", { kind: "install", origin: "environment" }); });
    expect(result).toBe("copy");
  });

  it("avec un projet, la commande part dans le terminal intégré et ferme la fenêtre de bienvenue", async () => {
    localStorage.setItem("atelier-studio.projects", JSON.stringify(["/Users/t/projet"]));
    const sock = await mountConnected();
    await act(async () => {
      sock.emit(setupStatus([CLAUDE_MISSING, CODEX_MISSING]));
    });
    await settle();
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(true);

    const commands: unknown[] = [];
    const onCommand = (event: Event) => commands.push((event as CustomEvent).detail);
    window.addEventListener("atelier-terminal-command", onCommand);
    let result: string | null = null;
    await act(async () => {
      result = runSetupCommand("curl -fsSL https://claude.ai/install.sh | bash", { kind: "install", origin: "welcome" });
    });
    await settle();
    window.removeEventListener("atelier-terminal-command", onCommand);

    expect(result).toBe("terminal");
    expect(setupEnvironmentSnapshot().welcomeOpen).toBe(false);
    // une seule fois : la demande est consommée
    expect(commands).toEqual([{ command: "curl -fsSL https://claude.ai/install.sh | bash" }]);
    // le bandeau « termine l'installation, puis revérifie » est posé
    expect(document.querySelector(".chat-notice-trigger")).not.toBeNull();
  });
});
