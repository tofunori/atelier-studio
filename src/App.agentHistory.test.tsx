// Fuite WKWebView 2026-08-31 : un sous-agent figé « working » faisait tourner
// le polling getAgentHistory (2,5 s) pour toujours, et chaque réponse
// rematérialisait + double-sérialisait le transcript enfant COMPLET
// (~35 Mo/min au repos, banc bench_realapp). Ces tests figent les deux
// correctifs : (1) l'intervalle exige un tour parent vivant ; (2) un
// transcript inchangé (empreinte nb:seq:eventId) n'est pas rematérialisé.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, within } from "@testing-library/react";

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

const harnessSpies = vi.hoisted(() => ({ materialize: vi.fn() }));
vi.mock("./lib/harnessEvents", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./lib/harnessEvents")>();
  harnessSpies.materialize.mockImplementation(orig.materializeHarnessHistory);
  return { ...orig, materializeHarnessHistory: harnessSpies.materialize };
});

import App from "./App";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { PROJECT_ROOT, events, makeMeta, makeThread } from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import type { AgentEvent } from "./lib/ws";

const THREAD_A = makeThread({ id: "thread-A", title: "Fil A — albédo" });
const AGENT_ID = "agent-007";

function agentRunAction(ts: number): AgentEvent {
  return {
    kind: "tool_update",
    id: "agent-tool-1",
    name: "agent_run",
    output: "",
    status: "running",
    agentActivity: {
      tool: "agent_run",
      receiverThreadIds: [AGENT_ID],
      agentsStates: { [AGENT_ID]: { status: "inprogress", message: null } },
      prompt: "trace la figure",
    },
    ts,
  } as AgentEvent;
}

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

function sentOfType(sock: FakeWS, type: string) {
  return sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === type);
}

async function openAgentPane(sock: FakeWS) {
  await push(sock, { type: "threads", threads: [THREAD_A] });
  const sidebar = document.querySelector(".sidebar");
  expect(sidebar, "panneau .sidebar attendu").toBeTruthy();
  const row = within(sidebar as HTMLElement).getAllByText(THREAD_A.title)[0];
  await act(async () => {
    row.click();
    await flushMicrotasks(4);
  });
  // tour parent vivant + action agent visible dans le fil
  await push(sock, { type: "event", threadId: THREAD_A.id, event: events.started() });
  await push(sock, { type: "event", threadId: THREAD_A.id, event: agentRunAction(Date.now()) });
  const opener = document.querySelector(".agent-chip");
  expect(opener, "chip d'ouverture du panneau agent (.agent-chip)").toBeTruthy();
  await act(async () => {
    (opener as HTMLButtonElement).click();
    await flushMicrotasks(4);
  });
}

function agentHistoryEvents(n: number): AgentEvent[] {
  const list: AgentEvent[] = [];
  for (let i = 0; i < n; i++) {
    list.push({
      kind: "text",
      text: `réponse ${i}`,
      ts: 1000 + i,
      meta: makeMeta({ eventId: `ah-${i}`, sequence: i, threadId: AGENT_ID, turnId: "tour-agent" }),
    } as AgentEvent);
  }
  return list;
}

