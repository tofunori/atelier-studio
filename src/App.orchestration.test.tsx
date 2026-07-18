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
});

describe("orchestration App — caractérisation", () => {
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
    expect(screen.getByText("Question source")).toBeTruthy();
    expect(screen.getByText("Continue avec Claude")).toBeTruthy();
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
    const chatButton = screen.getByRole("button", { name: t("view.chats") });
    expect(chatButton).toHaveClass("on");
    expect(screen.queryByText(t("highlights.empty"))).toBeNull();
  });

  it("ouvre les automatisations dans le panneau latéral sans remplacer le workspace", async () => {
    await mountApp();

    fireEvent.click(screen.getByRole("button", { name: t("automations.title") }));
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

  it("ouvre les liens PNG/PDF dans la Galerie et les SVG dans leur éditeur", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, {
      type: "files",
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
    expect(openCalls).toHaveLength(2);
    expect(openCalls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: "atelier-gallery-command",
        action: "open",
        mode: "viewer",
        projectRoot: PROJECT_ROOT,
        rels: ["outputs/figures/albedo_annuel.png"],
      }),
      expect.objectContaining({
        type: "atelier-gallery-command",
        action: "open",
        mode: "viewer",
        projectRoot: PROJECT_ROOT,
        rels: ["outputs/figures/albedo_annuel.pdf"],
      }),
    ]);
    const svgFrame = document.querySelector<HTMLIFrameElement>('iframe[src*="svg_viewer.html"]');
    expect(svgFrame).toBeTruthy();
    expect(svgFrame!.src).toContain("file=outputs%2Ffigures%2Falbedo_annuel.svg");
  });

  it("ouvre un événement Edited dans l'IDE avec le snapshot et le mode diff", async () => {
    const { sock } = await mountApp();
    await pushThreads(sock, [THREAD_A]);
    await selectThread(sock, "Fil A — albédo");
    await push(sock, { type: "files", files: ["scripts/plot.py"] });
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
    const rows = [...document.querySelectorAll(".ui-activity-trigger")] as HTMLElement[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      rows.forEach((r) => r.click());
      await flushMicrotasks(2);
    });
    expect(screen.getByText(/premier appel/)).toBeTruthy();
    expect(screen.getByText(/second appel/)).toBeTruthy();
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
});
