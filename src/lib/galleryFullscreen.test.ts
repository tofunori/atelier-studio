// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { galleryViewport, installGalleryFullscreen } from "./galleryFullscreen";

describe("gallery fullscreen bridge", () => {
  let cleanup: () => void;
  const onChange = vi.fn();
  const nonce = "gallery-test";
  function frame(port = 18790) {
    const el = document.createElement("iframe");
    el.src = `http://127.0.0.1:${port}/?embedded=atelier`;
    el.dataset.atelierRole = "gallery";
    el.className = "atelier";
    el.showPopover = vi.fn(); el.hidePopover = vi.fn();
    document.body.append(el);
    return el;
  }
  function send(el: HTMLIFrameElement, active = true, overrides = {}) {
    window.dispatchEvent(new MessageEvent("message", { source: el.contentWindow, origin: new URL(el.src).origin,
      data: { type: "atelier-gallery-fullscreen", nonce, active }, ...overrides }));
  }
  beforeEach(() => { onChange.mockClear(); cleanup = installGalleryFullscreen(nonce, onChange); });
  afterEach(() => { cleanup(); document.body.replaceChildren(); });
  it("promotes the exact secondary frame without replacing it, then restores it", () => {
    const first = frame(), second = frame(18791), context = second.contentWindow;
    send(second);
    expect(second.showPopover).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(first.showPopover).not.toHaveBeenCalled();
    expect(second.contentWindow).toBe(context);
    send(second, false);
    expect(second.hidePopover).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(second.hasAttribute("popover")).toBe(false);
    expect(second.className).toBe("atelier");
  });
  it("rejects a wrong nonce, mismatched source origin and non-gallery window", () => {
    const el = frame();
    send(el, true, { data: { type: "atelier-gallery-fullscreen", nonce: "wrong", active: true } });
    send(el, true, { origin: "http://127.0.0.1:18791" });
    send(el, true, { source: window });
    expect(el.showPopover).not.toHaveBeenCalled();
  });
  it("rejects malformed flags and hidden galleries", () => {
    const el = frame();
    send(el, true, { data: { type: "atelier-gallery-fullscreen", nonce, active: "true" } });
    el.hidden = true; send(el);
    expect(el.showPopover).not.toHaveBeenCalled();
  });
  it("switches galleries and leaves on Escape", () => {
    const first = frame(), second = frame(18791);
    send(first); send(second);
    expect(first.hidePopover).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(second.hidePopover).toHaveBeenCalledOnce();
  });
  it("cleans up when a frame reloads or its containing tab hides", async () => {
    const el = frame();
    send(el); el.dispatchEvent(new Event("load"));
    expect(el.hasAttribute("popover")).toBe(false);
    send(el); el.style.display = "none";
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(el.hasAttribute("popover")).toBe(false);
  });
  it("opening a normal viewer never promotes the iframe", () => {
    const el = frame();
    send(el, true, { data: { type: "atelier-gallery-viewport-request", nonce, active: true } });
    expect(el.showPopover).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(el.hasAttribute("popover")).toBe(false);
  });
  it("fits the normal viewer to the visible portion of a scrolled pane", () => {
    const el = frame(), pane = document.createElement("section");
    pane.style.overflowX = "hidden"; pane.style.overflowY = "auto";
    document.body.append(pane); pane.append(el);
    el.getBoundingClientRect = () => ({ left: 500, top: -100, right: 900, bottom: 700 } as DOMRect);
    pane.getBoundingClientRect = () => ({ left: 500, top: 50, right: 900, bottom: 600 } as DOMRect);
    expect(galleryViewport(el)).toEqual({ x: 0, y: 150, width: 400, height: 550 });
  });
  it("restores the frame if entering the top layer fails", () => {
    const el = frame(); el.showPopover = vi.fn(() => { throw new Error("unavailable"); });
    send(el);
    expect(el.hasAttribute("popover")).toBe(false);
    expect(el.className).toBe("atelier");
  });
});
