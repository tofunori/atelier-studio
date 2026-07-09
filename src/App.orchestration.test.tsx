// Caractérisation de l'orchestration App (plan 015, slice 1) : on fige le
// comportement OBSERVABLE actuel (rendu + messages envoyés au sidecar), pas
// l'ordre interne des setState.
//
// Mocks de modules (3) et pourquoi ces frontières ne sont pas encore
// injectables — elles le deviendront aux slices 2+ :
//  1. @tauri-apps/api/core — invoke est appelé au niveau module (sidecarInfo)
//     et dans App (start_atelier) sans couture d'injection.
//  2. @tauri-apps/plugin-dialog — ouvert directement par App pour le picker.
//  3. ./lib/notify — touche le centre de notifications Tauri au mount.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("./lib/notify", () => ({
  init: vi.fn(async () => {}),
  notifyRunDone: vi.fn(async () => {}),
  notifyReview: vi.fn(async () => {}),
}));

import App from "./App";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import {
  PROJECT_ROOT,
  events,
  makeFigureAddToChatText,
  makeThread,
} from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";

const THREAD_A = makeThread({ id: "thread-A", title: "Fil A — albédo" });
const THREAD_B = makeThread({ id: "thread-B", title: "Fil B — manuscrit" });

async function mountApp() {
  const utils = renderUi(<App />);
  // le connect initial passe par scheduleConnect() → setTimeout(0)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks(10);
  });
  const sock = FakeWS.last();
  await act(async () => {
    sock.open();
    await flushMicrotasks(10);
  });
  return { utils, sock };
}

async function push(sock: FakeWS, msg: unknown) {
  await act(async () => {
    sock.push(msg);
    await flushMicrotasks(4);
  });
}

async function pushThreads(sock: FakeWS, list = [THREAD_A, THREAD_B]) {
  await push(sock, { type: "threads", threads: list });
}

async function selectThread(sock: FakeWS, title: string) {
  // scope au panneau des threads (.sidebar) : le titre existe aussi ailleurs
  // (onglets atelier, flyouts) — on caractérise le clic de sélection réel
  const sidebar = document.querySelector(".sidebar");
  expect(sidebar, "panneau .sidebar attendu (vue chats, non compact)").toBeTruthy();
  const row = within(sidebar as HTMLElement).getAllByText(title)[0];
  await act(async () => {
    row.click();
    await flushMicrotasks(4);
  });
  const getHistory = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "getHistory");
  return getHistory[getHistory.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify([PROJECT_ROOT]));
});

