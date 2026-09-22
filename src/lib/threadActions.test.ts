import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeThread } from "../test/fixtures";
import type { AgentEvent, Thread } from "./ws";
import type { ThreadEvents } from "./threadEventStore";
import { createThreadActions, type ThreadActionsContext } from "./threadActions";

function setup(over: Partial<ThreadActionsContext> = {}, open = true) {
  const sent: any[] = [];
  const socket = { readyState: open ? 1 : 3, send: (raw: string) => sent.push(JSON.parse(raw)) } as unknown as WebSocket;
  let events: ThreadEvents = {};
  let drafts: Thread[] = [];
  const ctx: ThreadActionsContext = {
    ws: { current: socket },
    activeId: "t1",
    activeProject: "/p",
    allThreads: [],
    activeIdRef: { current: "t1" },
    activeProjectRef: { current: "/p" },
    allThreadsRef: { current: [] },
    eventsRef: { current: {} },
    pendingRevert: { current: null },
    pendingResend: { current: null },
    pendingGoal: { current: null },
    pendingPaste: { current: null },
    setActiveId: vi.fn(),
    setEvents: (update) => { events = update(events); },
    setDraftThreads: (update) => { drafts = update(drafts); },
    setInjectText: vi.fn(),
    requestHistory: vi.fn(),
    ...over,
  };
  return { ctx, sent, actions: createThreadActions(ctx), events: () => events, drafts: () => drafts, setDrafts: (d: Thread[]) => { drafts = d; }, setEventsValue: (e: ThreadEvents) => { events = e; } };
}

const user = (text: string, eventId?: string): AgentEvent => ({ kind: "user", text, ...(eventId ? { meta: { eventId } } : {}) } as AgentEvent);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("fils créés côté serveur", () => {
  it("importe une session puis ouvre le nouveau fil avec son historique", () => {
    const { ctx, sent, actions } = setup();
    actions.importSession("claude", "sess-1", "Titre", undefined);
    expect(sent).toEqual([expect.objectContaining({ type: "importSession", provider: "claude", sessionId: "sess-1", title: "Titre", projectRoot: "/p" })]);
    const newId = sent[0].newThreadId;
    expect(ctx.setActiveId).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(ctx.setActiveId).toHaveBeenCalledWith(newId);
    expect(ctx.activeIdRef.current).toBe(newId);
    expect(ctx.requestHistory).toHaveBeenCalledWith(newId);
  });

  it("n'ouvre rien quand la connexion est fermée", () => {
    const { ctx, sent, actions } = setup({}, false);
    actions.promoteQuickAsk("qa-1", "Question");
    vi.advanceTimersByTime(500);
    expect(sent).toEqual([]);
    expect(ctx.setActiveId).not.toHaveBeenCalled();
  });

  it("promeut un Quick Ask dans le projet courant au moment de l'appel", () => {
    const { ctx, sent, actions } = setup();
    ctx.activeProjectRef.current = "/autre";
    actions.promoteQuickAsk("qa-1", "Question");
    expect(sent[0]).toMatchObject({ type: "qaPromote", qaId: "qa-1", title: "Question" });
    expect(JSON.stringify(sent[0])).toContain("/autre");
  });
});

describe("gestion des fils", () => {
  it("supprime localement même hors connexion, et ferme le fil actif", () => {
    const h = setup({}, false);
    h.setDrafts([makeThread({ id: "t1" }), makeThread({ id: "t2" })]);
    h.setEventsValue({ t1: [], t2: [] });
    h.actions.deleteThread("t1");
    expect(h.drafts().map((t) => t.id)).toEqual(["t2"]);
    expect(Object.keys(h.events())).toEqual(["t2"]);
    expect(h.ctx.setActiveId).toHaveBeenCalledWith(null);
    expect(h.sent).toEqual([]);
  });

  it("renomme le brouillon et le fil serveur", () => {
    const h = setup();
    h.setDrafts([makeThread({ id: "t1", title: "Ancien" })]);
    h.actions.renameThread("t1", "Nouveau");
    expect(h.drafts()[0].title).toBe("Nouveau");
    expect(h.sent).toEqual([{ type: "renameThread", threadId: "t1", title: "Nouveau" }]);
  });

  it("délie depuis l'en-tête en visant le côté enfant", () => {
    const parent = makeThread({ id: "t1", provider: "kimi" });
    const child = makeThread({ id: "c1", provider: "codex", agentLink: {
      parentThreadId: "t1", role: "collaborator", access: "read_write", createdAt: "2026-07-20T00:00:00.000Z",
      createdBy: "user", autoDeliveryLimit: 1, autoDeliveryUsed: 0, paused: false,
    } });
    const h = setup({ allThreads: [parent, child] });
    h.actions.unlinkLinkedAgent("c1");
    h.actions.unlinkLinkedAgent("inconnu");
    expect(h.sent).toEqual([{ type: "unlinkThread", threadId: "c1" }]);
  });
});

