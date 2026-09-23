import { describe, expect, it, vi } from "vitest";
import { createLiveTokenStore } from "./liveTokenStore";

describe("liveTokenStore", () => {
  it("notifies only on a real change and clears a finished turn", () => {
    const store = createLiveTokenStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set("t1", 24);
    store.set("t1", 24);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get("t1")).toBe(24);
    expect(store.get("t2")).toBeNull();
    expect(store.get(null)).toBeNull();
    store.set("t1", null);
    expect(store.get("t1")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.set("t1", 48);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
