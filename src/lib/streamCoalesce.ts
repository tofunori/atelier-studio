// src/lib/streamCoalesce.ts
// Coalescence par frame des événements de streaming (plan 066 L1, réparé
// 2026-08-28 ; lissage par rythme d'arrivée ajouté 2026-09-04) : les
// providers émettent "delta"/"thinking_delta" (jamais "streaming", qui est
// un kind INTERNE de la liste fabriqué par le réducteur). Chaque delta est
// un FRAGMENT : on file, on n'écrase jamais — écraser perdrait du texte.
//
// Certains modèles (Fable 5.1, Haiku 4.5) streament par paquets de ~100-
// 120 caractères toutes les 300-750 ms côté API : le texte "saute" par
// blocs à l'écran. D'autres (Sonnet 5) streament par tout petits paquets
// (~8 caractères toutes les ~45 ms) — déjà fin, ne doit JAMAIS être
// ralenti. On lisse donc la révélation des événements "delta" au rythme
// d'arrivée mesuré par fil, sans jamais changer l'ordre d'application ni
// perdre de texte. "thinking_delta"/"stream_set" restent appliqués
// intégralement à la prochaine frame (comportement historique) : seul le
// texte visible ("delta") est rythmé.
export const STREAM_COALESCE_KINDS: ReadonlySet<string> = new Set([
  "delta",
  "thinking_delta",
  "stream_set",
]);

type Apply = (threadId: string, event: any) => void;
type Raf = (cb: () => void) => number;
type Caf = (id: number) => void;
type Now = () => number;

// -- Constantes de rythme (choisies empiriquement, voir streamCoalesce.test.ts) --
const RATE_WINDOW = 4; // nb de paquets gardés pour estimer le débit d'un fil
const SAFETY_FACTOR = 1.15; // léger rattrapage pour que le tampon ne grossisse pas
const MIN_BUDGET_CHARS = 2; // progression minimale garantie par frame
const NO_HISTORY_REVEAL_MS = 250; // durée cible de révélation sans historique de débit
const MAX_BUFFER_CHARS = 600; // au-delà : rattrapage (au moins la moitié du tampon)
const MAX_AGE_MS = 1500; // latence max tolérée pour le plus vieux caractère en attente
// Paquet "fin" (au sens : petit) : jamais découpé, quel que soit le débit
// mesuré. Un saut de quelques caractères est imperceptible, et le découper
// ajouterait une latence purement artificielle — c'est le cas de Sonnet 5,
// qui streame déjà par paquets de ~8 caractères toutes les ~45 ms.
const FINE_PACKET_CHARS = 32;
const NOMINAL_FRAME_MS = 16; // dt supposé avant la 1ère frame mesurée d'un fil
const MAX_FRAME_DT_MS = 100; // borne haute : évite un rattrapage énorme après une pause
const MIN_FRAME_DT_MS = 1;
// Échantillons de débit plus vieux que ça (par rapport au plus récent) sont
// ignorés : un fil qui reprend après une minute de silence repartirait sinon
// avec un débit quasi nul (span énorme) et un premier paquet révélé à
// 2 caractères par frame.
const RATE_STALE_MS = 5000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface PacingSample {
  /** Points de code restants à révéler pour ce delta. */
  remainingLen: number;
  /** Débit estimé (caractères/ms) sur la fenêtre glissante, ou null sans historique. */
  rateCharsPerMs: number | null;
  /** Durée écoulée depuis la dernière frame de ce fil (ms), déjà bornée. */
  dtMs: number;
  /** Ancienneté (ms) du plus vieux caractère encore en attente dans ce delta. */
  ageMs: number;
}

// Fonction pure : combien de points de code révéler à cette frame pour un
// delta donné. Exportée pour être testable indépendamment du rAF/now.
export function pacingBudget(sample: PacingSample): number {
  const { remainingLen, rateCharsPerMs, dtMs, ageMs } = sample;
  if (remainingLen <= 0) return 0;

  if (remainingLen <= FINE_PACKET_CHARS) return remainingLen;

  let budget = rateCharsPerMs == null
    ? Math.ceil((remainingLen * dtMs) / NO_HISTORY_REVEAL_MS)
    : Math.ceil(rateCharsPerMs * dtMs * SAFETY_FACTOR);
  budget = Math.max(MIN_BUDGET_CHARS, budget);

  // Rattrapage : tampon trop gros ou plus vieux caractère qui attend trop
  // longtemps — la latence ne doit jamais dépasser ~1,5 s.
  if (remainingLen > MAX_BUFFER_CHARS || ageMs > MAX_AGE_MS) {
    budget = Math.max(budget, Math.ceil(remainingLen / 2));
  }
  return Math.min(budget, remainingLen);
}

// Découpe sûre sur des points de code : Array.from() itère caractère par
// caractère Unicode (jamais au milieu d'une paire de substituts).
function toCodePoints(text: string): string[] {
  return Array.from(text);
}

interface DeltaItem {
  type: "delta";
  event: any;
  chars: string[]; // points de code non encore révélés
  receivedAt: number;
}
interface RawItem {
  type: "raw";
  event: any;
}
type QueueItem = DeltaItem | RawItem;

