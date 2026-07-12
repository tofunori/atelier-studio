import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceCredentials, WireEvent } from "../transport/types.ts";
import {
  getHistory,
  interruptThread,
  respondInteraction,
  sendMessage,
} from "../transport/gatewayClient.ts";
import { clearBadge, incrementBadge } from "../native/badge.ts";
import { haptic } from "../native/haptics.ts";
import {
  loadNotifPrefs,
  showLocalNotification,
} from "../native/notifications.ts";
import { pickDocuments } from "../native/documentPicker.ts";
import { addPendingAttachment } from "../files/pendingAttach.ts";
import type { InteractionResponse } from "./interactionTypes.ts";
import {
  enqueueSend,
  listRetryable,
  markAcked,
  markDurableByMessageId,
  markFailed,
  markInflight,
  type SendQueueState,
  type QueuedSend,
} from "../transport/sendQueue.ts";
import { syncThreadHistory } from "../transport/syncEngine.ts";
import {
  loadThreadCache,
  mergeCacheEvents,
  saveThreadCache,
} from "../storage/threadCache.ts";
import {
  loadPendingAttachments,
  removePendingAttachment,
} from "../files/pendingAttach.ts";
import type { PendingChatAttachment } from "../files/types.ts";
import { Composer } from "./Composer.tsx";
import { useChatStore } from "./store/useChatStore.ts";
import type { WireLikeEvent } from "./store/types.ts";
import { Transcript } from "./Transcript.tsx";

type Props = {
  threadId: string;
  title?: string;
  credentials: DeviceCredentials;
  onBack: () => void;
  /** Shared send queue from network session. */
  sendQueue: SendQueueState;
  setSendQueue: (q: SendQueueState | ((prev: SendQueueState) => SendQueueState)) => void;
  /** Network degraded / offline — queue locally. */
  offline?: boolean;
  /** Called on foreground sync request. */
  networkEpoch?: number;
};

