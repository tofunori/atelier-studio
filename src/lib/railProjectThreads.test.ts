import { describe, expect, it } from "vitest";
import type { Thread } from "./ws";
import { railChildThreads, railProjectThreads, rowSignal } from "./railProjectThreads";

const th = (id: string, root: string, updatedAt: string, extra: Partial<Thread> = {}): Thread => ({
  id, projectRoot: root, title: id, provider: "claude", sessionId: null, status: "idle", updatedAt, ...extra,
});
const child = (id: string, parent: string, updatedAt: string): Thread => th(id, "/p", updatedAt, {
  agentLink: { parentThreadId: parent, role: "thread", access: "read_write", createdAt: updatedAt,
    createdBy: "user", autoDeliveryLimit: 0, autoDeliveryUsed: 0, paused: false },
  delegue: { fil: true },
});

describe("railProjectThreads", () => {
  const threads = [
    th("a", "/p", "2026-11-12T10:00:00Z"),
    th("b", "/p", "2026-11-12T12:00:00Z"),
    th("c", "/p", "2026-11-12T11:00:00Z"),
    th("d", "/p", "2026-11-11T09:00:00Z"),
    th("e", "/p", "2026-11-10T09:00:00Z"),
    th("x", "/autre", "2026-11-12T13:00:00Z"),
  ];

  it("garde les fils du projet, les plus récents d'abord, dans la limite", () => {
    expect(railProjectThreads(threads, "/p").map(r => r.thread.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("ne répète pas les épinglés", () => {
    expect(railProjectThreads(threads, "/p", { pinned: new Set(["b"]) }).map(r => r.thread.id))
      .toEqual(["c", "a", "d", "e"]);
  });

  it("garde la conversation ouverte visible, à la dernière place", () => {
    expect(railProjectThreads(threads, "/p", { activeId: "e" }).map(r => r.thread.id))
      .toEqual(["b", "c", "a", "e"]);
  });

  it("range les fils délégués sous leur parent, qui prend leur activité", () => {
    const rows = railProjectThreads([...threads, child("k", "e", "2026-11-12T14:00:00Z")], "/p");
    expect(rows.map(r => r.thread.id)).toEqual(["e", "b", "c", "a"]);
    expect(rows[0].children.map(t => t.id)).toEqual(["k"]);
  });

  it("un fil délégué ouvert se retrouve par son parent", () => {
    const rows = railProjectThreads([...threads, child("k", "e", "2026-11-01T00:00:00Z")], "/p", { activeId: "k" });
    expect(rows.map(r => r.thread.id)).toEqual(["b", "c", "a", "e"]);
  });
});

describe("railChildThreads (sous-fils, 2026-11-15)", () => {
  const parent = th("p", "/p", "2026-11-12T10:00:00Z");
  const done = (id: string, at: string) => ({ ...child(id, "p", at), sessionId: "s", rapportA: "fini" });
  const row = (children: Thread[]) => ({ thread: parent, children, at: 0 });

  it("cache une famille terminée et fermée, la montre si elle est ouverte", () => {
    const r = row([done("k1", "2026-11-12T10:01:00Z")]);
    expect(railChildThreads(r).shown).toEqual([]);
    expect(railChildThreads(r, { activeId: "p" }).shown.map(c => [c.thread.id, c.state])).toEqual([["k1", "done"]]);
  });

  it("montre la famille dès qu'un sous-fil travaille, attend ou est à relire", () => {
    const r = row([done("k1", "2026-11-12T10:01:00Z"), child("k2", "p", "2026-11-12T10:02:00Z")]);
    const { shown } = railChildThreads(r, { signals: { k2: "run" } });
    expect(shown.map(c => [c.thread.id, c.state])).toEqual([["k1", "done"], ["k2", "running"]]);
    expect(railChildThreads(r, { signals: { k1: "unread" } }).shown[0].state).toBe("review");
    expect(railChildThreads(r, { signals: { k2: "fail" } }).shown[1].state).toBe("fail");
  });

  it("au plus trois : l'ouvert, puis les non terminés, dans l'ordre de lancement", () => {
    const r = row([
      done("k1", "2026-11-12T10:01:00Z"), done("k2", "2026-11-12T10:02:00Z"),
      child("k3", "p", "2026-11-12T10:03:00Z"), done("k4", "2026-11-12T10:04:00Z"),
      child("k5", "p", "2026-11-12T10:05:00Z"),
    ]);
    const { shown, hidden } = railChildThreads(r, { activeId: "k4", signals: { k3: "run", k5: "wait" } });
    expect(shown.map(c => c.thread.id)).toEqual(["k3", "k4", "k5"]);
    expect(hidden).toBe(2);
  });

  it("le parent ne garde que le signal des sous-fils sans ligne", () => {
    const r = row([child("k1", "p", "2026-11-12T10:01:00Z"), child("k2", "p", "2026-11-12T10:02:00Z")]);
    expect(rowSignal(r, { k1: "run", k2: "wait" }, new Set(["k1", "k2"]))).toBeNull();
    expect(rowSignal(r, { k1: "run", k2: "wait" }, new Set(["k1"]))).toBe("wait");
    expect(rowSignal(r, { k1: "run" })).toBe("run");
  });
});
