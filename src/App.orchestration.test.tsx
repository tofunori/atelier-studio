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
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(async (): Promise<string | string[] | null> => null),
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
import {
  PROJECT_ROOT,
  FIXED_ISO,
  events,
  makeFigureAddToChatText,
  makeCapabilities,
  makeProviderInfo,
  makeThread,
} from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import { resetKbSourcesForTests } from "./lib/kbSources";

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
    // P4 plan 053 : la galerie visible démarre au frame suivant, après que la
    // connexion cœur a eu la priorité sur la file IPC Tauri.
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

function eventWithMeta(event: ReturnType<typeof events.user> | ReturnType<typeof events.text>, eventId: string, sequence: number) {
  return {
    ...event,
    meta: {
      schemaVersion: 1,
      eventId,
      provider: "claude",
      threadId: "thread-A",
      turnId: "turn-1",
      sequence,
      ts: sequence,
      durable: true,
      origin: "provider",
    },
  };
}

async function loadExactHistory(sock: FakeWS) {
  await pushThreads(sock, [THREAD_A]);
  await selectThread(sock, "Fil A — albédo");
  await push(sock, {
    type: "history",
    threadId: "thread-A",
    events: [
      eventWithMeta(events.user("Question exacte"), "event-user-exact", 1),
      eventWithMeta(events.text("Réponse exacte"), "event-text-exact", 2),
    ],
  });
}

/** Le transcript seul : depuis la marge annotée, l'aperçu d'un prompt existe
 * aussi dans le rail de navigation — ces assertions parlent des messages. */
function transcript() {
  return within(document.querySelector(".messages") as HTMLElement);
}

/** Bouton Stop du composeur : icône seule, nommée par son aria-label (l'indice
 * texte « esc Interrompre » du fil a été retiré au 3a5dcfb4 — le statut vivant
 * habite le dock du composeur). Présent = tour actif côté UI. */
function stopButton() {
  return screen.queryByRole("button", { name: t("action.interrupt") });
}

/** Alerte du chat (163c11f9) : une icône dans l'en-tête ; le message n'apparaît
 * qu'en ouvrant son popover. Ouvre-le au besoin et renvoie le texte affiché —
 * null quand aucune alerte n'est portée. */
async function noticeText(): Promise<string | null> {
  const trigger = screen.queryByRole("button", { name: "Afficher l’alerte du chat" });
  if (!trigger) return null;
  if (!document.querySelector(".chat-notice-detail")) {
    fireEvent.click(trigger);
    await act(async () => { await flushMicrotasks(4); });
  }
  return document.querySelector(".chat-notice-detail p")?.textContent ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  FakeWS.reset();
  dialogMock.open.mockClear();
  dialogMock.confirm.mockClear();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify([PROJECT_ROOT]));
});

afterEach(() => {
  cleanup(); // pas de globals vitest → RTL ne se nettoie pas tout seul
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetKbSourcesForTests(); // cache module-level (lib/kbSources) : ne fuit pas au test suivant
});

