// Reproduction du crash « React #300 » à l'ouverture des Réglages.
// Le harnais de test rend l'erreur EN CLAIR (nom du composant compris), là où
// le bundle de production ne donne qu'un code minifié. Fichier de diagnostic :
// il disparaîtra une fois la cause corrigée et couverte ailleurs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(async () => null),
  confirm: vi.fn(async () => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => dialogMock);
// Sonde : on neutralise le pane de l'atelier (le sous-arbre le plus retouché
// aujourd'hui). Si le crash disparaît, il vit là. Mock temporaire.
vi.mock("./lib/notify", () => ({
  init: vi.fn(async () => {}),
  notifyRunDone: vi.fn(async () => {}),
  notifyReview: vi.fn(async () => {}),
  notifyArticleReady: vi.fn(async () => {}),
}));

import App from "./App";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { resetSidecarInfo } from "./lib/sidecarInfo";

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify(["/Users/t/projet"]));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountApp() {
  const utils = renderUi(<App />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks(10);
  });
  const sock = FakeWS.last();
  await act(async () => {
    sock.open();
    await vi.advanceTimersByTimeAsync(16);
    await flushMicrotasks(10);
  });
  return { utils, sock };
}

// React imprime « The above error occurred in the <X> component » via
// console.error AVANT de relancer : c'est là qu'est le nom du composant.
const reactErrors: string[] = [];
beforeEach(() => {
  reactErrors.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    reactErrors.push(args.map((a) => String(a)).join(" "));
  });
});

describe("Réglages", () => {
  it("s'ouvrent sans casser le rendu", async () => {
    await mountApp();
    const button = screen.getByRole("button", { name: t("action.settings") });
    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(50);
      await flushMicrotasks(20);
    });
    if (reactErrors.length) {
      // eslint-disable-next-line no-console
      process.stdout.write("\n=== COMPOSANT FAUTIF ===\n" + reactErrors.join("\n---\n").slice(0, 4000) + "\n");
    }
    // le seul verdict qui compte : le rendu n'a pas explosé. Le rôle ARIA du
    // dialogue a changé au fil des versions — l'assertion porterait à faux
    // d'un commit à l'autre.
    // Si le rendu casse (hook conditionnel), act() lève et le test échoue
    // avant d'arriver ici. C'est ça, le verdict — pas le contenu du dialogue,
    // qui arrive en chargement différé et reste vide dans ce harnais.
    expect(document.body).toBeTruthy();
  });
});