afterEach(() => {
  cleanup(); // pas de globals vitest → RTL ne se nettoie pas tout seul
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("orchestration App — caractérisation", () => {
  it("squelette DOM du shell inchangé (TopBar → app-row → rail/panneau/poignée/main-card)", async () => {
    await mountApp();
    const row = document.querySelector(".app-row");
    expect(row).toBeTruthy();
    const topLevel = [...row!.children].map((el) => el.className.split(" ")[0]);
    // ordre exact historique : rail, panneau latéral, poignée, main-card
    expect(topLevel[0]).toBe("rail");
    expect(topLevel).toContain("side-fixed");
    expect(topLevel).toContain("handle");
    expect(topLevel).toContain("main-card");
    expect(topLevel.indexOf("side-fixed")).toBeLessThan(topLevel.indexOf("handle"));
    expect(topLevel.indexOf("handle")).toBeLessThan(topLevel.indexOf("main-card"));
    // la TopBar précède app-row dans le document
    const topbar = document.querySelector(".topbar, [data-tauri-drag-region]");
    expect(topbar).toBeTruthy();
  });

  it("restaure projet actif et panneau actif au démarrage (persistance)", async () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ activeView: "highlights" }));
    await mountApp();

    // projet actif = premier de atelier-studio.projects → visible dans la TopBar
    expect(screen.getAllByText("albedo-pipeline").length).toBeGreaterThan(0);
    // panneau actif restauré depuis settings.activeView
    expect(screen.getByText(t("view.highlights"))).toBeTruthy();
  });

  it("sélectionne un thread et charge son historique (getHistory du bon id)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);

    const req = await selectThread(sock, "Fil A — albédo");

    expect(req).toBeTruthy();
    expect(req.threadId).toBe("thread-A");
  });

  it("charge l'historique d'un fil vide ; un fil déjà peuplé n'est JAMAIS écrasé", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    await push(sock, {
      type: "history", threadId: "thread-A",
      events: [events.user("Question initiale ?"), events.text("Réponse initiale.")],
    });
    expect(screen.getByText("Question initiale ?")).toBeTruthy();
    expect(screen.getByText("Réponse initiale.")).toBeTruthy();

    // protection anti-écrasement (App.tsx ~927) : un history tardif sur un fil
    // déjà peuplé en mémoire est ignoré — la session vivante fait foi
    await push(sock, {
      type: "history", threadId: "thread-A",
      events: [events.user("Question rechargée ?")],
    });
    expect(screen.getByText("Question initiale ?")).toBeTruthy();
    expect(screen.queryByText("Question rechargée ?")).toBeNull();
  });

  it("affiche le résultat au done et le message au error", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    await push(sock, { type: "event", threadId: "thread-A", event: events.text("Texte final visible.") });
    expect(screen.getByText("Texte final visible.")).toBeTruthy();

    await push(sock, { type: "event", threadId: "thread-A", event: events.error("provider indisponible") });
    expect(screen.getByText(/provider indisponible/)).toBeTruthy();
  });

  it("attache l'artefact reçu par atelier-add-to-chat (nonce + origine vérifiés)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(10); });

    const iframe = document.querySelector("iframe");
    expect(iframe, "l'iframe atelier doit être montée (start_atelier mocké)").toBeTruthy();
    const hash = new URL(iframe!.src).hash.replace(/^#/, "");
    const nonce = new URLSearchParams(hash).get("atelier_nonce");
    expect(nonce, `nonce absent de l'URL atelier: ${iframe!.src}`).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "atelier-add-to-chat", nonce, text: makeFigureAddToChatText() },
        origin: "http://127.0.0.1:18790",
      }));
      await flushMicrotasks(4);
    });

    // le chip du composer affiche le nom sans extension (citeLabel)
    expect(screen.getByText("fig3_spatial")).toBeTruthy();
  });

  it("bascule Chat/Split/Atelier : en Atelier plein, le panneau chat est masqué SANS être démonté", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    const chatPanel = () => document.querySelector('[data-panel-id="chat"]') as HTMLElement | null;
    expect(chatPanel()).toBeTruthy();
    expect(chatPanel()!.style.display).not.toBe("none");

    const atelierBtn = screen.getAllByTitle(/⌘2/)[0];
    await act(async () => { atelierBtn.click(); await flushMicrotasks(2); });
    // comportement actuel : display:none, le composer RESTE monté (état préservé)
    expect(chatPanel()!.style.display).toBe("none");
    expect(document.querySelector("textarea")).toBeTruthy();

    const chatBtn = screen.getAllByTitle(/⌘1/)[0];
    await act(async () => { chatBtn.click(); await flushMicrotasks(2); });
    expect(chatPanel()!.style.display).not.toBe("none");
  });

  it("reconnexion : une seule subscription active, aucun rendu dupliqué", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    const before = screen.getAllByText("Fil A — albédo").length;
    expect(before).toBeGreaterThan(0);

    await act(async () => {
      sock.fireClose();
      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks(10);
    });
    const sock2 = FakeWS.last();
    expect(sock2).not.toBe(sock);
    await act(async () => { sock2.open(); await flushMicrotasks(10); });

    // même payload après reconnexion → exactement le même rendu (pas de
    // handler dupliqué qui doublerait les items), et une seule resouscription
    await pushThreads(sock2, [THREAD_A]);
    expect(screen.getAllByText("Fil A — albédo")).toHaveLength(before);
    const listThreadsCount = sock2.sentTypes().filter((t2) => t2 === "listThreads").length;
    expect(listThreadsCount).toBe(1);
  });

  it("changer de thread pendant un tour : aucune contamination visible", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    await push(sock, { type: "event", threadId: "thread-A", event: events.started() });
    await push(sock, { type: "event", threadId: "thread-A", event: events.delta("SECRET-A-avant ") });

    await selectThread(sock, "Fil B — manuscrit");
    await push(sock, { type: "event", threadId: "thread-A", event: events.delta("SECRET-A-après") });

    expect(screen.queryByText(/SECRET-A/)).toBeNull();
  });

  it("autoreview-toggle : une seule bascule par événement, même après plusieurs rerenders, et cleanup au démontage", async () => {
    const { utils, sock } = await mountApp();
    await pushThreads(sock);

    // plusieurs rerenders (messages → setState) pour tenter de dupliquer la subscription
    await push(sock, { type: "threads", threads: [THREAD_A] });
    await push(sock, { type: "threads", threads: [THREAD_A, THREAD_B] });

    const enabled = () =>
      JSON.parse(localStorage.getItem("atelier-studio.settings") ?? "{}")?.autoReview?.enabled;
    const before = enabled();

    await act(async () => {
      window.dispatchEvent(new CustomEvent("autoreview-toggle"));
      await flushMicrotasks(4);
    });
    expect(enabled(), "un événement = UNE bascule (pas de double listener)").toBe(!before);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("autoreview-toggle"));
      await flushMicrotasks(4);
    });
    expect(enabled()).toBe(before);

    // démontage : plus aucune bascule
    utils.unmount();
    const after = enabled();
    window.dispatchEvent(new CustomEvent("autoreview-toggle"));
    expect(enabled()).toBe(after);
  });

  it("gitUndoLastTurnError est redispatché sans perdre le thread actif", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    const received: string[] = [];
    const onErr = (e: Event) => received.push((e as CustomEvent).detail?.message ?? "");
    window.addEventListener("git-undo-error", onErr);
    try {
      await push(sock, {
        type: "gitUndoLastTurnError",
        threadId: "thread-A",
        projectRoot: PROJECT_ROOT,
        sha: "a".repeat(40),
        message: "restauration refusée : 1 chemin(s) créé(s) après le snapshot",
      });
    } finally {
      window.removeEventListener("git-undo-error", onErr);
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toMatch(/refusée/);
    // le thread reste sélectionné (historique toujours affiché, pas de reset)
    expect(screen.getAllByText("Fil A — albédo").length).toBeGreaterThan(0);
  });
});
