import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSelectionPoll } from "./browserSelectionPoll";

describe("startSelectionPoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("livre chaque échantillon, blancs rognés", async () => {
    const vus: string[] = [];
    let sel = "";
    const stop = startSelectionPoll(async () => sel, (t) => vus.push(t), 800);
    await vi.advanceTimersByTimeAsync(100);
    sel = "  du texte choisi  ";
    await vi.advanceTimersByTimeAsync(900);
    expect(vus).toEqual(["", "du texte choisi"]);
    stop();
  });

  it("après stop : plus aucune sonde ni échantillon", async () => {
    const vus: string[] = [];
    let appels = 0;
    const stop = startSelectionPoll(async () => { appels++; return "x"; }, (t) => vus.push(t), 800);
    await vi.advanceTimersByTimeAsync(100);
    stop();
    const avant = appels;
    await vi.advanceTimersByTimeAsync(3000);
    expect(appels).toBe(avant);
    expect(vus).toEqual(["x"]);
  });

  it("une sonde qui échoue ne livre rien — l'échantillon précédent reste", async () => {
    const vus: string[] = [];
    let casse = false;
    const stop = startSelectionPoll(
      async () => { if (casse) throw new Error("webview partie"); return "sél"; },
      (t) => vus.push(t), 800,
    );
    await vi.advanceTimersByTimeAsync(100);
    casse = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(vus).toEqual(["sél"]);
    stop();
  });
});
