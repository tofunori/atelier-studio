// Independent acceptance checks: drive navigation and observe WS requests.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async (command: string) => {
  if (command === "sidecar_port") return { port: 4242, token: "review-fixture" };
  if (command === "start_atelier") return "http://127.0.0.1:18790/";
  return null;
}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), confirm: vi.fn(async () => true) }));
vi.mock("./lib/notify", () => ({ init: vi.fn(async () => {}), notifyRunDone: vi.fn(async () => {}), notifyReview: vi.fn(async () => {}) }));

import App from "./App";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { PROJECT_ROOT, makeThread } from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import { resetKbSourcesForTests } from "./lib/kbSources";

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState(); resetSidecarInfo(); FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify([PROJECT_ROOT]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); resetKbSourcesForTests(); });

async function sendWithoutAcknowledgement() {
  renderUi(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(10); });
  const socket = FakeWS.last();
  await act(async () => { socket.open(); await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); });
  const thread = makeThread({ id: "review-receipt", title: "Chat reçu revue" });
  await act(async () => { socket.push({ type: "threads", threads: [thread] }); await flushMicrotasks(4); });
  await act(async () => {
    within(document.querySelector(".sidebar") as HTMLElement).getAllByText(thread.title)[0].click();
    await flushMicrotasks(4);
  });
  const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "Message sans accusé" } });
  fireEvent.submit(textarea.closest("form")!);
  await act(async () => { await flushMicrotasks(4); });
  const sends = socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "send");
  expect(sends).toHaveLength(1);
  return { socket, sent: sends[0] };
}

it("n’annonce pas une réception serveur avant le premier accusé", async () => {
  await sendWithoutAcknowledgement();
  expect(document.body.textContent).not.toContain("Envoi reçu par Atelier");
});

it("termine un arrêt volontaire sans libellé ni croix et garde le texte reçu", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  await act(async () => {
    socket.push({ type: "event", threadId: sent.threadId,
      event: { kind: "text", text: "Texte partiel conservé", ts: Date.now() } });
    socket.push({ type: "event", threadId: sent.threadId,
      event: { kind: "error", message: "interrupted", ts: Date.now() + 4900 } });
    socket.push({ type: "event", threadId: sent.threadId,
      event: { kind: "done", ok: false, status: "stopped", result: "interrupted",
        projectRoot: PROJECT_ROOT, filesChanged: [], ts: Date.now() + 5000 } });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".messages")?.textContent).toContain("Texte partiel conservé");
  expect(document.querySelector(".messages")?.textContent).not.toMatch(/Arrêté après|Stopped after|Tour interrompu|Turn interrupted/);
  expect(document.querySelector(".capsule-status.warn, .turn-interrupted, .messages .error")).toBeNull();
  expect(document.querySelector(".turn-fold-static")).toBeNull();
  expect((document.querySelector(".composer textarea") as HTMLTextAreaElement).disabled).toBe(false);
});

it("continue de montrer une vraie erreur fournisseur", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  await act(async () => {
    socket.push({ type: "event", threadId: sent.threadId,
      event: { kind: "error", message: "Authentification fournisseur expirée", ts: Date.now() } });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".messages .error")?.textContent).toContain("Authentification fournisseur expirée");
});

it("ne transforme pas les accusés normaux en bandeaux d’alerte", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  for (const status of ["received", "started"]) {
    await act(async () => {
      socket.push({ type: "sendReceipt", status, accepted: true,
        clientMessageId: sent.clientMessageId, threadId: sent.threadId, provider: "claude" });
      await flushMicrotasks(4);
    });
    expect(document.querySelector(".top-banner")).toBeNull();
  }
});

it("recherche un accusé perdu sans renvoyer le message ni boucler indéfiniment", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); await flushMicrotasks(4); });
  const messages = socket.sent.map(raw => JSON.parse(raw));
  const probes = messages.filter(message => message.type === "receiptStatus" && message.clientMessageId === sent.clientMessageId);
  expect(probes.length).toBeGreaterThan(0);
  expect(probes.length).toBeLessThanOrEqual(5);
  expect(messages.filter(message => message.type === "send")).toHaveLength(1);
});

