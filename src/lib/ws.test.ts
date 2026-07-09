import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { connectSidecar } from "./ws";
import { getSidecarInfo, resetSidecarInfo } from "./sidecarInfo";
import { FakeWS, flushMicrotasks } from "../test/fixtures/sidecar";

const invokeMock = vi.mocked(invoke);

describe("connectSidecar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    FakeWS.reset();
    resetSidecarInfo();
    invokeMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publie SidecarInfo à la connexion et envoie les requêtes initiales", async () => {
    invokeMock.mockResolvedValue({ port: 1234, token: "tok" });
    const p = connectSidecar(() => {});
    await flushMicrotasks();
    const sock = FakeWS.instances[0];
    expect(sock.url).toBe("ws://127.0.0.1:1234?token=tok");
    sock.open();
    await p;
    expect(getSidecarInfo()).toEqual({ port: 1234, token: "tok" });
    expect(sock.sent.map((s) => JSON.parse(s).type)).toEqual(["listThreads", "providerStatus"]);
  });

  it("abort ferme la socket et n'autorise aucun retry", async () => {
    invokeMock.mockResolvedValue({ port: 1234 });
    const ctrl = new AbortController();
    const p = connectSidecar(() => {}, undefined, undefined, ctrl.signal);
    await flushMicrotasks();
    const sock = FakeWS.instances[0];
    sock.open();
    await p;

    ctrl.abort();
    expect(sock.closed).toBe(true);
    sock.fireClose();
    await vi.advanceTimersByTimeAsync(20000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("reconnexion après close : nouvelle socket sur le nouveau port, info mise à jour", async () => {
    invokeMock.mockResolvedValueOnce({ port: 1111 }).mockResolvedValueOnce({ port: 2222 });
    const reconnected: FakeWS[] = [];
    const disconnects: number[] = [];
    const p = connectSidecar(
      () => {},
      (next) => reconnected.push(next as unknown as FakeWS),
      () => disconnects.push(1),
    );
    await flushMicrotasks();
    FakeWS.instances[0].open();
    await p;
    expect(getSidecarInfo()?.port).toBe(1111);

    FakeWS.instances[0].fireClose();
    expect(disconnects).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWS.instances).toHaveLength(2);
    expect(FakeWS.instances[1].url).toBe("ws://127.0.0.1:2222");
    FakeWS.instances[1].open();
    await flushMicrotasks();
    expect(reconnected).toHaveLength(1);
    expect(getSidecarInfo()?.port).toBe(2222);
  });

  it("abort pendant l'attente de retry annule le timer : aucune nouvelle socket", async () => {
    invokeMock.mockResolvedValue({ port: 1111 });
    const ctrl = new AbortController();
    const p = connectSidecar(() => {}, undefined, undefined, ctrl.signal);
    await flushMicrotasks();
    FakeWS.instances[0].open();
    await p;

    FakeWS.instances[0].fireClose(); // programme un retry dans 1 s
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(20000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("abort avant l'ouverture rejette sans laisser de socket active", async () => {
    invokeMock.mockResolvedValue({ port: 1111 });
    const ctrl = new AbortController();
    const p = connectSidecar(() => {}, undefined, undefined, ctrl.signal);
    await flushMicrotasks();
    expect(FakeWS.instances).toHaveLength(1);
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(FakeWS.instances[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(FakeWS.instances).toHaveLength(1);
  });
});
