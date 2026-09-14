import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ChatAnnotationBadges } from "./ChatAnnotationBadges";
import type { Mark } from "../../lib/annotations";

const marks: Mark[] = [{ kind: "an", text: "ERA5-Land. Calibration prévue", note: "Vérifier" }];
function Harness({ onOpen = vi.fn() }: { onOpen?: (draft: { x: number; y: number; text: string; note: string }) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  return <><div ref={hostRef}><div className="messages"><div className="timeline-virtual-row"><p><strong>ERA5-Land.</strong> Calibration prévue</p></div></div></div><ChatAnnotationBadges hostRef={hostRef} marks={marks} revision={0} onOpen={onOpen}/></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("anchors to the message row across scrolling and opens at the current viewport position", async () => {
  let scroll = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    return new DOMRect(100, 200 - scroll, 600, 100);
  });
  Range.prototype.getClientRects = () => [new DOMRect(120, 240 - scroll, 200, 20)] as unknown as DOMRectList;
  const onOpen = vi.fn();
  const { container } = render(<Harness onOpen={onOpen}/>);
  const badge = await waitFor(() => {
    const node = container.querySelector<HTMLButtonElement>(".anno-badge");
    expect(node).not.toBeNull(); return node!;
  });
  expect(badge.parentElement).toHaveClass("timeline-virtual-row");
  expect(badge.style.left).toBe("0px");
  expect(badge.style.top).toBe("40px");
  scroll = 150;
  fireEvent.scroll(container.querySelector(".messages")!);
  expect(badge.style.top).toBe("40px"); // no scroll-handler correction needed
  vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(new DOMRect(320, 90, 20, 20));
  fireEvent.click(badge);
  expect(onOpen).toHaveBeenCalledWith({ x: 320, y: 110, text: marks[0].text, note: "Vérifier" });
});

it("removes stale badges when a virtual row is replaced and anchors newly mounted text", async () => {
  Range.prototype.getClientRects = () => [new DOMRect(120, 240, 200, 20)] as unknown as DOMRectList;
  const { container } = render(<Harness/>);
  await waitFor(() => expect(container.querySelectorAll(".anno-badge")).toHaveLength(1));
  const row = container.querySelector(".timeline-virtual-row")!;
  const replacement = document.createElement("div");
  replacement.className = "timeline-virtual-row";
  replacement.innerHTML = "<p>Autre message</p>";
  row.replaceWith(replacement);
  await waitFor(() => expect(row.querySelector(".anno-badge")).toBeNull());
  replacement.innerHTML = "<p><strong>ERA5-Land.</strong> Calibration prévue</p>";
  await waitFor(() => expect(replacement.querySelector(".anno-badge")).not.toBeNull());
});
