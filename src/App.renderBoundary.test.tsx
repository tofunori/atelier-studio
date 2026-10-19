// Frontières de rendu de l'App (audit 2026-10-18, problème 14 ; relecture du
// 2026-10-19) : une exception de rendu dans le chat ou dans la barre du haut
// ne remplace plus toute l'interface, seule la partie fautive cède sa place.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";

const crash = vi.hoisted(() => ({ chat: false, topBar: false }));

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
vi.mock("./components/ThreadChat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/ThreadChat")>();
  const Real = actual.default as unknown as (props: Record<string, unknown>) => React.ReactNode;
  return {
    ...actual,
    default: function ThreadChat(props: Record<string, unknown>) {
      if (crash.chat) throw new Error("chat en erreur");
      return <Real {...props} />;
    },
  };
});
vi.mock("./components/TopBar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/TopBar")>();
  const Real = actual.default as unknown as (props: Record<string, unknown>) => React.ReactNode;
  return {
    ...actual,
    default: function TopBar(props: Record<string, unknown>) {
      if (crash.topBar) throw new Error("barre en erreur");
      return <Real {...props} />;
    },
  };
});

import type React from "react";
import App from "./App";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { resetSidecarInfo } from "./lib/sidecarInfo";

async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); }); }

beforeEach(() => {
  vi.useFakeTimers(); resetTestState(); resetSidecarInfo(); FakeWS.reset();
  crash.chat = false; crash.topBar = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify(["/science"]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("un chat qui ne s'affiche pas laisse la barre du haut et le rail en place", async () => {
  crash.chat = true;
  renderUi(<App />); await settle();
  expect(screen.getByText(t("render.chat-error"))).toBeTruthy();
  expect(document.querySelector(".app")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: t("action.reload") }).length).toBeGreaterThan(0);
});

it("une barre du haut qui ne s'affiche pas laisse le chat et son champ de saisie", async () => {
  crash.topBar = true;
  renderUi(<App />); await settle();
  expect(screen.getByText(t("render.error"))).toBeTruthy();
  expect(document.querySelector(".composer textarea")).toBeTruthy();
});
