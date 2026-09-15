import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "sidecar_port") return { port: 4242, token: "tok-fixture" };
    if (cmd === "start_atelier") return "http://127.0.0.1:18790/";
    if (cmd === "discussion_workspace") return `/Users/test/Library/Application Support/atelier-studio/discussions/${args.threadId}`;
    if (cmd === "discussion_ensure_document") return "brouillon.md";
    if (cmd === "discussion_create_document") return "brouillon.md";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), confirm: vi.fn(async () => true) }));
vi.mock("./lib/notify", () => ({ init: vi.fn(async () => {}), notifyRunDone: vi.fn(async () => {}), notifyReview: vi.fn(async () => {}) }));
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { t } from "./lib/i18n";
import { renderUi, resetTestState } from "./test/render";
import { FakeWS, flushMicrotasks } from "./test/fixtures/sidecar";
import { resetSidecarInfo } from "./lib/sidecarInfo";
import { isDiscussionRoot } from "./lib/discussions";
async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(16); await flushMicrotasks(10); }); }
beforeEach(() => {
  vi.useFakeTimers(); resetTestState(); resetSidecarInfo(); FakeWS.reset();
  vi.mocked(invoke).mockClear();
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  localStorage.setItem("atelier-studio.projects", JSON.stringify(["/science"]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("creates isolated discussions, preserves context through settings hydration and sends in their own workspace", async () => {
  renderUi(<App />); await settle(); const sock = FakeWS.last();
  await act(async () => { sock.open(); }); await settle();
  fireEvent.click(screen.getByRole("button", { name: t("discussions.title") }));
  await settle();
  await act(async () => { sock.push({ type: "settingsFile", settings: { projects: ["/science"], additionalDirectories: "/science" } }); });
  await settle();
  expect(document.querySelector(".rail-proj.on")).toBeNull();
  const create = async () => {
    fireEvent.click(within(document.querySelector(".sidebar") as HTMLElement).getByRole("button", { name: t("action.new-chat") }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Codex/i }));
    await settle();
    return sock.sent.map(s => JSON.parse(s)).filter(m => m.type === "upsertThread").slice(-1)[0].thread;
  };
  const first = await create();
  expect(isDiscussionRoot(first.projectRoot)).toBe(true);
  await act(async () => { sock.push({ type: "files", projectRoot: first.projectRoot, files: ["secret-premier.md"] }); });
  await settle();
  const second = await create();
  expect(screen.queryByRole("button", { name: "secret-premier.md" })).toBeNull();
  expect(second.projectRoot).not.toBe(first.projectRoot);
  expect(JSON.parse(localStorage.getItem("atelier-studio.projects")!)).toEqual(["/science"]);
  const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "Écris une lettre" } });
  fireEvent.submit(textarea.closest("form")!); await settle();
  const send = sock.sent.map(s => JSON.parse(s)).filter(m => m.type === "send").slice(-1)[0];
  expect(send.projectRoot).toBe(second.projectRoot);
  expect(send.additionalDirectories ?? []).toEqual([]);
  expect(document.querySelector(".discussion-documents")).toBeNull();
  expect(document.querySelector(".composer textarea")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); await flushMicrotasks(10); });
  await settle();
  const pinned = JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");
  expect(pinned[second.projectRoot]?.[0]?.url).toContain("md_studio.html");
  expect(decodeURIComponent(pinned[second.projectRoot][0].url)).toContain(second.projectRoot + "/brouillon.md");
});

it("migrates an idle legacy free chat without losing its native session", async () => {
  renderUi(<App />); await settle(); const sock = FakeWS.last();
  await act(async () => { sock.open(); }); await settle();
  const legacy = {
    id: "legacy-free-chat",
    projectRoot: "",
    title: "Ancienne discussion",
    provider: "codex",
    sessionId: "native-session-42",
    status: "idle",
    updatedAt: new Date().toISOString(),
  };
  await act(async () => { sock.push({ type: "threads", threads: [legacy] }); });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: t("discussions.title") }));
  await settle();
  const upserts = sock.sent.map(s => JSON.parse(s)).filter(m => m.type === "upsertThread");
  const migrated = upserts.find((message) => message.thread.id === legacy.id && isDiscussionRoot(message.thread.projectRoot));
  expect(migrated?.thread.sessionId).toBe(legacy.sessionId);
  expect(migrated?.thread.discussionWorkspaceId).toBeTruthy();
  const textarea = document.querySelector(".composer textarea") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "Continue cette discussion" } });
  fireEvent.submit(textarea.closest("form")!); await settle();
  const send = sock.sent.map(s => JSON.parse(s)).filter(m => m.type === "send").slice(-1)[0];
  expect(send.projectRoot).toBe(migrated?.thread.projectRoot);
  expect(send.discussionDocument).toBe("brouillon.md");
  expect(send.additionalDirectories ?? []).toEqual([]);
  expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "discussion_workspace")).toBe(true);
});

it("waits for a running legacy provider before assigning a managed workspace", async () => {
  renderUi(<App />); await settle(); const sock = FakeWS.last();
  await act(async () => { sock.open(); }); await settle();
  const legacy = {
    id: "legacy-running-chat",
    projectRoot: "",
    title: "En cours",
    provider: "codex",
    sessionId: "native-session-running",
    status: "running",
    updatedAt: new Date().toISOString(),
  };
  await act(async () => { sock.push({ type: "threads", threads: [legacy] }); });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: t("discussions.title") }));
  await settle();
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "discussion_workspace")).toHaveLength(0);
  await act(async () => { sock.push({ type: "threads", threads: [{ ...legacy, status: "idle" }] }); });
  await settle();
  expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "discussion_workspace")).toHaveLength(1);
});
