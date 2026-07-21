import { describe, expect, it } from "vitest";
import { makeThread } from "../test/fixtures";
import {
  conversationContinuity,
  conversationFamilies,
  linkedConversationForProvider,
  linkedConversations,
} from "./threadLinks";

describe("threadLinks", () => {
  const parent = makeThread({ id: "kimi", provider: "kimi", title: "Analyse" });
  const child = makeThread({
    id: "codex",
    provider: "codex",
    title: "Analyse",
    agentLink: {
      parentThreadId: "kimi",
      role: "collaborator",
      access: "read_write",
      createdAt: "2026-07-20T00:00:00.000Z",
      createdBy: "user",
      autoDeliveryLimit: 1,
      autoDeliveryUsed: 0,
      paused: false,
    },
  });

  it("présente la relation dans les deux sens sans perdre l'id enfant", () => {
    expect(linkedConversations([parent, child], "kimi")).toEqual([
      expect.objectContaining({ thread: child, childThreadId: "codex", direction: "child" }),
    ]);
    expect(linkedConversations([parent, child], "codex")).toEqual([
      expect.objectContaining({ thread: parent, childThreadId: "codex", direction: "parent" }),
    ]);
  });

  it("retrouve une continuité existante par provider", () => {
    expect(linkedConversationForProvider([parent, child], "kimi", "codex")?.thread.id)
      .toBe("codex");
    expect(linkedConversationForProvider([parent, child], "codex", "kimi")?.thread.id)
      .toBe("kimi");
  });

  it("projette 1 → {2, 3} et 3 → 4 comme un seul arbre", () => {
    const one = makeThread({ id: "1", title: "Conversation 1" });
    const linked = (id: string, parentThreadId: string, createdAt: string) => makeThread({
      id,
      title: `Conversation ${id}`,
      agentLink: {
        parentThreadId,
        role: "collaborator",
        access: "read_write",
        createdAt,
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      },
    });
    const two = linked("2", "1", "2026-07-20T00:00:01.000Z");
    const three = linked("3", "1", "2026-07-20T00:00:02.000Z");
    const four = linked("4", "3", "2026-07-20T00:00:03.000Z");

    const continuity = conversationContinuity([four, two, one, three], "4");
    expect(continuity?.root.thread.id).toBe("1");
    expect(continuity?.root.children.map((node) => node.thread.id)).toEqual(["2", "3"]);
    expect(continuity?.root.children[1].children[0].thread.id).toBe("4");
    expect([...continuity!.activePathIds]).toEqual(["4", "3", "1"]);
    expect(continuity?.size).toBe(4);
  });

  it("attribue une identité racine identique et stable à chaque famille", () => {
    const rootA = makeThread({ id: "root-a", title: "A", updatedAt: "2026-07-20T12:00:00.000Z" });
    const childA = makeThread({
      id: "child-a",
      title: "A2",
      updatedAt: "2026-07-20T12:00:00.000Z",
      agentLink: {
        parentThreadId: "root-a",
        role: "collaborator",
        access: "read_write",
        createdAt: "2026-07-20T00:00:01.000Z",
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      },
    });
    const rootB = makeThread({ id: "root-b", title: "B" });
    const childB = makeThread({
      id: "child-b",
      title: "B2",
      agentLink: {
        parentThreadId: "root-b",
        role: "collaborator",
        access: "read_write",
        createdAt: "2026-07-20T00:00:02.000Z",
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      },
    });

    const markers = conversationFamilies([childB, rootA, rootB, childA]);
    expect(markers.get("root-a")?.id).toBe("root-a");
    expect(markers.get("child-a")).toBe(markers.get("root-a"));
    expect(markers.get("root-b")?.id).toBe("root-b");
    expect(markers.get("child-b")).toBe(markers.get("root-b"));
  });
});
