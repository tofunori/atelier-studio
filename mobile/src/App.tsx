import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Tabs } from "@/components/ui/tabs.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { ArrowLeftIcon } from "lucide-react";
import { BottomTabBar, type AppTab } from "./app/BottomTabBar.tsx";
import { bannerFor, redactDiagnostics } from "./app/connectionState.ts";
import { ChatScreen } from "./chat/ChatScreen.tsx";
import { ThreadList } from "./chat/ThreadList.tsx";
import { FilesScreen } from "./files/FilesScreen.tsx";
import { GalleryScreen } from "./gallery/GalleryScreen.tsx";
import { DiagnosticsScreen } from "./settings/DiagnosticsScreen.tsx";
import { PairingScreen } from "./settings/PairingScreen.tsx";
import { SettingsScreen } from "./settings/SettingsScreen.tsx";
import { parseDeepLink } from "./native/notifications.ts";
import {
  clearCredentials,
  loadCredentials,
  loadLastGatewayUrl,
  saveCredentials,
  saveLastGatewayUrl,
} from "./storage/credentials.ts";
import { countCachedThreads, purgeExpiredCaches } from "./storage/threadCache.ts";
import { pairDevice } from "./transport/gatewayClient.ts";
import { PROTOCOL_VERSION } from "./transport/protocol.ts";
import { useNetworkSession } from "./transport/useNetworkSession.ts";
import type { DeviceCredentials } from "./transport/types.ts";

const APP_VERSION = "0.1.0-i";

type Overlay = "none" | "pairing" | "diagnostics" | "thread";

