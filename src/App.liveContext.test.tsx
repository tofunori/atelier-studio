// Contexte vivant (2026-11-08) côté App : le contexte publié par AtelierPane
// part avec le message (`liveContext` du send, jamais dans `prompt`), laisse
// une trace sur la bulle ; l'œil du compositeur (2026-11-09) le coupe pour de
// bon, jusqu'au prochain clic ; un tour mis en file garde le contexte capturé
// à la mise en file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

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
}));

import App from "./App";
import { t } from "./lib/i18n";
import { LIVE_CONTEXT_EVENT, LIVE_CONTEXT_ON_KEY } from "./lib/liveContext";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { PROJECT_ROOT, makeThread } from "./test/fixtures";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import { resetKbSourcesForTests } from "./lib/kbSources";

const THREAD_A = makeThread({ id: "thread-A", title: "Fil A — albédo" });
const TEX = {
  path: `${PROJECT_ROOT}/chap/chapitre1.tex`, name: "chapitre1.tex", kind: "tex", line: 23,
  comments: [{ line: 24, text: "source ?" }],
};

async function mountOnThread() {
  renderUi(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(10); });
  const sock = FakeWS.last();
  await act(async () => { sock.open(); await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); });
  await act(async () => { sock.push({ type: "threads", threads: [THREAD_A] }); await flushMicrotasks(4); });
  const sidebar = document.querySelector(".sidebar") as HTMLElement;
  await act(async () => { within(sidebar).getAllByText("Fil A — albédo")[0].click(); await flushMicrotasks(4); });
  return sock;
}

async function look(context: unknown) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(LIVE_CONTEXT_EVENT, { detail: { context } }));
    await flushMicrotasks(2);
  });
}

async function send(text: string) {
  const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: "Enter" });
  await act(async () => { await flushMicrotasks(4); });
}

const last = <T,>(list: T[]) => list[list.length - 1];
const sends = (sock: FakeWS) => sock.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "send");
const eye = () => document.querySelector<HTMLButtonElement>(".composer .live-eye")!;
async function finish(sock: FakeWS) {
  await act(async () => {
    sock.push({ type: "event", threadId: "thread-A", event: { kind: "done", ok: true, result: "" } });
    await flushMicrotasks(6);
  });
}
async function toggleEye() {
  // le panneau reste ouvert après un basculement : on ne l'ouvre que s'il est fermé
  if (!screen.queryByRole("switch")) {
    await act(async () => { fireEvent.click(eye()); await vi.advanceTimersByTimeAsync(50); await flushMicrotasks(4); });
  }
  await act(async () => { fireEvent.click(screen.getByRole("switch", { name: t("live-context.share") })); await flushMicrotasks(4); });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTestState();
  resetSidecarInfo();
  FakeWS.reset();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify([PROJECT_ROOT]));
  localStorage.removeItem(LIVE_CONTEXT_ON_KEY);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetKbSourcesForTests();
});

describe("App — contexte vivant", () => {
  it("part avec le message, hors du prompt, et laisse une trace sur la bulle", async () => {
    const sock = await mountOnThread();
    // la sélection ne part jamais d'elle-même (Thierry, 2026-11-08), même si un cadre l'envoie
    await look({ ...TEX, lineFrom: 23, lineTo: 25, selection: "Bare-ice albedo\ndecreased by 0.04" });
    expect(eye()).toHaveAttribute("data-state", "on");
    expect(eye()).toHaveAccessibleName(t("live-context.sees", { name: "chapitre1.tex", where: t("live-context.line", { line: 23 }) }));
    // plus d'étiquette au-dessus du champ
    expect(document.querySelector(".composer .context-pills")).toBeNull();

    await send("Ce passage est-il cohérent ?");
    const sent = last(sends(sock));
    expect(sent.prompt).toBe("Ce passage est-il cohérent ?");
    expect(sent.liveContext).toEqual(TEX);
    expect(sent.displayEvent.liveContext).toEqual({
      path: TEX.path, name: "chapitre1.tex", line: 23, comments: 1,
    });
    // trace optimiste, avant l'écho serveur
    expect(document.querySelector(".messages .user-live-context")).toHaveTextContent(`chapitre1.tex · ${t("live-context.line", { line: 23 })}`);
  });

  it("l'œil coupé : plus rien ne part, même d'un message à l'autre, et ça se retient", async () => {
    const sock = await mountOnThread();
    await look(TEX);
    await toggleEye();
    expect(eye()).toHaveAttribute("data-state", "off");
    expect(localStorage.getItem(LIVE_CONTEXT_ON_KEY)).toBe("0");

    await send("sans contexte");
    expect(last(sends(sock)).liveContext).toBeUndefined();
    expect(last(sends(sock)).displayEvent.liveContext).toBeUndefined();
    await finish(sock);
    // une autre ligne, un autre envoi : toujours coupé
    await look({ ...TEX, line: 30 });
    expect(eye()).toHaveAttribute("data-state", "off");
    await send("toujours sans");
    expect(last(sends(sock)).prompt).toBe("toujours sans");
    expect(last(sends(sock)).liveContext).toBeUndefined();
    await finish(sock);

    await toggleEye();
    expect(eye()).toHaveAttribute("data-state", "on");
    await send("avec");
    expect(last(sends(sock)).prompt).toBe("avec");
    expect(last(sends(sock)).liveContext).toEqual({ ...TEX, line: 30 });
  });

  it("coupé avant le démarrage : l'œil s'ouvre coupé", async () => {
    localStorage.setItem(LIVE_CONTEXT_ON_KEY, "0");
    const sock = await mountOnThread();
    await look(TEX);
    expect(eye()).toHaveAttribute("data-state", "off");
    await send("question");
    expect(last(sends(sock)).liveContext).toBeUndefined();
  });

  it("rien quand l'atelier ne montre aucun document", async () => {
    const sock = await mountOnThread();
    await look(TEX);
    await look(null);
    expect(eye()).toHaveAttribute("data-state", "idle");
    await send("question");
    expect(last(sends(sock)).liveContext).toBeUndefined();
  });

  it("un tour mis en file garde le contexte capturé à la mise en file", async () => {
    const sock = await mountOnThread();
    await act(async () => { sock.push({ type: "event", threadId: "thread-A", event: { kind: "started" } }); await flushMicrotasks(4); });
    await look(TEX);
    const before = sends(sock).length;
    await send("et ensuite ?");
    expect(sends(sock)).toHaveLength(before);
    await look({ path: `${PROJECT_ROOT}/autre.pdf`, name: "autre.pdf", kind: "pdf", page: 7, pageCount: 14 });
    await act(async () => {
      sock.push({ type: "event", threadId: "thread-A", event: { kind: "done", ok: true, result: "" } });
      await flushMicrotasks(6);
    });
    const queued = last(sends(sock));
    expect(queued.prompt).toBe("et ensuite ?");
    expect(queued.mode).toBe("queue");
    expect(queued.liveContext).toEqual(TEX);
    expect(queued.displayEvent.liveContext).toMatchObject({ name: "chapitre1.tex", line: 23 });
  });
});