it("reprend une lecture d’historique occupée sans reconnecter ni perdre le brouillon", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  const histories = () => socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "getHistory" && message.threadId === sent.threadId);
  const initial = histories();
  const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "Brouillon pendant récupération" } });
  await act(async () => {
    socket.push({ type: "error", requestType: "getHistory", code: "REQUEST_BUSY",
      threadId: sent.threadId, requestId: initial[initial.length - 1]?.requestId,
      message: "Serveur occupé pour cette lecture" });
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks(4);
  });
  const recovered = histories();
  expect(recovered.length).toBeGreaterThan(initial.length);
  expect(recovered.length - initial.length).toBeLessThanOrEqual(4);
  expect(FakeWS.last()).toBe(socket);
  expect((document.querySelector(".composer textarea") as HTMLTextAreaElement).value).toBe("Brouillon pendant récupération");
  expect(socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "send")).toHaveLength(1);
  await act(async () => {
    socket.push({ type: "history", threadId: sent.threadId,
      requestId: recovered[recovered.length - 1]?.requestId, historyMode: "snapshot", historyHeadSequence: 0,
      historyCursor: { epoch: "busy-recovery", sequence: 0 }, events: [] });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".top-banner")?.textContent ?? "").not.toContain("Serveur occupé pour cette lecture");
});

it("borne les refus répétés et autorise une nouvelle lecture après épuisement", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  const histories = () => socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "getHistory" && message.threadId === sent.threadId);
  const initialCount = histories().length;
  for (let attempt = 0; attempt < 4; attempt++) {
    const requests = histories();
    await act(async () => {
      socket.push({ type: "error", requestType: "getHistory", code: "REQUEST_BUSY",
        threadId: sent.threadId, requestId: requests[requests.length - 1].requestId,
        message: "Lecture refusée répétée" });
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks(4);
    });
  }
  expect(histories()).toHaveLength(initialCount + 3);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); await flushMicrotasks(4); });
  expect(histories()).toHaveLength(initialCount + 3);
  await act(async () => {
    socket.push({ type: "threads", threads: [
      makeThread({ id: sent.threadId, title: "Chat reçu revue" }),
      makeThread({ id: "retry-other", title: "Autre chat reprise explicite" }),
    ] });
    await flushMicrotasks(4);
  });
  for (const title of ["Autre chat reprise explicite", "Chat reçu revue"]) {
    await act(async () => {
      within(document.querySelector(".sidebar") as HTMLElement).getAllByText(title)[0].click();
      await flushMicrotasks(4);
    });
  }
  expect(histories().length).toBeGreaterThan(initialCount + 3);
  expect(socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "send")).toHaveLength(1);
});

it("annule la reprise d’une lecture quand on quitte son chat", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  const histories = () => socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "getHistory" && message.threadId === sent.threadId);
  const initial = histories();
  await act(async () => {
    socket.push({ type: "threads", threads: [
      makeThread({ id: sent.threadId, title: "Chat reçu revue" }),
      makeThread({ id: "cancel-other", title: "Destination reprise annulée" }),
    ] });
    socket.push({ type: "error", requestType: "getHistory", code: "REQUEST_BUSY",
      threadId: sent.threadId, requestId: initial[initial.length - 1]?.requestId,
      message: "Lecture temporairement occupée" });
    await flushMicrotasks(4);
  });
  await act(async () => {
    within(document.querySelector(".sidebar") as HTMLElement).getAllByText("Destination reprise annulée")[0].click();
    await flushMicrotasks(4);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); await flushMicrotasks(4); });
  expect(histories()).toHaveLength(initial.length);
  expect(FakeWS.last()).toBe(socket);
});

it("retrouve un envoi non confirmé après remontage sans le réexécuter", async () => {
  const { sent } = await sendWithoutAcknowledgement();
  cleanup();
  resetSidecarInfo();
  FakeWS.reset();
  renderUi(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(10); });
  const socket = FakeWS.last();
  await act(async () => { socket.open(); await vi.advanceTimersByTimeAsync(100); await flushMicrotasks(10); });
  const messages = socket.sent.map(raw => JSON.parse(raw));
  expect(messages.some(message => message.type === "receiptStatus" && message.clientMessageId === sent.clientMessageId)).toBe(true);
  expect(messages.filter(message => message.type === "send")).toHaveLength(0);
});

