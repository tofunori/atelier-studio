import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCodexApps } from "./useCodexApps";

class Socket extends EventTarget {
  readyState = 1;
  send = vi.fn();
  reply(data: object) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
  request() { return JSON.parse(this.send.mock.lastCall![0]); }
}
describe("connector catalog requests", () => {
  it("correlates replies, appends pages without duplicates and cleans up on unmount", () => {
    const socket = new Socket();
    const { result, unmount } = renderHook(() => useCodexApps(socket as unknown as WebSocket, "/a"));
    act(() => result.current.load());
    const first = socket.request();
    act(() => socket.reply({ type: "codexApps", requestId: "stale", data: [{ id: "bad" }] }));
    expect(result.current.apps).toEqual([]);
    act(() => socket.reply({ type: "codexApps", requestId: first.requestId, data: [{ id: "a", name: "A" }], nextCursor: "page2" }));
    act(() => result.current.load(result.current.cursor));
    expect(socket.request().cursor).toBe("page2");
    act(() => socket.reply({ type: "codexApps", requestId: socket.request().requestId, data: [{ id: "a", name: "A" }, { id: "b", name: "B" }], nextCursor: null }));
    expect(result.current.apps.map(app => app.id)).toEqual(["a", "b"]);
    act(() => result.current.load());
    unmount();
    expect(() => socket.reply({ type: "codexApps", requestId: socket.request().requestId })).not.toThrow();
  });
  it("retains the retry cursor and clears loading on disconnect", () => {
    const socket = new Socket();
    const { result, unmount } = renderHook(() => useCodexApps(socket as unknown as WebSocket, "/a"));
    act(() => result.current.load());
    act(() => socket.reply({ type: "codexApps", requestId: socket.request().requestId, data: [{ id: "a" }], nextCursor: "next" }));
    act(() => result.current.load("next"));
    act(() => socket.reply({ type: "codexApps", requestId: socket.request().requestId, error: "try again" }));
    expect(result.current.cursor).toBe("next");
    expect(result.current.apps).toHaveLength(1);
    act(() => result.current.load());
    act(() => socket.reply({ type: "codexApps", requestId: socket.request().requestId, error: "refresh failed" }));
    act(() => result.current.retry());
    expect(socket.request().cursor).toBeNull();
    act(() => socket.dispatchEvent(new Event("close")));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeTruthy();
    unmount();
  });
});
