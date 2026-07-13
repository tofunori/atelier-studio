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
import { WorkingStatus } from "./WorkingStatus.tsx";
import { threadDisplayTitle } from "./ThreadList.tsx";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert.tsx";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeftIcon, FileIcon, RefreshCwIcon, XIcon } from "lucide-react";

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
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    lastSequenceRef.current = store.state.durable.lastSequence;
  }, [store.state.durable.lastSequence]);

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
    [store.loadHistory, store.pushEventsImmediate, p.setSendQueue],
  );

  const resync = useCallback(async () => {
    setSyncLabel("Synchronisation…");
    setError(null);
    try {
      const lastSeq = lastSequenceRef.current;
      // Prefer cache hydrate first if empty
      if (lastSeq === 0 && store.state.durable.itemOrder.length === 0) {
        const cache = await loadThreadCache(p.threadId);
        if (cache?.events.length) {
          store.loadHistory(cache.events);
        }
      }
      const localSeq = lastSequenceRef.current;
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
  }, [applyEvents, p.credentials, p.threadId, store.loadHistory, store.pushEventsImmediate]);

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

  // Flux live reprenable : le journal canonique reste l'autorité. Le polling
  // court ne transmet que les événements après la dernière séquence et reprend
  // proprement après veille/réseau sans créer un second reducer.
  useEffect(() => {
    if (loading || p.offline) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "hidden") {
        try {
          const history = await getHistory(
            p.credentials,
            p.threadId,
            lastSequenceRef.current,
          );
          if (cancelled) return;
          if (history.snapshotRequired) {
            await resync();
          } else if (history.events.length) {
            applyEvents(history.events as WireLikeEvent[], "delta");
          }
        } catch {
          // useNetworkSession porte l'état de connexion; une requête live
          // manquée sera naturellement reprise au tick suivant.
        }
      }
      if (!cancelled) timer = setTimeout(poll, 750);
    };
    timer = setTimeout(poll, 150);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyEvents, loading, p.credentials, p.offline, p.threadId, resync]);

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
      const fileAttachments = attachments.filter((attachment) => !attachment.excerpt);
      const selections = attachments.filter((attachment) => attachment.excerpt);
      const selectionNote = selections
        .map((attachment) => {
          const lines = attachment.lineStart
            ? `, lignes ${attachment.lineStart}${attachment.lineEnd && attachment.lineEnd !== attachment.lineStart ? `–${attachment.lineEnd}` : ""}`
            : "";
          return `\n\nExtrait sélectionné de ${attachment.name}${lines}:\n\`\`\`${attachment.kind}\n${attachment.excerpt}\n\`\`\``;
        })
        .join("");
      const attachNote =
        fileAttachments.length > 0
          ? `\n\n[pièces jointes: ${fileAttachments.map((a) => `${a.name}#${a.fileId}`).join(", ")}]`
          : "";
      const prompt = text + selectionNote + attachNote;
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
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="chat-back"
          aria-label="Retour aux conversations"
          onClick={p.onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="chat-heading">
          <h1 className="chat-title">
            {threadDisplayTitle(p.title || p.threadId, p.threadId)}
          </h1>
          <span className="chat-subtitle">Atelier Studio</span>
        </div>
        {store.busy && <WorkingStatus label="En cours" className="chat-working-status" />}
        {(syncLabel || p.offline) && (
          <Alert className="chat-network-status" role="status"><AlertDescription>{p.offline ? "Hors ligne — envoi mis en file" : syncLabel}</AlertDescription></Alert>
        )}
      </div>
      {loading && <Skeleton className="mx-4 mt-4 h-24" aria-label="Chargement" />}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-3 w-auto"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {pendingForThread.length > 0 && (
        <Alert variant={pendingForThread.some((item) => item.status === "failed") ? "destructive" : "default"} className="rounded-none border-x-0">
          <AlertDescription>
            {pendingForThread.filter((x) => x.status === "failed").length
              ? "Envoi en échec"
              : "Messages en attente"}{" "}
            ({pendingForThread.length})
          </AlertDescription>
          <AlertAction>
            <Button type="button" variant="ghost" size="sm" disabled={!!p.offline} onClick={() => void flushQueue()}>
              <RefreshCwIcon data-icon="inline-start" />
              Réessayer
            </Button>
          </AlertAction>
        </Alert>
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
        hasShelf={attachments.length > 0}
        shelf={
          <AttachmentGroup className="composer-attachments">
              {attachments.map((attachment) => (
                <Attachment key={attachment.fileId} size="xs" state="idle">
                  <AttachmentMedia><FileIcon /></AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{attachment.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {attachment.excerpt
                        ? `L${attachment.lineStart ?? "?"}–${attachment.lineEnd ?? attachment.lineStart ?? "?"}`
                        : attachment.kind}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label={`Retirer ${attachment.name}`}
                      onClick={() => setAttachments(removePendingAttachment(attachment.fileId))}
                    >
                      <XIcon />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              ))}
          </AttachmentGroup>
        }
        onAttach={() => void onPickDocument()}
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
