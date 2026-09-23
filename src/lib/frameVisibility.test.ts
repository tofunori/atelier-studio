import { describe, expect, it, vi } from "vitest";
import { resetFrameVisibility, syncFrameVisibility } from "./frameVisibility";

function frame(root: HTMLElement, visible: () => boolean) {
  const element = document.createElement("iframe");
  element.className = "atelier";
  root.appendChild(element);
  element.getClientRects = () => (visible() ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  return { element, post: vi.spyOn(element.contentWindow!, "postMessage") };
}

describe("frameVisibility", () => {
  it("poste l'état de chaque onglet seulement quand il change, et de nouveau après un rechargement", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let activeIsA = true;
    const a = frame(root, () => activeIsA);
    const b = frame(root, () => !activeIsA);

    syncFrameVisibility(root);
    expect(a.post).toHaveBeenLastCalledWith({ type: "atelier-tab-visibility", visible: true }, "*");
    expect(b.post).toHaveBeenLastCalledWith({ type: "atelier-tab-visibility", visible: false }, "*");

    syncFrameVisibility(root);
    expect(a.post).toHaveBeenCalledTimes(1);

    activeIsA = false;
    syncFrameVisibility(root);
    expect(a.post).toHaveBeenLastCalledWith({ type: "atelier-tab-visibility", visible: false }, "*");
    expect(b.post).toHaveBeenLastCalledWith({ type: "atelier-tab-visibility", visible: true }, "*");

    resetFrameVisibility(a.element);
    syncFrameVisibility(root);
    expect(a.post).toHaveBeenCalledTimes(3);
    root.remove();
  });
});