it("préserve un événement direct face aux lectures retardées après navigation rapide", async () => {
  const { socket, sent } = await sendWithoutAcknowledgement();
  await act(async () => {
    socket.push({ type: "threads", threads: [
      makeThread({ id: sent.threadId, title: "Chat reçu revue" }),
      makeThread({ id: "race-other", title: "Autre chat course" }),
    ] });
    await flushMicrotasks(4);
  });
  for (const title of ["Autre chat course", "Chat reçu revue"]) {
    await act(async () => {
      within(document.querySelector(".sidebar") as HTMLElement).getAllByText(title)[0].click();
      await flushMicrotasks(4);
    });
  }
  const historyRequests = socket.sent.map(raw => JSON.parse(raw)).filter(message => message.type === "getHistory" && message.threadId === sent.threadId);
  // Coalescing is also valid: answer every actual request, without requiring
  // the implementation to issue redundant reads during navigation.
  expect(historyRequests.length).toBeGreaterThan(0);
  await act(async () => {
    socket.push({ type: "event", threadId: sent.threadId, event: {
      kind: "text", text: "Texte direct arrivé pendant les lectures", meta: {
        schemaVersion: 1, eventId: "live-race-1", threadId: sent.threadId,
        turnId: "live-race-turn", provider: "claude", sequence: 1,
        durable: true, ts: Date.now(), origin: "provider",
      },
    } });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".messages")?.textContent).toContain("Texte direct arrivé pendant les lectures");
  for (const [index, request] of historyRequests.slice(0, 2).entries()) {
    await act(async () => {
      socket.push({ type: "history", threadId: sent.threadId, events: [],
        ...(request.requestId ? { requestId: request.requestId } : {}),
        historyMode: "snapshot", historyHeadSequence: 0,
        historyCursor: { epoch: "race-journal", sequence: 0 },
      });
      await flushMicrotasks(4);
    });
    expect(document.querySelector(".messages")?.textContent, `après réponse historique ${index + 1}`).toContain("Texte direct arrivé pendant les lectures");
  }
});

it("recharge entièrement le chat évincé au lieu de demander seulement les événements nouveaux", async () => {
  renderUi(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(10); });
  const socket = FakeWS.last();
  await act(async () => { socket.open(); await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); });
  const threads = Array.from({ length: 5 }, (_, i) => makeThread({ id: `review-${i}`, title: `Chat revue ${i}` }));
  await act(async () => { socket.push({ type: "threads", threads }); await flushMicrotasks(4); });
  const select = async (title: string) => {
    await act(async () => {
      within(document.querySelector(".sidebar") as HTMLElement).getAllByText(title)[0].click();
      await flushMicrotasks(4);
    });
  };
  for (const thread of threads) {
    await select(thread.title);
    await act(async () => {
      socket.push({ type: "history", threadId: thread.id, historyMode: "snapshot", historyHeadSequence: 1,
        historyCursor: { epoch: `journal-${thread.id}`, sequence: 1, eventId: `text-${thread.id}` },
        events: [{ kind: "text", text: `Réponse conservée ${thread.id}`, meta: {
          schemaVersion: 1, eventId: `text-${thread.id}`, threadId: thread.id,
          turnId: `turn-${thread.id}`, provider: "claude", sequence: 1,
          durable: true, ts: 1, origin: "provider",
        } }],
      });
      await flushMicrotasks(4);
    });
  }
  const before = socket.sent.length;
  await select(threads[0].title);
  const requests = socket.sent.slice(before).map(raw => JSON.parse(raw)).filter(message => message.type === "getHistory" && message.threadId === threads[0].id);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.some(request => !request.historyCursor && !request.cursor)).toBe(true);
});

it("retire les événements supprimés lors du snapshot de repli après un rewind manqué", async () => {
  renderUi(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(10); });
  const socket = FakeWS.last();
  await act(async () => { socket.open(); await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); });
  const thread = makeThread({ id: "review-rewind", title: "Chat rewind revue" });
  await act(async () => { socket.push({ type: "threads", threads: [thread] }); await flushMicrotasks(4); });
  await act(async () => {
    within(document.querySelector(".sidebar") as HTMLElement).getAllByText(thread.title)[0].click();
    await flushMicrotasks(4);
  });
  const event = (sequence: number, text: string) => ({ kind: "text", text, meta: {
    schemaVersion: 1, eventId: `rewind-${sequence}`, threadId: thread.id,
    turnId: `turn-${sequence}`, provider: "claude", sequence, durable: true,
    ts: sequence, origin: "provider",
  } });
  await act(async () => {
    socket.push({ type: "history", threadId: thread.id, historyMode: "snapshot",
      historyEpoch: "runtime", historyRevision: 1, historyHeadSequence: 2,
      historyCursor: { epoch: "journal", sequence: 2, eventId: "rewind-2" },
      events: [event(1, "Réponse conservée après retour"), event(2, "Réponse retirée par le serveur")],
    });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".messages")?.textContent).toContain("Réponse retirée par le serveur");
  await act(async () => {
    // The server rejected the old cursor because its event was truncated.
    socket.push({ type: "history", threadId: thread.id, historyMode: "snapshot",
      historyFallback: "cursor_invalid", historyEpoch: "runtime", historyRevision: 2, historyHeadSequence: 1,
      historyCursor: { epoch: "journal", sequence: 1, eventId: "rewind-1" },
      events: [event(1, "Réponse conservée après retour")],
    });
    await flushMicrotasks(4);
  });
  expect(document.querySelector(".messages")?.textContent).toContain("Réponse conservée après retour");
  expect(document.querySelector(".messages")?.textContent).not.toContain("Réponse retirée par le serveur");
});
