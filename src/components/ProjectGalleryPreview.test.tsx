import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Preview from "./ProjectGalleryPreview";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("linked gallery previews", () => {
  it("loads text only near the viewport and renders markup as inert text", async () => {
    let intersect!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { intersect = callback; } observe() {} disconnect = disconnect; });
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<img src=x onerror=alert(1)>\n# Document' });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<Preview rel="a #.md" origin="http://localhost:19000" revision="0"/>);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(fetch.mock.calls[0][0]).toContain("path=a%20%23.md");
    expect(container.querySelector("pre")?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });
  it("retries a failed HTML thumbnail on refresh", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container, rerender } = render(<Preview rel="page.html" origin="http://localhost:19000" revision="0"/>);
    const image = container.querySelector("img")!;
    expect(image.src).toContain("/thumb?path=page.html");
    fireEvent.error(image);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Preview rel="page.html" origin="http://localhost:19000" revision="1"/>);
    await waitFor(() => expect(container.querySelector("img")?.src).toContain("rev=1"));
  });
  it("discards stale text responses when the source changes", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ ok: true, text: async () => "new document" }));
    const { container, rerender } = render(<Preview rel="same.md" origin="http://localhost:19000" revision="0"/>);
    rerender(<Preview rel="same.md" origin="http://localhost:19001" revision="0"/>);
    await waitFor(() => expect(container.querySelector("pre")?.textContent).toBe("new document"));
    await act(async () => resolve({ ok: true, text: async () => "old document" }));
    expect(container.querySelector("pre")?.textContent).toBe("new document");
  });
});
