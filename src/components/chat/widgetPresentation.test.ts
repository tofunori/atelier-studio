// Execute the exact bridge embedded by Rust, independent of the React host.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const shell = readFileSync("rust/crates/atelier-runtime/src/widget_presentation.html", "utf8");
const script = shell.match(/<script>([\s\S]*?)<\/script>/)![1];
function bridge() {
  let height = 420;
  const listeners: Record<string, (event?: unknown) => void> = {};
  const frames: (() => void)[] = [];
  const messages: Record<string, unknown>[] = [];
  let resize!: () => void;
  const parent = { postMessage: (message: Record<string, unknown>) => messages.push(message) };
  const win = { innerWidth: 600, innerHeight: 420, addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; } };
  runInNewContext(script, {
    parent,
    window: win,
    document: { body: { getBoundingClientRect: () => ({ height }) } },
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
    ResizeObserver: class { constructor(fn: () => void) { resize = fn; } observe() {} },
  });
  listeners.DOMContentLoaded();
  return { messages, listeners, parent, win, setHeight: (value: number) => { height = value; resize(); }, flush: () => frames.splice(0).forEach((f) => f()) };
}

describe("widget presentation bridge", () => {
  it("coalesces content changes and reports growth and shrinkage", () => {
    const b = bridge();
    b.flush();
    expect(b.messages).toEqual([{ source: "atelier-widget", type: "resize", height: 420 }]);
    b.setHeight(600); b.setHeight(720); b.flush();
    expect(b.messages).toHaveLength(2);
    expect(b.messages[1].height).toBe(720);
    b.setHeight(180); b.flush();
    expect(b.messages[2].height).toBe(180);
    b.setHeight(180); b.flush();
    expect(b.messages).toHaveLength(3);
  });
  it("does not grow a viewport-dependent legacy widget to the height ceiling", () => {
    const b = bridge();
    b.setHeight(448); b.flush();
    expect(b.messages[0].height).toBe(448);
    b.win.innerHeight = 448; b.setHeight(476); b.flush();
    expect(b.messages).toHaveLength(1);
    // Real content growth is still measured after the feedback is ignored.
    b.setHeight(650); b.flush();
    expect(b.messages[1].height).toBe(650);
  });
  it("reports runtime failures without exposing error payloads or spamming", () => {
    const b = bridge();
    b.listeners.error({ message: "ResizeObserver loop completed with undelivered notifications." });
    expect(b.messages).toHaveLength(0);
    b.listeners.error({ message: "private stack" });
    b.listeners.unhandledrejection({ reason: "private data" });
    expect(b.messages).toEqual([{ source: "atelier-widget", type: "error" }]);
  });
  it("remeasures after a host theme change", () => {
    const b = bridge(); b.flush();
    b.listeners.message({ source: b.parent, data: { source: "atelier-host", type: "theme" } });
    b.setHeight(500); b.flush();
    expect(b.messages[b.messages.length - 1].height).toBe(500);
  });
});