describe("révisions du fil actif", () => {
  it("revert : mémorise l'état avant l'envoi et rend le texte au composer", () => {
    const events = [user("a", "e0"), user("b", "e1")];
    const h = setup({ eventsRef: { current: { t1: events } } });
    h.actions.revert(1, "b", true);
    expect(h.ctx.pendingRevert.current).toEqual({ threadId: "t1", snapshot: events, index: 1 });
    expect(h.sent[0]).toMatchObject({ type: "revert", scope: "thread", threadId: "t1", text: "b", eventId: "e1" });
    expect(h.ctx.setInjectText).toHaveBeenCalledWith("b");
  });

  it("édition : prépare le renvoi puis demande le revert de l'ancien texte", () => {
    const h = setup({ eventsRef: { current: { t1: [user("vieux", "e0")] } } });
    h.actions.editSend(0, "vieux", "neuf");
    expect(h.ctx.pendingResend.current).toMatchObject({ threadId: "t1", prompt: "neuf", index: 0 });
    expect(h.sent).toEqual([{ type: "revert", scope: "thread", threadId: "t1", text: "vieux", eventId: "e0" }]);
  });

  it("fork : copie l'historique jusqu'au point choisi et ouvre la copie", () => {
    const events = [user("a"), user("b"), user("c")];
    const h = setup({ allThreadsRef: { current: [makeThread({ id: "t1" })] }, eventsRef: { current: { t1: events } } });
    h.actions.fork(1);
    const newId = h.ctx.activeIdRef.current!;
    expect(newId).not.toBe("t1");
    expect(h.events()[newId]).toEqual(events.slice(0, 2));
    expect(h.sent[0]).toMatchObject({ newThreadId: newId });
    expect(h.ctx.setActiveId).toHaveBeenCalledWith(newId);
  });

  it("stop : interrompt et force le rechargement de l'historique", () => {
    const h = setup();
    h.actions.stop();
    expect(h.sent).toEqual([{ type: "interrupt", threadId: "t1" }]);
    expect(h.ctx.requestHistory).toHaveBeenCalledWith("t1", undefined, { force: true });
  });

  it("image collée : garde l'aperçu en attente de la sauvegarde", () => {
    const h = setup();
    h.actions.pasteImage("data:image/png;base64,AA");
    expect(h.ctx.pendingPaste.current).toBe("data:image/png;base64,AA");
    expect(h.sent).toEqual([{ type: "saveImage", dataURL: "data:image/png;base64,AA" }]);
  });
});

describe("objectif Codex", () => {
  it("sans session : mémorise l'objectif pour le premier message", () => {
    const h = setup({ allThreadsRef: { current: [makeThread({ id: "t1", provider: "codex", sessionId: undefined })] } });
    h.actions.goal("set", "Réduire l'erreur");
    expect(h.ctx.pendingGoal.current).toEqual({ threadId: "t1", objective: "Réduire l'erreur" });
    expect(h.sent).toEqual([]);
  });

  it("avec session : pose, met en pause ou efface l'objectif", () => {
    const h = setup({ allThreadsRef: { current: [makeThread({ id: "t1", provider: "codex", sessionId: "s" })] } });
    h.ctx.pendingGoal.current = { threadId: "t1", objective: "x" };
    h.actions.goal("set", "Obj", "paused");
    h.actions.goal("clear");
    expect(h.sent).toEqual([
      { type: "goalSet", threadId: "t1", objective: "Obj", status: "paused" },
      { type: "goalClear", threadId: "t1" },
    ]);
    expect(h.ctx.pendingGoal.current).toBeNull();
  });
});
