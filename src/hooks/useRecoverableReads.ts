import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { AgentEvent } from "../lib/ws";

export type HistoryCursor = { epoch: string; sequence: number; eventId?: string };
type HistoryRequestBoundary = { threadId: string; keys: Set<string> };
export type RecoverableReadType =
  | "getHistory"
  | "listCommands"
  | "listFiles"
  | "listPins"
  | "getUsage"
  | "getSettings"
  | "listHighlights"
  | "listAutomations";
type RecoverableRead = {
  key: string;
  requestType: RecoverableReadType;
  requestId: string;
  threadId?: string;
  projectRoot?: string;
  provider?: string | null;
  cursor?: HistoryCursor;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
};
const READ_RETRY_DELAYS_MS = [250, 750, 1500] as const;

/** Lectures récupérables du sidecar (historique, catalogues, réglages…).
 *  Reads are retried independently of the chat send path. A busy/slow
 *  catalogue must never reconnect the socket or replay a provider turn.
 *  Chaque lecture en vol est indexée par portée et par `requestId` ; une
 *  réponse `REQUEST_BUSY`/`REQUEST_TIMEOUT` relance au plus trois fois tant
 *  que le fil ou le projet visé reste actif. */
export function useRecoverableReads(
  ws: MutableRefObject<WebSocket | null>,
  eventsRef: { readonly current: Record<string, AgentEvent[]> },
  activeIdRef: MutableRefObject<string | null>,
  activeProjectRef: MutableRefObject<string | null>,
) {
  const historyRequestBoundariesRef = useRef(new Map<string, HistoryRequestBoundary>());
  const historyRequestOrderRef = useRef(new Map<string, string[]>());
  const recoverableReadsRef = useRef(new Map<string, RecoverableRead>());
  const recoverableReadsByRequestIdRef = useRef(new Map<string, string>());

  function historyEventKey(event: AgentEvent): string | null {
    const meta = event.meta as any;
    if (meta && typeof meta.eventId === "string") return `event:${meta.eventId}`;
    if (meta && typeof meta.messageId === "string") return `message:${meta.messageId}`;
    return null;
  }

  function recoverableReadKey(
    requestType: RecoverableReadType,
    scope: { threadId?: string; projectRoot?: string; provider?: string | null; cursor?: HistoryCursor } = {},
  ): string {
    if (requestType === "getHistory") {
      const cursor = scope.cursor
        ? `${scope.cursor.epoch}:${scope.cursor.sequence}:${scope.cursor.eventId ?? ""}`
        : "full";
      return `${requestType}:${scope.threadId ?? ""}:${cursor}`;
    }
    return `${requestType}:${scope.projectRoot ?? ""}:${scope.provider ?? ""}`;
  }

  function forgetHistoryRequestBoundary(requestId: string) {
    if (!requestId) return;
    const boundary = historyRequestBoundariesRef.current.get(requestId);
    if (!boundary) return;
    historyRequestBoundariesRef.current.delete(requestId);
    const order = historyRequestOrderRef.current.get(boundary.threadId);
    if (!order) return;
    const next = order.filter((id) => id !== requestId);
    if (next.length) historyRequestOrderRef.current.set(boundary.threadId, next);
    else historyRequestOrderRef.current.delete(boundary.threadId);
  }

  function forgetRecoverableRead(key: string, dropHistoryBoundary = false) {
    const current = recoverableReadsRef.current.get(key);
    if (!current) return;
    if (current.timer != null) clearTimeout(current.timer);
    if (dropHistoryBoundary && current.requestType === "getHistory") {
      forgetHistoryRequestBoundary(current.requestId);
    }
    recoverableReadsRef.current.delete(key);
    if (recoverableReadsByRequestIdRef.current.get(current.requestId) === key) {
      recoverableReadsByRequestIdRef.current.delete(current.requestId);
    }
  }

  function findRecoverableRead(msg: any): RecoverableRead | undefined {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    if (requestId) {
      const key = recoverableReadsByRequestIdRef.current.get(requestId);
      if (key) return recoverableReadsRef.current.get(key);
      // An explicit id is a promise about one read. Never attach a late or
      // unknown response/error to another in-flight chat/project request.
      return undefined;
    }
    const requestType = msg.requestType as RecoverableReadType | undefined;
    if (!requestType) return undefined;
    const candidates = [...recoverableReadsRef.current.values()]
      .filter((entry) => entry.requestType === requestType)
      .filter((entry) => !msg.threadId || entry.threadId === msg.threadId)
      .filter((entry) => !msg.projectRoot || entry.projectRoot === msg.projectRoot)
      .filter((entry) => !msg.provider || entry.provider === msg.provider);
    return candidates[candidates.length - 1];
  }

  function recoverableReadScopeIsActive(entry: RecoverableRead): boolean {
    if (entry.threadId && activeIdRef.current !== entry.threadId) return false;
    if (entry.projectRoot && activeProjectRef.current !== entry.projectRoot) return false;
    return ws.current?.readyState === 1;
  }

  function issueRecoverableRead(
    requestType: Exclude<RecoverableReadType, "getHistory">,
    scope: { projectRoot?: string; provider?: string | null; threadId?: string },
    attempt = 0,
    force = false,
  ): boolean {
    const sock = ws.current;
    if (!sock || sock.readyState !== 1) return false;
    const key = recoverableReadKey(requestType, scope);
    const existing = recoverableReadsRef.current.get(key);
    if (existing && !force) return true;
    if (existing) forgetRecoverableRead(key);
    const requestId = crypto.randomUUID();
    const message: Record<string, unknown> = {
      type: requestType,
      ...(scope.projectRoot ? { projectRoot: scope.projectRoot } : {}),
      ...(scope.provider ? { provider: scope.provider } : {}),
      requestId,
    };
    try {
      sock.send(JSON.stringify(message));
    } catch {
      return false;
    }
    const entry: RecoverableRead = {
      key,
      requestType,
      requestId,
      ...(scope.threadId ? { threadId: scope.threadId } : {}),
      ...(scope.projectRoot ? { projectRoot: scope.projectRoot } : {}),
      ...(scope.provider !== undefined ? { provider: scope.provider } : {}),
      attempt,
    };
    recoverableReadsRef.current.set(key, entry);
    recoverableReadsByRequestIdRef.current.set(requestId, key);
    return true;
  }

  function requestCatalogRead(
    requestType: "listCommands" | "listFiles",
    projectRoot: string,
    provider?: string | null,
    attempt = 0,
    force = false,
  ): boolean {
    return issueRecoverableRead(requestType, { projectRoot, provider }, attempt, force);
  }

  function requestCatalogWithRecovery(projectRoot: string, provider?: string | null) {
    requestCatalogRead("listCommands", projectRoot, provider);
    requestCatalogRead("listFiles", projectRoot);
  }

  function requestFileCatalogWithRecovery(projectRoot: string) {
    requestCatalogRead("listFiles", projectRoot);
  }

  function requestGlobalRead(
    requestType: "getUsage" | "getSettings" | "listHighlights" | "listAutomations",
    attempt = 0,
    force = false,
  ): boolean {
    return issueRecoverableRead(requestType, {}, attempt, force);
  }

  type HistoryRequestOptions = {
    force?: boolean;
    retryAttempt?: number;
    recoveryKey?: string;
  };

  function requestHistory(threadId: string, cursor?: HistoryCursor, options: HistoryRequestOptions = {}) {
    if (ws.current?.readyState !== 1) return false;
    const key = options.recoveryKey ?? recoverableReadKey("getHistory", { threadId, cursor });
    const existing = recoverableReadsRef.current.get(key);
    if (existing && !options.force) return true;
    if (existing) {
      // The old request has either timed out or is being replaced by a bounded
      // retry. Its snapshot boundary must not be reused by a later legacy
      // response after the new request has been issued.
      forgetHistoryRequestBoundary(existing.requestId);
      forgetRecoverableRead(key);
    }
    const keys = new Set(
      (eventsRef.current[threadId] ?? [])
        .map(historyEventKey)
        .filter((key): key is string => key !== null),
    );
    const requestId = crypto.randomUUID();
    historyRequestBoundariesRef.current.set(requestId, { threadId, keys });
    const order = historyRequestOrderRef.current.get(threadId) ?? [];
    order.push(requestId);
    // A disconnected socket can leave a request without a response. Keep a
    // small ordered fallback queue for legacy servers that do not echo
    // requestId, while bounding the per-thread refs across a long session.
    while (order.length > 16) {
      const expired = order.shift();
      if (expired) historyRequestBoundariesRef.current.delete(expired);
    }
    historyRequestOrderRef.current.set(threadId, order);
    try {
      ws.current.send(JSON.stringify({
        type: "getHistory",
        threadId,
        requestId,
        ...(cursor ? { historyCursor: cursor } : {}),
      }));
      ws.current.send(JSON.stringify({
        type: "getReviews",
        requestId: crypto.randomUUID(),
        threadId,
      }));
    } catch {
      forgetHistoryRequestBoundary(requestId);
      return false;
    }
    const entry: RecoverableRead = {
      key,
      requestType: "getHistory",
      requestId,
      threadId,
      ...(cursor ? { cursor } : {}),
      attempt: options.retryAttempt ?? 0,
    };
    recoverableReadsRef.current.set(key, entry);
    recoverableReadsByRequestIdRef.current.set(requestId, key);
    return true;
  }

  function takeHistoryRequestBoundary(threadId: string, requestId?: string): Set<string> | undefined {
    let selectedId = requestId;
    let boundary = selectedId ? historyRequestBoundariesRef.current.get(selectedId) : undefined;
    // An explicit id belongs to one precise read. If an old socket response
    // arrives after its boundary was evicted, dropping it is safer than
    // borrowing the next request for this thread and applying the wrong live
    // preservation policy.
    if (selectedId && (!boundary || boundary.threadId !== threadId)) return undefined;
    if (!boundary) {
      selectedId = undefined;
      boundary = undefined;
      const order = historyRequestOrderRef.current.get(threadId) ?? [];
      while (order.length && !boundary) {
        const candidateId = order.shift()!;
        const candidate = historyRequestBoundariesRef.current.get(candidateId);
        historyRequestBoundariesRef.current.delete(candidateId);
        if (candidate?.threadId === threadId) {
          selectedId = candidateId;
          boundary = candidate;
        }
      }
      if (order.length) historyRequestOrderRef.current.set(threadId, order);
      else historyRequestOrderRef.current.delete(threadId);
    } else if (selectedId) {
      historyRequestBoundariesRef.current.delete(selectedId);
      const order = historyRequestOrderRef.current.get(threadId);
      if (order) {
        const index = order.indexOf(selectedId);
        if (index >= 0) order.splice(index, 1);
        if (order.length) historyRequestOrderRef.current.set(threadId, order);
        else historyRequestOrderRef.current.delete(threadId);
      }
    }
    return boundary?.keys;
  }

  function settleRecoverableRead(msg: any, requestType?: RecoverableReadType): boolean {
    const entry = findRecoverableRead({ ...msg, ...(requestType ? { requestType } : {}) });
    if (!entry || (requestType && entry.requestType !== requestType)) return false;
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    if (requestId && requestId !== entry.requestId) return false;
    // History still needs its request boundary while the response is applied;
    // the handler consumes it immediately below. Other reads have no such
    // merge boundary and can be released at once.
    forgetRecoverableRead(entry.key, entry.requestType !== "getHistory");
    return true;
  }

  function scheduleRecoverableReadRetry(msg: any): boolean {
    const requestType = msg.requestType as RecoverableReadType | undefined;
    const recoverableTypes: RecoverableReadType[] = ["getHistory", "listCommands", "listFiles", "getUsage", "getSettings", "listHighlights", "listAutomations"];
    if (!requestType || !recoverableTypes.includes(requestType)) {
      return false;
    }
    const entry = findRecoverableRead(msg);
    if (!entry) return false;
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    if (requestId && requestId !== entry.requestId) return false;
    if (!recoverableReadScopeIsActive(entry)) {
      forgetRecoverableRead(entry.key, true);
      return false;
    }
    // A read error that is not explicitly retryable must release its in-flight
    // slot. Otherwise a later periodic/global read is coalesced forever with
    // the failed request.
    if (msg.code !== "REQUEST_BUSY" && msg.code !== "REQUEST_TIMEOUT") {
      forgetRecoverableRead(entry.key, true);
      return false;
    }
    if (entry.timer != null) return true;
    if (entry.attempt >= READ_RETRY_DELAYS_MS.length) {
      forgetRecoverableRead(entry.key, true);
      return false;
    }
    const delay = READ_RETRY_DELAYS_MS[entry.attempt];
    entry.timer = setTimeout(() => {
      const current = recoverableReadsRef.current.get(entry.key);
      if (current !== entry) return;
      entry.timer = undefined;
      if (!recoverableReadScopeIsActive(entry)) {
        if (entry.requestType === "getHistory") forgetHistoryRequestBoundary(entry.requestId);
        forgetRecoverableRead(entry.key);
        return;
      }
      if (entry.requestType === "getHistory") {
        requestHistory(entry.threadId!, entry.cursor, {
          force: true,
          retryAttempt: entry.attempt + 1,
          recoveryKey: entry.key,
        });
      } else if (entry.requestType === "listCommands" || entry.requestType === "listFiles") {
        requestCatalogRead(entry.requestType, entry.projectRoot ?? "", entry.provider, entry.attempt + 1, true);
      } else {
        switch (entry.requestType) {
          case "getUsage":
          case "getSettings":
          case "listHighlights":
          case "listAutomations":
            requestGlobalRead(entry.requestType, entry.attempt + 1, true);
            break;
          default:
            forgetRecoverableRead(entry.key, true);
        }
      }
    }, delay);
    return true;
  }

  function cancelRecoverableReadsOutsideScope(threadId: string | null, projectRoot: string | null) {
    for (const entry of [...recoverableReadsRef.current.values()]) {
      const threadOutside = entry.threadId != null && entry.threadId !== threadId;
      const projectOutside = entry.projectRoot != null && entry.projectRoot !== projectRoot;
      if (!threadOutside && !projectOutside) continue;
      if (entry.requestType === "getHistory") forgetHistoryRequestBoundary(entry.requestId);
      forgetRecoverableRead(entry.key);
    }
  }

  function cancelRecoverableReadsForSocket() {
    for (const entry of [...recoverableReadsRef.current.values()]) {
      if (entry.requestType === "getHistory") forgetHistoryRequestBoundary(entry.requestId);
      forgetRecoverableRead(entry.key);
    }
  }

  return {
    requestCatalogWithRecovery,
    requestFileCatalogWithRecovery,
    requestGlobalRead,
    requestHistory,
    takeHistoryRequestBoundary,
    settleRecoverableRead,
    scheduleRecoverableReadRetry,
    cancelRecoverableReadsOutsideScope,
    cancelRecoverableReadsForSocket,
  };
}
