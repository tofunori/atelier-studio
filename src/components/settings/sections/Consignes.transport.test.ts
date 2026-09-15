import { afterEach, describe, expect, it, vi } from "vitest";
import { reformulerViaWs } from "./Consignes";

const c = { id: "c1", nom: "Test", description: "", texte: "Original" };
const assist = { provider: "claude", model: "claude-sonnet-5" };
function socket() {
  const send = vi.fn();
  return { ws: { readyState: 1, send } as unknown as WebSocket, send };
}
function reply(requestId: string, texte: string) {
  window.dispatchEvent(new CustomEvent("consigne-reformulee", { detail: { requestId, texte } }));
}
afterEach(() => vi.useRealTimers());
describe("instruction rewrite transport", () => {
  it("ignores a late reply from an expired request", async () => {
    vi.useFakeTimers();
    const { ws, send } = socket();
    const first = reformulerViaWs(ws, "/project", assist, c);
    const oldId = JSON.parse(send.mock.calls[0][0]).requestId;
    await vi.advanceTimersByTimeAsync(65_000);
    expect(await first).toBeNull();
    const receive = vi.fn();
    const second = reformulerViaWs(ws, "/project", assist, c, { mode: "correct", language: "fr" }).then(receive);
    const payload = JSON.parse(send.mock.calls[1][0]);
    expect(payload.rewrite).toEqual({ mode: "correct", language: "fr" });
    reply(oldId, "Wrong");
    await Promise.resolve();
    expect(receive).not.toHaveBeenCalled();
    reply(payload.requestId, "Right");
    await second;
    expect(receive).toHaveBeenCalledWith("Right");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("settles cleanly if sending throws", async () => {
    vi.useFakeTimers();
    const ws = { readyState: 1, send: () => { throw new Error("closed"); } } as unknown as WebSocket;
    expect(await reformulerViaWs(ws, "", assist, c)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
