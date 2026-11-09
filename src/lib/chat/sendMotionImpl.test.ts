import { afterEach, describe, expect, it, vi } from "vitest";
import { armSendFlight, easeOut, flySentBubble, followBottom, landAtBottom } from "./sendMotionImpl";

// Envoi « B · Envol » (2026-11-09) : la mécanique fine (images, vol) se
// vérifie au banc #chatbench-envoi ; ici, les garde-fous qui ne dépendent pas
// de la mise en page.
function scroller(scrollHeight: number, clientHeight: number) {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => clientHeight });
  return el;
}

afterEach(() => { vi.useRealTimers(); });

describe("sendMotionImpl", () => {
  it("easeOut part de 0, arrive à 1 et ne recule jamais", () => {
    expect(easeOut(0)).toBeCloseTo(0, 3);
    expect(easeOut(1)).toBeCloseTo(1, 3);
    let prev = 0;
    for (let i = 1; i <= 20; i += 1) {
      const v = easeOut(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("landAtBottom rejoint le bas et appelle onDone, jamais de façon synchrone", async () => {
    const el = scroller(1000, 400);
    const done = vi.fn();
    landAtBottom(el, done);
    expect(done).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(el.scrollTop).toBe(600);
  });

  it("landAtBottom annulé appelle onDone une seule fois", () => {
    const done = vi.fn();
    const stop = landAtBottom(scroller(1000, 400), done);
    stop();
    stop();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("followBottom marque la position qu'il a écrite, tant qu'il est attaché", () => {
    const el = scroller(1000, 400);
    el.scrollTop = 600;
    const stop = followBottom(el, () => true);
    expect(el.dataset.following).toBe("600");
    stop();
    expect(el.dataset.following).toBeUndefined();
  });

  it("followBottom ne ramène pas en bas un utilisateur qui lit plus haut", async () => {
    let height = 1000;
    const el = scroller(0, 400);
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height });
    el.scrollTop = 600;
    const stop = followBottom(el, () => false);
    el.scrollTop = 100; // barre de défilement, sans molette
    height = 1100;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(el.scrollTop).toBe(100);
    stop();
  });

  it("armSendFlight masque le placeholder le temps du vol", () => {
    vi.useFakeTimers();
    const form = document.createElement("form");
    const field = document.createElement("textarea");
    form.appendChild(field);
    armSendFlight(form);
    expect(field.classList.contains("send-armed")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(field.classList.contains("send-armed")).toBe(false);
  });

  it("sans envoi armé, une bulle (historique, autre fil) ne vole pas", () => {
    armSendFlight(null);
    const host = document.createElement("div");
    host.className = "timeline-scroll-wrap";
    const shell = document.createElement("div");
    host.appendChild(shell);
    document.body.appendChild(host);
    flySentBubble(shell)();
    expect(shell.style.visibility).toBe("");
    expect(host.querySelector(".send-flight")).toBeNull();
    host.remove();
  });
});