export default function App() {
  const [tab, setTab] = useState<AppTab>("chats");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [creds, setCreds] = useState<DeviceCredentials | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState("http://127.0.0.1:18765");
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [booted, setBooted] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [networkEpoch, setNetworkEpoch] = useState(0);
  const [creatingThread, setCreatingThread] = useState(false);

  const session = useNetworkSession({
    credentials: creds,
    gatewayUrl,
    paired: !!creds,
  });

  const banner = useMemo(
    () =>
      bannerFor(session.phase, {
        detail: session.phaseDetail ?? lastError ?? undefined,
      }),
    [session.phase, session.phaseDetail, lastError],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await loadLastGatewayUrl();
      const c = await loadCredentials();
      if (cancelled) return;
      setGatewayUrl(url);
      setCreds(c);
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep links: atelier://open?threadId=…&requestId=…
  useEffect(() => {
    const onLink = (ev: Event) => {
      const detail = (ev as CustomEvent<{ url?: string }>).detail;
      const url = detail?.url || (typeof location !== "undefined" ? location.href : "");
      const t = parseDeepLink(url);
      if (t?.threadId) {
        setActiveThreadId(t.threadId);
        setOverlay("thread");
        setTab("chats");
      }
    };
    window.addEventListener("atelier-deeplink", onLink);
    // Also parse hash on load: #thread=id
    if (typeof location !== "undefined" && location.hash.startsWith("#thread=")) {
      const id = location.hash.slice("#thread=".length);
      if (id) {
        setActiveThreadId(id);
        setOverlay("thread");
      }
    }
    return () => window.removeEventListener("atelier-deeplink", onLink);
  }, []);

  const prevNet = useRef(session.net.state);
  useEffect(() => {
    const prev = prevNet.current;
    prevNet.current = session.net.state;
    // Resync chat only on recovery transitions (not every live tick)
    if (
      (prev === "offline" || prev === "degraded" || prev === "connecting") &&
      (session.net.state === "live" || session.net.state === "syncing")
    ) {
      setNetworkEpoch((n) => n + 1);
    }
    if (session.net.lastError) setLastError(session.net.lastError);
  }, [session.net.state, session.net.lastError]);

  const onPair = async (code: string, deviceName: string) => {
    setPairBusy(true);
    setPairError(null);
    try {
      await saveLastGatewayUrl(gatewayUrl);
      const res = await pairDevice({ baseUrl: gatewayUrl, code, deviceName });
      const next: DeviceCredentials = {
        deviceId: res.deviceId,
        token: res.token,
        name: res.name,
        scopes: res.scopes ?? [],
        gatewayBaseUrl: gatewayUrl.replace(/\/$/, ""),
        pairedAt: Date.now(),
      };
      await saveCredentials(next);
      setCreds(next);
      setOverlay("none");
      setTab("chats");
      await session.refresh();
    } catch (e) {
      setPairError(e instanceof Error ? e.message : String(e));
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairBusy(false);
    }
  };

  const openThread = (id: string) => {
    if (!creds) {
      setOverlay("pairing");
      return;
    }
    setActiveThreadId(id);
    setOverlay("thread");
  };

  const createChat = async (body: { title: string; provider: string; model: string }) => {
    if (!creds) {
      setOverlay("pairing");
      return;
    }
    setCreatingThread(true);
    try {
      const created = await session.createThread(body);
      setActiveThreadId(created.id);
      setOverlay("thread");
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingThread(false);
    }
  };

  const revokeLocal = async () => {
    await clearCredentials();
    setCreds(null);
    setActiveThreadId(null);
    setOverlay("pairing");
  };

  const [cacheThreads, setCacheThreads] = useState<number | undefined>();
  useEffect(() => {
    void (async () => {
      await purgeExpiredCaches();
      setCacheThreads(await countCachedThreads());
    })();
  }, [session.net.state, booted]);

  const diagText = redactDiagnostics({
    phase: session.phase,
    gatewayBaseUrl: creds?.gatewayBaseUrl ?? gatewayUrl,
    credentials: creds,
    lastError:
      lastError ??
      (session.reconnectInfo.running
        ? `reconnect attempt=${session.reconnectInfo.attempt} delay=${session.reconnectInfo.nextDelayMs}`
        : null),
    appVersion: APP_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    networkState: session.net.state,
    badgeCount: (() => {
      try {
        return Number(localStorage.getItem("atelier.badgeCount.v1") || 0);
      } catch {
        return undefined;
      }
    })(),
    cacheThreads,
  });

  const copyDiag = async () => {
    try {
      await navigator.clipboard.writeText(diagText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setLastError("copie impossible");
    }
  };

  if (!booted) {
    return (
      <div className="app-shell">
        <Empty>
          <EmptyHeader>
            <Spinner />
            <EmptyTitle>Démarrage…</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const showTabBar = overlay === "none";
  const offline =
    session.net.state === "offline" ||
    session.phase === "offline" ||
    session.phase === "tailscale_missing";

  return (
    <div className="app-shell">
      <Toaster position="top-center" richColors />
      {session.phase !== "ready" && (
        <Alert
          variant={banner.tone === "error" ? "destructive" : "default"}
          className="rounded-none border-x-0 border-t-0"
          role="status"
        >
          <AlertDescription>
            {banner.label}
            {session.reconnectInfo.running && session.reconnectInfo.attempt > 0
              ? ` (essai ${session.reconnectInfo.attempt})`
              : ""}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as AppTab)} className="contents">
      <main className="app-main">
        {overlay === "pairing" && (
          <PairingScreen
            gatewayUrl={gatewayUrl}
            onGatewayUrlChange={setGatewayUrl}
            onPair={onPair}
            busy={pairBusy}
            error={pairError}
          />
        )}
        {overlay === "diagnostics" && (
          <div>
            <div className="screen pb-0">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOverlay("none")}>
                <ArrowLeftIcon data-icon="inline-start" />
                Réglages
              </Button>
            </div>
            <DiagnosticsScreen text={diagText} onCopy={() => void copyDiag()} copied={copied} />
          </div>
        )}
        {overlay === "thread" && activeThreadId && creds && (
          <ChatScreen
            threadId={activeThreadId}
            title={session.threads.find((t) => t.id === activeThreadId)?.title}
            credentials={creds}
            sendQueue={session.sendQueue}
            setSendQueue={session.setSendQueue}
            offline={offline}
            networkEpoch={networkEpoch}
            onBack={() => {
              setOverlay("none");
              setActiveThreadId(null);
            }}
          />
        )}
        {overlay === "none" && tab === "chats" && (
          <ThreadList
            threads={session.threads}
            loading={session.threadsLoading}
            error={session.threadsError}
            onOpen={openThread}
            onRefresh={() => void session.refresh()}
            onCreate={createChat}
            creating={creatingThread}
          />
        )}
        {overlay === "none" && tab === "gallery" && (
          <GalleryScreen
            credentials={creds}
            onNeedPair={() => setOverlay("pairing")}
          />
        )}
        {overlay === "none" && tab === "files" && (
          <FilesScreen credentials={creds} onNeedPair={() => setOverlay("pairing")} />
        )}
        {overlay === "none" && tab === "settings" && (
          <SettingsScreen
            phase={session.phase}
            credentials={creds}
            gatewayUrl={gatewayUrl}
            onOpenPairing={() => setOverlay("pairing")}
            onOpenDiagnostics={() => setOverlay("diagnostics")}
            onRevokeLocal={() => void revokeLocal()}
            onRefresh={() => void session.refresh()}
          />
        )}
      </main>

      {showTabBar && (
        <BottomTabBar />
      )}
      </Tabs>
    </div>
  );
}