function isPaceable(event: any): boolean {
  return event != null && event.kind === "delta" && typeof event.text === "string";
}

export function createStreamCoalescer(
  apply: Apply,
  raf: Raf = (cb) => window.requestAnimationFrame(cb),
  caf: Caf = (id) => window.cancelAnimationFrame(id),
  now: Now = () => performance.now(),
) {
  const queues = new Map<string, QueueItem[]>();
  const frames = new Map<string, number>();
  const lastFrameAt = new Map<string, number>();
  const rateHistory = new Map<string, Array<{ t: number; size: number }>>();

  function recordArrival(threadId: string, size: number, t: number) {
    const arr = rateHistory.get(threadId) ?? [];
    arr.push({ t, size });
    while (arr.length > RATE_WINDOW) arr.shift();
    rateHistory.set(threadId, arr);
  }

  // Débit estimé (caractères/ms) sur la fenêtre glissante : on exclut la
  // taille du 1er échantillon, qui ne fait que marquer le début de la
  // fenêtre (sinon le débit est surestimé d'un facteur ~2 sur 2 paquets).
  function estimateRate(threadId: string): number | null {
    const all = rateHistory.get(threadId);
    if (!all || all.length < 2) return null;
    const newest = all[all.length - 1]!.t;
    const samples = all.filter((s) => newest - s.t <= RATE_STALE_MS);
    if (samples.length < 2) return null;
    const span = samples[samples.length - 1]!.t - samples[0]!.t;
    if (span <= 0) return null;
    let total = 0;
    for (let i = 1; i < samples.length; i++) total += samples[i]!.size;
    return total / span;
  }

  function scheduleFrame(threadId: string) {
    if (frames.has(threadId)) return;
    frames.set(threadId, raf(() => {
      frames.delete(threadId);
      drainFrame(threadId);
    }));
  }

  function drainFrame(threadId: string) {
    const queue = queues.get(threadId);
    if (!queue || queue.length === 0) return;

    const last = lastFrameAt.get(threadId);
    const t = now();
    const dt = last == null ? NOMINAL_FRAME_MS : clamp(t - last, MIN_FRAME_DT_MS, MAX_FRAME_DT_MS);
    lastFrameAt.set(threadId, t);
    const rate = estimateRate(threadId);

    while (queue.length > 0) {
      const item = queue[0]!;
      if (item.type === "raw") {
        queue.shift();
        apply(threadId, item.event);
        continue;
      }
      if (item.chars.length === 0) {
        queue.shift();
        continue;
      }
      const ageMs = t - item.receivedAt;
      const budget = pacingBudget({
        remainingLen: item.chars.length,
        rateCharsPerMs: rate,
        dtMs: dt,
        ageMs,
      });
      if (budget >= item.chars.length) {
        // ce delta est entièrement révélé : on peut enchaîner sur le
        // prochain élément de la file dans la même frame (il n'est plus
        // "partiellement révélé", rien ne justifie d'attendre).
        const fragment = item.chars.join("");
        queue.shift();
        apply(threadId, { ...item.event, text: fragment });
        continue;
      }
      // delta partiellement révélé : on s'arrête ici pour cette frame — un
      // événement suivant dans la file ne doit jamais doubler celui-ci.
      const revealed = item.chars.slice(0, budget);
      item.chars = item.chars.slice(budget);
      apply(threadId, { ...item.event, text: revealed.join("") });
      break;
    }

    if (queue.length > 0) {
      scheduleFrame(threadId);
    } else {
      queues.delete(threadId);
    }
  }

  function flushDrain(threadId: string) {
    const queue = queues.get(threadId);
    if (!queue || queue.length === 0) return;
    queues.delete(threadId);
    for (const item of queue) {
      if (item.type === "raw") {
        apply(threadId, item.event);
      } else if (item.chars.length > 0) {
        apply(threadId, { ...item.event, text: item.chars.join("") });
      }
    }
  }

  return {
    push(threadId: string, event: any) {
      const queue = queues.get(threadId) ?? [];
      if (isPaceable(event)) {
        const t = now();
        const chars = toCodePoints(event.text as string);
        queue.push({ type: "delta", event, chars, receivedAt: t });
        recordArrival(threadId, chars.length, t);
      } else {
        queue.push({ type: "raw", event });
      }
      queues.set(threadId, queue);
      scheduleFrame(threadId);
    },
    // flush immédiat (synchrone) avant tout événement non-stream du même fil,
    // pour ne jamais changer l'ordre d'arrivée : tout le tampon est appliqué
    // d'un coup, sans rythme, et le rAF en attente est annulé.
    flush(threadId: string) {
      const frame = frames.get(threadId);
      if (frame != null) {
        caf(frame);
        frames.delete(threadId);
      }
      flushDrain(threadId);
      // Un flush ferme un tour (text/done/error) : le tour suivant repart
      // sans débit hérité ni dt mesuré contre une frame d'il y a une minute.
      rateHistory.delete(threadId);
      lastFrameAt.delete(threadId);
    },
    flushAll() {
      for (const threadId of [...queues.keys()]) this.flush(threadId);
    },
  };
}
