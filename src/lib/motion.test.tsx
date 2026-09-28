import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { prefersReducedMotion, useReducedMotion } from "./motion";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("updates mounted motion consumers when the system changes and removes the listener", () => {
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = false;
  const remove = vi.spyOn(media, "removeEventListener");
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  const { result, unmount } = renderHook(useReducedMotion);
  expect(result.current).toBe(false);
  act(() => { media.matches = true; media.dispatchEvent(new Event("change")); });
  expect(result.current).toBe(true);
  expect(prefersReducedMotion()).toBe(true);
  unmount();
  expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
});
