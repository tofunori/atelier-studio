import { isTrustedAtelierMessage } from "./ipc";

/** Visible portion of a gallery frame, including clipping by grouped scroll panes. */
export function galleryViewport(frame: HTMLIFrameElement) {
  const rect = frame.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
  for (let node = frame.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
  }
  return { x: Math.max(0, left - rect.left), y: Math.max(0, top - rect.top), width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Promote the existing iframe to the top layer: no reload, no pane clipping. */
export function installGalleryFullscreen(nonce: string, onChange: (active: boolean) => void = () => {}) {
  let active: HTMLIFrameElement | null = null;
  let origin = "";
  const viewers = new Map<HTMLIFrameElement, string>();
  const updateViewports = () => {
    for (const [frame, targetOrigin] of viewers) {
      if (!frame.isConnected) { viewers.delete(frame); continue; }
      frame.contentWindow?.postMessage({ type: "atelier-gallery-viewport", nonce, ...galleryViewport(frame) }, targetOrigin);
    }
  };
  const viewportObserver = new ResizeObserver(updateViewports);
  viewportObserver.observe(document.documentElement);
  const reply = (frame: HTMLIFrameElement, targetOrigin: string, value: boolean) => {
    frame.contentWindow?.postMessage({ type: "atelier-gallery-fullscreen-state", nonce, active: value }, targetOrigin);
  };
  const leave = () => {
    const frame = active;
    if (!frame) return;
    active = null;
    onChange(false);
    observer.disconnect();
    frame.removeEventListener("load", leave);
    try { frame.hidePopover(); } catch { /* A detached frame has already left the top layer. */ }
    frame.removeAttribute("popover");
    frame.classList.remove("atelier-gallery-fullscreen");
    reply(frame, origin, false);
    updateViewports();
  };
  const visible = (frame: HTMLElement) => {
    for (let node: HTMLElement | null = frame; node; node = node.parentElement) {
      if (node.hidden || getComputedStyle(node).display === "none") return false;
    }
    return frame.isConnected;
  };
  const observer = new MutationObserver(() => {
    if (active && !visible(active)) leave();
  });
  const receive = (event: MessageEvent) => {
    if (!isTrustedAtelierMessage(event, nonce) || !["atelier-gallery-fullscreen", "atelier-gallery-viewport-request"].includes(event.data.type)) return;
    const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]')]
      .find(candidate => candidate.contentWindow === event.source && new URL(candidate.src, location.href).origin === event.origin);
    if (!frame) return;
    if (event.data.type === "atelier-gallery-viewport-request") {
      if (event.data.active) {
        viewers.set(frame, event.origin);
        for (let node: HTMLElement | null = frame; node; node = node.parentElement) viewportObserver.observe(node);
      } else {
        viewers.delete(frame);
        if (!viewers.size) { viewportObserver.disconnect(); viewportObserver.observe(document.documentElement); }
      }
      updateViewports();
      return;
    }
    if (event.data.type !== "atelier-gallery-fullscreen") return;
    if (!event.data.active) {
      if (active === frame) leave();
      return;
    }
    if (active === frame) return;
    if (!visible(frame) || typeof frame.showPopover !== "function") {
      reply(frame, event.origin, false);
      return;
    }
    leave();
    active = frame;
    origin = event.origin;
    frame.setAttribute("popover", "manual");
    frame.classList.add("atelier-gallery-fullscreen");
    try {
      frame.showPopover();
      onChange(true);
      frame.focus({ preventScroll: true });
      frame.addEventListener("load", leave);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
      reply(frame, origin, true);
    } catch { leave(); }
  };
  const keydown = (event: KeyboardEvent) => {
    if (active && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); leave(); }
  };
  window.addEventListener("resize", updateViewports);
  window.addEventListener("scroll", updateViewports, true);
  window.addEventListener("message", receive);
  window.addEventListener("keydown", keydown, true);
  return () => {
    leave();
    viewportObserver.disconnect();
    viewers.clear();
    window.removeEventListener("resize", updateViewports);
    window.removeEventListener("scroll", updateViewports, true);
    window.removeEventListener("message", receive);
    window.removeEventListener("keydown", keydown, true);
  };
}