function newId(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatScreen(p: Props) {
  const store = useChatStore(p.threadId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [prefersReducedMotion, setPrm] = useState(false);
  const [voiceOverHint, setVo] = useState(false);
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>(() =>
    loadPendingAttachments(),
  );

  useEffect(() => {
    // refresh shelf when returning to chat
    setAttachments(loadPendingAttachments());
    // real consultation → reset badge
    clearBadge();
  }, [p.threadId, p.networkEpoch]);

  const notifiedRef = useRef(new Set<string>());
  // Notify on terminal / pending interaction (opt-in prefs) — once per event id
  useEffect(() => {
    const prefs = loadNotifPrefs();
    if (!prefs.enabled) return;
    for (const id of store.state.durable.itemOrder) {
      if (notifiedRef.current.has(id)) continue;
      const it = store.state.durable.itemsById[id];
      if (!it) continue;
      if (it.kind === "done") {
        notifiedRef.current.add(id);
        void showLocalNotification(prefs, {
          kind: "done",
          threadId: p.threadId,
          threadTitle: p.title,
        });
      } else if (it.kind === "error") {
        notifiedRef.current.add(id);
        void showLocalNotification(prefs, {
          kind: "error",
          threadId: p.threadId,
          threadTitle: p.title,
        });
        incrementBadge();
      } else if (it.kind === "interaction" && it.interaction?.state === "pending") {
        notifiedRef.current.add(id);
        void showLocalNotification(prefs, {
          kind: "interaction",
          threadId: p.threadId,
          threadTitle: p.title,
          requestId: it.interaction.requestId,
        });
        incrementBadge();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.state.presentation.metrics.reduceCount, p.threadId, p.title]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setPrm(!!mq?.matches);
    const fn = () => setPrm(!!mq?.matches);
    mq?.addEventListener?.("change", fn);
    setVo(false);
    return () => mq?.removeEventListener?.("change", fn);
  }, []);

  const applyEvents = useCallback(
    (events: WireLikeEvent[], mode: "replace" | "delta") => {
      if (mode === "replace") {
        store.loadHistory(events);
      } else {
        for (const ev of events) store.pushEventsImmediate([ev]);
      }
      // durable acks for queue
      for (const ev of events) {
        if (ev.kind === "user" && ev.meta?.messageId) {
          p.setSendQueue((q) => markDurableByMessageId(q, String(ev.meta!.messageId)));
        }
      }
    },
    [store, p],
  );

  const resync = useCallback(async () => {
    setSyncLabel("Synchronisation…");
    setError(null);
    try {
      const lastSeq = store.state.durable.lastSequence;
      // Prefer cache hydrate first if empty
      if (lastSeq === 0 && store.state.durable.itemOrder.length === 0) {
        const cache = await loadThreadCache(p.threadId);
        if (cache?.events.length) {
          store.loadHistory(cache.events);
        }
      }
      const localSeq = store.state.durable.lastSequence;
      const result = await syncThreadHistory({
        credentials: p.credentials,
        threadId: p.threadId,
        lastSequence: localSeq,
      });
      if (!result.ok) {
        if (result.reason === "auth") setError("Session expirée — réappareiller");
        else setError(result.detail);
        setSyncLabel(null);
        return;
      }
      if (result.mode === "snapshot") {
        applyEvents(result.events, "replace");
      } else if (result.mode === "delta" && result.events.length) {
        applyEvents(result.events, "delta");
      }
      // persist cache projection
      if (result.mode === "snapshot" || result.events.length > 50) {
        const full = result.mode === "snapshot" ? result.events : undefined;
        if (full) {
          await saveThreadCache(p.threadId, full, result.lastSequence);
        } else {
          const hist = await getHistory(p.credentials, p.threadId, 0);
          await saveThreadCache(
            p.threadId,
            hist.events as WireLikeEvent[],
            result.lastSequence,
          );
        }
      } else if (result.events.length) {
        const cache = (await loadThreadCache(p.threadId))?.events ?? [];
        const merged = mergeCacheEvents(cache, result.events);
        await saveThreadCache(p.threadId, merged, result.lastSequence);
      }
      setSyncLabel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSyncLabel(null);
    }
  }, [applyEvents, p.credentials, p.threadId, store]);

  // Initial load: cache then server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cache = await loadThreadCache(p.threadId);
        if (cancelled) return;
        if (cache?.events.length) {
          store.loadHistory(cache.events);
        }
        const lastSeq = cache?.lastSequence ?? 0;
        const result = await syncThreadHistory({
          credentials: p.credentials,
          threadId: p.threadId,
          lastSequence: lastSeq,
        });
        if (cancelled) return;
        if (!result.ok) {
          if (!cache?.events.length) setError(result.detail);
          return;
        }
        if (result.mode === "snapshot") {
          store.loadHistory(result.events);
          await saveThreadCache(p.threadId, result.events, result.lastSequence);
        } else if (result.mode === "delta" && result.events.length) {
          if (!cache?.events.length) {
            // empty cache but delta from 0 — treat as full
            const full = await getHistory(p.credentials, p.threadId, 0);
            if (cancelled) return;
            store.loadHistory(full.events as WireLikeEvent[]);
            await saveThreadCache(
              p.threadId,
              full.events as WireLikeEvent[],
              result.lastSequence,
            );
          } else {
            for (const ev of result.events) store.pushEventsImmediate([ev]);
            const merged = mergeCacheEvents(cache.events, result.events);
            await saveThreadCache(p.threadId, merged, result.lastSequence);
          }
        } else if (!cache?.events.length) {
          const full = await getHistory(p.credentials, p.threadId, 0);
          if (cancelled) return;
          store.loadHistory(full.events as WireLikeEvent[]);
          await saveThreadCache(
            p.threadId,
            full.events as WireLikeEvent[],
            store.state.durable.lastSequence,
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.threadId, p.credentials.token, p.credentials.gatewayBaseUrl]);

  // Foreground / network epoch → resync (no continuous stream promise)
  useEffect(() => {
    if (p.networkEpoch == null || p.networkEpoch === 0) return;
    void resync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.networkEpoch]);

  // Idle promote
  useEffect(() => {
    const stream = store.streaming;
    if (!stream || stream.promoted) return;
    const id = stream.id;
    let cancelled = false;
    const run = () => {
      if (!cancelled) store.promoteItem(id);
    };
    if (typeof requestIdleCallback !== "undefined") {
      const h = requestIdleCallback(run, { timeout: 800 });
      return () => {
        cancelled = true;
        cancelIdleCallback(h);
      };
    }
    const t = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [store.streaming?.id, store.streaming?.text, store]);

  const flushOne = useCallback(
    async (item: QueuedSend) => {
      p.setSendQueue((q) => markInflight(q, item.clientRequestId));
      try {
        await sendMessage(p.credentials, {
          threadId: item.threadId,
          prompt: item.prompt,
          clientRequestId: item.clientRequestId,
          clientMessageId: item.clientMessageId,
        });
        p.setSendQueue((q) => markAcked(q, item.clientRequestId));
        store.sendAccepted(item.clientRequestId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        p.setSendQueue((q) => markFailed(q, item.clientRequestId, msg));
        store.sendFailed(msg);
        throw e;
      }
    },
    [p, store],
  );

  const flushQueue = useCallback(async () => {
    if (p.offline) return;
    const retryable = listRetryable(p.sendQueue, p.threadId);
    for (const item of retryable) {
      try {
        await flushOne(item);
      } catch {
        break; // stop on first failure (likely offline again)
      }
    }
  }, [flushOne, p.offline, p.sendQueue, p.threadId]);

  useEffect(() => {
    if (!p.offline && !loading) void flushQueue();
  }, [p.offline, loading, flushQueue]);

  const onSend = useCallback(
    async (text: string) => {
      const messageId = newId();
      const clientRequestId = newId();
      const attachNote =
        attachments.length > 0
          ? `\n\n[pièces jointes: ${attachments.map((a) => `${a.name}#${a.fileId}`).join(", ")}]`
          : "";
      const prompt = text + attachNote;
      store.optimisticUser(messageId, text, clientRequestId);
      p.setSendQueue((q) =>
        enqueueSend(q, {
          clientRequestId,
          clientMessageId: messageId,
          threadId: p.threadId,
          prompt,
          status: "pending_local",
        }),
      );
      if (p.offline) {
        setSyncLabel("Hors ligne — message en file d'attente");
        return;
      }
      try {
        await flushOne({
          clientRequestId,
          clientMessageId: messageId,
          threadId: p.threadId,
          prompt,
          status: "pending_local",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          attempts: 0,
        });
        setSyncLabel(null);
        // clear attachments after successful queue/send attempt when online
        if (!p.offline) {
          for (const a of attachments) removePendingAttachment(a.fileId);
          setAttachments([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [attachments, flushOne, p, store],
  );

  const onStop = useCallback(async () => {
    store.stopRequested();
    await haptic("medium");
    if (p.offline) {
      setError("Hors ligne — impossible d'interrompre le Mac");
      return;
    }
    try {
      await interruptThread(p.credentials, {
        threadId: p.threadId,
        clientRequestId: newId(),
      });
      store.pushEventsImmediate([
        {
          kind: "done",
          ok: false,
          result: "interrupted",
          meta: {
            eventId: newId(),
            sequence: store.state.durable.lastSequence + 1,
            turnId: store.streaming?.turnId || "turn-stop",
            durable: true,
            ts: Date.now(),
          },
        } as WireLikeEvent,
      ]);
    } catch (e) {
      store.sendFailed(e instanceof Error ? e.message : String(e));
    }
  }, [p.credentials, p.offline, p.threadId, store]);

  const onInteractionRespond = useCallback(
    async (requestId: string, response: InteractionResponse, clientRequestId: string) => {
      if (p.offline) throw new Error("Hors ligne");
      await respondInteraction(p.credentials, {
        threadId: p.threadId,
        requestId,
        response,
        clientRequestId,
      });
      // Optimistic terminal state (server is authority — will be overwritten on resync)
      store.pushEventsImmediate([
        {
          kind: "interaction",
          requestId,
          title: "Interaction",
          interactionType: "approval",
          state:
            "allow" in response
              ? response.allow
                ? "answered"
                : "declined"
              : "action" in response
                ? response.action === "accept"
                  ? "answered"
                  : "declined"
                : "answered",
          answerSummary: "Répondu",
          meta: {
            eventId: `local-int-${clientRequestId}`,
            sequence: store.state.durable.lastSequence + 1,
            turnId: "turn-int",
            itemId: requestId,
            durable: true,
            ts: Date.now(),
          },
        } as WireLikeEvent,
      ]);
      clearBadge();
    },
    [p.credentials, p.offline, p.threadId, store],
  );

  const onPickDocument = useCallback(async () => {
    const docs = await pickDocuments({ multiple: true, accept: "*/*" });
    for (const d of docs) {
      // Local pick — attach metadata only (upload to Mac is gateway future)
      addPendingAttachment({
        fileId: `local:${d.name}:${d.size}`,
        name: d.name,
        size: d.size,
        kind: "data",
        projectId: "local",
        addedAt: Date.now(),
      });
    }
    setAttachments(loadPendingAttachments());
    await haptic("light");
  }, []);

  const pendingForThread = p.sendQueue.items.filter(
    (x) =>
      x.threadId === p.threadId &&
      (x.status === "pending_local" || x.status === "failed" || x.status === "inflight"),
  );

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button type="button" className="back-btn" onClick={p.onBack}>
          ← Conversations
        </button>
        <h1 className="screen-title" style={{ marginBottom: 0 }}>
          {p.title || p.threadId}
        </h1>
        <div className="chat-metrics" aria-hidden>
          flushes {store.metrics.visualFlushCount} · reduces {store.metrics.reduceCount}
          {store.state.durable.lastSequence > 0
            ? ` · seq ${store.state.durable.lastSequence}`
            : ""}
        </div>
        {(syncLabel || p.offline) && (
          <div className="sync-banner" role="status">
            {p.offline ? "Hors ligne — envoi mis en file" : syncLabel}
          </div>
        )}
      </div>
      {loading && <div className="empty">Chargement…</div>}
      {error && (
        <div role="alert" style={{ color: "var(--status-error)", padding: "0 16px" }}>
          {error}
        </div>
      )}
      {pendingForThread.length > 0 && (
        <div className="queue-bar">
          <span>
            {pendingForThread.filter((x) => x.status === "failed").length
              ? "Envoi en échec"
              : "Messages en attente"}{" "}
            ({pendingForThread.length})
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!p.offline}
            onClick={() => void flushQueue()}
          >
            Réessayer
          </button>
        </div>
      )}
      {!loading && (
        <Transcript
          store={store}
          threadId={p.threadId}
          reducedMotion={prefersReducedMotion}
          disableVirtualization={voiceOverHint || store.turnOrder.length < 8}
          onInteractionRespond={onInteractionRespond}
        />
      )}
      <Composer
        busy={store.busy}
        hasShelf
        shelf={
          <>
            <button type="button" className="attach-chip" onClick={() => void onPickDocument()}>
              + Fichier
            </button>
            {attachments.map((a) => (
              <button
                key={a.fileId}
                type="button"
                className="attach-chip"
                onClick={() => setAttachments(removePendingAttachment(a.fileId))}
                aria-label={`Retirer ${a.name}`}
              >
                {a.name} ×
              </button>
            ))}
          </>
        }
        onSend={(t) => void onSend(t)}
        onStop={() => void onStop()}
      />
    </div>
  );
}

/** Test helper */
export function injectLiveEvents(
  pushEvent: (ev: WireLikeEvent) => void,
  events: WireEvent[],
): void {
  for (const ev of events) pushEvent(ev as WireLikeEvent);
}
