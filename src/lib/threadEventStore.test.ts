import { describe, expect, it, vi } from "vitest";
import { createThreadEventStore } from "./threadEventStore";
import { mergeHarnessHistory, reduceHarnessEvent } from "./harnessEvents";

describe("thread event transactions", () => {
  it("back-to-back updates and synchronous refs cannot lose a fragment", () => {
    const store = createThreadEventStore();
    for (const text of ["avant de", " lancer", " l’ensemble."]) store.update(p => ({ ...p, a: reduceHarnessEvent(p.a ?? [], { kind: "delta", text }) }));
    expect(store.ref.current.a).toEqual([expect.objectContaining({ text: "avant de lancer l’ensemble." })]);
    expect(store.getSnapshot()).toBe(store.ref.current);
  });
  it("no-op updates preserve snapshot identity and do not notify", () => {
    const store = createThreadEventStore({ a: [] });
    const listener = vi.fn(); store.subscribe("a", listener); store.subscribeAll(listener);
    const snapshot = store.getSnapshot();
    store.update(p => p); store.update(p => ({ ...p }));
    expect(store.getSnapshot()).toBe(snapshot); expect(listener).not.toHaveBeenCalled();
  });
  it("one multi-thread transaction is complete before any subscriber runs", () => {
    const store = createThreadEventStore({ a: [], b: [] });
    const snapshots: unknown[] = [];
    const listener = () => snapshots.push(store.getSnapshot());
    store.subscribe("a", listener); store.subscribe("b", listener); store.subscribeAll(listener);
    const next = { a: [{ kind: "text" as const, text: "a" }], b: [{ kind: "text" as const, text: "b" }] };
    store.update(next); expect(snapshots).toEqual([next]);
  });
  it("history replay and revert use the current snapshot and preserve another thread", () => {
    const store = createThreadEventStore({ a: [{ kind: "user", text: "question" }], b: [{ kind: "text", text: "b" }] });
    const sibling = store.getThread("b");
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "réponse" }) }));
    store.update(p => ({ ...p, a: mergeHarnessHistory(p.a, [{ kind: "user", text: "old" }]) }));
    expect(store.getThread("a")).toHaveLength(2);
    store.update(p => ({ ...p, a: p.a.slice(0, 1) }));
    expect(store.getThread("a")).toEqual([{ kind: "user", text: "question" }]);
    expect(store.getThread("b")).toBe(sibling);
  });
});
