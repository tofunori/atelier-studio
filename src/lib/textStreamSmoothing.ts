// Lissage de cadence du texte streamé (lot 066-bis). Le sidecar livre le
// texte par PAQUETS RÉSEAU irréguliers (parfois une phrase entière d'un
// coup) — affiché brut, ça « saute » au lieu de « streamer », comme le
// note déjà useSmoothedStream (turns.tsx, lissage rendu). Ce module fait le
// lissage plus en amont, à la source : chaque fil garde un buffer de texte
// PAS ENCORE révélé ; une boucle programmée (rAF, ou un setTimeout de
// secours si l'onglet est masqué) en libère des MOTS ENTIERS vers l'état à
// cadence régulière, à un débit qui accélère si le retard dépasse ~400
// caractères (borne de latence ajoutée ~500 ms sur les gros paragraphes).
//
// Contrat d'ordre (non négociable) : ce module ne réordonne RIEN. Il ne
// fait que retarder l'affichage du texte déjà reçu. `flush()` vide
// immédiatement et intégralement le buffer d'un fil — l'appelant DOIT
// l'invoquer avant d'appliquer tout événement non textuel du même fil
// (thinking, tool, permission, done, error…).

/** ≈ 1-2 mots/frame (mot + espace ≈ 6-12 caractères) — cadence de base. */
export const WORD_BUFFER_BASE_CHARS = 12;
/** Au-delà de ce retard (caractères), le débit accélère proportionnellement. */
export const WORD_BUFFER_BACKLOG_THRESHOLD = 400;
/** "backlog / 20 caractères par frame" passé le seuil (borne ~500 ms). */
export const WORD_BUFFER_BACKLOG_DIVISOR = 20;
/** Cadence de secours (ms) quand rAF est gelé (onglet masqué). */
const HIDDEN_TAB_TICK_MS = 50;
/** Filet de sécurité (ms) : si un rAF programmé n'a pas tiré passé ce délai,
 * on force le pas via setTimeout. `document.hidden` ne couvre PAS tous les
 * cas où un WebView natif peut suspendre requestAnimationFrame sans le
 * signaler (fenêtre occultée, optimisation d'énergie de l'OS, webview
 * embarquée…) — sans ce filet, un rAF qui ne tire jamais bloque le texte
 * INDÉFINIMENT (round 1, lot 066-bis : reproduit par un test unitaire où
 * raf() enregistre son callback sans jamais l'invoquer). */
const RAF_WATCHDOG_MS = 120;
/** Un "mot" sans espace au-delà de budget×FACTOR (URL, CJK…) se découpe
 * quand même, plutôt que de geler l'affichage indéfiniment. */
const LONG_TOKEN_FACTOR = 4;

/** Débit cible (en caractères) pour LA PROCHAINE frame, selon le retard
 * accumulé — jamais moins que la base, jamais de plafond (le retard doit
 * pouvoir se résorber en < ~500 ms même sur un backlog de plusieurs
 * milliers de caractères). */
export function frameCharBudget(backlogChars: number): number {
  if (backlogChars <= WORD_BUFFER_BACKLOG_THRESHOLD) return WORD_BUFFER_BASE_CHARS;
  return Math.max(WORD_BUFFER_BASE_CHARS, backlogChars / WORD_BUFFER_BACKLOG_DIVISOR);
}

/** Alternance mot / espace(s), sans perte : tokenizeBuffered(s).join("") ===
 * s toujours. Un run non-espace n'est jamais scindé ICI (la coupure de
 * sécurité pour les mots anormalement longs se fait dans peelWords). Split
 * par unité de code UTF-16 sur du \s : une paire surrogate (emoji…) n'est
 * jamais un caractère d'espacement, elle ne peut donc jamais être coupée
 * par ce découpage. */
export function tokenizeBuffered(buffer: string): string[] {
  return buffer.split(/(\s+)/).filter((tok) => tok.length > 0);
}

/** Prélève des MOTS ENTIERS en tête de `buffer`, jusqu'à couvrir au moins
 * `frameBudget` caractères (au moins un mot si le buffer n'est pas vide).
 * Le DERNIER token du buffer n'est jamais prélevé s'il n'est pas suivi
 * d'espace : rien ne prouve qu'il est terminé, le prochain delta pourrait
 * le prolonger — sauf s'il est anormalement long (au-delà de
 * budget×LONG_TOKEN_FACTOR : URL, identifiant, texte CJK sans espaces),
 * auquel cas on le découpe sur une frontière de POINT DE CODE (Array.from,
 * jamais un couple surrogate) pour ne pas geler l'affichage indéfiniment. */
