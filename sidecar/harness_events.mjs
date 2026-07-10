import { randomUUID as nodeRandomUUID } from "node:crypto";

// Sérialiseur universel de turns (plan 025) — la SEULE porte d'émission des
// événements durables d'un thread. Il attribue la metadata schema v1
// (eventId, sequence monotone, turnId/messageId/itemId, durable, origin),
// garantit exactement un terminal par turn, et sérialise les enrichissements
// asynchrones : un `edit` enrichi en vol ne peut pas être dépassé par le
// `done` qui le suit. Broadcast et journal reçoivent LE MÊME objet, dans le
// même ordre ; les éphémères sont broadcastés mais jamais journalisés.

export const DURABLE_KINDS = new Set([
  "user",
  "text",
  "thinking",
  "tool",
  "tool_update",
  "edit",
  "todos",
  "goal",
  "interaction",
  "usage",
  "done",
  "error",
  "permission",
]);

export function createHarnessThread({
  threadId,
  provider,
  emit,
  journal,
  now = Date.now,
  randomUUID = nodeRandomUUID,
  initialSequence = 0, // reprise d'un thread journalisé : la sequence reste monotone entre process
}) {
  let sequence = Number.isFinite(initialSequence) && initialSequence > 0 ? initialSequence : 0;
  let chain = Promise.resolve();
  let active = null;
  let currentProvider = provider;
  const turns = new Map(); // turnId -> { status: "active"|"queued"|"done", terminal: bool, nativeTurnId? }

  function decorate(event, turnId, opts = {}) {
    const { messageId, itemId, nativeThreadId, nativeTurnId, origin } = opts;
    const nTurn = nativeTurnId ?? turns.get(turnId)?.nativeTurnId;
    const meta = {
      schemaVersion: 1,
      eventId: randomUUID(),
      provider: currentProvider,
      threadId,
      turnId,
      ...(messageId ? { messageId } : {}),
      ...(itemId ? { itemId: String(itemId) } : {}),
      ...(nativeThreadId ? { nativeThreadId } : {}),
      ...(nTurn ? { nativeTurnId: nTurn } : {}),
      sequence: ++sequence,
      ts: now(),
      durable: DURABLE_KINDS.has(event.kind),
      origin: origin ?? "provider",
    };
    return { ...event, meta };
  }

  function dispatch(out) {
    emit(out);
    if (out.meta.durable) journal?.append(out);
  }

  // FIFO par thread : chaque émission attend la précédente. Une émission qui
  // rejette est neutralisée pour ne pas figer le thread entier.
  function enqueue(fn) {
    const p = chain.then(fn);
    chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  function emitUser(turnId, messageId, userEvent, extras = {}) {
    return enqueue(() => {
      dispatch(decorate(userEvent, turnId, { messageId, origin: "atelier", ...extras }));
    });
  }

  return {
    threadId,
    provider,

    activeTurnId: () => active,

    turnStatus: (turnId) => turns.get(turnId)?.status ?? null,

    /** Un thread peut changer de provider en cours de vie — la sequence reste monotone. */
    setProvider(p) {
      if (p) currentProvider = p;
    },

    /** Attache le turn natif du provider (Codex turn/started) au turn universel. */
    setNativeTurnId(turnId, nativeTurnId) {
      const t = turns.get(turnId);
      if (t && nativeTurnId) t.nativeTurnId = String(nativeTurnId);
    },

    /** Nouveau turn actif. Émet l'événement user (origin atelier) s'il est fourni. */
    startTurn({ turnId, messageId, userEvent, nativeThreadId } = {}) {
      const id = turnId ?? randomUUID();
      turns.set(id, { status: "active", terminal: false });
      active = id;
      if (userEvent) emitUser(id, messageId, userEvent, { nativeThreadId });
      return id;
    },

    /** Message injecté dans le turn actif : messageId propre, MÊME turnId. */
    steer({ messageId, userEvent }) {
      if (!active) return null;
      const id = active;
      if (userEvent) emitUser(id, messageId, userEvent);
      return id;
    },

    /** Réserve un turn distinct, visible immédiatement comme queued. */
    queue({ turnId, messageId, userEvent } = {}) {
      const id = turnId ?? randomUUID();
      turns.set(id, { status: "queued", terminal: false });
      if (userEvent) emitUser(id, messageId, userEvent);
      return id;
    },

    /** Active un turn réservé — à appeler seulement après le terminal du précédent. */
    activateQueued(turnId) {
      const t = turns.get(turnId);
      if (!t || t.status !== "queued") return false;
      t.status = "active";
      active = turnId;
      return true;
    },

    /**
     * Émet un événement (ou une promesse d'événement enrichi) du turn.
     * nativeMeta : { itemId?, nativeTurnId?, messageId? } — itemId prime sur event.id.
     */
    emit(turnId, eventOrPromise, nativeMeta = {}) {
      return enqueue(async () => {
        const event = await eventOrPromise;
        if (!event) return;
        const itemId = nativeMeta.itemId ?? event.id;
        dispatch(decorate(event, turnId, { ...nativeMeta, itemId }));
      });
    },

    /**
     * Terminal (done/error) du turn — exactement un par turn : un second
     * terminal est refusé (retourne false) sans être émis.
     */
    terminal(turnId, eventOrPromise, nativeMeta = {}) {
      return enqueue(async () => {
        const t = turns.get(turnId);
        if (!t || t.terminal) {
          console.warn(`[harness] terminal dupliqué ignoré (thread ${threadId}, turn ${turnId})`);
          return false;
        }
        const event = await eventOrPromise;
        t.terminal = true;
        t.status = "done";
        if (active === turnId) active = null;
        dispatch(decorate(event, turnId, nativeMeta));
        return true;
      });
    },
  };
}
