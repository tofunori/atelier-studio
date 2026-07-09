// Faux sidecar déterministe (plan 015) : WebSocket contrôlable à la main pour
// simuler connecté / déconnecté / reconnecté sans réseau ni timers réels.
// Consommé par ws.test.ts et les tests de caractérisation App.
import { vi } from "vitest";

export class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }

  send(d: string) {
    this.sent.push(d);
  }

  close() {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }

  /** Le serveur accepte la connexion. */
  open() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  /** Le sidecar meurt (kill) : close côté client. */
  fireClose() {
    this.readyState = 3;
    this.onclose?.();
  }

  /** Le sidecar pousse un message JSON. */
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** Types des messages envoyés par le client (ordre d'envoi). */
  sentTypes(): string[] {
    return this.sent.map((s) => JSON.parse(s).type);
  }

  static reset() {
    FakeWS.instances = [];
  }
  static last(): FakeWS {
    const ws = FakeWS.instances[FakeWS.instances.length - 1];
    if (!ws) throw new Error("aucune FakeWS créée");
    return ws;
  }
}

/**
 * Installe le faux sidecar : global.WebSocket remplacé, invoke("sidecar_port")
 * mocké (le module @tauri-apps/api/core doit être vi.mock-é par le test —
 * passer ici son vi.mocked(invoke)). Retourne des helpers de scénario.
 */
export function installFakeSidecar(
  invokeMock: { mockResolvedValue: (v: unknown) => unknown; mockResolvedValueOnce: (v: unknown) => unknown },
  { port = 4242, token = "tok-fixture" }: { port?: number; token?: string } = {},
) {
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  FakeWS.reset();
  invokeMock.mockResolvedValue({ port, token });
  return {
    /** Scénario « connecté » : ouvre la dernière socket créée. */
    async connect() {
      await flushMicrotasks();
      FakeWS.last().open();
      await flushMicrotasks();
      return FakeWS.last();
    },
    /** Scénario « déconnecté » : le sidecar meurt. */
    disconnect() {
      FakeWS.last().fireClose();
    },
    /** Scénario « reconnecté » : nouveau port annoncé, la reconnexion aboutit. */
    async reconnect(nextPort = port + 1) {
      invokeMock.mockResolvedValueOnce({ port: nextPort, token });
      FakeWS.last().fireClose();
      await vi.advanceTimersByTimeAsync(1000);
      FakeWS.last().open();
      await flushMicrotasks();
      return FakeWS.last();
    },
  };
}

export async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
