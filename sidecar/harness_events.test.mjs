import { describe, it, expect, vi } from "vitest";
import { createHarnessThread, DURABLE_KINDS } from "./harness_events.mjs";

// Horloge et UUID déterministes : le sérialiseur ne touche jamais Date/crypto
// directement (injection), sinon replay et tests deviennent non reproductibles.
function makeHarness({ journal } = {}) {
  const emitted = [];
  let t = 1000;
  let n = 0;
  const h = createHarnessThread({
    threadId: "th-1",
    provider: "claude",
    emit: (ev) => emitted.push(ev),
    journal: journal ?? { append: vi.fn() },
    now: () => ++t,
    randomUUID: () => `uuid-${++n}`,
  });
  return { h, emitted };
}

const user = (text) => ({ kind: "user", text });

describe("metadata obligatoire", () => {
  it("chaque événement émis porte meta schema v1 complet", async () => {
    const { h, emitted } = makeHarness();
    const turnId = h.startTurn({ messageId: "m1", userEvent: user("salut") });
    await h.emit(turnId, { kind: "text", text: "réponse" });
    await h.terminal(turnId, { kind: "done", ok: true, result: "réponse" });

    expect(emitted.length).toBe(3);
    for (const ev of emitted) {
      expect(ev.meta.schemaVersion).toBe(1);
      expect(ev.meta.eventId).toMatch(/^uuid-/);
      expect(ev.meta.provider).toBe("claude");
      expect(ev.meta.threadId).toBe("th-1");
      expect(ev.meta.turnId).toBe(turnId);
      expect(typeof ev.meta.ts).toBe("number");
      expect(ev.meta.origin).toBe("provider" === ev.kind ? "provider" : ev.meta.origin);
    }
    expect(emitted[0].meta.messageId).toBe("m1");
    expect(emitted[0].meta.origin).toBe("atelier");
    expect(emitted[1].meta.origin).toBe("provider");
  });

  it("sequence est monotone strictement croissante dans le thread, à travers les turns", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, { kind: "text", text: "x" });
    await h.terminal(t1, { kind: "done", ok: true, result: "x" });
    const t2 = h.startTurn({ messageId: "m2", userEvent: user("b") });
    await h.emit(t2, { kind: "text", text: "y" });
    await h.terminal(t2, { kind: "done", ok: true, result: "y" });

    const seqs = emitted.map((e) => e.meta.sequence);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });

  it("durable suit le contrat : deltas éphémères, états finaux durables", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, { kind: "delta", text: "d" });
    await h.emit(t1, { kind: "heartbeat" });
    await h.emit(t1, { kind: "text", text: "final" });
    await h.terminal(t1, { kind: "done", ok: true, result: "final" });

    const byKind = Object.fromEntries(emitted.map((e) => [e.kind, e.meta.durable]));
    expect(byKind.user).toBe(true);
    expect(byKind.delta).toBe(false);
    expect(byKind.heartbeat).toBe(false);
    expect(byKind.text).toBe(true);
    expect(byKind.done).toBe(true);
    expect(DURABLE_KINDS.has("tool_update")).toBe(true);
    expect(DURABLE_KINDS.has("interaction")).toBe(true);
  });

  it("itemId est tiré de event.id ou de nativeMeta", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, { kind: "tool_update", id: "call_1", name: "Bash", output: "" });
    await h.emit(t1, { kind: "text", text: "x" }, { itemId: "item-9", nativeTurnId: "nt-1" });

    expect(emitted[1].meta.itemId).toBe("call_1");
    expect(emitted[2].meta.itemId).toBe("item-9");
    expect(emitted[2].meta.nativeTurnId).toBe("nt-1");
  });
});

