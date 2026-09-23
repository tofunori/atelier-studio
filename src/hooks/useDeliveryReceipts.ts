import { useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { requestReceiptStatus } from "../lib/ws";
import type { AppBanner } from "../lib/appBanner";

export type DeliveryStatus = "unconfirmed" | "received" | "started" | "completed" | "failed" | "cancelled" | "uncertain" | "unknown";
export type DeliveryState = {
  status: DeliveryStatus;
  threadId?: string;
  provider?: string;
  issue?: string;
  updatedAt?: string;
};

function loadPendingReceiptIds() {
  if (typeof localStorage === "undefined") return new Set<string>();
  try {
    const raw = JSON.parse(localStorage.getItem("atelier-studio.pending-receipts") ?? "[]");
    return new Set<string>(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : []);
  } catch {
    return new Set<string>();
  }
}

const terminalDeliveryStatuses = new Set<DeliveryStatus>(["completed", "failed", "cancelled", "uncertain", "unknown"]);

/** Accusés de réception des envois : chaque envoi reste « en attente » (persisté
 *  en localStorage) jusqu'à une réponse terminale du serveur, avec au plus trois
 *  sondes `requestReceiptStatus` par connexion. Ne renvoie jamais un tour. */
export function useDeliveryReceipts(
  ws: MutableRefObject<WebSocket | null>,
  setAppBanner: Dispatch<SetStateAction<AppBanner | null>>,
) {
  const [deliveryStates, setDeliveryStates] = useState<Record<string, DeliveryState>>({});
  const deliveryStatesRef = useRef(new Map<string, DeliveryState>());
  const pendingReceiptIdsRef = useRef(loadPendingReceiptIds());
  const receiptRetryAttemptsRef = useRef(new Map<string, number>());
  const receiptRetryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const receiptRetrySocketRef = useRef<WebSocket | null>(null);

  function persistPendingReceiptIds() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("atelier-studio.pending-receipts", JSON.stringify([...pendingReceiptIdsRef.current]));
    } catch { /* a full/private storage must not block the send path */ }
  }

  function clearReceiptRetry(clientMessageId: string) {
    const timer = receiptRetryTimersRef.current.get(clientMessageId);
    if (timer != null) clearTimeout(timer);
    receiptRetryTimersRef.current.delete(clientMessageId);
    receiptRetryAttemptsRef.current.delete(clientMessageId);
  }

  function rememberDeliveryState(clientMessageId: string, state: DeliveryState) {
    deliveryStatesRef.current.set(clientMessageId, state);
    // Keep a bounded client-side view. Pending ids are retained until their
    // terminal/uncertain answer; old terminal rows are presentation history.
    if (deliveryStatesRef.current.size > 512) {
      for (const [id, old] of deliveryStatesRef.current) {
        if (terminalDeliveryStatuses.has(old.status)) {
          deliveryStatesRef.current.delete(id);
          if (deliveryStatesRef.current.size <= 384) break;
        }
      }
    }
    setDeliveryStates(Object.fromEntries(deliveryStatesRef.current));
  }

  function scheduleReceiptStatus(clientMessageId: string, sock: WebSocket, immediate = false) {
    if (!pendingReceiptIdsRef.current.has(clientMessageId)) return;
    if (receiptRetryTimersRef.current.has(clientMessageId)) return;
    const attempt = receiptRetryAttemptsRef.current.get(clientMessageId) ?? 0;
    if (attempt >= 3) return;
    const delay = immediate ? 0 : [1000, 2000, 4000][attempt] ?? 4000;
    const timer = setTimeout(() => {
      receiptRetryTimersRef.current.delete(clientMessageId);
      if (!pendingReceiptIdsRef.current.has(clientMessageId)) return;
      if (ws.current !== sock || sock.readyState !== 1) {
        if (ws.current?.readyState === 1) scheduleReceiptStatus(clientMessageId, ws.current, true);
        return;
      }
      receiptRetryAttemptsRef.current.set(clientMessageId, attempt + 1);
      if (!requestReceiptStatus(sock, clientMessageId)) return;
      // A response may arrive before this timer is installed; coalescing by id
      // makes the following bounded probe harmless and avoids a resend.
      if (attempt + 1 < 3) scheduleReceiptStatus(clientMessageId, sock);
    }, delay);
    receiptRetryTimersRef.current.set(clientMessageId, timer);
  }

  function reconcilePendingReceipts(sock: WebSocket) {
    if (receiptRetrySocketRef.current !== sock) {
      for (const clientMessageId of pendingReceiptIdsRef.current) clearReceiptRetry(clientMessageId);
      receiptRetrySocketRef.current = sock;
    }
    for (const clientMessageId of pendingReceiptIdsRef.current) {
      scheduleReceiptStatus(clientMessageId, sock, true);
    }
  }

  function trackReceipt(clientMessageId: string, threadId: string, provider: string) {
    pendingReceiptIdsRef.current.add(clientMessageId);
    persistPendingReceiptIds();
    rememberDeliveryState(clientMessageId, { status: "unconfirmed", threadId, provider });
    if (ws.current?.readyState === 1) scheduleReceiptStatus(clientMessageId, ws.current);
  }

  function handleSendReceipt(msg: any) {
    const clientMessageId = typeof msg.clientMessageId === "string" ? msg.clientMessageId : "";
    if (!clientMessageId) return;
    const status = (typeof msg.status === "string" ? msg.status : "unknown") as DeliveryStatus;
    const state: DeliveryState = {
      status,
      ...(typeof msg.threadId === "string" ? { threadId: msg.threadId } : {}),
      ...(typeof msg.provider === "string" ? { provider: msg.provider } : {}),
      ...(typeof msg.issue === "string" ? { issue: msg.issue } : {}),
      ...(typeof msg.updatedAt === "string" ? { updatedAt: msg.updatedAt } : {}),
    };
    rememberDeliveryState(clientMessageId, state);
    if (terminalDeliveryStatuses.has(status)) {
      pendingReceiptIdsRef.current.delete(clientMessageId);
      persistPendingReceiptIds();
      clearReceiptRetry(clientMessageId);
    } else if ((receiptRetryAttemptsRef.current.get(clientMessageId) ?? 0) > 0 && ws.current?.readyState === 1) {
      scheduleReceiptStatus(clientMessageId, ws.current);
    }
    const shortId = clientMessageId.slice(0, 8);
    if (status === "uncertain") {
      setAppBanner({
        requestType: "sendReceipt",
        clientMessageId,
        threadId: state.threadId,
        text: `Envoi ${shortId} : effet fournisseur incertain après redémarrage. Vérifier avant de renvoyer.`,
        actionLabel: "Vérifier l’état",
        onAction: () => { if (ws.current?.readyState === 1) requestReceiptStatus(ws.current, clientMessageId); },
        closable: true,
      });
    } else if (status === "failed" || status === "unknown") {
      setAppBanner({
        requestType: "sendReceipt",
        clientMessageId,
        threadId: state.threadId,
        text: status === "unknown"
          ? `Envoi ${shortId} : état introuvable après reconnexion ; le renvoi reste manuel.`
          : `Envoi ${shortId} : ${state.issue || "échec confirmé"}.`,
        closable: true,
      });
    } else if (status === "completed" || status === "cancelled" || status === "received" || status === "started") {
      setAppBanner((banner) => banner?.requestType === "sendReceipt" && banner.clientMessageId === clientMessageId ? null : banner);
    }
  }

  return { deliveryStates, trackReceipt, handleSendReceipt, reconcilePendingReceipts };
}