export function peelWords(
  buffer: string,
  frameBudget: number,
): { revealed: string; rest: string } {
  if (!buffer) return { revealed: "", rest: "" };
  const tokens = tokenizeBuffered(buffer);
  let revealed = "";
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const isLast = i === tokens.length - 1;
    const isWhitespace = /^\s+$/.test(tok);
    if (isLast && !isWhitespace) {
      if (tok.length > frameBudget * LONG_TOKEN_FACTOR) {
        const codePoints = Array.from(tok);
        const take = Math.max(1, Math.min(codePoints.length - 1, Math.round(frameBudget)));
        revealed += codePoints.slice(0, take).join("");
        return { revealed, rest: codePoints.slice(take).join("") };
      }
      break; // mot potentiellement incomplet : on attend le prochain delta
    }
    revealed += tok;
    i += 1;
    if (!isWhitespace && revealed.length >= frameBudget) break;
  }
  return { revealed, rest: tokens.slice(i).join("") };
}

export type TextStreamApply = (threadId: string, text: string) => void;

export interface TextStreamSmootherOptions {
  /** Applique un incrément de texte déjà révélé à l'état du fil (append). */
  apply: TextStreamApply;
  raf?: (cb: (time: number) => void) => number;
  caf?: (handle: number) => void;
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  clearTimeoutFn?: (handle: number) => void;
  /** Onglet masqué ? (rAF gelé → bascule setTimeout). */
  isHidden?: () => boolean;
  prefersReducedMotion?: () => boolean;
}

const defaultRaf = (cb: (time: number) => void) =>
  requestAnimationFrame(cb) as unknown as number;
const defaultCaf = (handle: number) => cancelAnimationFrame(handle);
const defaultSetTimeout = (cb: () => void, ms: number) => setTimeout(cb, ms) as unknown as number;
const defaultClearTimeout = (handle: number) => clearTimeout(handle);
const defaultIsHidden = () => typeof document !== "undefined" && document.hidden;
const defaultPrefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Buffer de lissage PAR FIL — voir le commentaire d'en-tête du module. */
export class TextStreamSmoother {
  private readonly applyFn: TextStreamApply;
  private readonly raf: (cb: (time: number) => void) => number;
  private readonly caf: (handle: number) => void;
  private readonly setTimeoutFn: (cb: () => void, ms: number) => number;
  private readonly clearTimeoutFn: (handle: number) => void;
  private readonly isHidden: () => boolean;
  private readonly prefersReducedMotion: () => boolean;

  private buffers = new Map<string, string>();
  /** Texte cumulé total jamais mis en file (revealed + encore en buffer) —
   * sert uniquement à diffuser l'incrément d'un stream_set (snapshot
   * cumulatif : le texte COMPLET à chaque appel, pas un delta). */
  private delivered = new Map<string, string>();
  /** Débit VERROUILLÉ pour l'épisode de drainage en cours, calculé une fois
   * au moment où du texte arrive (frameCharBudget sur le backlog total à cet
   * instant), puis réutilisé tel quel frame après frame — jamais recalculé
   * sur le backlog restant, qui décroît à chaque frame. Recalculer à chaque
   * frame donnerait une décroissance géométrique du débit (comme le backlog
   * rétrécit, le débit rétrécit aussi) : le drainage ralentirait sans cesse
   * au lieu de converger, et la borne de ~500 ms ne serait plus garantie
   * (mesuré : un backlog de 5000 caractères prendrait plus d'1 s au lieu de
   * ~300 ms). Un débit verrouillé par épisode garantit un nombre de frames
   * borné (~20 frames quel que soit le backlog une fois le seuil dépassé,
   * puisque budget ∝ backlog). Remis à jour à chaque nouvelle arrivée de
   * texte (le backlog total peut avoir grossi ou rétréci entre-temps). */
  private frameBudgets = new Map<string, number>();
  /** `watchdog` n'existe que pour une entrée "raf" — le setTimeout de secours
   * annulé dès que le rAF tire normalement (voir RAF_WATCHDOG_MS). */
  private scheduled = new Map<string, { kind: "raf" | "timer"; handle: number; watchdog?: number }>();

  constructor(opts: TextStreamSmootherOptions) {
    this.applyFn = opts.apply;
    this.raf = opts.raf ?? defaultRaf;
    this.caf = opts.caf ?? defaultCaf;
    this.setTimeoutFn = opts.setTimeoutFn ?? defaultSetTimeout;
    this.clearTimeoutFn = opts.clearTimeoutFn ?? defaultClearTimeout;
    this.isHidden = opts.isHidden ?? defaultIsHidden;
    this.prefersReducedMotion = opts.prefersReducedMotion ?? defaultPrefersReducedMotion;
  }

  /** Delta incrémental (append) — le cas normal (tous les providers). */
  pushDelta(threadId: string, text: string): void {
    if (!text) return;
    const already = this.delivered.get(threadId) ?? "";
    this.delivered.set(threadId, already + text);
    if (this.prefersReducedMotion()) {
      this.flush(threadId);
      this.applyFn(threadId, text);
      return;
    }
    const buffer = (this.buffers.get(threadId) ?? "") + text;
    this.buffers.set(threadId, buffer);
    this.frameBudgets.set(threadId, frameCharBudget(buffer.length));
    this.schedule(threadId);
  }

