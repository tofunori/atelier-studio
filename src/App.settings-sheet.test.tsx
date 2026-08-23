// Le gain du lot A (tâche 3) : l'application reste montée derrière la
// feuille de réglages, donc les réglages de typographie du fil s'appliquent
// sous les yeux de l'utilisateur — au lieu de l'ancien `if (showSettings)
// return (…)` qui démontait tout le chat/atelier/galerie.
//
// Même infra de montage que App.settings-crash.test.tsx (mocks tauri +
// FakeWS) : App() a besoin du sidecar simulé pour se monter sans exploser.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  confirm: vi.fn(async () => true),
}));
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
  return { utils };
}

describe("Réglages en feuille modale", () => {
  it("l'interface principale reste dans le document quand les réglages s'ouvrent", async () => {
    // Volontairement PAS de sock.open() : le socket sidecar reste en
    // CONNECTING (readyState 0). C'est ce que fait déjà
    // App.settings-crash.test.tsx implicitement en n'assertant rien sur le
    // contenu du dialogue — la section « General » des réglages appelle
    // `ws.addEventListener` (src/components/settings/sections/General.tsx)
    // dès que `readyState === 1`, or FakeWS (src/test/fixtures/sidecar.ts)
    // n'implémente pas l'API EventTarget (juste onopen/onmessage). Ouvrir
    // le socket ferait donc planter <General>, attrapé par la LazyBoundary
    // qui rend alors `null` — la feuille de réglages n'apparaîtrait jamais,
    // ce qui n'aurait rien à voir avec la régression que ce test vise à
    // couvrir (le démontage du rail). Garder le socket fermé isole le test
    // du vrai sujet : la composition de l'arbre React.
    await mountApp();

    const railAvant = document.querySelector(".rail");
    expect(railAvant).not.toBeNull();

    // Déclencheur réel : le bouton Réglages épinglé en bas du rail
    // (src/components/Rail.tsx, aria-label = t("action.settings")).
    const button = screen.getByRole("button", { name: t("action.settings") });
    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(50);
      await flushMicrotasks(20);
    });

    // Pas de `waitFor` ici : sous timers fake, son polling interne (setTimeout
    // réel côté testing-library) ne progresse pas tout seul. Les timers déjà
    // avancés dans le `act()` ci-dessus suffisent à faire apparaître le
    // dialogue Base UI (pas d'animation d'entrée asynchrone bloquante ici).
    expect(document.querySelector(".settings-page")).not.toBeNull();
    // Le cœur du test : le rail n'a PAS été démonté par l'ouverture des
    // réglages — c'est ce que l'ancien `if (showSettings) return` cassait.
    expect(document.querySelector(".rail")).not.toBeNull();
  });
});
