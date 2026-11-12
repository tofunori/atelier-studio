import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useDocxPaneRequests } from "./useDocxPaneRequests";

const ORIGIN = "http://127.0.0.1:4242";

function rect(width: number) {
  return { width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe("useDocxPaneRequests", () => {
  let size = 40;
  let frame: HTMLIFrameElement;
  let replies: unknown[];
  const handle: ImperativePanelHandle = {
    collapse: () => {}, expand: () => {}, getId: () => "atelier", isCollapsed: () => false, isExpanded: () => true,
    getSize: () => size,
    resize: (next) => { size = Math.min(70, next); },
  };

  beforeEach(() => {
    size = 40;
    replies = [];
    // 1 % du panneau = 10 px ; le document occupe tout le panneau.
    document.body.innerHTML = `<div data-panel-id="chat"></div><div data-panel-id="atelier"><div class="workspace-pane"><iframe></iframe></div></div>`;
    const atelier = document.querySelector<HTMLElement>('[data-panel-id="atelier"]')!;
    const chat = document.querySelector<HTMLElement>('[data-panel-id="chat"]')!;
    Object.defineProperty(chat, "offsetWidth", { value: 600 });
    atelier.getBoundingClientRect = () => rect(size * 10);
    document.querySelector<HTMLElement>(".workspace-pane")!.getBoundingClientRect = () => rect(size * 10);
    frame = document.querySelector("iframe")!;
    frame.src = `${ORIGIN}/.fig_thumbs/docx_studio.html?path=a.docx#atelier_nonce=n1`;
    vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((message: unknown) => { replies.push(message); });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const send = (data: Record<string, unknown>, origin = ORIGIN) =>
    window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-docx-pane", nonce: "n1", ...data }, origin, source: frame.contentWindow }));

  it("élargit le panneau de la place demandée puis rend la largeur d'avant", () => {
    renderHook(() => useDocxPaneRequests({ current: handle }, `${ORIGIN}/figures_index.html`, true));
    send({ action: "widen", px: 150 });
    expect(size).toBeCloseTo(55);
    expect(replies[replies.length - 1]).toEqual({ type: "atelier-docx-pane-done", action: "widen", ok: true });
    send({ action: "restore", px: 0 });
    expect(size).toBeCloseTo(40);
    expect(replies[replies.length - 1]).toEqual({ type: "atelier-docx-pane-done", action: "restore", ok: true });
  });

  it("laisse la conversation à son minimum et dit que la place manque", () => {
    renderHook(() => useDocxPaneRequests({ current: handle }, `${ORIGIN}/`, true));
    send({ action: "widen", px: 500 });
    expect(size).toBe(70);
    expect(replies[replies.length - 1]).toMatchObject({ action: "widen", ok: false });
  });

  it("ne rend pas la largeur si le panneau a été retouché à la main", () => {
    renderHook(() => useDocxPaneRequests({ current: handle }, `${ORIGIN}/`, true));
    send({ action: "widen", px: 100 });
    size = 62;
    send({ action: "restore", px: 0 });
    expect(size).toBe(62);
    expect(replies[replies.length - 1]).toMatchObject({ action: "restore", ok: false });
  });

  it("ignore une autre origine ou un mauvais nonce", () => {
    renderHook(() => useDocxPaneRequests({ current: handle }, `${ORIGIN}/`, true));
    send({ action: "widen", px: 100 }, "http://evil.test");
    send({ action: "widen", px: 100, nonce: "x" });
    expect(size).toBe(40);
    expect(replies).toEqual([]);
  });
});
