// Typewriter du streaming : moteur pur de débit + hook React.
// Extrait de turns.tsx (phase 2, 2026-08-24) pour être partagé avec
// LiveThinking (turnParts.tsx) sans cycle d'imports turns ↔ turnParts.
import { useEffect, useRef, useState } from "react";

/** Moteur pur du typewriter (2026-08-24) : révélation à DÉBIT CONSTANT
 * ADAPTATIF au lieu du drainage proportionnel. Le 12 %/tick accélérait
 * brutalement à chaque gros delta du CLI puis décélérait en exponentielle —
 * un rythme de pompe, chunk après chunk. Ici le débit visible suit le débit
 * d'arrivée réel (EMA ~2 s), majoré par un rattrapage borné (τ = 600 ms sur
 * le retard) pour ne jamais diverger, avec un plancher pour ne jamais geler.
 * Pur et à horloge injectée : testable sans rAF réel. */
export interface StreamPace {
  /** Caractères révélés (index dans le texte cible). */
  revealed: number;
  /** Reliquat fractionnaire de caractères entre deux ticks. */
  fractional: number;
  /** Débit d'arrivée estimé (chars/s, EMA). 0 = pas encore mesuré. */
  rate: number;
  /** Horodatage de la dernière croissance RETENUE pour la mesure (-1 = jamais). */
  lastGrowthAt: number;
  /** Longueur du texte à cette dernière croissance retenue. */
  lastLen: number;
  /** Horodatage du dernier tick de révélation. */
  lastTickAt: number;
}

/** Rattrapage : le retard se résorbe avec cette constante de temps (ms). */
const PACE_CATCHUP_MS = 600;
/** Plancher (chars/s) : la révélation ne gèle jamais. */
const PACE_FLOOR_CPS = 90;
/** Plafond (chars/s) : ~15 caractères par image à 60 Hz. Sans lui, un gros
 * retard (bloc de pensée livré d'un coup) faisait sortir 40-60 caractères en
 * une seule image — une phrase entière qui apparaît d'un bloc, sèche. Le
 * plafond transforme la rafale en déroulé ; la fin de tour flushe de toute
 * façon, donc rien ne se perd. */
const PACE_MAX_CPS = 900;
/** Constante de temps de l'EMA du débit d'arrivée (ms). */
const PACE_RATE_TAU_MS = 2000;
/** Deux deltas à moins de 50 ms = même rafale : mesurés ensemble au suivant. */
const PACE_COALESCE_MS = 50;
/** Reprise d'un fil en cours : au plus cette queue se rejoue au montage —
 * l'essentiel s'affiche direct, seule la fin « se tape ». Un tour FRAIS
 * (texte plus court que la borne) part donc du début : le premier delta d'un
 * provider rapide peut faire 800 caractères, affiché d'un bloc c'était le
 * début du « tout d'un coup » (2026-08-25). */
const MOUNT_TAIL_CHARS = 600;
/** Finition (fin de tour) : le reliquat se déroule à ce plancher, sans le
 * plafond de croisière — vite, mais jamais téléporté. */
const FINISH_FLOOR_CPS = 600;
const FINISH_CATCHUP_MS = 300;

/** Relais bulle → texte final. Au done, le reducer REMPLACE la bulle
 * streaming par le texte final : l'ancien composant meurt avec son compte de
 * révélation, et le texte final apparaissait entier d'un coup. La clé de
 * rangée (stable au remplacement depuis le fix du flash) porte le compte
 * d'un composant à l'autre. */
const handoffs = new Map<string, number>();
export function publishStreamHandoff(key: string, revealed: number): void {
  handoffs.set(key, revealed);
}
export function takeStreamHandoff(key: string): number | null {
  const value = handoffs.get(key);
  if (value == null) return null;
  handoffs.delete(key);
  return value;
}

export function newStreamPace(initialLen: number): StreamPace {
  return { revealed: initialLen, fractional: 0, rate: 0, lastGrowthAt: -1, lastLen: initialLen, lastTickAt: 0 };
}

/** Note l'arrivée de texte et met à jour l'estimation de débit. */
export function paceGrowth(p: StreamPace, len: number, now: number): void {
  if (len <= p.lastLen) {
    p.lastLen = len;
    return;
  }
  if (p.lastGrowthAt < 0) {
    p.lastGrowthAt = now;
    p.lastLen = len;
    return;
  }
  const dt = now - p.lastGrowthAt;
  // Rafale coalescée : dt quasi nul donnerait un débit instantané absurde.
  // On laisse la croissance s'accumuler ; la prochaine mesure la couvrira.
  if (dt < PACE_COALESCE_MS) return;
  const inst = ((len - p.lastLen) * 1000) / dt;
  const alpha = 1 - Math.exp(-dt / PACE_RATE_TAU_MS);
  p.rate = p.rate === 0 ? inst : p.rate + alpha * (inst - p.rate);
  p.lastGrowthAt = now;
  p.lastLen = len;
}

