// src/lib/streamCoalesce.ts
// Coalescence par frame des événements de streaming (plan 066 L1, réparé
// 2026-08-28) : les providers émettent "delta"/"thinking_delta" (jamais
// "streaming", qui est un kind INTERNE de la liste fabriqué par le
// réducteur). Chaque delta est un FRAGMENT : on file, on n'écrase jamais —
// écraser perdrait du texte. Tous les deltas d'une frame s'appliquent dans
// l'ordre dans le même callback (React 18 les batch en un seul render).
export const STREAM_COALESCE_KINDS: ReadonlySet<string> = new Set([
  "delta",
  "thinking_delta",
  "stream_set",
]);

type Apply = (threadId: string, event: any) => void;
type Raf = (cb: () => void) => number;
type Caf = (id: number) => void;

export function createStreamCoalescer(
  apply: Apply,
  raf: Raf = (cb) => window.requestAnimationFrame(cb),
  caf: Caf = (id) => window.cancelAnimationFrame(id),
) {
  const queues = new Map<string, any[]>();
  const frames = new Map<string, number>();

  function drain(threadId: string) {
    const pending = queues.get(threadId);
    if (!pending?.length) return;
    queues.delete(threadId);
    for (const ev of pending) apply(threadId, ev);
  }

  return {
    push(threadId: string, event: any) {
      const queue = queues.get(threadId) ?? [];
      queue.push(event);
      queues.set(threadId, queue);
      if (!frames.has(threadId)) {
        frames.set(threadId, raf(() => {
          frames.delete(threadId);
          drain(threadId);
        }));
      }
    },
    // flush immédiat (synchrone) avant tout événement non-stream du même fil,
    // pour ne jamais changer l'ordre d'arrivée.
    flush(threadId: string) {
      const frame = frames.get(threadId);
      if (frame != null) {
        caf(frame);
        frames.delete(threadId);
      }
      drain(threadId);
    },
    flushAll() {
      for (const threadId of [...queues.keys()]) this.flush(threadId);
    },
  };
}
