import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { findTextRanges } from "../../lib/markRanges";
import type { Mark } from "../../lib/annotations";
import { t } from "../../lib/i18n";
import { RowButton } from "../ui";

type Badge = { n: number; x: number; y: number; mark: Mark; row: HTMLElement };

/** Row-local coordinates keep badges in the browser's native scroll layer. */
export function ChatAnnotationBadges({ hostRef, marks, revision, onOpen }: {
  hostRef: RefObject<HTMLDivElement | null>;
  marks: Mark[];
  revision: unknown;
  onOpen: (draft: { x: number; y: number; text: string; note: string }) => void;
}) {
  const [badges, setBadges] = useState<Badge[]>([]);
  useLayoutEffect(() => {
    const host = hostRef.current?.querySelector<HTMLDivElement>(".messages") ?? hostRef.current;
    if (!host || !marks.length) { setBadges([]); return; }
    let frame = 0;
    const observed = new Set<HTMLElement>();
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute); };
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    function compute() {
      frame = 0;
      const next: Badge[] = [];
      const rows = new Set<HTMLElement>();
      marks.filter(mark => !mark.color).forEach((mark, i) => {
        const ranges = findTextRanges(host!, mark.text);
        const range = ranges[ranges.length - 1];
        if (!range) return;
        const end = range.endContainer;
        const row = (end instanceof Element ? end : end.parentElement)?.closest<HTMLElement>(".timeline-virtual-row");
        const rects = range.getClientRects();
        const rect = rects[0];
        if (!row || !rect) return;
        const origin = row.getBoundingClientRect();
        rows.add(row);
        const x = Math.max(0, rect.left - origin.left - row.clientLeft - 25);
        let y = rect.top - origin.top - row.clientTop;
        for (const previous of next.filter(b => b.row === row).sort((a,b) => a.y-b.y)) {
          if (Math.abs(previous.x-x)<28 && Math.abs(previous.y-y)<26) y=previous.y+26;
        }
        next.push({ n: i + 1, x, y, mark, row });
      });
      for (const row of observed) if (!rows.has(row)) { resize.unobserve(row); observed.delete(row); }
      for (const row of rows) if (!observed.has(row)) { resize.observe(row); observed.add(row); }
      setBadges(previous => previous.length === next.length && previous.every((b, i) => {
        const n = next[i];
        return b.row === n.row && b.mark === n.mark && b.x === n.x && b.y === n.y && b.n === n.n;
      }) ? previous : next);
    }
    // Virtual rows can mount without a new chat event (scrolling into view).
    const mutation = new MutationObserver(schedule);
    mutation.observe(host, { childList: true, subtree: true, characterData: true });
    compute();
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [hostRef, marks, revision]);

  return badges.map(badge => createPortal(
    <RowButton className="anno-badge atelier-annotation-number"
      style={{ left: badge.x, top: badge.y }} title={badge.mark.note || t("chat.annotation-no-note")}
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen({ x: rect.left, y: rect.bottom, text: badge.mark.text, note: badge.mark.note ?? "" });
      }}>{badge.n}</RowButton>, badge.row, badge.mark.text,
  ));
}
