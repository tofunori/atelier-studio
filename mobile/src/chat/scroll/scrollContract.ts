/**
 * Scroll contract — pinned | reading | catch-up (plan 034 E §10.4).
 * Pure math, no DOM.
 */
import type { ScrollMode } from "../store/types.ts";

export const PIN_THRESHOLD_PX = 80;
export const JUMP_THRESHOLD_PX = 200;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function distanceFromBottom(m: ScrollMetrics): number {
  return m.scrollHeight - m.scrollTop - m.clientHeight;
}

/**
 * Derive mode from scroll position.
 * - near bottom → pinned
 * - scrolled up past jump threshold → reading
 * - between pin and jump: keep previous if reading else pinned
 */
export function modeFromScroll(
  m: ScrollMetrics,
  previous: ScrollMode,
): ScrollMode {
  const d = distanceFromBottom(m);
  if (d <= PIN_THRESHOLD_PX) return "pinned";
  if (d > JUMP_THRESHOLD_PX) return "reading";
  // hysteresis band
  if (previous === "reading" || previous === "catch-up") return "reading";
  return "pinned";
}

/**
 * When content grows (streaming), should we force scrollTop to bottom?
 */
export function shouldFollowStream(mode: ScrollMode): boolean {
  return mode === "pinned";
}

/**
 * After content height change while pinned, new scrollTop to stay at bottom.
 */
export function scrollTopToPin(m: Pick<ScrollMetrics, "scrollHeight" | "clientHeight">): number {
  return Math.max(0, m.scrollHeight - m.clientHeight);
}

/**
 * Enter catch-up when reading and new items arrived.
 */
export function maybeCatchUp(mode: ScrollMode, newItemCount: number): ScrollMode {
  if (mode === "reading" && newItemCount > 0) return "catch-up";
  if (mode === "catch-up" && newItemCount === 0) return "reading";
  return mode;
}

export type AnchorSnapshot = {
  mode: ScrollMode;
  /** Item/turn id near top of viewport for restore */
  anchorTurnId: string | null;
  offsetWithinTurn: number;
  distanceFromBottom: number;
};

export function captureAnchor(
  mode: ScrollMode,
  m: ScrollMetrics,
  turnIdAtTop: string | null,
  offsetWithinTurn: number,
): AnchorSnapshot {
  return {
    mode,
    anchorTurnId: turnIdAtTop,
    offsetWithinTurn,
    distanceFromBottom: distanceFromBottom(m),
  };
}
