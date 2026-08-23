// Faux sidecar déterministe (plan 015) : WebSocket contrôlable à la main pour
// simuler connecté / déconnecté / reconnecté sans réseau ni timers réels.
// Consommé par ws.test.ts et les tests de caractérisation App.
import { vi } from "vitest";

/**
 * FakeWS étend EventTarget pour se comporter comme un vrai WebSocket :
 * certains consommateurs (src/lib/ws.ts) s'abonnent via les propriétés
 * onmessage/onopen/onclose/onerror, d'autres (sections de réglages,
 * src/components/settings/sections/*) via addEventListener("message", …).
 * Les deux styles doivent fonctionner et rester interopérables sans
 * double livraison au même écouteur.
 *
 * Implémentation : les propriétés onX sont des accesseurs qui, en interne,
 * font addEventListener/removeEventListener sur le même EventTarget que
 * celui utilisé par les consommateurs "addEventListener". Il n'existe donc
 * qu'un seul chemin de livraison (dispatchEvent) — pas de double appel
 * manuel en plus du dispatch.
 */
export class FakeWS extends EventTarget {
  static instances: FakeWS[] = [];
  url: string;
  sent: string[] = [];
  closed = false;
  readyState = 0; // CONNECTING

  #onopen: ((e: Event) => void) | null = null;
  #onerror: ((e: Event) => void) | null = null;
  #onclose: ((e: Event) => void) | null = null;
  #onmessage: ((e: MessageEvent) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWS.instances.push(this);
  }

  get onopen(): ((e: Event) => void) | null {
    return this.#onopen;
  }
  set onopen(fn: ((e: Event) => void) | null) {
    if (this.#onopen) this.removeEventListener("open", this.#onopen);
    this.#onopen = fn;
    if (fn) this.addEventListener("open", fn);
  }

  get onerror(): ((e: Event) => void) | null {
    return this.#onerror;
  }
  set onerror(fn: ((e: Event) => void) | null) {
    if (this.#onerror) this.removeEventListener("error", this.#onerror);
    this.#onerror = fn;
    if (fn) this.addEventListener("error", fn);
  }

  get onclose(): ((e: Event) => void) | null {
    return this.#onclose;
  }
  set onclose(fn: ((e: Event) => void) | null) {
    if (this.#onclose) this.removeEventListener("close", this.#onclose);
    this.#onclose = fn;
    if (fn) this.addEventListener("close", fn);
  }

  get onmessage(): ((e: MessageEvent) => void) | null {
    return this.#onmessage;
  }
  set onmessage(fn: ((e: MessageEvent) => void) | null) {
    if (this.#onmessage) this.removeEventListener("message", this.#onmessage as EventListener);
    this.#onmessage = fn;
    if (fn) this.addEventListener("message", fn as EventListener);
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
    this.dispatchEvent(new Event("open"));
  }

  /** Le sidecar meurt (kill) : close côté client. */
  fireClose() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  /**
   * Le sidecar pousse un message JSON : construit un vrai MessageEvent
   * (data: JSON.stringify(payload)) et le dispatch une seule fois — reçu
   * aussi bien par onmessage que par les écouteurs addEventListener.
   */
  emit(payload: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }

  /** Alias historique de emit(), conservé pour compat avec les tests existants. */
  push(msg: unknown) {
    this.emit(msg);
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
