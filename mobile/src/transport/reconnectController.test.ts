import { describe, expect, it } from "vitest";
import { ReconnectController } from "./reconnectController.ts";

describe("ReconnectController", () => {
  it("single loop — no concurrent double start", async () => {
    let calls = 0;
    const ctrl = new ReconnectController({
      tryConnect: async () => {
        calls++;
        return false;
      },
      // yield so stop() can run (avoid tight loop starving the event loop)
      sleep: async (_ms, signal) => {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 5);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
      random: () => 0,
      baseMs: 1,
      capMs: 1,
    });
    ctrl.start();
    ctrl.start();
    await new Promise((r) => setTimeout(r, 25));
    ctrl.stop();
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThan(20);
  });

  it("stops after success and resets attempt", async () => {
    let n = 0;
    const ctrl = new ReconnectController({
      tryConnect: async () => {
        n++;
        return n >= 2;
      },
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
      random: () => 0,
      baseMs: 1,
      capMs: 1,
    });
    ctrl.start();
    await new Promise((r) => setTimeout(r, 40));
    expect(ctrl.isRunning).toBe(false);
    expect(ctrl.currentAttempt).toBe(0);
  });
});
