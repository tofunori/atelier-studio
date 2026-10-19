// Audit 2026-10-18, problème 14 : l'écran fatal est réservé à l'échec du
// démarrage ; après le premier rendu, une erreur non rattrapée est
// journalisée et signalée sans vider l'interface.
import { describe, expect, it, vi } from "vitest";
import { createRuntimeErrorGuard, describeRuntimeError, isBenignResizeObserverError } from "./runtimeErrors";

function guard(now = () => 0) {
  const renderFatal = vi.fn();
  const report = vi.fn();
  const log = vi.fn();
  return { renderFatal, report, log, g: createRuntimeErrorGuard({ renderFatal, report, log, now, quietMs: 1000 }) };
}

describe("createRuntimeErrorGuard", () => {
  it("avant le premier rendu, une erreur affiche l'écran fatal", () => {
    const { g, renderFatal, report } = guard();
    g.handle(new Error("boot cassé"));
    expect(renderFatal).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it("après le premier rendu, une promesse rejetée est journalisée et signalée, jamais fatale", () => {
    const { g, renderFatal, report, log } = guard();
    g.markBooted();
    expect(g.booted).toBe(true);
    g.handle(new Error("copie refusée"));
    expect(renderFatal).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("copie refusée");
  });

  it("un même message n'est signalé qu'une fois par fenêtre de temps, mais toujours journalisé", () => {
    let at = 0;
    const { g, report, log } = guard(() => at);
    g.markBooted();
    g.handle("réseau perdu");
    at = 500;
    g.handle("réseau perdu");
    expect(report).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(2);
    at = 1500;
    g.handle("réseau perdu");
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("un signalement qui lève ne relance pas l'erreur", () => {
    const g = createRuntimeErrorGuard({ renderFatal: vi.fn(), report: () => { throw new Error("toast"); }, log: vi.fn() });
    g.markBooted();
    expect(() => g.handle(new Error("x"))).not.toThrow();
  });
});

describe("describeRuntimeError / isBenignResizeObserverError", () => {
  it("décrit erreurs, chaînes et objets", () => {
    expect(describeRuntimeError(new Error("a"))).toBe("a");
    expect(describeRuntimeError("b")).toBe("b");
    expect(describeRuntimeError({ code: 1 })).toBe('{"code":1}');
    expect(describeRuntimeError(undefined)).toBe("undefined");
  });
  it("reconnaît le signal bénin de ResizeObserver", () => {
    expect(isBenignResizeObserverError({ error: null, message: "ResizeObserver loop limit exceeded" })).toBe(true);
    expect(isBenignResizeObserverError({ error: new Error("x"), message: "ResizeObserver loop limit exceeded" })).toBe(false);
  });
});
