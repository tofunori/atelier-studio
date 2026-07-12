/**
 * Single active reconnect with exponential backoff + jitter (plan 034 F).
 * Never stacks concurrent reconnect loops.
 */
import { bumpAttempt, nextBackoffMs, resetAttempt } from "./backoff.ts";

export type ReconnectHandlers = {
  /** Attempt connectivity + auth + optional sync. Return true if live. */
  tryConnect: (signal: AbortSignal) => Promise<boolean>;
  onState?: (info: { attempt: number; nextDelayMs: number | null; running: boolean }) => void;
  /** clock for tests */
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  baseMs?: number;
  capMs?: number;
};

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class ReconnectController {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loopAbort: AbortController | null = null;
  private running = false;

  constructor(private handlers: ReconnectHandlers) {}

  get isRunning(): boolean {
    return this.running;
  }

  get currentAttempt(): number {
    return this.attempt;
  }

  /** Start or keep a single reconnect loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopAbort = new AbortController();
    void this.loop(this.loopAbort.signal);
  }

  /** Stop loop (foreground pause optional — usually stop on success only). */
  stop(): void {
    this.running = false;
    this.loopAbort?.abort();
    this.loopAbort = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.handlers.onState?.({ attempt: this.attempt, nextDelayMs: null, running: false });
  }

  /** Reset backoff after success. */
  resetBackoff(): void {
    this.attempt = resetAttempt();
  }

  /** Notify failure and ensure loop is running. */
  notifyFailure(): void {
    this.attempt = bumpAttempt(this.attempt);
    this.start();
  }

  private async loop(signal: AbortSignal): Promise<void> {
    const sleep = this.handlers.sleep ?? defaultSleep;
    while (this.running && !signal.aborted) {
      try {
        const ok = await this.handlers.tryConnect(signal);
        if (ok) {
          this.attempt = resetAttempt();
          this.running = false;
          this.handlers.onState?.({ attempt: 0, nextDelayMs: null, running: false });
          return;
        }
      } catch (e) {
        if (signal.aborted) return;
        // continue backoff
        void e;
      }
      this.attempt = bumpAttempt(this.attempt);
      const delay = nextBackoffMs(this.attempt - 1, {
        baseMs: this.handlers.baseMs,
        capMs: this.handlers.capMs,
        random: this.handlers.random,
      });
      this.handlers.onState?.({ attempt: this.attempt, nextDelayMs: delay, running: true });
      try {
        await sleep(delay, signal);
      } catch {
        return;
      }
    }
  }
}
