import { describe, expect, it } from "vitest";
import type { Thread } from "./ws";
import { railProjectThreads } from "./railProjectThreads";

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
