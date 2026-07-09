import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useSidecarConnection, type SidecarStatus } from "./useSidecarConnection";
import { FakeWS, flushMicrotasks } from "../test/fixtures/sidecar";
import { resetSidecarInfo } from "../lib/sidecarInfo";

const invokeMock = vi.mocked(invoke);

describe("useSidecarConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    FakeWS.reset();
    resetSidecarInfo();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ port: 4242, token: "tok" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mountHook() {
    const statuses: SidecarStatus[] = [];
    const utils = renderHook(() =>
      useSidecarConnection(() => {}, (s) => statuses.push(s)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks(8);
    });
    await act(async () => { FakeWS.last().open(); await flushMicrotasks(8); });
    return { ...utils, statuses };
  }

  it("se connecte, publie wsReady et notifie 'connected'", async () => {
    const { result, statuses } = await mountHook();
    expect(result.current.wsReady).toBe(true);
    expect(result.current.mock).toBe(false);
    expect(result.current.wsRef.current).toBe(FakeWS.last() as unknown as WebSocket);
    expect(statuses).toEqual(["connected"]);
  });

  it("montage/démontage ×2 : chaque cycle ferme sa socket, aucun retry orphelin", async () => {
    const first = await mountHook();
    const sock1 = FakeWS.last();
    first.unmount();
    expect(sock1.closed).toBe(true);

    const second = await mountHook();
    const sock2 = FakeWS.last();
    expect(sock2).not.toBe(sock1);
    second.unmount();
    expect(sock2.closed).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(FakeWS.instances).toHaveLength(2); // aucune socket née après démontage
  });

  it("coupure → 'disconnected', reconnexion → 'reconnected' avec nouvelle socket adoptée", async () => {
    const { result, statuses } = await mountHook();
    const sock1 = FakeWS.last();

    await act(async () => { sock1.fireClose(); await flushMicrotasks(4); });
    expect(result.current.wsReady).toBe(false);
    expect(statuses).toEqual(["connected", "disconnected"]);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); await flushMicrotasks(8); });
    const sock2 = FakeWS.last();
    expect(sock2).not.toBe(sock1);
    await act(async () => { sock2.open(); await flushMicrotasks(8); });

    expect(statuses).toEqual(["connected", "disconnected", "reconnected"]);
    expect(result.current.wsReady).toBe(true);
    expect(result.current.wsRef.current).toBe(sock2 as unknown as WebSocket);
  });

  it("échec de connexion → mock + 'failed', retry 3 s, puis succès", async () => {
    invokeMock.mockRejectedValueOnce(new Error("sidecar absent"));
    const statuses: SidecarStatus[] = [];
    const { result } = renderHook(() =>
      useSidecarConnection(() => {}, (s) => statuses.push(s)));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks(8);
    });
    expect(result.current.mock).toBe(true);
    expect(statuses).toEqual(["failed"]);

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); await flushMicrotasks(8); });
    await act(async () => { FakeWS.last().open(); await flushMicrotasks(8); });
    expect(result.current.mock).toBe(false);
    expect(statuses).toEqual(["failed", "connected"]);
  });

  it("les messages vont toujours au handler LE PLUS RÉCENT (pas de closure périmée)", async () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useSidecarConnection((m) => seen.push(`${tag}:${(m as { type: string }).type}`)),
      { initialProps: { tag: "v1" } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); await flushMicrotasks(8); });
    await act(async () => { FakeWS.last().open(); await flushMicrotasks(8); });

    await act(async () => { FakeWS.last().push({ type: "ping" }); });
    rerender({ tag: "v2" });
    await act(async () => { FakeWS.last().push({ type: "ping" }); });

    expect(seen).toEqual(["v1:ping", "v2:ping"]);
  });
});
