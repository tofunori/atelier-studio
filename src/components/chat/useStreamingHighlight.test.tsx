import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { streamingHighlightDelay, useStreamingHighlight } from "./useStreamingHighlight";

afterEach(() => vi.useRealTimers());

it("une arrivée continue n'affame pas la coloration et la fin publie immédiatement", () => {
  vi.useFakeTimers();
  const view = renderHook(({ raw, active }) => useStreamingHighlight(raw, "python", active), {
    initialProps: { raw: "x", active: true },
  });
  for (let i = 1; i <= 8; i++) {
    view.rerender({ raw: "x".repeat(i + 1), active: true });
    act(() => vi.advanceTimersByTime(20));
  }
  expect(view.result.current).toBe("x".repeat(9));
  view.rerender({ raw: "x".repeat(12), active: false });
  expect(view.result.current).toBe("x".repeat(12));
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});

it("un remplacement ou changement de langue invalide le préfixe sans conserver du texte périmé", () => {
  vi.useFakeTimers();
  const view = renderHook(({ raw, lang }) => useStreamingHighlight(raw, lang, true), {
    initialProps: { raw: "ancien", lang: "python" },
  });
  view.rerender({ raw: "nouveau", lang: "rust" });
  expect(view.result.current).toBe("");
  act(() => vi.advanceTimersByTime(160));
  expect(view.result.current).toBe("nouveau");
  view.rerender({ raw: "nouveau suffixe", lang: "rust" });
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("borne la cadence selon la taille du code", () => {
  expect(streamingHighlightDelay(100)).toBe(160);
  expect(streamingHighlightDelay(80000)).toBe(1000);
  expect(streamingHighlightDelay(200000)).toBe(1000);
});
