import "@testing-library/jest-dom/vitest";

// Node 26 (mise à niveau machine du 2026-08-17) expose un localStorage
// EXPÉRIMENTAL qui, sans --localstorage-file, ombrage celui de jsdom en
// valant undefined — TOUS les tests DOM qui y touchent tombaient (vécu :
// 36/36 sur turnAnatomy, 19/19 sur TopBarSurfaces, sur du code inchangé).
// Shim en mémoire, posé seulement si le vrai est absent/inutilisable.
if (typeof globalThis.localStorage === "undefined"
  || globalThis.localStorage == null
  || typeof globalThis.localStorage.clear !== "function") {
  const mem = new Map<string, string>();
  const shim: Storage = {
    get length() { return mem.size; },
    clear: () => mem.clear(),
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    key: (i: number) => [...mem.keys()][i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
  if (typeof globalThis.window !== "undefined") {
    Object.defineProperty(globalThis.window, "localStorage", { value: shim, configurable: true });
  }
}

// jsdom n'implémente pas le défilement impératif. Les primitives de scroll
// réelles (dont shadcn MessageScroller) passent par cette API; le polyfill
// reproduit seulement son effet observable sur scrollTop.
if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function scrollTo(
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    if (typeof optionsOrX === "number") {
      this.scrollLeft = optionsOrX;
      this.scrollTop = y ?? 0;
      return;
    }
    if (optionsOrX?.left != null) this.scrollLeft = optionsOrX.left;
    if (optionsOrX?.top != null) this.scrollTop = optionsOrX.top;
  };
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}

// cmdk observe la hauteur de sa liste pour l'animation et le scroll. jsdom ne
// fournit pas ResizeObserver; ce double suffit au contrat DOM des tests.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
}

// LegendList mesure synchroniquement son viewport avant de calculer la plage
// virtualisée. jsdom retourne toujours 0×0, ce qui signifie « pas encore
// monté » pour la vraie liste. On ne simule une géométrie que pour la timeline
// et ses lignes; les autres composants conservent le comportement jsdom.
const jsdomRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  if (this.classList.contains("messages") || this.classList.contains("timeline-virtual-row")) {
    const height = this.classList.contains("messages") ? 800 : 90;
    return {
      x: 0, y: 0, top: 0, left: 0, right: 760, bottom: height,
      width: 760, height,
      toJSON: () => ({}),
    } as DOMRect;
  }
  return jsdomRect.call(this);
};
