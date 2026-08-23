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

  it("deux styles d'abonnement (onmessage et addEventListener) coexistent sans se voler l'événement", () => {
    // Ceci teste la coexistence de deux ABONNÉS DISTINCTS, pas la double
    // livraison à un même abonné (voir le test suivant pour ce risque-là).
    const ws = new FakeWS("ws://test");
    const onMessageCalls: unknown[] = [];
    const listenerCalls: unknown[] = [];

    ws.onmessage = (e) => onMessageCalls.push(JSON.parse(e.data));
    ws.addEventListener("message", (e) => listenerCalls.push(JSON.parse((e as MessageEvent).data)));

    ws.emit({ type: "once" });

    expect(onMessageCalls).toEqual([{ type: "once" }]);
    expect(listenerCalls).toEqual([{ type: "once" }]);
  });

  it("un même onmessage n'est invoqué qu'une seule fois par emit() (pas de double dispatch)", () => {
    // Le vrai risque : un bug d'implémentation qui ferait addEventListener
    // sans removeEventListener préalable, ou qui appellerait le handler
    // manuellement EN PLUS du dispatch — le même chemin serait alors
    // invoqué deux fois pour un seul événement.
    const ws = new FakeWS("ws://test");
    const handler = vi.fn();

    ws.onmessage = handler;
    ws.emit({ type: "once" });

    expect(handler).toHaveBeenCalledTimes(1);
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

  it("réassigner onmessage à la même référence reste idempotent (pas de doublon)", () => {
    const ws = new FakeWS("ws://test");
    const handler = vi.fn();

    ws.onmessage = handler;
    ws.onmessage = handler; // même référence, deux fois de suite
    ws.emit({ type: "ping" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onmessage = null neutralise l'abonnement (motif de src/lib/ws.ts:313, onclose = null à l'abort)", () => {
    const ws = new FakeWS("ws://test");
    const handler = vi.fn();

    ws.onmessage = handler;
    ws.onmessage = null; // équivalent de ws.onclose = null utilisé en production pour désarmer la reconnexion
    ws.emit({ type: "ping" });

    expect(handler).not.toHaveBeenCalled();
    expect(ws.onmessage).toBeNull();
  });
});
