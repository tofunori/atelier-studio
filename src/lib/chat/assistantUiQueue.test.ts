import { describe, it, expect, vi } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import type { QueuedTurn } from "../chatDraftStore";
import { createAtelierQueueAdapter } from "./assistantUiQueue";

const message = { role: "user", content: [{ type: "text", text: "continue" }], parentId: null, sourceId: null, runConfig: undefined, createdAt: new Date(0), metadata: { custom: {} } } as AppendMessage;
const items = ["a", "b", "c"].map(id => ({ id, prompt: id } as QueuedTurn));

describe("native durable queue bridge", () => {
  it("honors queue preference even when assistant-ui routes an active send through steer", () => {
    const submit = vi.fn();
    createAtelierQueueAdapter({ items, mode: "queue", submit }).steer(message);
    expect(submit).toHaveBeenCalledWith(message, "queue");
    createAtelierQueueAdapter({ items, mode: "steer", submit }).steer(message);
    expect(submit).toHaveBeenLastCalledWith(message, "steer");
  });
  it("translates placement to Atelier's original target index in both directions", () => {
    const reorder = vi.fn();
    const queue = createAtelierQueueAdapter({ items, mode: "queue", submit: vi.fn(), reorder });
    queue.move("a", { insertAfter: "c" });
    expect(reorder).toHaveBeenLastCalledWith("a", "c");
    queue.move("c", { insertBefore: "a" });
    expect(reorder).toHaveBeenLastCalledWith("c", "a");
    queue.move("a", { insertBefore: "c" });
    expect(reorder).toHaveBeenLastCalledWith("a", "b");
  });
  it("routes explicit interruption and removal without replacing queued metadata", () => {
    const steer = vi.fn(), remove = vi.fn();
    const queue = createAtelierQueueAdapter({ items, mode: "queue", submit: vi.fn(), steer, remove });
    queue.move("b", { lane: "steer" });
    queue.remove("a");
    expect(steer).toHaveBeenCalledWith("b");
    expect(remove).toHaveBeenCalledWith("a");
    expect(items.map(item => item.id)).toEqual(["a", "b", "c"]);
  });
});