describe("terminalité", () => {
  it("un turn possède exactement un terminal — le second est refusé sans être émis", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    const first = await h.terminal(t1, { kind: "done", ok: true, result: "r" });
    const second = await h.terminal(t1, { kind: "error", message: "boom" });

    expect(first).toBe(true);
    expect(second).toBe(false);
    const terminals = emitted.filter((e) => e.kind === "done" || e.kind === "error");
    expect(terminals.length).toBe(1);
  });

  it("deux turns réutilisant le même itemId ne se collisionnent pas : turnId distincts", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, { kind: "tool_update", id: "call_1", name: "Bash", output: "un" });
    await h.terminal(t1, { kind: "done", ok: true, result: "" });
    const t2 = h.startTurn({ messageId: "m2", userEvent: user("b") });
    await h.emit(t2, { kind: "tool_update", id: "call_1", name: "Bash", output: "deux" });
    await h.terminal(t2, { kind: "done", ok: true, result: "" });

    const tools = emitted.filter((e) => e.kind === "tool_update");
    expect(tools.length).toBe(2);
    expect(tools[0].meta.itemId).toBe("call_1");
    expect(tools[1].meta.itemId).toBe("call_1");
    expect(tools[0].meta.turnId).not.toBe(tools[1].meta.turnId);
  });
});

describe("steer et queue", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("steer garde le turnId actif avec son propre messageId", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("run") });
    h.steer({ messageId: "m2", userEvent: user("plutôt comme ça") });
    await flush();

    const users = emitted.filter((e) => e.kind === "user");
    expect(users.length).toBe(2);
    expect(users[1].meta.turnId).toBe(t1);
    expect(users[1].meta.messageId).toBe("m2");
    expect(users[1].meta.messageId).not.toBe(users[0].meta.messageId);
  });

  it("queue réserve un turnId distinct, visible queued immédiatement, activé après terminal", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("run") });
    const t2 = h.queue({ messageId: "m2", userEvent: user("ensuite") });
    await flush();

    expect(t2).not.toBe(t1);
    const users = emitted.filter((e) => e.kind === "user");
    expect(users[1].meta.turnId).toBe(t2);
    expect(h.activeTurnId()).toBe(t1);

    await h.terminal(t1, { kind: "done", ok: true, result: "" });
    h.activateQueued(t2);
    expect(h.activeTurnId()).toBe(t2);
    await h.emit(t2, { kind: "text", text: "suite" });
    const text = emitted.at(-1);
    expect(text.meta.turnId).toBe(t2);
  });

  it("un steer sans turn actif est refusé (retourne null)", () => {
    const { h } = makeHarness();
    expect(h.steer({ messageId: "m1", userEvent: user("x") })).toBeNull();
  });
});

describe("sérialisation des enrichissements async", () => {
  it("un emit asynchrone lent n'est pas dépassé par le terminal qui suit", async () => {
    const { h, emitted } = makeHarness();
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    const slowEdit = new Promise((res) =>
      setTimeout(() => res({ kind: "edit", files: [{ path: "a.txt", add: 1, del: 0 }] }), 30),
    );
    const p1 = h.emit(t1, slowEdit);
    const p2 = h.terminal(t1, { kind: "done", ok: true, result: "" });
    await Promise.all([p1, p2]);

    const kinds = emitted.map((e) => e.kind);
    expect(kinds.indexOf("edit")).toBeLessThan(kinds.indexOf("done"));
    const seqs = emitted.map((e) => e.meta.sequence);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });

  it("le journal reçoit le même objet enrichi, dans le même ordre que le broadcast", async () => {
    const journaled = [];
    const journal = { append: (ev) => journaled.push(ev) };
    const { h, emitted } = makeHarness({ journal });
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, Promise.resolve({ kind: "text", text: "x" }));
    await h.terminal(t1, { kind: "done", ok: true, result: "x" });

    expect(journaled.length).toBe(3);
    journaled.forEach((ev, i) => expect(ev).toBe(emitted[i]));
  });

  it("les éphémères sont broadcastés mais pas journalisés", async () => {
    const journaled = [];
    const journal = { append: (ev) => journaled.push(ev) };
    const { h, emitted } = makeHarness({ journal });
    const t1 = h.startTurn({ messageId: "m1", userEvent: user("a") });
    await h.emit(t1, { kind: "delta", text: "d" });
    await h.terminal(t1, { kind: "done", ok: true, result: "d" });

    expect(emitted.some((e) => e.kind === "delta")).toBe(true);
    expect(journaled.some((e) => e.kind === "delta")).toBe(false);
  });
});