describe("polling getAgentHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTestState();
    resetSidecarInfo();
    FakeWS.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    localStorage.setItem("atelier-studio.projects", JSON.stringify([PROJECT_ROOT]));
    // jsdom n'implémente pas getAnimations ; le panneau agent (ScrollArea
    // base-ui) l'appelle dans un timeout
    if (!Element.prototype.getAnimations) {
      Element.prototype.getAnimations = () => [];
    }
    harnessSpies.materialize.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("applique une révision à taille constante sans rematérialiser les doublons", async () => {
    const { sock } = await mountApp();
    await openAgentPane(sock);
    const message = { type: "agentHistory", parentThreadId: THREAD_A.id, agentThreadId: AGENT_ID };
    await push(sock, { ...message, revision: "pending", events: [{ kind: "text", text: "En cours" }] });
    const first = harnessSpies.materialize.mock.calls.length;
    await push(sock, { ...message, revision: "completed", events: [{ kind: "text", text: "Résultat final" }] });
    expect(harnessSpies.materialize.mock.calls.length).toBe(first + 1);
    expect(document.querySelector(".agent-transcript")).toHaveTextContent("Résultat final");
    await push(sock, { ...message, revision: "completed", events: [{ kind: "text", text: "Résultat final" }] });
    expect(harnessSpies.materialize.mock.calls.length).toBe(first + 1);
  });

  it("interroge pendant le tour parent puis s'arrête au done", async () => {
    const { sock } = await mountApp();
    await openAgentPane(sock);
    const afterOpen = sentOfType(sock, "getAgentHistory").length;
    expect(afterOpen).toBeGreaterThan(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
      await flushMicrotasks(4);
    });
    const duringTurn = sentOfType(sock, "getAgentHistory").length;
    expect(duringTurn).toBeGreaterThanOrEqual(afterOpen + 2);
    // fin du tour parent : le sous-agent reste « working » (done manqué) mais
    // le polling doit s'arrêter — c'était la fuite au repos
    await push(sock, { type: "event", threadId: THREAD_A.id, event: events.done() });
    const afterDone = sentOfType(sock, "getAgentHistory").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await flushMicrotasks(4);
    });
    expect(sentOfType(sock, "getAgentHistory").length).toBe(afterDone);
  });

  it("évince au repos un fil peuplé en arrière-plan", async () => {
    const THREAD_B = makeThread({ id: "thread-B", title: "Fil B — manuscrit" });
    const { sock } = await mountApp();
    await push(sock, { type: "threads", threads: [THREAD_A, THREAD_B] });
    const sidebar = document.querySelector(".sidebar") as HTMLElement;
    await act(async () => {
      within(sidebar).getAllByText(THREAD_A.title)[0].click();
      await flushMicrotasks(4);
    });
    // le fil B se peuple par le WS sans jamais devenir actif (tour autonome),
    // et son tour se termine (done) — il devient évincable
    await push(sock, { type: "event", threadId: THREAD_B.id, event: events.user("question autonome") });
    await push(sock, { type: "event", threadId: THREAD_B.id, event: events.done() });
    // au repos : le passage périodique (60 s) doit le sortir de `events`
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
      await flushMicrotasks(4);
    });
    const before = sentOfType(sock, "getHistory").length;
    await act(async () => {
      within(sidebar).getAllByText(THREAD_B.title)[0].click();
      await flushMicrotasks(4);
    });
    // fil évincé → réactivation = rechargement complet par getHistory
    const asked = sentOfType(sock, "getHistory").slice(before);
    expect(asked.some((m) => m.threadId === THREAD_B.id)).toBe(true);
  });

  it("ne rematérialise pas un transcript agent inchangé", async () => {
    const { sock } = await mountApp();
    await openAgentPane(sock);
    const list = agentHistoryEvents(5);
    harnessSpies.materialize.mockClear();
    await push(sock, { type: "agentHistory", parentThreadId: THREAD_A.id, agentThreadId: AGENT_ID, events: list });
    const afterFirst = harnessSpies.materialize.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    // même transcript re-poussé (polling au tick suivant) : aucun retraitement
    await push(sock, { type: "agentHistory", parentThreadId: THREAD_A.id, agentThreadId: AGENT_ID, events: list });
    await push(sock, { type: "agentHistory", parentThreadId: THREAD_A.id, agentThreadId: AGENT_ID, events: list });
    expect(harnessSpies.materialize.mock.calls.length).toBe(afterFirst);
    // le transcript grandit : retraitement attendu
    await push(sock, {
      type: "agentHistory", parentThreadId: THREAD_A.id, agentThreadId: AGENT_ID,
      events: agentHistoryEvents(6),
    });
    expect(harnessSpies.materialize.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});
