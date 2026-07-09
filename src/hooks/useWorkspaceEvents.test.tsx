import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useWorkspaceEvents } from "./useWorkspaceEvents";

afterEach(cleanup);

describe("useWorkspaceEvents", () => {
  it("abonne chaque événement de la famille et le dispatch au handler", () => {
    const palette = vi.fn();
    const review = vi.fn();
    renderHook(() => useWorkspaceEvents({ "open-palette": palette, "request-review": review }));

    window.dispatchEvent(new CustomEvent("open-palette"));
    window.dispatchEvent(new CustomEvent("request-review", { detail: { threadId: "t1" } }));

    expect(palette).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
    expect((review.mock.calls[0][0] as CustomEvent).detail.threadId).toBe("t1");
  });

  it("retire TOUS les listeners au démontage (aucune fuite)", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useWorkspaceEvents({ "usage-toggle": handler }));
    window.dispatchEvent(new CustomEvent("usage-toggle"));
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
    window.dispatchEvent(new CustomEvent("usage-toggle"));
    expect(handler).toHaveBeenCalledTimes(1); // plus rien après unmount
  });

  it("dispatch toujours au handler LE PLUS RÉCENT sans re-souscrire", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const v1 = vi.fn();
    const v2 = vi.fn();
    const { rerender } = renderHook(
      ({ h }: { h: () => void }) => useWorkspaceEvents({ "open-palette": h }),
      { initialProps: { h: v1 } },
    );
    const subsAfterMount = addSpy.mock.calls.filter(([n]) => n === "open-palette").length;

    window.dispatchEvent(new CustomEvent("open-palette"));
    rerender({ h: v2 });
    window.dispatchEvent(new CustomEvent("open-palette"));

    expect(v1).toHaveBeenCalledTimes(1);
    expect(v2).toHaveBeenCalledTimes(1);
    // même liste d'événements → une seule souscription, pas de churn par render
    const subsAfterRerender = addSpy.mock.calls.filter(([n]) => n === "open-palette").length;
    expect(subsAfterRerender).toBe(subsAfterMount);
    addSpy.mockRestore();
  });

  it("une seule subscription par nom d'événement", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useWorkspaceEvents({ "quick-ask-open": vi.fn(), "quick-ask-toggle": vi.fn() }));
    expect(addSpy.mock.calls.filter(([n]) => n === "quick-ask-open")).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([n]) => n === "quick-ask-toggle")).toHaveLength(1);
    addSpy.mockRestore();
  });
});
