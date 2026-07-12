import { useCallback, useEffect, useRef, useState } from "react";
import { installLifecycleListeners, isDocumentVisible, isNavigatorOnline } from "../app/lifecycle.ts";
import { parseQueue, SEND_QUEUE_STORAGE_KEY, serializeQueue, type SendQueueState } from "./sendQueue.ts";
import {
  initialNetworkContext,
  networkBannerLabel,
  reduceNetwork,
  toConnectionPhase,
  type NetworkContext,
} from "./networkMachine.ts";
import { ReconnectController } from "./reconnectController.ts";
import { GatewayError, listThreads, probeGateway } from "./gatewayClient.ts";
import type { ConnectionPhase, DeviceCredentials, ThreadSummary } from "./types.ts";
import { secureGet, secureSet } from "../native/secureStorage.ts";

export type NetworkSession = {
  net: NetworkContext;
  phase: ConnectionPhase;
  phaseDetail?: string;
  threads: ThreadSummary[];
  threadsLoading: boolean;
  threadsError: string | null;
  sendQueue: SendQueueState;
  setSendQueue: (q: SendQueueState | ((prev: SendQueueState) => SendQueueState)) => void;
  refresh: () => Promise<void>;
  reconnectInfo: { attempt: number; nextDelayMs: number | null; running: boolean };
};

export function useNetworkSession(opts: {
  credentials: DeviceCredentials | null;
  gatewayUrl: string;
  paired: boolean;
}): NetworkSession {
  const [net, setNet] = useState<NetworkContext>(initialNetworkContext);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [sendQueue, setSendQueueState] = useState<SendQueueState>({ items: [] });
  const [reconnectInfo, setReconnectInfo] = useState({
    attempt: 0,
    nextDelayMs: null as number | null,
    running: false,
  });

  const credsRef = useRef(opts.credentials);
  credsRef.current = opts.credentials;
  const urlRef = useRef(opts.gatewayUrl);
  urlRef.current = opts.credentials?.gatewayBaseUrl ?? opts.gatewayUrl;

  const setSendQueue = useCallback(
    (q: SendQueueState | ((prev: SendQueueState) => SendQueueState)) => {
      setSendQueueState((prev) => {
        const next = typeof q === "function" ? q(prev) : q;
        void secureSet(SEND_QUEUE_STORAGE_KEY, serializeQueue(next));
        return next;
      });
    },
    [],
  );

  // load queue on boot
  useEffect(() => {
    void (async () => {
      const raw = await secureGet(SEND_QUEUE_STORAGE_KEY);
      setSendQueueState(parseQueue(raw));
    })();
  }, []);

  const tryConnect = useCallback(async (signal: AbortSignal) => {
    if (!isNavigatorOnline()) {
      setNet((n) => reduceNetwork(n, { type: "GO_OFFLINE" }));
      return false;
    }
    setNet((n) => reduceNetwork(n, { type: "START_CONNECT" }));
    const url = urlRef.current;
    const probe = await probeGateway(url, signal);
    if (signal.aborted) return false;
    if (!probe.ok) {
      if (probe.reason === "version_incompatible") {
        setNet((n) => reduceNetwork(n, { type: "VERSION_INCOMPATIBLE" }));
      } else if (probe.reason === "tailscale_missing") {
        setNet((n) => reduceNetwork(n, { type: "TAILSCALE_MISSING" }));
      } else {
        setNet((n) => reduceNetwork(n, { type: "GO_OFFLINE" }));
      }
      return false;
    }
    const c = credsRef.current;
    if (!c) {
      setNet((n) => reduceNetwork(n, { type: "AUTH_OK" })); // health ok, not paired
      setNet((n) => reduceNetwork(n, { type: "SYNC_OK" }));
      return true;
    }
    setNet((n) => reduceNetwork(n, { type: "AUTH_OK" }));
    setNet((n) => reduceNetwork(n, { type: "START_SYNC" }));
    try {
      setThreadsLoading(true);
      const list = await listThreads(c, signal);
      if (signal.aborted) return false;
      setThreads(list);
      setThreadsError(null);
      setNet((n) => reduceNetwork(n, { type: "SYNC_OK" }));
      return true;
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? (e as GatewayError).status : 0;
      if (status === 401) {
        setNet((n) => reduceNetwork(n, { type: "AUTH_FAIL" }));
        return false;
      }
      setThreadsError(e instanceof Error ? e.message : String(e));
      setNet((n) => reduceNetwork(n, { type: "SYNC_FAIL" }));
      return false;
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const tryConnectRef = useRef(tryConnect);
  tryConnectRef.current = tryConnect;

  const controllerRef = useRef<ReconnectController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new ReconnectController({
      tryConnect: (signal) => tryConnectRef.current(signal),
      onState: setReconnectInfo,
      baseMs: 1000,
      capMs: 30_000,
    });
  }

  const refresh = useCallback(async () => {
    controllerRef.current?.stop();
    const ok = await tryConnectRef.current(new AbortController().signal);
    if (!ok) controllerRef.current?.start();
  }, []);

  // initial + credential changes
  useEffect(() => {
    void refresh();
  }, [opts.credentials?.token, opts.gatewayUrl, refresh]);

  // lifecycle
  useEffect(() => {
    return installLifecycleListeners({
      onBackground: () => {
        setNet((n) => reduceNetwork(n, { type: "BACKGROUND" }));
      },
      onForeground: () => {
        setNet((n) => reduceNetwork(n, { type: "FOREGROUND_RESUME" }));
        // Never claim continuous stream — resync
        void refresh();
      },
      onOnline: () => {
        setNet((n) => reduceNetwork(n, { type: "GO_ONLINE" }));
        void refresh();
      },
      onOffline: () => {
        setNet((n) => reduceNetwork(n, { type: "GO_OFFLINE" }));
        controllerRef.current?.start();
      },
    });
  }, [refresh]);

  // auto-start reconnect when offline
  useEffect(() => {
    if (net.state === "offline" && opts.paired && isDocumentVisible()) {
      controllerRef.current?.start();
    }
    if (net.state === "live") {
      controllerRef.current?.stop();
      controllerRef.current?.resetBackoff();
    }
  }, [net.state, opts.paired]);

  const phase = toConnectionPhase(net, opts.paired);
  const phaseDetail = networkBannerLabel(net) ?? undefined;

  return {
    net,
    phase,
    phaseDetail,
    threads,
    threadsLoading,
    threadsError,
    sendQueue,
    setSendQueue,
    refresh,
    reconnectInfo,
  };
}