/** Un tick de révélation. Retourne true si `revealed` a avancé.
 * `finishing` : fin de tour — le reliquat se résorbe vite (plancher élevé,
 * pas de plafond de croisière), mais toujours mot à mot. */
export function paceStep(p: StreamPace, full: string, now: number, finishing = false): boolean {
  const dt = Math.min(Math.max(now - p.lastTickAt, 0), 250);
  p.lastTickAt = now;
  const total = full.length;
  if (p.revealed >= total) {
    p.fractional = 0;
    return false;
  }
  const backlog = total - p.revealed;
  const cps = finishing
    ? Math.max(p.rate, (backlog * 1000) / FINISH_CATCHUP_MS, FINISH_FLOOR_CPS)
    : Math.min(
        Math.max(p.rate, (backlog * 1000) / PACE_CATCHUP_MS, PACE_FLOOR_CPS),
        PACE_MAX_CPS,
      );
  p.fractional += (cps * dt) / 1000;
  const step = Math.floor(p.fractional);
  if (step <= 0) return false;
  p.fractional -= step;
  let next = Math.min(total, p.revealed + step);
  // Snap à la fin du mot en cours (plan 067) : un mot apparaît entier, son
  // fade (rehypeWordFade) joue une fois — jamais un mot tronqué qui grandit
  // sans animation. S'arrêter sur un caractère non blanc (en plein mot OU
  // juste avant lui) complète le mot. Cap +24 pour les runs sans blanc
  // (URLs, code) : la progression reste garantie.
  if (next < total && !/\s/.test(full[next] ?? " ")) {
    const cap = Math.min(total, next + 24);
    while (next < cap && !/\s/.test(full[next])) next += 1;
  }
  p.revealed = next;
  return true;
}

/** Typewriter : le CLI Claude livre le texte par morceaux à l'échelle de la
 * phrase (mesuré : ~6 text_delta pour 5 phrases, même avec
 * --include-partial-messages) — affichés bruts, ils donnent une impression de
 * sauts, pas de streaming. On découple donc le rythme réseau du rythme visuel
 * (même principe que smoothStream du Vercel AI SDK) : le texte cible
 * s'accumule, une boucle rAF révèle le retard au débit d'arrivée estimé
 * (voir paceStep). Fin de tour : flush immédiat. Au montage, le texte déjà
 * présent s'affiche sans replay (reprise de fil). Sous
 * prefers-reduced-motion, aucun typewriter : le texte brut passe tel quel. */
export function useSmoothedStream(text: string, working: boolean, handoffKey?: string): string {
  const reduceMotion = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pace = useRef<StreamPace | null>(null);
  if (pace.current == null) {
    // Bulle de réponse (elle seule porte une clé de relais) : queue bornée
    // (reprise) ou début (tour frais). La pensée vivante, SANS clé, garde le
    // montage sans replay — elle se démonte/remonte au passage par les outils
    // et re-taper tout le bloc à chaque fois serait pire que tout. Texte
    // final : reprendre le compte relayé par la bulle qui vient de mourir,
    // sinon tout afficher (relecture d'un vieux message).
    const initial = working
      ? (handoffKey != null ? Math.max(0, text.length - MOUNT_TAIL_CHARS) : text.length)
      : (handoffKey != null ? takeStreamHandoff(handoffKey) : null) ?? text.length;
    pace.current = newStreamPace(initial);
  }
  const target = useRef(text);
  const frame = useRef<number | null>(null);
  const [, force] = useState(0);
  target.current = text;

  useEffect(() => {
    if (reduceMotion) return;
    const p = pace.current!;
    const cancel = () => {
      if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null; }
    };
    if (working) paceGrowth(p, text.length, performance.now());
    const finishing = !working;
    const tick = (time: number) => {
      frame.current = null;
      if (paceStep(p, target.current, time, finishing)) {
        if (working && handoffKey != null) publishStreamHandoff(handoffKey, p.revealed);
        force((n) => n + 1);
      }
      if (p.revealed < target.current.length) {
        frame.current = requestAnimationFrame(tick);
      } else if (finishing && handoffKey != null) {
        handoffs.delete(handoffKey);
      }
    };
    if (frame.current == null && p.revealed < target.current.length) {
      frame.current = requestAnimationFrame(tick);
    }
    return cancel;
  }, [text, working, reduceMotion, handoffKey]);

  if (reduceMotion) return text;
  return text.slice(0, Math.min(pace.current.revealed, text.length));
}
