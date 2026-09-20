import { useLayoutEffect, type RefObject } from "react";

/** Measure viewport coordinates so sidebars and unequal panels share one axis. */
export function useToolbarDividerAlignment(ref: RefObject<HTMLDivElement | null>, split: boolean) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const tools = bar.querySelector<HTMLElement>(".topbar-center");
    const divider = document.querySelector<HTMLElement>('[data-panel-resize-handle-id="chat-atelier-divider"]');
    const chat = document.querySelector<HTMLElement>('[data-panel-id="chat"]');
    const group = chat?.parentElement;
    if (!tools) return;
    const align = () => {
      const rect = bar.getBoundingClientRect();
      const boundary = split && divider ? divider.getBoundingClientRect() : null;
      const axis = boundary && boundary.width > 0
        ? boundary.left + boundary.width / 2 - rect.left : rect.width / 2;
      // At extreme splits, tools fold into their existing complete menu.
      bar.classList.toggle("toolbar-tools-compact", Math.min(axis, rect.width - axis) < 180);
      const gap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
      const left = Math.max(0, axis - tools.getBoundingClientRect().width / 2 - gap);
      bar.style.setProperty("--toolbar-left", `${left}px`);
    };
    align();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(align);
    [bar, tools, chat, group].forEach(element => { if (element) observer.observe(element); });
    window.addEventListener("resize", align);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", align);
      bar.style.removeProperty("--toolbar-left");
    };
  }, [ref, split]);
}
