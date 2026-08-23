// FakeWS doit se comporter comme un vrai WebSocket : les sections des réglages
// s'abonnent par addEventListener, pas par onmessage.
import { describe, expect, it, vi } from "vitest";
import { FakeWS } from "./sidecar";

describe("FakeWS", () => {
  it("délivre les messages aux écouteurs addEventListener", () => {
    const ws = new FakeWS("ws://test");
    const vu: unknown[] = [];
    ws.addEventListener("message", (e) => vu.push(JSON.parse((e as MessageEvent).data)));
    ws.emit({ type: "providerStatus", providers: [] });
    expect(vu).toEqual([{ type: "providerStatus", providers: [] }]);
  });

  it("continue de délivrer à onmessage — l'ancien style reste valide", () => {
    const ws = new FakeWS("ws://test");
    const vu: unknown[] = [];
    ws.onmessage = (e) => vu.push(JSON.parse(e.data));
    ws.emit({ type: "ping" });
    expect(vu).toEqual([{ type: "ping" }]);
  });

  it("removeEventListener détache réellement", () => {
    const ws = new FakeWS("ws://test");
    const fn = vi.fn();
    ws.addEventListener("message", fn);
    ws.removeEventListener("message", fn);
    ws.emit({ type: "ping" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("push() reste un alias de emit() pour les tests existants", () => {
    const ws = new FakeWS("ws://test");
    const vu: unknown[] = [];
    ws.addEventListener("message", (e) => vu.push(JSON.parse((e as MessageEvent).data)));
    ws.push({ type: "ping" });
    expect(vu).toEqual([{ type: "ping" }]);
  });

  it("open()/fireClose() déclenchent à la fois onX et addEventListener", () => {
    const ws = new FakeWS("ws://test");
    const events: string[] = [];
    ws.onopen = () => events.push("onopen");
    ws.addEventListener("open", () => events.push("listener:open"));
    ws.onclose = () => events.push("onclose");
    ws.addEventListener("close", () => events.push("listener:close"));

    ws.open();
    ws.fireClose();

    expect(events).toEqual(["onopen", "listener:open", "onclose", "listener:close"]);
  });

  it("n'appelle pas onmessage deux fois quand addEventListener est aussi utilisé (pas de double livraison)", () => {
    const ws = new FakeWS("ws://test");
    const onMessageCalls: unknown[] = [];
    const listenerCalls: unknown[] = [];

    // Deux styles branchés simultanément, chacun avec son propre callback.
    ws.onmessage = (e) => onMessageCalls.push(JSON.parse(e.data));
    ws.addEventListener("message", (e) => listenerCalls.push(JSON.parse((e as MessageEvent).data)));

    ws.emit({ type: "once" });

    // Chaque abonné reçoit l'événement une seule fois — pas de double
    // livraison au sein d'un même chemin d'abonnement.
    expect(onMessageCalls).toEqual([{ type: "once" }]);
    expect(listenerCalls).toEqual([{ type: "once" }]);
  });

  it("réassigner onmessage détache l'ancien gestionnaire (pas d'accumulation)", () => {
    const ws = new FakeWS("ws://test");
    const first = vi.fn();
    const second = vi.fn();

    ws.onmessage = first;
    ws.onmessage = second; // doit remplacer, pas s'ajouter
    ws.emit({ type: "ping" });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