describe("orchestration App — caractérisation", () => {
  it("Stop resynchronise un tour terminé dont le done direct a été perdu", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "started" } });
    const before = sock.sent.length;
    fireEvent.click(screen.getAllByTitle(t("action.interrupt"))[0]);
    const messages = sock.sent.slice(before).map(value => JSON.parse(value));
    expect(messages).toContainEqual({ type: "interrupt", threadId: "thread-A" });
    const historyRequest = messages.find((message) => message.type === "getHistory" && message.threadId === "thread-A");
    expect(historyRequest).toEqual(expect.objectContaining({ type: "getHistory", threadId: "thread-A" }));
    expect(historyRequest?.requestId).toEqual(expect.any(String));
    await push(sock, { type: "history", threadId: "thread-A", events: [{
      kind: "done", ok: true, result: "",
      meta: { schemaVersion: 1, eventId: "recovered-done", provider: "codex", threadId: "thread-A",
        turnId: "recovered-turn", sequence: 9, ts: Date.now(), durable: true, origin: "provider" },
    }] });
    expect(screen.queryByText(t("action.interrupt"))).toBeNull();
  });

  it("isole et restaure le brouillon du composer pour chaque conversation", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "brouillon albédo" } });

    await selectThread(sock, "Fil B — manuscrit");
    expect((document.querySelector(".composer textarea") as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(document.querySelector(".composer textarea")!, { target: { value: "brouillon manuscrit" } });

    await selectThread(sock, "Fil A — albédo");
    expect((document.querySelector(".composer textarea") as HTMLTextAreaElement).value).toBe("brouillon albédo");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(localStorage.getItem("atelier-studio.chat-drafts:v1")).toContain("brouillon manuscrit");
  });

  it("garde une relance visible et éditable, puis l’envoie automatiquement après le tour actif", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "started" } });

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "compare ensuite les deux cartes" } });
    const before = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send").length;
    // Contrat Codex : pendant un tour actif, Enter met la relance en file par défaut.
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(screen.getByTestId("queued-follow-up-row")).toHaveTextContent("compare ensuite les deux cartes");
    expect(textarea.value).toBe("");
    expect(sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send")).toHaveLength(before);

    fireEvent.click(screen.getByRole("button", { name: t("queue.more") }));
    await act(async () => { await flushMicrotasks(2); });
    fireEvent.click(screen.getByRole("menuitem", { name: t("queue.edit") }));
    expect(screen.queryByTestId("queued-follow-up-row")).toBeNull();
    expect(textarea.value).toBe("compare ensuite les deux cartes");

    fireEvent.click(document.querySelector(".follow-up-submit") as HTMLButtonElement);
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "done", ok: true, result: "" } });
    await act(async () => { await flushMicrotasks(6); });
    const sends = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send");
    expect(sends).toHaveLength(before + 1);
    expect(sends[sends.length - 1]).toMatchObject({
      threadId: "thread-A",
      provider: "claude",
      prompt: "compare ensuite les deux cartes",
      mode: "queue",
    });
    expect(screen.queryByTestId("queued-follow-up-row")).toBeNull();
  });

  it("un collage archivé garde son texte : la chip reste ouvrable après restauration", async () => {
    // Vécu 2026-09-14 : « Texte collé (lines 34) » dans une bulle restaurée —
    // clic sans effet. L'archive ne portait que {name, lines} (plan 025), donc
    // la bulle rechargée (changement de fil, snapshot, relance) perdait le
    // texte et turns.tsx rendait la chip inerte. Le collage est du contenu de
    // l'utilisateur, pas un contexte injecté : il s'archive avec son texte.
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    const pasted = Array.from({ length: 34 }, (_, i) => `ligne ${i + 1}`).join("\n");
    fireEvent.paste(textarea, {
      clipboardData: { items: [], getData: (type: string) => (type === "text/plain" ? pasted : "") },
    });
    fireEvent.change(textarea, { target: { value: "résume ce passage" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(4); });
    const sent = sock.sent.map((value) => JSON.parse(value)).find((message) => message.type === "send");
    expect(sent).toBeTruthy();
    expect(sent.displayEvent.text).toBe("résume ce passage");
    expect(sent.displayEvent.pastes).toEqual([{ name: t("chat.pasted-text"), lines: 34, text: pasted }]);
    // le prompt provider reçoit le collage une seule fois, en tête
    expect(sent.prompt.startsWith(pasted)).toBe(true);
    expect(sent.prompt.match(/ligne 34/g)).toHaveLength(1);
  });

  it("un send refusé par le serveur éteint le spinner et affiche le refus", async () => {
    // Vécu 2026-08-25 : un tour zombie gardait le writer du projet, le serveur
    // refusait chaque send suivant ({"type":"error"}) — mais l'erreur mourait
    // en console.error et le spinner tournait à vide. « Je commence un chat,
    // rien ne se passe », quel que soit le provider.
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "allo" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(2); });
    // le tour local est parti : le bouton Stop est visible
    expect(stopButton()).toBeTruthy();

    await push(sock, {
      type: "error",
      threadId: "thread-A",
      message: "projet verrouillé par une autre tâche (t-zombie) — attends sa fin ou arrête-la avant toute écriture",
    });
    // le refus est visible (alerte du chat) et le spinner éteint
    expect(await noticeText()).toMatch(/projet verrouillé par une autre tâche/);
    expect(stopButton()).toBeNull();
  });

  it("une lecture expirée et une action retardée laissent le chat actif", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "allo" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(2); });
    await push(sock, { type: "error", requestType: "getHistory", threadId: "thread-A", code: "REQUEST_TIMEOUT", message: "Historique trop lent" });
    expect(await noticeText()).toBe("Historique trop lent");
    expect(stopButton()).toBeTruthy();
    await push(sock, { type: "requestDelayed", requestType: "send", threadId: "thread-A", message: "Envoi encore en préparation" });
    expect(await noticeText()).toBe("Envoi encore en préparation");
    expect(stopButton()).toBeTruthy();
    await push(sock, { type: "error", requestType: "send", threadId: "thread-A", code: "REQUEST_CANCELLED", message: "Envoi annulé" });
    expect(stopButton()).toBeNull();
  });

  it("retire le refus d'historique seulement après récupération du même chat", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "error", requestType: "getHistory", threadId: "thread-A", code: "REQUEST_BUSY", message: "Historique indisponible" });
    expect(await noticeText()).toBe("Historique indisponible");
    await push(sock, { type: "history", threadId: "other", events: [] });
    expect(await noticeText()).toBe("Historique indisponible");
    await push(sock, { type: "history", threadId: "thread-A", events: [] });
    expect(await noticeText()).toBeNull();
  });

  it("retire le refus du catalogue après succès du même projet uniquement", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "error", requestType: "listCommands", projectRoot: THREAD_A.projectRoot, code: "REQUEST_BUSY", message: "Catalogue indisponible" });
    expect(await noticeText()).toBe("Catalogue indisponible");
    await push(sock, { type: "commands", projectRoot: "/other", commands: [] });
    expect(await noticeText()).toBe("Catalogue indisponible");
    await push(sock, { type: "commands", projectRoot: THREAD_A.projectRoot, commands: [] });
    expect(await noticeText()).toBeNull();
  });

  it("un ancien instantané ne supprime ni ne ressuscite un chat confirmé", async () => {
    const { sock } = await mountApp();
    await push(sock, { type: "threads", threads: [THREAD_A], threadsEpoch: "runtime-1", threadsRevision: 2 });
    expect(screen.getAllByText("Fil A — albédo").length).toBeGreaterThan(0);
    await push(sock, { type: "threads", threads: [], threadsEpoch: "runtime-1", threadsRevision: 1 });
    expect(screen.getAllByText("Fil A — albédo").length).toBeGreaterThan(0);
    await push(sock, { type: "threads", threads: [], threadsEpoch: "runtime-1", threadsRevision: 3 });
    expect(within(document.querySelector(".sidebar") as HTMLElement).queryByText("Fil A — albédo")).toBeNull();
    await push(sock, { type: "threads", threads: [THREAD_A], threadsEpoch: "runtime-1", threadsRevision: 2 });
    expect(within(document.querySelector(".sidebar") as HTMLElement).queryByText("Fil A — albédo")).toBeNull();
    await push(sock, { type: "threads", threads: [THREAD_A], threadsEpoch: "runtime-2", threadsRevision: 1 });
    expect(screen.getAllByText("Fil A — albédo").length).toBeGreaterThan(0);
  });

  it("le refus d'un steer conserve Stop pour le tour déjà actif", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "started" } });
    await push(sock, { type: "error", requestType: "send", threadId: "thread-A", clientMessageId: "steer-refused", code: "REQUEST_BUSY", message: "Envoi refusé" });
    expect(await noticeText()).toBe("Envoi refusé");
    expect(stopButton()).toBeTruthy();
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "done", ok: true } });
    expect(stopButton()).toBeNull();
  });

  it("la récupération d'un done manqué libère aussi la confirmation du tour", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "event", threadId: "thread-A", event: { kind: "started" } });
    await push(sock, { type: "history", threadId: "thread-A", events: [{ kind: "done", ok: true, result: "Terminé", ts: Date.now() + 1 }] });
    expect(screen.queryByText(t("action.interrupt"))).toBeNull();
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "nouvel envoi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(2); });
    await push(sock, { type: "error", requestType: "send", threadId: "thread-A", code: "REQUEST_BUSY", message: "Refus de surcharge" });
    expect(screen.queryByText(t("action.interrupt"))).toBeNull();
  });

  it("un historique capturé avant une révision ne réintroduit pas les messages retirés", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "reverted", threadId: "thread-A", historyEpoch: "runtime", historyRevision: 2 });
    await push(sock, { type: "reverted", threadId: "thread-A", historyEpoch: "runtime", historyRevision: 1 });
    await push(sock, { type: "history", threadId: "thread-A", historyEpoch: "runtime", historyRevision: 1, events: [{ kind: "user", text: "ANCIEN_MESSAGE_RETIRÉ" }] });
    expect(screen.queryByText("ANCIEN_MESSAGE_RETIRÉ")).toBeNull();
    await push(sock, { type: "history", threadId: "thread-A", historyEpoch: "runtime", historyRevision: 2, events: [{ kind: "user", text: "MESSAGE_ACTUEL" }] });
    expect(screen.getAllByText("MESSAGE_ACTUEL").length).toBeGreaterThan(0);
  });

  // Task 7 fix round 1 (finding 2) : rien ne testait le rafraîchissement de
  // la consigne au moment de l'envoi (App.tsx::submit(), juste avant
  // sendPrompt) — un refactor de submit() pourrait en inverser l'ORDRE (le
  // patch upsertThread doit partir AVANT le send, sur la même connexion :
  // send.rs::consigne_du_fil lit `previous`, l'état du fil déjà en mémoire
  // au moment où le serveur traite le message "send") sans qu'aucun test
  // ne le remarque.
  it("l'envoi rafraîchit la consigne AVANT le tour : le patch part sur le fil, puis le send", async () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      consignes: [{ id: "concis", nom: "Concis", description: "d", texte: "Texte édité dans les réglages." }],
    }));
    const { sock } = await mountApp();
    const withConsigne = makeThread({
      id: "thread-A",
      title: "Fil A — albédo",
      consigne: { id: "concis", texte: "Ancien texte, avant édition." },
    });
    await pushThreads(sock, [withConsigne]);
    await selectThread(sock, "Fil A — albédo");

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "allo" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(4); });

    const messages = sock.sent.map((s) => JSON.parse(s));
    const upsertIdx = messages.findIndex(
      (m) => m.type === "upsertThread" && m.thread?.id === "thread-A" && m.thread?.consigne,
    );
    const sendIdx = messages.findIndex((m) => m.type === "send" && m.threadId === "thread-A");
    expect(upsertIdx, "le patch de consigne doit avoir été envoyé").toBeGreaterThanOrEqual(0);
    expect(sendIdx, "le send doit suivre le patch, pas le précéder").toBeGreaterThan(upsertIdx);
    expect(messages[upsertIdx].thread.consigne).toEqual({ id: "concis", texte: "Texte édité dans les réglages." });
  });

  it("une consigne disparue du catalogue garde sa dernière copie ; le tour part quand même", async () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ consignes: [] }));
    const { sock } = await mountApp();
    const withConsigne = makeThread({
      id: "thread-A",
      title: "Fil A — albédo",
      consigne: { id: "disparue", texte: "Dernière copie connue." },
    });
    await pushThreads(sock, [withConsigne]);
    await selectThread(sock, "Fil A — albédo");

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "allo" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(4); });

    const messages = sock.sent.map((s) => JSON.parse(s));
    // rien à rafraîchir (même texte que la dernière copie connue) : aucun
    // patch de consigne envoyé — le fil garde ce qu'il portait déjà.
    expect(
      messages.some((m) => m.type === "upsertThread" && m.thread?.id === "thread-A" && m.thread?.consigne),
    ).toBe(false);
    // et surtout : le tour part normalement malgré l'id disparu du catalogue.
    const sends = messages.filter((m) => m.type === "send" && m.threadId === "thread-A");
    expect(sends).toHaveLength(1);
  });

  it("choisit le provider avant de créer un chat et le conserve au premier envoi", async () => {
    const { sock } = await mountApp();
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    expect(screen.getByRole("dialog", { name: /new chat/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Analyse ce projet" } });
    fireEvent.submit(textarea.closest("form")!);
    await act(async () => { await flushMicrotasks(4); });

    const sends = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send");
    expect(sends[sends.length - 1]).toMatchObject({ provider: "codex", prompt: "Analyse ce projet" });
  });

  it("garde le nouveau chat dans la barre après envoi jusqu’à son accusé serveur", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, []);
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });
    const created = sock.sent.map((raw) => JSON.parse(raw)).find((msg) => msg.type === "upsertThread").thread;
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Allo" } });
    fireEvent.submit(textarea.closest("form")!);
    await act(async () => { await flushMicrotasks(4); });
    expect(sock.sent.map((raw) => JSON.parse(raw))).toContainEqual(expect.objectContaining({
      type: "send", threadId: created.id, prompt: "Allo",
    }));
    expect(within(sidebar).getAllByText(created.title)).toHaveLength(1);
    // An older snapshot can arrive while the create/send still waits.
    await pushThreads(sock, []);
    expect(within(sidebar).getAllByText(created.title)).toHaveLength(1);
    await pushThreads(sock, [makeThread({ ...created, title: "Chat confirmé" })]);
    expect(within(sidebar).getAllByText("Chat confirmé")).toHaveLength(1);
    expect(within(sidebar).queryByText(created.title)).toBeNull();
    // Once acknowledged, a server-side deletion must not resurrect the draft.
    await pushThreads(sock, []);
    expect(within(sidebar).queryByText("Chat confirmé")).toBeNull();
    expect(within(sidebar).queryByText(created.title)).toBeNull();
  });

  it("un chat vide est persisté dès sa création (il survit à la relance)", async () => {
    const { sock } = await mountApp();
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });

    const upserts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].thread).toMatchObject({ provider: "codex" });
    expect(typeof upserts[0].thread.id).toBe("string");
  });

  it("une consigne choisie avant tout fil se transfère au fil créé en UN SEUL message complet", async () => {
    // Le déclencheur « Consigne du fil » n'est gardé que par le provider
    // (claude par défaut), jamais par l'existence d'un fil — un premier
    // choix avant la moindre conversation doit survivre à la création du
    // fil au lieu d'être perdu en silence (même repli que pendingKb pour
    // la base de connaissances). Fix round 2 : ça doit être le fil COMPLET
    // dès le premier message — jamais un patch {id, consigne} isolé, qui
    // ferait normaliser provider→claude et perdre le projet côté backend
    // pour un id qu'il ne connaît pas encore (ThreadStore::upsert / normalize).
    const { sock } = await mountApp();
    fireEvent.click(screen.getByLabelText(t("consigne.menu-title")));
    fireEvent.click(screen.getByText("Concis"));

    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });

    const upserts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts, "un seul upsertThread — pas de patch partiel avant le complet").toHaveLength(1);
    expect(upserts[0].thread).toMatchObject({ provider: "codex", consigne: { id: "concis" } });
    expect(typeof upserts[0].thread.projectRoot).toBe("string");
    expect(typeof upserts[0].thread.id).toBe("string");
  });

  it("consigne ET base de connaissances en attente ensemble : pliées dans le MÊME message complet, jamais un patch partiel", async () => {
    // Combinaison la plus susceptible de régresser (mentionnée par le
    // reviewer) : consumePendingKb et consumePendingConsigne sont consommés
    // l'un après l'autre dans createChat(). consumePendingKb envoie SON
    // upsertThread complet — la consigne y est pliée via son paramètre
    // `thread` — et c'est LUI qui doit porter les deux, jamais un second
    // message {id, consigne} isolé. (Un filet de persistance existant,
    // indépendant de ce fix, republie parfois une 2e annonce du même fil une
    // fois qu'il est en `draftThreads` — harmless car TOUJOURS complète ; ce
    // test n'exige donc pas un message unique, seulement qu'aucun ne soit
    // partiel et que consigne+KB voyagent ensemble sur celui qui les porte.)
    const { sock } = await mountApp();
    // Source déjà connue du cache global (lib/kbSources.ts) — alimenté en
    // temps normal par le WS via l'événement fenêtre "kb-sources" que App
    // relaie ; pas besoin de driver tout le flux d'ajout (kbAdd) pour ce test.
    window.dispatchEvent(new CustomEvent("kb-sources", {
      detail: [{
        id: "src-1", kind: "note", title: "Note de test",
        origin: null, chars: 42, addedAt: FIXED_ISO, updatedAt: FIXED_ISO,
      }],
    }));

    fireEvent.click(screen.getByLabelText(t("consigne.menu-title")));
    fireEvent.click(screen.getByText("Concis"));

    fireEvent.click(screen.getByLabelText(t("kb.open")));
    fireEvent.click(screen.getByText("Note de test"));

    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });

    const upserts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts.length).toBeGreaterThan(0);
    // aucun patch partiel : chaque annonce de ce fil neuf porte provider ET
    // projectRoot (jamais un {id, consigne} isolé — le défaut du round
    // précédent, qui ferait normaliser provider→claude côté backend pour un
    // id qu'il ne connaît pas encore).
    for (const u of upserts) {
      expect(typeof u.thread.provider, JSON.stringify(u)).toBe("string");
      expect(typeof u.thread.projectRoot, JSON.stringify(u)).toBe("string");
    }
    const withBoth = upserts.find((u) => u.thread.consigne && u.thread.kbSourceIds);
    expect(withBoth?.thread).toMatchObject({
      provider: "codex",
      consigne: { id: "concis" },
      kbSourceIds: ["src-1"],
    });
  });

  it("choisir une consigne sur un fil connu réémet provider/projectRoot/title", async () => {
    // ThreadStore::upsert fusionne sur un objet VIDE pour un id inconnu et
    // normalize remplit ensuite provider→claude, projectRoot→"" : un patch
    // {id, consigne} nu suffirait à déplacer le fil hors de son projet.
    // Même garde que handleKbChange (KB).
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");

    fireEvent.click(screen.getByLabelText(t("consigne.menu-title")));
    fireEvent.click(screen.getByText("Concis"));
    await act(async () => { await flushMicrotasks(4); });

    const upserts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts.length).toBeGreaterThan(0);
    expect(upserts[upserts.length - 1].thread).toMatchObject({
      id: "thread-A",
      provider: THREAD_A.provider,
      projectRoot: THREAD_A.projectRoot,
      title: THREAD_A.title,
      consigne: { id: "concis" },
    });
  });

  it("une consigne choisie sans fil actif s'affiche quand même dans la pilule", async () => {
    // Sans ce repli, le choix était bien mémorisé (pendingConsigne) mais
    // invisible : l'utilisateur ne pouvait pas savoir qu'il avait pris.
    await mountApp();
    fireEvent.click(screen.getByLabelText(t("consigne.menu-title")));
    fireEvent.click(screen.getByText("Concis"));
    await act(async () => { await flushMicrotasks(4); });
    expect(document.querySelector(".consigne-pilule-nom")?.textContent).toBe("Concis");
  });

  it("un fil créé WS fermée est republié à la reconnexion AVEC sa consigne", async () => {
    // Filet de persistance (useEffect sur wsReady) : sans la consigne dans sa
    // charge utile, le fil repartait nu côté store. Le rafraîchissement
    // d'avant-tour de submit() ne rattrape rien — il ne patche que si le
    // catalogue a bougé — et `send.rs::consigne_du_fil` ne trouvait donc
    // aucun `extra.consigne` : consigne perdue en silence dès le 1er tour.
    const { sock } = await mountApp();
    fireEvent.click(screen.getByLabelText(t("consigne.menu-title")));
    fireEvent.click(screen.getByText("Concis"));

    // la socket meurt AVANT la création : aucun upsertThread ne peut partir
    await act(async () => { sock.fireClose(); await flushMicrotasks(4); });
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });
    expect(sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread")).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); await flushMicrotasks(10); });
    const sock2 = FakeWS.last();
    expect(sock2).not.toBe(sock);
    await act(async () => { sock2.open(); await flushMicrotasks(10); });

    const upserts = sock2.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts, "le brouillon doit être republié une fois").toHaveLength(1);
    expect(upserts[0].thread).toMatchObject({ provider: "codex", consigne: { id: "concis" } });
    expect(typeof upserts[0].thread.projectRoot).toBe("string");
  });

  it("un chat créé pendant qu'un projet est ouvert APPARTIENT à ce projet", async () => {
    // Régression 2026-08-23 : les entrées « + » qui passent par newChat()
    // (état vide de la timeline, rail compact) créaient un fil projectRoot:""
    // — visible pendant la session (fil actif toujours listé), mais exclu du
    // projet par le filtre strict au redémarrage : « mes nouveaux chats
    // disparaissent ».
    // mountApp seed atelier-studio.projects → projet actif = albedo-pipeline,
    // aucun fil sélectionné : l'accueil (ResearchHome) porte son « New chat »
    // branché sur newChat(), le chemin qui perdait le projet.
    const { sock } = await mountApp();
    const timeline = document.querySelector(".messages") as HTMLElement;
    fireEvent.click(within(timeline).getByText(t("action.new-chat")));
    fireEvent.click(screen.getByRole("button", { name: /Codex/i }));
    await act(async () => { await flushMicrotasks(4); });

    const upserts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "upsertThread");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].thread).toMatchObject({ provider: "codex", projectRoot: PROJECT_ROOT });
  });

  it("ouvrir un fil sans projet quitte le contexte du projet", async () => {
    const { sock } = await mountApp();
    const loose = makeThread({ id: "thread-U", title: "Fil sans projet", projectRoot: "" });
    await pushThreads(sock, [THREAD_A, THREAD_B, loose]);
    const inSidebar = () =>
      within(document.querySelector(".sidebar") as HTMLElement).queryAllByText("Fil sans projet");
    expect(inSidebar()).toHaveLength(0);

    // ouverture inter-contexte (palette, lien d'agent, reprise de session)
    await act(async () => {
      window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: "thread-U" } }));
      await flushMicrotasks(4);
    });

    // la conversation ouverte est listée…
    expect(inSidebar().length).toBeGreaterThan(0);
    // Le contexte précédent reste accessible dans le rail, mais est désélectionné.
    expect(document.querySelector(".rail-proj.on")).toBeNull();
  });

  it("le picker de modèles reste verrouillé sur le provider du fil", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, {
      type: "history",
      threadId: "thread-A",
      events: [events.user("Question source"), events.text("Réponse source")],
    });

    fireEvent.click(document.querySelector(".mp-model") as HTMLButtonElement);
    const modelMenu = document.querySelector(".model-menu") as HTMLElement;
    expect(modelMenu.querySelector(".model-provider-tabs")).toBeNull();
    expect(within(modelMenu).queryByText("Codex")).toBeNull();

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Continue avec Claude" } });
    await act(async () => {
      fireEvent.submit(textarea.closest("form")!);
      await flushMicrotasks(6);
    });

    const sends = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send");
    const continuation = sends[sends.length - 1];
    expect(continuation.provider).toBe("claude");
    expect(continuation.threadId).toBe("thread-A");
    expect(continuation.handoffFromThreadId).toBeUndefined();
    expect(continuation.prompt).toBe("Continue avec Claude");
    expect(transcript().getByText("Question source")).toBeTruthy();
    expect(transcript().getByText("Continue avec Claude")).toBeTruthy();
  });
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

  it("restaure le projet actif mais démarre toujours sur le panneau Chat", async () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ activeView: "highlights" }));
    await mountApp();

    // projet actif = premier de atelier-studio.projects → visible dans la TopBar
    expect(screen.getAllByText("albedo-pipeline").length).toBeGreaterThan(0);
    const chatButton = screen.getByRole("button", { name: t("discussions.title") });
    expect(chatButton).not.toHaveClass("on");
    expect(screen.queryByText(t("highlights.empty"))).toBeNull();
  });

  it("ouvre les automatisations dans le panneau latéral sans remplacer le workspace", async () => {
    await mountApp();

    // Automatisations et surlignages vivent dans le menu « … » du rail (4dc49144)
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    await act(async () => {
      await vi.dynamicImportSettled();
      await flushMicrotasks(4);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: t("automations.title") }));
    await act(async () => {
      await vi.dynamicImportSettled();
      await flushMicrotasks(4);
    });

    expect(document.querySelector(".automation-panel")).toBeTruthy();
    expect(document.querySelector(".main-card .app")).toBeTruthy();
    expect(screen.getByText(t("automations.empty"))).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: t("automations.create") })[0]);
    await act(async () => { await flushMicrotasks(4); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(t("automations.new"))).toBeTruthy();
    expect(document.querySelector(".main-card .app")).toBeTruthy();
    expect(document.querySelector("#workspace-inspector-host")).toBeNull();
  });

  it("déplie le panneau demandé depuis les icônes du rail compact", async () => {
    localStorage.setItem("atelier-studio.compact", "1");
    await mountApp();
    expect(document.querySelector(".side-fixed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    await act(async () => {
      await vi.dynamicImportSettled();
      await flushMicrotasks(4);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: t("view.highlights") }));
    await act(async () => { await flushMicrotasks(2); });

    expect(document.querySelector(".side-fixed")).toBeTruthy();
    expect(screen.getByText(t("highlights.empty"))).toBeTruthy();
  });

  it("affiche l’horloge Codex seulement pour un heartbeat actif ciblant le chat", async () => {
    const { sock } = await mountApp();
    expect(sock.sentTypes()).toContain("listAutomations");
    await pushThreads(sock, [THREAD_A]);

    const heartbeat = {
      id: "heartbeat-A",
      name: "Audit périodique",
      prompt: "Vérifie les résultats",
      status: "ACTIVE",
      kind: "heartbeat",
      rrule: "FREQ=MINUTELY;INTERVAL=30",
      targetThreadId: "thread-A",
      projectRoot: PROJECT_ROOT,
      provider: "codex",
      runs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await push(sock, { type: "automations", automations: [heartbeat] });

    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    const row = within(sidebar).getByText("Fil A — albédo").closest(".pnav-row");
    expect(row?.querySelector(".pnav-heartbeat")).toBeTruthy();
    expect(row?.querySelector(".pnav-row-main")?.getAttribute("aria-label"))
      .toContain(t("automations.heartbeat-active"));

    await push(sock, {
      type: "automations",
      automations: [{ ...heartbeat, status: "PAUSED" }],
    });
    expect(row?.querySelector(".pnav-heartbeat")).toBeNull();
  });

  it("sélectionne un thread et charge son historique (getHistory du bon id)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);

    const req = await selectThread(sock, "Fil A — albédo");

    expect(req).toBeTruthy();
    expect(req.threadId).toBe("thread-A");
  });

  it("un clic sur le projet actif revient à l'accueil après avoir ouvert un fil", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    expect(screen.queryByText(t("home.start"))).toBeNull();

    fireEvent.click(document.querySelector(".rail-proj") as HTMLButtonElement);
    await act(async () => { await flushMicrotasks(4); });

    expect(screen.getByText(t("home.start"))).toBeTruthy();
  });

  it("l'accueil montre les mtimes du catalogue plutôt que l'ancien localStorage", async () => {
    localStorage.setItem("atelier-studio.recentFiles", JSON.stringify(["ancien-local.md"]));
    const { sock } = await mountApp();
    await push(sock, {
      type: "files",
      projectRoot: PROJECT_ROOT,
      files: ["ancien-local.md", "frais.ts", "notes.md"],
      recentFiles: ["frais.ts", "notes.md"],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks(10);
    });

    expect(screen.getByText("frais.ts")).toBeTruthy();
    expect(screen.getByText("notes.md")).toBeTruthy();
    expect(screen.queryByText("ancien-local.md")).toBeNull();
  });

  it("un cache Codex ne peut plus changer le provider d'un fil Claude", async () => {
    localStorage.setItem(`atelier-studio.modelSel:${PROJECT_ROOT}`, JSON.stringify({
      provider: "codex", model: "gpt-5.5", effort: "medium", permissionMode: "bypassPermissions",
    }));
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]); // session existante Claude
    await selectThread(sock, "Fil A — albédo");

    const objective = "produire la figure 3 vérifiée";
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: `/goal ${objective}` } });
    await act(async () => {
      fireEvent.submit(textarea.closest("form")!);
      await flushMicrotasks(6);
    });

    const sends = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send");
    expect(sends[sends.length - 1]).toMatchObject({ threadId: "thread-A", provider: "claude", prompt: `/goal ${objective}` });
    expect(document.querySelector(".goal-bar")).toBeNull();
  });

  it("charge l'historique d'un fil vide ; un fil déjà peuplé n'est JAMAIS écrasé", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    await push(sock, {
      type: "history", threadId: "thread-A",
      events: [events.user("Question initiale ?"), events.text("Réponse initiale.")],
    });
    expect(transcript().getByText("Question initiale ?")).toBeTruthy();
    expect(screen.getByText("Réponse initiale.")).toBeTruthy();

    // protection anti-écrasement (App.tsx ~927) : un history tardif sur un fil
    // déjà peuplé en mémoire est ignoré — la session vivante fait foi
    await push(sock, {
      type: "history", threadId: "thread-A",
      events: [events.user("Question rechargée ?")],
    });
    expect(transcript().getByText("Question initiale ?")).toBeTruthy();
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

  it("steer : l'« interrupted » du vieux tour n'éteint pas le stop du nouveau", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    // Au steer Claude, le terminal du VIEUX tour (« interrupted ») arrive
    // APRÈS le submit : il effaçait workingSince et Esc/le carré stop
    // devenaient inertes pendant le démarrage du nouveau tour (2026-08-24).
    await push(sock, { type: "event", threadId: "thread-A", event: events.error("interrupted") });
    // …puis l'ack serveur du NOUVEAU tour : son événement user re-pose l'état.
    await push(sock, { type: "event", threadId: "thread-A", event: events.user("nouvelle consigne") });
    // le carré stop ET le rappel esc réapparaissent : l'état de travail est re-posé
    expect(screen.getAllByTitle(t("action.interrupt")).length).toBeGreaterThan(0);
  });

  it("affiche l'alerte en icône et la retire après confirmation du serveur", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await push(sock,{type:'sendReceipt',clientMessageId:'notice-test',threadId:'thread-A',status:'uncertain'});
    expect(screen.getByRole('button',{name:'Afficher l’alerte du chat'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Afficher l’alerte du chat'}));
    await act(async()=>{await flushMicrotasks(4);});
    fireEvent.click(screen.getByRole('button',{name:'Vérifier l’état'}));
    expect(sock.sent.map(value=>JSON.parse(value)).filter(message=>message.type==='receiptStatus').slice(-1)[0]?.clientMessageId).toBe('notice-test');
    expect(sock.sent.map(value=>JSON.parse(value)).some(message=>message.type==='send')).toBe(false);
    await push(sock,{type:'sendReceipt',clientMessageId:'notice-test',threadId:'thread-A',status:'received'});
    expect(screen.queryByRole('button',{name:'Afficher l’alerte du chat'})).toBeNull();
  });

  it("retire l’alerte quand sa croix est utilisée sans renvoyer le message", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await push(sock,{type:'sendReceipt',clientMessageId:'dismiss-test',threadId:'thread-A',status:'uncertain'});
    fireEvent.click(screen.getByRole('button',{name:'Afficher l’alerte du chat'}));
    await act(async()=>{await flushMicrotasks(4);});
    fireEvent.click(screen.getByRole('button',{name:'Retirer l’alerte du chat'}));
    expect(screen.queryByRole('button',{name:'Afficher l’alerte du chat'})).toBeNull();
    expect(sock.sent.map(value=>JSON.parse(value)).some(message=>message.type==='send')).toBe(false);
  });

  it("retire un refus d’envoi après confirmation du même chat uniquement", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await push(sock,{type:'error',requestType:'send',threadId:'thread-A',message:'Envoi refusé',code:'REQUEST_BUSY'});
    expect(screen.getByRole('button',{name:'Afficher l’alerte du chat'})).toBeTruthy();
    await push(sock,{type:'event',threadId:'thread-B',event:events.user('autre chat')});
    expect(screen.getByRole('button',{name:'Afficher l’alerte du chat'})).toBeTruthy();
    await push(sock,{type:'event',threadId:'thread-A',event:events.user('envoi confirmé')});
    expect(screen.queryByRole('button',{name:'Afficher l’alerte du chat'})).toBeNull();
  });

  it("retire l’alerte de reçu seulement pour le message confirmé", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await push(sock,{type:'sendReceipt',clientMessageId:'receipt-a',threadId:'thread-A',status:'uncertain'});
    await push(sock,{type:'event',threadId:'thread-A',event:{...events.user('autre message'),meta:{messageId:'receipt-b'}}});
    expect(screen.getByRole('button',{name:'Afficher l’alerte du chat'})).toBeTruthy();
    await push(sock,{type:'event',threadId:'thread-A',event:{...events.user('confirmé'),meta:{messageId:'receipt-a'}}});
    expect(screen.queryByRole('button',{name:'Afficher l’alerte du chat'})).toBeNull();
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
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "atelier-add-to-chat",
          nonce,
          text: makeFigureAddToChatText(),
          path: "/Users/test/projet/fig3_spatial.png",
          name: "fig3_spatial.png",
          previewUrl: "http://127.0.0.1:18790/fig3_spatial.png",
          requestId: "add-fig3-1",
        },
        origin: "http://127.0.0.1:18790",
        source: iframe!.contentWindow,
      }));
      await flushMicrotasks(4);
    });

    // la pilule du composer affiche le nom sans extension (citeLabel) ;
    // l'image ne s'affiche plus en vignette mais via le zoom (plan 050 P2)
    expect(screen.getByText("fig3_spatial")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("context.preview-image", { name: "fig3_spatial.png" }) }));
    const preview = screen.getByRole("img", { name: "fig3_spatial.png" }) as HTMLImageElement;
    expect(preview.src).toBe("http://127.0.0.1:18790/fig3_spatial.png");
    fireEvent.click(screen.getByRole("button", { name: t("context.close-image-preview") }));
    expect(postMessage).toHaveBeenCalledWith({
      type: "atelier-add-to-chat-ack",
      nonce,
      requestId: "add-fig3-1",
      ok: true,
    }, "http://127.0.0.1:18790");
  });

  it("conserve la lecture agrandie lors de l'ajout et de l'envoi direct d'une annotation", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await act(async()=>{await flushMicrotasks(10);});
    fireEvent.keyDown(window,{code:'Digit2',key:'2',metaKey:true});
    const panel=()=>document.querySelector('[data-panel-id="chat"]') as HTMLElement;
    expect(panel().style.display).toBe('none');
    const iframe=document.querySelector('iframe')!;
    const nonce=new URLSearchParams(new URL(iframe.src).hash.slice(1)).get('atelier_nonce');
    for(const direct of [false,true]) {
      await act(async()=>{
        window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:18790',source:iframe.contentWindow,
          data:{type:'atelier-add-to-chat',nonce,text:'paper.pdf (p.7) : « Passage annoté »\nCommentaire : Pourquoi ce seuil ?',direct,pdfAnnotation:{rel:'paper.pdf',id:direct?'a2':'a1'}}}));
        await flushMicrotasks(8);
      });
      expect(panel().style.display).toBe('none');
    }
    const sent = sock.sent.map(value=>JSON.parse(value)).find(message=>message.type==='send');
    expect(sent).toBeTruthy();
    expect(sent.displayEvent.text).toContain('Pourquoi ce seuil ?');
    expect(sent.displayEvent.text).toContain('Passage annoté');
    expect(sent.prompt.match(/Pourquoi ce seuil \?/g)).toHaveLength(1);
    fireEvent.keyDown(window,{code:'Digit0',key:'0',metaKey:true});
    expect(document.querySelector('.chat-annotation-comment')?.textContent).toBe('Pourquoi ce seuil ?');
    expect(document.querySelector('.user-bubble')?.textContent).not.toContain('Commentaire :');
    expect(document.querySelector('.user-bubble .user-file-attachment')).toBeNull();
  });

  it("distingue brouillon et envoi direct pour un surlignage sans supprimer le marquage", async () => {
    const {sock} = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(10); });
    const iframe = document.querySelector('iframe')!;
    const nonce = new URLSearchParams(new URL(iframe.src).hash.slice(1)).get('atelier_nonce');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const sends = () => sock.sent.map(value => JSON.parse(value)).filter(message => message.type === 'send');
    const deliver = async (text: string, direct: boolean) => {
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'http://127.0.0.1:18790', source: iframe.contentWindow,
          data: {type: 'atelier-add-to-chat', nonce, text, direct},
        }));
        await flushMicrotasks(8);
      });
    };
    await deliver('paper.pdf (p.2) : « Autre passage gardé en brouillon »', false);
    const text = 'paper.pdf (p.7) : « Passage surligné »\nCommentaire : Explique ce passage';
    await deliver(text, false);
    expect(sends()).toHaveLength(0);
    const composer = document.querySelector('.composer textarea') as HTMLTextAreaElement;
    fireEvent.change(composer, {target: {value: 'Mon brouillon non envoyé'}});
    await deliver(text, true);
    expect(sends()).toHaveLength(1);
    const sent = sends()[0];
    expect(sent.prompt).toContain('Passage surligné');
    expect(sent.prompt).not.toContain('Autre passage');
    expect(sent.prompt).not.toContain('Mon brouillon non envoyé');
    expect(composer.value).toBe('Mon brouillon non envoyé');
    expect(screen.getByTitle('paper.pdf (p.2) : « Autre passage gardé en brouillon »')).toBeTruthy();
    await push(sock, {type:'event', threadId:'thread-A', event:{kind:'user', text, meta:{messageId:sent.clientMessageId}}});
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/pdfannot') && init?.method === 'POST')).toHaveLength(0);
  });

  it("garde le texte de lecture si la mention d'agent est refusée", async () => {
    const {sock}=await mountApp();
    await pushThreads(sock);
    await selectThread(sock,"Fil A — albédo");
    await push(sock,{type:'files',projectRoot:PROJECT_ROOT,files:['paper.tex']});
    await act(async()=>{
      window.dispatchEvent(new CustomEvent('chat-open-file',{detail:{rel:'paper.tex',diff:true}}));
      await flushMicrotasks(10);
    });
    fireEvent.keyDown(window,{code:'Digit2',key:'2',metaKey:true});
    const input=screen.getByRole('textbox',{name:'Écrire au chat depuis la lecture'});
    fireEvent.change(input,{target:{value:'@codex Vérifie ce passage'}});
    fireEvent.submit(input.closest('form')!);
    await act(async()=>{await flushMicrotasks(4);});
    expect((input as HTMLTextAreaElement).value).toBe('@codex Vérifie ce passage');
  });

  it("retire une annotation PDF seulement après l’ack du message envoyé", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(10); });
    const iframe = document.querySelector("iframe")!;
    const nonce = new URLSearchParams(new URL(iframe.src).hash.slice(1)).get("atelier_nonce");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const removalCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/pdfannot") && init?.method === "POST");
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { origin:"http://127.0.0.1:18790", source:iframe.contentWindow,
        data:{type:"atelier-add-to-chat",nonce,text:"Passage annoté",pdfAnnotation:{rel:"paper.pdf",id:"a1"}} }));
      await flushMicrotasks(4);
    });
    expect(removalCalls()).toHaveLength(0);
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea,{target:{value:"Examine cette note"}});
    fireEvent.submit(textarea.closest("form")!);
    await act(async () => { await flushMicrotasks(4); });
    expect(removalCalls()).toHaveLength(0);
    const sentMessages = sock.sent.map(value=>JSON.parse(value)).filter(m=>m.type==="send");
    const sent = sentMessages[sentMessages.length - 1];
    expect(sent).toBeTruthy();
    await push(sock,{type:"event",threadId:"thread-A",event:{kind:"user",text:"Examine cette note",meta:{messageId:sent.clientMessageId}}});
    expect(removalCalls()).toHaveLength(1);
    expect(JSON.parse(String(removalCalls()[0][1]?.body))).toEqual({rel:"paper.pdf",removeIds:["a1"]});
  });

  it("garde un fichier TEX comme contexte Read sans l'envoyer comme image", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(10); });

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    const nonce = new URLSearchParams(new URL(iframe!.src).hash.replace(/^#/, "")).get("atelier_nonce");
    expect(nonce).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "atelier-add-to-chat",
          nonce,
          text: "conferences/agu2026/abstract_agu26.tex\nFichier joint depuis la galerie atelier — lis-le (outil Read) avant de répondre.",
          path: "conferences/agu2026/abstract_agu26.tex",
          name: "abstract_agu26.tex",
          requestId: "add-abstract-1",
        },
        origin: "http://127.0.0.1:18790",
        source: iframe!.contentWindow,
      }));
      await flushMicrotasks(4);
    });

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Respecte-t-il les règles ?" } });
    fireEvent.submit(textarea.closest("form")!);
    await act(async () => { await flushMicrotasks(6); });

    const sends = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send");
    const sent = sends[sends.length - 1];
    expect(sent.prompt).toContain("conferences/agu2026/abstract_agu26.tex");
    expect(sent.attachments).toBeUndefined();
    expect(sent.displayEvent.imagePaths).toBeUndefined();
    expect(sent.inputs?.some((input: { type?: string }) => input.type === "local_image") ?? false).toBe(false);
  });

  it("conserve les pièces jointes du brouillon si le transport refuse l'envoi", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(10); });

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    const nonce = new URLSearchParams(new URL(iframe!.src).hash.replace(/^#/, "")).get("atelier_nonce");
    expect(nonce).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "atelier-add-to-chat",
          nonce,
          text: "notes/late.md — lis ce fichier avant de répondre.",
          path: "notes/late.md",
          name: "late.md",
          requestId: "add-late-attachment",
        },
        origin: "http://127.0.0.1:18790",
        source: iframe!.contentWindow,
      }));
      await flushMicrotasks(6);
    });

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Réessaie avec ce fichier" } });
    const sendCount = () => sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "send").length;
    const before = sendCount();
    // sendPrompt refuse une socket fermée ; le message user optimiste reste
    // visible, mais le fichier doit rester dans le draft réessayable.
    sock.close();
    fireEvent.submit(textarea.closest("form")!);
    await act(async () => {
      await flushMicrotasks(6);
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(sendCount()).toBe(before);
    const persisted = JSON.parse(localStorage.getItem("atelier-studio.chat-drafts:v1") ?? "{}");
    const drafts = Object.values(persisted.drafts ?? {}) as Array<{ attachments?: Array<{ path?: string }> }>;
    expect(drafts.some((draft) => draft.attachments?.some((attachment) => attachment.path === "notes/late.md"))).toBe(true);
  });

  it("rattache un ajout KB asynchrone au fil source, après un changement de conversation", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A, THREAD_B]);
    await selectThread(sock, "Fil A — albédo");
    await act(async () => { await flushMicrotasks(6); });

    dialogMock.open.mockResolvedValueOnce("/tmp/late-kb.md");
    fireEvent.click(screen.getByLabelText(t("kb.open")));
    fireEvent.click(screen.getByText(t("kb.add-file")));
    await act(async () => { await flushMicrotasks(6); });
    expect(sock.sent.map((value) => JSON.parse(value))).toContainEqual(
      expect.objectContaining({ type: "kbAdd", kind: "file", origin: "/tmp/late-kb.md" }),
    );

    // Le callback conservé par useKbActions doit garder thread-A, même si le
    // picker est maintenant rendu avec le binding du fil B.
    fireEvent.click(screen.getByLabelText(t("kb.open")));
    await selectThread(sock, "Fil B — manuscrit");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("kb-source-added", {
        detail: {
          ok: true,
          source: {
            id: "kb-late-source",
            kind: "file",
            title: "late-kb.md",
            origin: "/tmp/late-kb.md",
            chars: 12,
            addedAt: FIXED_ISO,
            updatedAt: FIXED_ISO,
          },
        },
      }));
      await flushMicrotasks(6);
    });

    const upserts = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "upsertThread");
    const late = upserts.filter((message) => message.thread?.kbSourceIds?.includes("kb-late-source"));
    expect(late).toHaveLength(1);
    expect(late[0].thread).toMatchObject({ id: "thread-A", kbSourceIds: ["kb-late-source"] });
    expect(late.some((message) => message.thread?.id === "thread-B")).toBe(false);
  });

  it("conserve un ajout KB lancé depuis l'accueil en attente, sans l'attacher au fil ouvert entre-temps", async () => {
    const { sock } = await mountApp();
    dialogMock.open.mockResolvedValueOnce("/tmp/home-kb.md");
    fireEvent.click(screen.getByLabelText(t("kb.open")));
    fireEvent.click(screen.getByText(t("kb.add-file")));
    await act(async () => { await flushMicrotasks(6); });

    await pushThreads(sock, [THREAD_A, THREAD_B]);
    await selectThread(sock, "Fil B — manuscrit");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("kb-source-added", {
        detail: {
          ok: true,
          source: {
            id: "kb-home-source",
            kind: "file",
            title: "home-kb.md",
            origin: "/tmp/home-kb.md",
            chars: 12,
            addedAt: FIXED_ISO,
            updatedAt: FIXED_ISO,
          },
        },
      }));
      await flushMicrotasks(6);
    });

    const beforeHome = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "upsertThread");
    expect(beforeHome.some((message) => message.thread?.kbSourceIds?.includes("kb-home-source"))).toBe(false);

    fireEvent.click(document.querySelector(".rail-proj") as HTMLButtonElement);
    await act(async () => { await flushMicrotasks(4); });
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.click(within(sidebar).getByRole("button", { name: /new chat/i }));
    const dialog = screen.getByRole("dialog", { name: /new chat/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /Claude/i }));
    await act(async () => { await flushMicrotasks(6); });

    const upserts = sock.sent.map((value) => JSON.parse(value)).filter((message) => message.type === "upsertThread");
    expect(upserts.some((message) => message.thread?.kbSourceIds?.includes("kb-home-source"))).toBe(true);
  });

  it("envoie une commande show unique à l'iframe Galerie et accepte son résultat", async () => {
    const { sock } = await mountApp();
    await act(async () => { await flushMicrotasks(10); });

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    expect(iframe, "iframe Galerie explicitement identifiée").toBeTruthy();
    fireEvent.load(iframe!);
    await act(async () => { await flushMicrotasks(2); });
    const nonce = new URLSearchParams(new URL(iframe!.src).hash.replace(/^#/, "")).get("atelier_nonce");
    expect(nonce).toBeTruthy();
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");
    const switches: unknown[] = [];
    const onSwitch = (event: Event) => switches.push((event as CustomEvent).detail);
    window.addEventListener("switch-surface", onSwitch);

    const request = {
      action: "show" as const,
      mode: "focus" as const,
      projectRoot: PROJECT_ROOT,
      requestId: "gallery-req-1",
      rels: ["figures/a.png", "figures/missing.png"],
    };
    await push(sock, { type: "galleryCommand", command: request });
    await push(sock, { type: "galleryCommand", command: request });

    const showCalls = postMessage.mock.calls.filter(([message]) =>
      (message as { type?: string }).type === "atelier-gallery-command",
    );
    expect(showCalls).toHaveLength(1);
    expect(showCalls[0]).toEqual([
      { type: "atelier-gallery-command", nonce, ...request },
      "http://127.0.0.1:18790",
    ]);
    expect(switches.filter((detail) => (detail as { surface?: string }).surface === "atelier")).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: "atelier-gallery-result",
          nonce,
          ok: true,
          action: "show",
          projectRoot: PROJECT_ROOT,
          requestId: "gallery-req-1",
          matched: ["figures/a.png"],
          missing: ["figures/missing.png"],
        },
        origin: "http://127.0.0.1:18790",
        source: iframe!.contentWindow,
      }));
      await flushMicrotasks(4);
    });

    window.removeEventListener("switch-surface", onSwitch);
  });

  it("re-cliquer dans la galerie un fichier DÉJÀ ouvert ramène son onglet", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    fireEvent.load(iframe!);
    await act(async () => { await flushMicrotasks(2); });

    const url = "http://127.0.0.1:18790/.fig_thumbs/latex_studio.html?path=%2Fp%2Fmethods.tex&v=1";
    // le nonce d'atelier voyage dans le fragment de l'iframe galerie
    const nonce = /atelier_nonce=([\w-]+)/.exec(iframe!.getAttribute("src") ?? "")?.[1] ?? "";
    expect(nonce).not.toBe("");
    const ouvrir = async () => {
      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "atelier-open-tab", nonce, url, title: "methods.tex" },
          origin: "http://127.0.0.1:18790",
          source: iframe!.contentWindow,
        }));
        await flushMicrotasks(4);
      });
    };
    // La couche affichée est le seul signal qui compte : « le fichier est à
    // l'écran ». Les onglets, eux, vivent dans la barre du haut.
    const coucheDoc = () => {
      // withAtelierNonce ajoute un fragment : match par PRÉFIXE, pas exact
      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[src^="http://127.0.0.1:18790/.fig_thumbs/latex_studio.html"]');
      return frame?.closest<HTMLElement>(".workspace-content-layer") ?? null;
    };
    const coucheGalerie = () => document
      .querySelector<HTMLElement>('[data-workspace-content="surface:atelier"]');
    const visible = (el: HTMLElement | null) => el?.style.display === "block";

    await ouvrir();
    expect(coucheDoc()).toBeTruthy();
    expect(visible(coucheDoc())).toBe(true);

    // Retour à la galerie par le RAIL (switchToSurface) — le chemin réel de
    // Thierry. Il ne touche PAS à activeTab côté App : l'app croit encore être
    // sur le document alors que la galerie est à l'écran.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface: "atelier" } }));
      await flushMicrotasks(3);
    });
    expect(visible(coucheGalerie())).toBe(true);
    expect(visible(coucheDoc())).toBe(false);

    // re-clic sur le MÊME fichier depuis la galerie : son onglet doit revenir
    // au premier plan (vécu 2026-08-24 : rien ne se passait).
    await ouvrir();
    expect(visible(coucheDoc())).toBe(true);
    // …et jamais de doublon d'onglet
    expect(document.querySelectorAll(
      'iframe[src^="http://127.0.0.1:18790/.fig_thumbs/latex_studio.html"]')).toHaveLength(1);
  });

  it("ouvre les PNG dans la Galerie, les PDF dans leur lecteur et les SVG dans leur éditeur", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, {
      type: "files",
      // `projectRoot` est OBLIGATOIRE depuis que le catalogue est scopé au
      // projet actif (App.tsx:1907) : sans lui le message est ignoré, la
      // liste reste vide, et le clic part en resolution findfile différée —
      // ce test tombait alors à zéro postMessage. Le garde est le correctif
      // d'un vrai bug : une pilule résolue contre le catalogue d'un AUTRE
      // projet ouvrait « file not found ».
      projectRoot: PROJECT_ROOT,
      files: [
        "outputs/figures/albedo_annuel.png",
        "outputs/figures/albedo_annuel.pdf",
        "outputs/figures/albedo_annuel.svg",
      ],
    });
    await push(sock, {
      type: "history",
      threadId: "thread-A",
      events: [
        events.user("Montre-moi les sorties"),
        events.text([
          "- [Figure PNG](outputs/figures/albedo_annuel.png)",
          "- [Figure PDF](outputs/figures/albedo_annuel.pdf)",
          "- [Figure SVG](outputs/figures/albedo_annuel.svg)",
        ].join("\n")),
      ],
    });

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    expect(iframe).toBeTruthy();
    fireEvent.load(iframe!);
    await act(async () => { await flushMicrotasks(2); });
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");

    fireEvent.click(screen.getByRole("button", { name: "Figure PNG" }));
    fireEvent.click(screen.getByRole("button", { name: "Figure PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Figure SVG" }));
    await act(async () => { await flushMicrotasks(2); });

    const openCalls = postMessage.mock.calls.filter(([message]) =>
      (message as { action?: string }).action === "open",
    );
    expect(openCalls).toHaveLength(1);
    expect(openCalls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: "atelier-gallery-command",
        action: "open",
        mode: "viewer",
        projectRoot: PROJECT_ROOT,
        rels: ["outputs/figures/albedo_annuel.png"],
      }),
    ]);
    const pdfFrame = document.querySelector<HTMLIFrameElement>('iframe[src*="pdf_viewer.html"]');
    expect(pdfFrame).toBeTruthy();
    expect(new URL(pdfFrame!.src).searchParams.get("file")).toBe("outputs/figures/albedo_annuel.pdf");
    const svgFrame = document.querySelector<HTMLIFrameElement>('iframe[src*="svg_viewer.html"]');
    expect(svgFrame).toBeTruthy();
    expect(svgFrame!.src).toContain("file=outputs%2Ffigures%2Falbedo_annuel.svg");
  });

  it("ouvre le PDF absolu du projet à la page annoncée sans dépendre de l'index Galerie", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, {
      type: "files",
      projectRoot: PROJECT_ROOT,
      files: ["build/latex/main_ngeo.pdf"],
    });
    await push(sock, {
      type: "history",
      threadId: "thread-A",
      events: [
        events.user("Compile le manuscrit"),
        events.text([
          `[Voir le PDF, page 6](${PROJECT_ROOT}/build/latex/main_ngeo.pdf)`,
          `[Voir le PDF, page 7](${PROJECT_ROOT}/build/latex/main_ngeo.pdf)`,
        ].join("\n\n")),
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Voir le PDF, page 6" }));
    await act(async () => { await flushMicrotasks(4); });

    let pdfFrames = document.querySelectorAll<HTMLIFrameElement>('iframe[src*="pdf_viewer.html"]');
    expect(pdfFrames).toHaveLength(1);
    expect(new URL(pdfFrames[0].src).searchParams.get("file")).toBe("build/latex/main_ngeo.pdf");
    expect(new URL(pdfFrames[0].src).searchParams.get("page")).toBe("6");

    fireEvent.click(screen.getByRole("button", { name: "Voir le PDF, page 7" }));
    await act(async () => { await flushMicrotasks(4); });
    pdfFrames = document.querySelectorAll<HTMLIFrameElement>('iframe[src*="pdf_viewer.html"]');
    expect(pdfFrames).toHaveLength(1);
    expect(new URL(pdfFrames[0].src).searchParams.get("page")).toBe("7");
  });

  it("en layout Chat seul, cliquer une pilule PNG rouvre le panneau et l'ouvre dans la Galerie", async () => {
    // Vécu 2026-09-11 : en layout « chat » l'AtelierPane n'est pas monté, donc
    // aucune iframe galerie → le bridge échouait (gallery-frame-unavailable)
    // avant même de basculer le layout ; la pilule ne faisait rien d'utile.
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, {
      type: "files",
      projectRoot: PROJECT_ROOT,
      files: ["outputs/figures/albedo_annuel.png"],
    });
    await push(sock, {
      type: "history",
      threadId: "thread-A",
      events: [
        events.user("Montre-moi la figure"),
        events.text("- [Figure PNG](outputs/figures/albedo_annuel.png)"),
      ],
    });

    const chatBtn = screen.getAllByTitle(/⌘1/)[0];
    await act(async () => { chatBtn.click(); await flushMicrotasks(2); });
    expect(document.querySelector('iframe[data-atelier-role="gallery"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Figure PNG" }));
    await act(async () => { await flushMicrotasks(4); });

    // le panneau atelier est remonté…
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
    expect(iframe).toBeTruthy();
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");
    // …et la commande part dès que la galerie a fini de charger
    fireEvent.load(iframe!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks(4);
    });
    const openCalls = postMessage.mock.calls.filter(([message]) =>
      (message as { action?: string }).action === "open",
    );
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0][0]).toEqual(expect.objectContaining({
      type: "atelier-gallery-command",
      action: "open",
      mode: "viewer",
      projectRoot: PROJECT_ROOT,
      rels: ["outputs/figures/albedo_annuel.png"],
    }));
  });

  it("ouvre un événement Edited dans l'IDE avec le snapshot et le mode diff", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "files", projectRoot: PROJECT_ROOT, files: ["scripts/plot.py"] });
    const baseSha = "a".repeat(40);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("chat-open-file", { detail: {
        rel: "scripts/plot.py",
        line: null,
        diff: true,
        baseSha,
      } }));
      await flushMicrotasks(4);
    });

    const editor = document.querySelector<HTMLIFrameElement>('iframe[src*="latex_studio.html"]');
    expect(editor).toBeTruthy();
    expect(document.querySelector('iframe[src*="diff_viewer.html"]')).toBeNull();
    const url = new URL(editor!.src);
    expect(url.searchParams.get("path")).toBe(`${PROJECT_ROOT}/scripts/plot.py`);
    expect(url.searchParams.get("diff")).toBe("1");
    expect(url.searchParams.get("base")).toBe(baseSha);
  });

  it("recliquer un fichier déjà ouvert le ramène à l'écran, pas la galerie", async () => {
    // Ouvrir un fichier n'est pas « montrer la galerie ». Quand l'onglet
    // existe déjà et qu'il est déjà l'onglet actif, aucun état ne change :
    // seule une demande numérotée peut encore ramener le fichier devant.
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "files", projectRoot: PROJECT_ROOT, files: ["scripts/plot.py"] });

    const shown = () => Array.from(document.querySelectorAll<HTMLElement>(".workspace-content-layer"))
      .filter((layer) => layer.style.display !== "none")
      .map((layer) => layer.dataset.workspaceContent ?? "");
    const openFromChat = async () => {
      await act(async () => {
        window.dispatchEvent(new CustomEvent("chat-open-file", {
          detail: { rel: "scripts/plot.py", line: null },
        }));
        await flushMicrotasks(6);
      });
    };

    await openFromChat();
    expect(shown().some((key) => key.startsWith("document:"))).toBe(true);

    // retour à la galerie (rail / barre du haut)
    await act(async () => {
      window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface: "atelier" } }));
      await flushMicrotasks(4);
    });
    expect(shown()).toContain("surface:atelier");

    // même fichier, même onglet, même `activeTab` : il doit revenir devant
    await openFromChat();
    expect(shown().some((key) => key.startsWith("document:"))).toBe(true);
    expect(shown()).not.toContain("surface:atelier");
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

  it("ouvre une surface du rail après être passé par le layout Chat", async () => {
    localStorage.setItem("atelier-studio.topbar-surfaces", JSON.stringify(["biblio"]));
    await mountApp();

    const chatBtn = screen.getAllByTitle(/⌘1/)[0];
    await act(async () => { chatBtn.click(); await flushMicrotasks(2); });
    expect(document.querySelector('[data-panel-id="atelier"]')).toBeNull();

    const switches: unknown[] = [];
    const onSwitch = (event: Event) => switches.push((event as CustomEvent).detail);
    window.addEventListener("switch-surface", onSwitch);

    fireEvent.click(screen.getByRole("button", { name: t("atelier.biblio") }));
    await act(async () => {
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks(6);
    });

    expect(document.querySelector('[data-panel-id="atelier"]')).toBeTruthy();
    expect(switches).toContainEqual({ surface: "biblio" });
    expect(document.querySelector(".biblio-surface")).toBeTruthy();
    // la surface active non épinglée se révèle dans la barre
    expect(document.querySelector(".topbar-surface.on")).toBeTruthy();
    window.removeEventListener("switch-surface", onSwitch);
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

  it("replay de l'usage au reload : l'anneau se repeuple depuis le done journalisé (plan 025)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");
    // avant tout usage : pas d'anneau
    expect(document.querySelector(".ctx-ring")).toBeNull();
    // historique matérialisé avec un done portant l'usage (comme le journal le rejoue)
    await push(sock, {
      type: "history", threadId: "thread-A",
      events: [
        events.user("Question"),
        events.text("Réponse."),
        events.done({ usage: { context: 10000, output: 5000, cost: null, turns: 2 } }),
      ],
    });
    // l'anneau d'usage se repeuple depuis le done rejoué (usageByThread réhydraté)
    await act(async () => { await flushMicrotasks(4); });
    expect(document.querySelector(".ctx-ring")).toBeTruthy();
  });

  it("deux tool_update de même itemId dans deux turns restent deux actions distinctes (plan 025)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    // turn 1 : un outil « call-1 », puis terminal
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        ...events.tool({ id: "call-1", name: "Bash", detail: "premier appel", output: "sortie un" }),
        meta: { schemaVersion: 1, eventId: "e1", provider: "claude", threadId: "thread-A", turnId: "turn-1", itemId: "call-1", sequence: 2, ts: 1, durable: true, origin: "provider" },
      },
    });
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        ...events.done(),
        meta: { schemaVersion: 1, eventId: "e2", provider: "claude", threadId: "thread-A", turnId: "turn-1", sequence: 3, ts: 2, durable: true, origin: "provider" },
      },
    });
    // turn 2 : le provider réutilise le même id d'item (ids Codex/Claude non
    // globalement uniques) — l'identité d'un item est (turnId, itemId)
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        ...events.tool({ id: "call-1", name: "Bash", detail: "second appel", output: "sortie deux" }),
        meta: { schemaVersion: 1, eventId: "e3", provider: "claude", threadId: "thread-A", turnId: "turn-2", itemId: "call-1", sequence: 5, ts: 3, durable: true, origin: "provider" },
      },
    });

    // les DEUX actions existent : le tool du turn 2 ne remplace pas celui du
    // turn 1 (détails visibles en dépliant chaque groupe d'outils)
    // Rendu consolidé : liste plate d'actions, une rangée `.tool-output` par
    // appel (plus de disclosure par groupe).
    const rows = [...document.querySelectorAll(".tool-output-head")] as HTMLElement[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      rows.forEach((r) => r.click());
      await flushMicrotasks(2);
    });
    // La rangée compacte n'affiche plus le `detail` : ce sont les sorties
    // distinctes qui prouvent que le tour 2 n'a pas remplacé le tour 1.
    expect(screen.getByText(/sortie un/)).toBeTruthy();
    expect(screen.getByText(/sortie deux/)).toBeTruthy();
  });

  it("interaction pending → carte ; réponse → WS interactionResponse ; ré-émission answered → figée sans doublon (plan 025)", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock);
    await selectThread(sock, "Fil A — albédo");

    const meta = (eventId: string, sequence: number) => ({
      schemaVersion: 1, eventId, provider: "codex", threadId: "thread-A",
      turnId: "turn-1", itemId: "req-appr-1", sequence, ts: 1, durable: true, origin: "provider",
    });
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        kind: "interaction", requestId: "req-appr-1", interactionType: "approval",
        title: "Exécuter rm -rf build ?", detail: "rm -rf build", state: "pending",
        meta: meta("e-int-1", 2),
      },
    });
    // la carte apparaît avec ses boutons
    expect(screen.getByText("Exécuter rm -rf build ?")).toBeTruthy();
    const allowBtn = screen.getByRole("button", { name: t("interaction.allow-once") });
    await act(async () => {
      allowBtn.click();
      await flushMicrotasks(4);
    });

    // le message WS interactionResponse part avec la réponse du contrat
    const responses = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "interactionResponse");
    expect(responses).toHaveLength(1);
    expect(responses[0].requestId).toBe("req-appr-1");
    expect(responses[0].threadId).toBe("thread-A");
    expect(responses[0].clientInstanceId).toMatch(/^[0-9a-f-]{20,}$/i);
    expect(responses[0].response).toEqual({ allow: true, scope: "once" });
    // marquage optimiste : la carte est déjà figée en attendant l'état final
    expect(screen.queryByRole("button", { name: t("interaction.allow-once") })).toBeNull();

    // le sidecar ré-émet le MÊME requestId à l'état final : remplacement en
    // place (aucune 2e carte), résumé visible, toujours non éditable
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        kind: "interaction", requestId: "req-appr-1", interactionType: "approval",
        title: "Exécuter rm -rf build ?", detail: "rm -rf build", state: "answered",
        answerSummary: "autorisé une fois", meta: meta("e-int-2", 3),
      },
    });
    expect(screen.getAllByText("Exécuter rm -rf build ?")).toHaveLength(1);
    expect(screen.getByText("autorisé une fois")).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("interaction.allow-once") })).toBeNull();
  });

  it("Revert transmet l'eventId exact du message sélectionné", async () => {
    const { sock } = await mountApp();
    await loadExactHistory(sock);

    await act(async () => {
      screen.getByRole("button", { name: t("chat.revert-title") }).click();
      await flushMicrotasks(4);
    });

    const reverts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "revert");
    const sent = reverts[reverts.length - 1];
    expect(sent).toMatchObject({ threadId: "thread-A", eventId: "event-user-exact" });
    expect(dialogMock.confirm).not.toHaveBeenCalled();
  });

  it("Edit & resend transmet l'eventId exact du message remplacé", async () => {
    const { sock } = await mountApp();
    await loadExactHistory(sock);

    await act(async () => {
      screen.getByRole("button", { name: t("action.edit-resend") }).click();
      await flushMicrotasks(2);
    });
    const textarea = document.querySelector(".edit-box textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.dataset.slot).toBe("textarea");
    expect(textarea.rows).toBe(1);
    expect(textarea.className).toContain("tw:bg-transparent");
    expect(textarea.className).toContain("tw:focus-visible:ring-0");
    expect(textarea.className).not.toContain("tw:focus-visible:border-[var(--border-strong)]");
    expect(document.querySelector(".edit-box")?.tagName).toBe("FORM");
    expect(document.querySelector(".edit-box-shell")?.parentElement?.classList.contains("user-wrap")).toBe(true);
    expect(document.querySelector(".user-bubble")).toBeNull();
    expect(document.querySelector(".user-message [data-slot='message-footer']")).toBeNull();
    const cancelButton = document.querySelector(".edit-cancel") as HTMLButtonElement;
    expect(cancelButton.dataset.slot).toBe("button");
    expect(cancelButton.className).toContain("tw:border-border");
    expect(cancelButton.className).toContain("tw:rounded-full");
    const sendButton = document.querySelector(".edit-send") as HTMLButtonElement;
    expect(sendButton.dataset.slot).toBe("button");
    expect(sendButton.className).toContain("tw:bg-primary");
    expect(sendButton.className).toContain("tw:rounded-full");
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(sendButton.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "Question corrigée" } });
    expect(sendButton.disabled).toBe(false);
    await act(async () => {
      sendButton.click();
      await flushMicrotasks(4);
    });

    const reverts = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "revert");
    const sent = reverts[reverts.length - 1];
    expect(sent).toMatchObject({ threadId: "thread-A", eventId: "event-user-exact" });
    expect(sent.snapshotSha).toBeUndefined();
    expect(dialogMock.confirm).not.toHaveBeenCalled();

    await push(sock, { type: "reverted", threadId: "thread-A" });
    const resend = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send").slice(-1)[0];
    expect(resend).toMatchObject({
      threadId: "thread-A",
      prompt: "Question corrigée",
      displayEvent: { kind: "user", text: "Question corrigée" },
    });
    expect(resend.clientMessageId).toMatch(/^[0-9a-f-]{20,}$/i);

    // Ack autoritaire du sidecar : même messageId, donc la bulle optimiste est
    // enrichie en place et ne devient jamais une seconde bulle identique.
    await push(sock, {
      type: "event", threadId: "thread-A",
      event: {
        kind: "user", text: "Question corrigée",
        meta: {
          schemaVersion: 1, eventId: "event-user-corrected", provider: "claude",
          threadId: "thread-A", turnId: "turn-2", messageId: resend.clientMessageId,
          sequence: 3, ts: 3, durable: true, origin: "provider",
        },
      },
    });
    const bubbles = [...document.querySelectorAll(".user-bubble")]
      .filter((el) => el.textContent === "Question corrigée");
    expect(bubbles).toHaveLength(1);
  });

  it("Edit & resend conserve le brouillon et ne renvoie rien après un refus", async () => {
    const { sock } = await mountApp();
    await loadExactHistory(sock);
    await act(async () => {
      screen.getByRole("button", { name: t("action.edit-resend") }).click();
      await flushMicrotasks(2);
    });
    fireEvent.change(document.querySelector(".edit-box textarea")!, { target: { value: "Texte corrigé conservé" } });
    await act(async () => {
      (document.querySelector(".edit-send") as HTMLButtonElement).click();
      await flushMicrotasks(2);
    });
    const sendsBefore = sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send").length;
    await push(sock, { type: "error", threadId: "thread-A", message: "Session corrigée indisponible" });
    expect(sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send")).toHaveLength(sendsBefore);
    expect((document.querySelector(".composer textarea") as HTMLTextAreaElement).value).toBe("Texte corrigé conservé");
    expect(await noticeText()).toBe("Session corrigée indisponible");
  });

  it("Fork transmet l'eventId exact du point de bifurcation", async () => {
    const { sock } = await mountApp();
    await loadExactHistory(sock);

    await act(async () => {
      screen.getByRole("button", { name: t("action.fork") }).click();
      await flushMicrotasks(4);
    });

    const sent = sock.sent.map((s) => JSON.parse(s)).find((m) => m.type === "forkThread");
    expect(sent).toMatchObject({ fromThreadId: "thread-A", eventId: "event-text-exact" });
  });

  it("@Codex envoie une mention atomique sans sélectionner un UUID fantôme", async () => {
    const { sock } = await mountApp();
    await push(sock, {
      type: "providerStatus",
      providers: [
        makeProviderInfo(),
        makeProviderInfo({
          id: "codex",
          label: "Codex",
          models: ["gpt-5.5"],
          defaultModel: "gpt-5.5",
          capabilities: makeCapabilities({ atelierSessionsMcp: true }),
        }),
      ],
    });
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, THREAD_A.title);

    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "@Codex vérifie le contexte" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(4); });

    const mention = sock.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "mentionAgent");
    expect(mention).toMatchObject({
      sourceThreadId: "thread-A",
      targetProvider: "codex",
      text: "vérifie le contexte",
      displayText: "@Codex vérifie le contexte",
    });
    expect(sock.sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === "createLinkedThread")).toHaveLength(0);
    expect(sock.sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === "send")).toHaveLength(0);

    await push(sock, {
      type: "agentMentionFailed",
      threadId: "thread-A",
      requestId: mention.requestId,
      message: "création refusée",
    });
    expect(screen.getAllByText("création refusée").length).toBeGreaterThan(0);
    expect(document.querySelector(".chat-surface-header")?.textContent).toContain(THREAD_A.title);
  });

  it("/review demande une revue Git isolée du tour, pas native_command", async () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ defaultProvider: "codex" }));
    const { sock } = await mountApp();
    await push(sock, {
      type: "providerStatus",
      providers: [
        makeProviderInfo({
          id: "codex",
          label: "Codex",
          models: ["gpt-5.5"],
          defaultModel: "gpt-5.5",
          capabilities: makeCapabilities({ review: true }),
        }),
      ],
    });
    const codexThread = makeThread({
      id: "thread-A",
      title: "Fil A — albédo",
      provider: "codex",
    });
    await pushThreads(sock, [codexThread]);
    await selectThread(sock, "Fil A — albédo");
    const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/review" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await act(async () => { await flushMicrotasks(4); });
    const review = sock.sent.map((raw) => JSON.parse(raw)).find((message) => message.type === "requestReview");
    expect(review).toMatchObject({
      type: "requestReview",
      threadId: "thread-A",
      mode: "git",
    });
    expect(review.requestId).toEqual(expect.any(String));
    expect(sock.sent.map((raw) => JSON.parse(raw)).some((message) => message.type === "send")).toBe(false);
  });

  it("crée une continuité depuis le menu, attend l'ack puis permet de la délier", async () => {
    const { sock } = await mountApp();
    await push(sock, {
      type: "providerStatus",
      providers: [
        makeProviderInfo(),
        makeProviderInfo({
          id: "codex",
          label: "Codex",
          models: ["gpt-5.5"],
          defaultModel: "gpt-5.5",
          capabilities: makeCapabilities({ atelierSessionsMcp: true }),
        }),
      ],
    });
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, THREAD_A.title);

    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    fireEvent.contextMenu(within(sidebar).getByText(THREAD_A.title));
    await act(async () => {
      await vi.dynamicImportSettled();
      await flushMicrotasks(4);
    });
    fireEvent.click(screen.getByRole("menuitem", {
      name: t("linkedConversation.continueWith"),
    }));
    await act(async () => { await flushMicrotasks(4); });
    fireEvent.click(screen.getByRole("menuitem", { name: "Codex" }));
    await act(async () => { await flushMicrotasks(4); });

    const create = sock.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "createLinkedThread");
    expect(create).toMatchObject({
      sourceThreadId: THREAD_A.id,
      targetProvider: "codex",
      reuseExisting: true,
      autoDeliveryLimit: 1,
    });
    expect(document.querySelector(".chat-surface-header")?.textContent).toContain(THREAD_A.title);

    await push(sock, {
      type: "linkedThreadCreated",
      requestId: create.requestId,
      sourceThreadId: THREAD_A.id,
      requestedTargetThreadId: create.targetThreadId,
      targetThreadId: create.targetThreadId,
      targetProvider: "codex",
      reused: false,
    });
    expect(sock.sent.map((raw) => JSON.parse(raw)).filter(
      (message) => message.type === "getHistory" && message.threadId === create.targetThreadId,
    )).toHaveLength(0);

    const child = makeThread({
      id: create.targetThreadId,
      provider: "codex",
      title: THREAD_A.title,
      agentLink: {
        parentThreadId: THREAD_A.id,
        role: "collaborator",
        access: "read_write",
        createdAt: "2026-07-20T00:00:00.000Z",
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      },
    });
    await pushThreads(sock, [THREAD_A, child]);
    expect(sock.sent.map((raw) => JSON.parse(raw)).some(
      (message) => message.type === "getHistory" && message.threadId === child.id,
    )).toBe(true);
    expect(screen.getAllByRole("button", {
      name: t("linkedConversation.markerLabel", { count: 2 }),
    })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: t("linkedConversation.title") }));
    await act(async () => { await flushMicrotasks(4); });
    fireEvent.click(screen.getByRole("button", {
      name: t("linkedConversation.unlinkNamed", { provider: "Claude" }),
    }));
    const unlink = sock.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "unlinkThread")
      .slice(-1)[0];
    expect(unlink).toEqual({ type: "unlinkThread", threadId: child.id });
  });
});
