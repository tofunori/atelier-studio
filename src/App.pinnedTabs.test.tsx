import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), confirm: vi.fn(async () => true) }));
vi.mock("./lib/notify", () => ({ init: vi.fn(async () => {}), notifyRunDone: vi.fn(async () => {}), notifyReview: vi.fn(async () => {}) }));
import App from "./App";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { resetSidecarInfo } from "./lib/sidecarInfo";

async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); }); }
const pinnedStore = () => JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");

beforeEach(() => {
  vi.useFakeTimers(); resetTestState(); resetSidecarInfo(); FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify(["/alpha", "/beta"]));
  localStorage.setItem("atelier-studio.pinnedTabs", JSON.stringify({
    "/beta": [{ url: "http://127.0.0.1:18790/notes.html", title: "notes.html" }],
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Régression : closeAtelierTab est mémorisé une fois pour toutes ; il doit
// pourtant persister les épinglés du projet ACTIF au moment de la fermeture,
// pas de celui du premier rendu.
it("fermer un onglet épinglé d'un autre projet que le premier l'oublie pour de bon", async () => {
  renderUi(<App />); await settle();
  const sock = FakeWS.last();
  await act(async () => { sock.open(); }); await settle();

  const beta = [...document.querySelectorAll<HTMLButtonElement>(".rail-proj")]
    .find((button) => button.title === "beta");
  expect(beta, "projet beta dans le rail").toBeTruthy();
  fireEvent.click(beta!);
  await settle(); await settle();

  const close = screen.getByRole("button", { name: `${t("action.close-tab")} — notes.html` });
  fireEvent.click(close);
  await settle();

  expect(screen.queryByRole("button", { name: `${t("action.close-tab")} — notes.html` })).toBeNull();
  expect(pinnedStore()["/beta"]).toEqual([]);
});