  /** Snapshot cumulatif (remplace le texte entier — Codex `stream_set`) : ne
   * met en file QUE l'incrément par rapport à ce qui a déjà été reçu. Une
   * divergence (correction non préfixe, ex. réécriture) flushe tout et
   * applique le texte tel quel pour CET événement, sans lissage — jamais de
   * perte ni de duplication. */
  pushStreamSet(threadId: string, fullText: string): void {
    const already = this.delivered.get(threadId) ?? "";
    if (fullText === already) return;
    if (!fullText.startsWith(already)) {
      this.flush(threadId);
      this.delivered.set(threadId, fullText);
      this.applyFn(threadId, fullText);
      return;
    }
    const increment = fullText.slice(already.length);
    this.delivered.set(threadId, fullText);
    if (this.prefersReducedMotion()) {
      this.flush(threadId);
      this.applyFn(threadId, increment);
      return;
    }
    const buffer = (this.buffers.get(threadId) ?? "") + increment;
    this.buffers.set(threadId, buffer);
    this.frameBudgets.set(threadId, frameCharBudget(buffer.length));
    this.schedule(threadId);
  }

  /** Réinitialise le suivi d'un fil sur un texte déjà matérialisé (rattrapage
   * de reconnexion, catch-up) — pas de lissage pour cet instantané, il est
   * déjà affiché tel quel (pas de replay au montage). */
  resetTo(threadId: string, fullText: string): void {
    this.cancelScheduled(threadId);
    this.buffers.delete(threadId);
    this.frameBudgets.delete(threadId);
    this.delivered.set(threadId, fullText);
  }

  /** Vide immédiatement et intégralement le buffer d'un fil (ordre
   * préservé : à appeler avant tout événement non textuel du même fil).
   * `endTurn` efface aussi le suivi cumulatif — le tour est terminé, la
   * prochaine bulle streaming du fil repart de zéro. */
  flush(threadId: string, opts: { endTurn?: boolean } = {}): void {
    this.cancelScheduled(threadId);
    const rest = this.buffers.get(threadId);
    if (rest) {
      this.buffers.delete(threadId);
      this.frameBudgets.delete(threadId);
      this.applyFn(threadId, rest);
    }
    if (opts.endTurn) this.delivered.delete(threadId);
  }

  private cancelScheduled(threadId: string): void {
    const s = this.scheduled.get(threadId);
    if (!s) return;
    this.scheduled.delete(threadId);
    if (s.kind === "raf") {
      this.caf(s.handle);
      if (s.watchdog != null) this.clearTimeoutFn(s.watchdog);
    } else {
      this.clearTimeoutFn(s.handle);
    }
  }

  private schedule(threadId: string): void {
    if (this.scheduled.has(threadId)) return;
    if (this.isHidden()) {
      const handle = this.setTimeoutFn(() => {
        this.scheduled.delete(threadId);
        this.step(threadId);
      }, HIDDEN_TAB_TICK_MS);
      this.scheduled.set(threadId, { kind: "timer", handle });
      return;
    }
    // rAF normal, MAIS avec un filet setTimeout (RAF_WATCHDOG_MS) : le
    // premier des deux à tirer gagne et annule l'autre — voir le
    // commentaire de RAF_WATCHDOG_MS pour pourquoi document.hidden seul ne
    // suffit pas à garantir la progression.
    let settled = false;
    const rafHandle = this.raf(() => {
      if (settled) return;
      settled = true;
      this.clearTimeoutFn(watchdogHandle);
      this.scheduled.delete(threadId);
      this.step(threadId);
    });
    const watchdogHandle = this.setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      this.caf(rafHandle);
      this.scheduled.delete(threadId);
      this.step(threadId);
    }, RAF_WATCHDOG_MS);
    this.scheduled.set(threadId, { kind: "raf", handle: rafHandle, watchdog: watchdogHandle });
  }

  private step(threadId: string): void {
    const buffer = this.buffers.get(threadId);
    if (!buffer) return;
    const budget = this.frameBudgets.get(threadId) ?? WORD_BUFFER_BASE_CHARS;
    const { revealed, rest } = peelWords(buffer, budget);
    if (rest) this.buffers.set(threadId, rest);
    else { this.buffers.delete(threadId); this.frameBudgets.delete(threadId); }
    if (revealed) this.applyFn(threadId, revealed);
    // Ne reprogrammer que si CE tick a fait avancer les choses : si tout le
    // reste tient dans un unique mot pas encore suivi d'espace (le flux n'a
    // pas encore livré ce qui vient après), rien à peler tant que de
    // nouvelles données n'arrivent pas — boucler sans arrêt ici tournerait
    // à vide (busy-loop rAF) jusqu'au prochain push()/flush(), qui
    // reprogramment déjà eux-mêmes.
    if (rest && revealed) this.schedule(threadId);
  }
}
