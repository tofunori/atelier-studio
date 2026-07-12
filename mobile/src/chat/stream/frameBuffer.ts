/**
 * Coalesce stream deltas to at most one visual commit per animation frame.
 * Semantic events (done/error/interaction/user/text final) flush immediately.
 */
import type { WireLikeEvent } from "../store/types.ts";

const IMMEDIATE = new Set([
  "user",
  "text",
  "thinking",
  "done",
  "error",
  "interaction",
  "tool_update",
  "tool",
]);

export type FrameBufferHandlers = {
  /** Apply events to store (may be many deltas coalesced). */
  apply: (events: WireLikeEvent[]) => void;
  /** Called after visual flush (for metrics). */
  onFlush?: (count: number) => void;
  /** schedule — default requestAnimationFrame */
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
};

export class StreamFrameBuffer {
  private queue: WireLikeEvent[] = [];
  private raf: number | null = null;
  private readonly schedule: (cb: () => void) => number;
  private readonly cancel: (id: number) => void;

  constructor(private handlers: FrameBufferHandlers) {
    this.schedule =
      handlers.schedule ??
      ((cb) =>
        typeof requestAnimationFrame !== "undefined"
          ? requestAnimationFrame(cb)
          : (setTimeout(cb, 16) as unknown as number));
    this.cancel =
      handlers.cancel ??
      ((id) => {
        if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(id);
        else clearTimeout(id);
      });
  }

  push(ev: WireLikeEvent): void {
    if (IMMEDIATE.has(ev.kind)) {
      // flush pending deltas first, then semantic
      this.flush();
      this.handlers.apply([ev]);
      this.handlers.onFlush?.(1);
      return;
    }
    this.queue.push(ev);
    if (this.raf == null) {
      this.raf = this.schedule(() => {
        this.raf = null;
        this.flush();
      });
    }
  }

  flush(): void {
    if (this.raf != null) {
      this.cancel(this.raf);
      this.raf = null;
    }
    if (!this.queue.length) return;
    const batch = this.queue;
    this.queue = [];
    this.handlers.apply(batch);
    this.handlers.onFlush?.(batch.length);
  }

  dispose(): void {
    if (this.raf != null) this.cancel(this.raf);
    this.raf = null;
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }
}
