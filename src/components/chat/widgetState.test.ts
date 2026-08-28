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
});
