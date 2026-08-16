// Miroir disque des réglages (plan 064, extension round 1) : suite dédiée,
// distincte de App.orchestration.test.tsx pour rester ciblée.
//
// Bug rapporté par l'opérateur : « chaque fois que je supprime un projet ou
// change un réglage, au redémarrage/rebuild rien n'a changé ». Cause racine
// à DEUX niveaux, tous deux couverts ici :
//  1. L'écriture du miroir disque (settings.json via le sidecar) était
//     débounced 600ms — un `pkill -9` dans cette fenêtre perdait l'écriture.
//  2. Au boot, la restauration depuis le disque était une FUSION additive
//     (union pour projects, spread pour projMeta) : incapable de représenter
//     une suppression, elle ressuscitait l'élément supprimé dès que le
//     localStorage WKWebView local — connu pour perdre ses toutes dernières
//     écritures au kill -9 — retenait encore l'ancienne valeur.
//
// Même mocks/infra que App.orchestration.test.tsx (FakeWS, renderUi).
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
vi.mock("./lib/notify", () => ({
  init: vi.fn(async () => {}),
  notifyRunDone: vi.fn(async () => {}),
  notifyReview: vi.fn(async () => {}),
}));

import App from "./App";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { PROJECT_ROOT, OTHER_PROJECT_ROOT } from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";

const PROJECTS_KEY = "atelier-studio.projects";

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

async function push(sock: FakeWS, msg: unknown) {
  await act(async () => {
    sock.push(msg);
    await flushMicrotasks(4);
  });
}

function lastSaveSettings(sock: FakeWS): { settings: Record<string, unknown> } | undefined {
  const saves = sock.sent
    .map((s) => JSON.parse(s))
    .filter((m) => m.type === "saveSettings");
  return saves[saves.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  FakeWS.reset();
  dialogMock.open.mockClear();
  dialogMock.confirm.mockClear();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("miroir disque des réglages — le disque fait foi, pas d'union résurrectrice", () => {
  it("un projet supprimé sur disque dans une session précédente ne revient PAS au boot, même si le localStorage local est resté périmé", async () => {
    // Donné : le localStorage WKWebView local est PÉRIMÉ — il montre encore
    // les deux projets, comme s'il avait perdu la toute dernière écriture au
    // kill -9. Le disque, lui, a déjà correctement enregistré la suppression
    // (l'écriture immédiate d'une session précédente a réussi).
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([PROJECT_ROOT, OTHER_PROJECT_ROOT]));
    localStorage.setItem("atelier-studio.settings", JSON.stringify({}));

    const { sock } = await mountApp();
    await push(sock, {
      type: "settingsFile",
      settings: { projMeta: {}, projects: [PROJECT_ROOT] },
    });

    // Avec l'ancienne fusion additive (union), OTHER_PROJECT_ROOT — toujours
    // présent dans le localStorage périmé — aurait été réintégré. Avec le
    // remplacement disk-is-truth, il doit rester absent.
    const restored = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
    expect(restored).toEqual([PROJECT_ROOT]);
    expect(restored).not.toContain(OTHER_PROJECT_ROOT);
  });

  it("une suppression de projet écrit le miroir disque en 200ms, pas 600ms", async () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([PROJECT_ROOT]));
    const { sock } = await mountApp();

    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    fireEvent.click(screen.getByText(t("project.remove")));

    // Juste avant l'ancien seuil (600ms) : l'écriture write-through doit déjà
    // être partie, bien avant.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
      await flushMicrotasks(4);
    });

    const last = lastSaveSettings(sock);
    expect(last, "un saveSettings aurait dû être envoyé sous 200ms").toBeTruthy();
    expect(last!.settings.projects).not.toContain(PROJECT_ROOT);
  });

  it("favoris/épingles/onglets épinglés/fichiers récents survivent au miroir disque (remplacement, pas d'écrasement d'un local plus frais quand le disque n'en a pas)", async () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([PROJECT_ROOT]));
    localStorage.setItem("atelier-studio.settings", JSON.stringify({}));
    localStorage.setItem("atelier-studio.favorites", JSON.stringify(["thread-local-frais"]));

    const { sock } = await mountApp();
    // Le disque ne connaît rien de "favorites" pour cette session (clé absente
    // du blob) : l'état local plus frais ne doit pas être écrasé.
    await push(sock, {
      type: "settingsFile",
      settings: { projMeta: {}, projects: [PROJECT_ROOT] },
    });
    expect(JSON.parse(localStorage.getItem("atelier-studio.favorites") ?? "[]")).toEqual([
      "thread-local-frais",
    ]);

    // Le disque a maintenant des favoris à lui (une session précédente les a
    // écrits) : ils remplacent l'état local, même partiellement différent.
    await push(sock, {
      type: "settingsFile",
      settings: { projMeta: {}, projects: [PROJECT_ROOT], favorites: ["thread-disque"] },
    });
    expect(JSON.parse(localStorage.getItem("atelier-studio.favorites") ?? "[]")).toEqual([
      "thread-disque",
    ]);
  });
});

describe("webview vierge : le miroir disque doit aussi OUVRIR un projet", () => {
  it("un localStorage vide plus un disque peuplé ne laissent pas l'app sur « aucun projet ouvert »", async () => {
    // Constaté pour de vrai pendant le spike Linux (run CI 31967329679) : le
    // rail affichait la pastille du projet, le centre affichait « aucun projet
    // ouvert », et ça ne se débloquait jamais. `activeProject` s'initialise UNE
    // fois depuis le localStorage ; sur une webview vierge il vaut null, et le
    // miroir remplissait la liste sans jamais rien sélectionner.
    //
    // Le plan 064 rend ce cas ORDINAIRE plutôt qu'exotique : il renomme
    // l'identifiant de bundle, et le localStorage de WKWebView est indexé
    // dessus. Le premier lancement après le renommage tombe pile dedans.
    localStorage.clear();

    const { sock } = await mountApp();
    await push(sock, {
      type: "settingsFile",
      settings: { projMeta: {}, projects: [PROJECT_ROOT, OTHER_PROJECT_ROOT] },
    });

    // L'invite « aucun projet ouvert » ne doit plus être là : le premier projet
    // du disque a été adopté, comme le ferait l'initialiseur avec un
    // localStorage sain.
    expect(screen.queryByText(t("home.no-project-title"))).toBeNull();
  });

  it("n'arrache PAS un projet déjà ouvert quand le miroir arrive", async () => {
    // Le miroir est asynchrone : il ne doit jamais déplacer la sélection sous
    // les pieds de l'utilisateur. Ici le local est sain et pointe sur le
    // SECOND projet ; le disque les liste dans l'autre ordre.
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([OTHER_PROJECT_ROOT]));
    localStorage.setItem("atelier-studio.settings", JSON.stringify({}));

    const { sock } = await mountApp();
    await push(sock, {
      type: "settingsFile",
      settings: { projMeta: {}, projects: [PROJECT_ROOT, OTHER_PROJECT_ROOT] },
    });

    // le projet actif reste celui d'avant — pas PROJECT_ROOT, premier du disque
    expect(screen.queryByText(t("home.no-project-title"))).toBeNull();
    expect(JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]"))
      .toEqual([PROJECT_ROOT, OTHER_PROJECT_ROOT]);
  });
});
