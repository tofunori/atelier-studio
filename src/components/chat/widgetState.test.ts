import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWidgetStates, recallWidgetState, rememberWidgetState, WIDGET_STATE_MAX_BYTES,
} from "./widgetState";

beforeEach(() => clearWidgetStates());

describe("mémoire d'état des widgets", () => {
  it("rend ce qu'on lui a confié, par identifiant", () => {
    expect(rememberWidgetState("w_a", { nu: 4 })).toBe(true);
    expect(recallWidgetState("w_a")).toEqual({ nu: 4 });
    expect(recallWidgetState("w_b")).toBeUndefined();
  });

  it("ignore une charge au-delà du plafond au lieu de la tronquer", () => {
    const gros = { blob: "x".repeat(WIDGET_STATE_MAX_BYTES + 100) };
    expect(rememberWidgetState("w_a", gros)).toBe(false);
    expect(recallWidgetState("w_a")).toBeUndefined();
  });

  it("mesure la charge en octets UTF-8, pas en unités UTF-16 (accents)", () => {
    // « é » : 1 unité UTF-16 (.length) mais 2 octets UTF-8. Choisi pour que
    // la sérialisation reste SOUS le plafond en unités UTF-16 tout en le
    // dépassant en octets réels — le seul cas qui distingue les deux mesures.
    const etat = { blob: "é".repeat(2500) };
    const serialized = JSON.stringify(etat);
    const utf16Length = serialized.length;
    const utf8Length = new TextEncoder().encode(serialized).length;
    expect(utf16Length).toBeLessThan(WIDGET_STATE_MAX_BYTES);
    expect(utf8Length).toBeGreaterThan(WIDGET_STATE_MAX_BYTES);

    expect(rememberWidgetState("w_a", etat)).toBe(false);
    expect(recallWidgetState("w_a")).toBeUndefined();
  });
});
