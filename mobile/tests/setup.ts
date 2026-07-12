import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver (virtualized transcript)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
