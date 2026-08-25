import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { connectSidecar, sendPrompt } from "./ws";
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
    const initial = sock.sent.map((s) => JSON.parse(s));
    expect(initial.map((m) => m.type)).toEqual(["clientHello", "listThreads", "providerStatus"]);
    expect(initial[0].clientInstanceId).toMatch(/^[0-9a-f-]{20,}$/i);
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
    expect(getSidecarInfo()).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWS.instances).toHaveLength(2);
    expect(FakeWS.instances[1].url).toBe("ws://127.0.0.1:2222");
    FakeWS.instances[1].open();
    await flushMicrotasks();
    expect(reconnected).toHaveLength(1);
    expect(getSidecarInfo()?.port).toBe(2222);
    const firstHello = JSON.parse(FakeWS.instances[0].sent[0]);
    const secondHello = JSON.parse(FakeWS.instances[1].sent[0]);
    expect(secondHello.clientInstanceId).toBe(firstHello.clientInstanceId);
    expect(invokeMock).toHaveBeenCalledTimes(2);
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

// Envoi sur socket non ouverte (2026-08-25). `ws.send()` lève InvalidStateError
// tant que la socket est en CONNECTING : le prompt ne partait jamais, le
// serveur n'en entendait jamais parler, et le spinner — allumé AVANT l'envoi —
// tournait dans le vide. Symptôme vécu : « je commence un chat, ça fait rien ;
// je recommence, ça marche », quel que soit le provider.
describe("sendPrompt", () => {
  const base = {
    threadId: "t1", projectRoot: "/p", provider: "grok", prompt: "allo",
  };
  const fausseSocket = (readyState: number) => {
    const envoyes: string[] = [];
    const socket = {
      readyState,
      send(data: string) {
        if (readyState !== 1) throw new DOMException("still in CONNECTING state", "InvalidStateError");
        envoyes.push(data);
      },
    } as unknown as WebSocket;
    return { socket, envoyes };
  };

  it("refuse d'envoyer tant que la socket n'est pas ouverte", () => {
    for (const readyState of [0, 2, 3]) {
      const { socket, envoyes } = fausseSocket(readyState);
      expect(sendPrompt(socket, base), `readyState=${readyState}`).toBe(false);
      expect(envoyes).toHaveLength(0);
    }
  });

  it("ne dépend pas des statiques du global WebSocket", () => {
    // Les tests de l'app remplacent le global par un faux sans `OPEN`
    // (vi.stubGlobal). Comparer à `WebSocket.OPEN` donnait `undefined` : la
    // garde devenait toujours vraie et PLUS RIEN ne partait — six tests
    // d'orchestration l'ont attrapé, pas ce fichier.
    vi.stubGlobal("WebSocket", class Faux {});
    try {
      const { socket, envoyes } = fausseSocket(1);
      expect(sendPrompt(socket, base)).toBe(true);
      expect(envoyes).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("envoie et le confirme sur une socket ouverte", () => {
    const { socket, envoyes } = fausseSocket(1);
    expect(sendPrompt(socket, base)).toBe(true);
    expect(envoyes).toHaveLength(1);
    expect(JSON.parse(envoyes[0])).toMatchObject({ type: "send", threadId: "t1", prompt: "allo" });
  });
});
