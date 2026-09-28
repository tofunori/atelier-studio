import type { KeyboardEvent } from "react";

/** Mounted workspace surfaces can be hidden by a parent without unmounting. */
export function isSurfaceVisible(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.inert) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

/** Shared manual activation: arrows move focus; native Enter/Space activate. */
export function moveDocumentTabFocus(event: KeyboardEvent<HTMLElement>, selector: string): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(selector);
  if (!target || !event.currentTarget.contains(target)) return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector))
    .filter(button => !button.disabled && isSurfaceVisible(button));
  const index = controls.indexOf(target);
  if (index < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + controls.length) % controls.length;
  event.preventDefault();
  event.stopPropagation();
  controls[next]?.focus();
}
