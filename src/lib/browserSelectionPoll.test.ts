import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSelectionPoll } from "./browserSelectionPoll";

describe("startSelectionPoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("signale les transitions seulement — jamais un tick répété", async () => {
    const états: boolean[] = [];
    let sel = "";
    const stop = startSelectionPoll(async () => sel, (h) => états.push(h), 800);
    await vi.advanceTimersByTimeAsync(1700); // 2 ticks vides après l'initial
    expect(états).toEqual([false]);
    sel = "du texte choisi";
    await vi.advanceTimersByTimeAsync(1700);
    expect(états).toEqual([false, true]);
    sel = "   ";
    await vi.advanceTimersByTimeAsync(900);
    expect(états).toEqual([false, true, false]);
    stop();
  });

  it("après stop : plus aucune sonde ni signal", async () => {
    const états: boolean[] = [];
    let appels = 0;
    const stop = startSelectionPoll(async () => { appels++; return "x"; }, (h) => états.push(h), 800);
    await vi.advanceTimersByTimeAsync(100);
    stop();
    const avant = appels;
    await vi.advanceTimersByTimeAsync(3000);
    expect(appels).toBe(avant);
    expect(états).toEqual([true]);
  });

  it("une sonde qui échoue laisse l'état en paix", async () => {
    const états: boolean[] = [];
    let casse = false;
    const stop = startSelectionPoll(
      async () => { if (casse) throw new Error("webview partie"); return "sél"; },
      (h) => états.push(h), 800,
    );
    await vi.advanceTimersByTimeAsync(100);
    casse = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(états).toEqual([true]);
    stop();
  });
});
