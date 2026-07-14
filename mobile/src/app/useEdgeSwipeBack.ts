import { useEffect } from "react";

type Point = { x: number; y: number };

const EDGE_WIDTH = 28;
const MIN_HORIZONTAL_TRAVEL = 72;
const MAX_VERTICAL_TRAVEL = 64;

export function isEdgeSwipeBack(start: Point, end: Point): boolean {
  const horizontalTravel = end.x - start.x;
  const verticalTravel = Math.abs(end.y - start.y);
  return (
    start.x <= EDGE_WIDTH &&
    horizontalTravel >= MIN_HORIZONTAL_TRAVEL &&
    verticalTravel <= MAX_VERTICAL_TRAVEL
  );
}

/** Adds the familiar iOS swipe-from-left-edge gesture to WebView destinations. */
export function useEdgeSwipeBack(onBack: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let start: Point | null = null;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (start && touch && isEdgeSwipeBack(start, { x: touch.clientX, y: touch.clientY })) {
        onBack();
      }
      start = null;
    };
    const onTouchCancel = () => {
      start = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, onBack]);
}
