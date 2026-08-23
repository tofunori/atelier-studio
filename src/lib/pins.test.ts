import { describe, expect, it } from "vitest";
import { createPin, resolvePins, type Pin, type PinEvent } from "./pins";

// Un fil rejoué n'a PAS la même longueur qu'en direct : le reducer réinsère
// les tool_update et les thinking, et les index glissent. Mesuré sur le fil
// 449eed77 (épingle posée à 116, message retrouvé à 127 après rejeu) — c'est
// le scénario que ces tests reproduisent en miniature.
function ev(kind: string, text: string, eventId?: string): PinEvent {
  return { kind, text, ...(eventId ? { meta: { eventId } } : {}) };
}

const LIVE: PinEvent[] = [
  ev("user", "Vérifie d'où vient le −0,00975", "u1"),
  ev("text", "La découverte : le −0,00975 ne vient pas du run courant", "a1"),
];

// même conversation, rejouée : deux outils s'intercalent avant la réponse
const REPLAY: PinEvent[] = [
  ev("user", "Vérifie d'où vient le −0,00975", "u1"),
  ev("tool_update", ""),
  ev("tool_update", ""),
  ev("text", "La découverte : le −0,00975 ne vient pas du run courant", "a1"),
];

describe("createPin", () => {
  it("photographie l'identifiant durable de l'événement épinglé", () => {
    const pin = createPin(LIVE, 1, "La découverte");
    expect(pin).toEqual({
      index: 1,
      label: "La découverte",
      anchor: "La découverte",
      eventId: "a1",
    });
  });

  it("reste utilisable sur un événement sans identifiant durable", () => {
    const pin = createPin([ev("text", "sans meta")], 0, "sans meta");
    expect(pin.eventId).toBeUndefined();
    expect(pin.index).toBe(0);
  });
});

describe("resolvePins", () => {
  it("recale l'index quand le rejeu a décalé l'événement épinglé", () => {
    const pins: Pin[] = [createPin(LIVE, 1, "La découverte")];
    expect(resolvePins(REPLAY, pins)[0].index).toBe(3);
  });

  it("adopte l'identifiant durable d'une épingle héritée qui n'a que son ancre", () => {
    const legacy: Pin[] = [{ index: 1, label: "La découverte", anchor: "La découverte" }];
    const [resolved] = resolvePins(REPLAY, legacy);
    expect(resolved.index).toBe(3);
    expect(resolved.eventId).toBe("a1");
  });

  it("rend le MÊME tableau quand rien n'a bougé — pas de re-rendu pendant le stream", () => {
    const pins: Pin[] = [createPin(REPLAY, 3, "La découverte")];
    expect(resolvePins(REPLAY, pins)).toBe(pins);
  });

  it("laisse l'épingle intacte tant que le fil n'est pas chargé", () => {
    const pins: Pin[] = [createPin(LIVE, 1, "La découverte")];
    expect(resolvePins([], pins)).toBe(pins);
  });

  // Rejeu NATIF (grok/codex/kimi) : prefer_richer_dialogue côté Rust garde les
  // messages user du journal mais reconstruit les réponses assistant depuis le
  // transcript du CLI, SANS meta. L'eventId photographié en direct n'existe
  // plus — c'était le « les marque-pages ne survivent pas au redémarrage »
  // rapporté 2026-08-23 (épingles posées sur des réponses assistant).
  it("retombe sur l'ancre texte quand le rejeu natif a perdu les eventId", () => {
    const nativeReplay: PinEvent[] = [
      ev("user", "Vérifie d'où vient le −0,00975", "u1"),
      ev("text", "La découverte : le −0,00975 ne vient pas du run courant"),
    ];
    const pins: Pin[] = [createPin(REPLAY, 3, "La découverte")];
    const [resolved] = resolvePins(nativeReplay, pins);
    expect(resolved.index).toBe(1);
    // l'identifiant durable reste photographié pour un futur rejeu journal
    expect(resolved.eventId).toBe("a1");
  });

  it("garde l'épingle dont l'événement a disparu du fil plutôt que de la perdre", () => {
    const pins: Pin[] = [{ index: 1, label: "Disparu", anchor: "Disparu", eventId: "zzz" }];
    expect(resolvePins(REPLAY, pins)).toEqual(pins);
  });

  it("préserve la couleur et le libellé en recalant", () => {
    const pins: Pin[] = [
      { index: 1, label: "La découverte", anchor: "La découverte", eventId: "a1", color: "#7aa2f7" },
    ];
    expect(resolvePins(REPLAY, pins)[0]).toMatchObject({ index: 3, color: "#7aa2f7" });
  });
});
