import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bannerFor, redactDiagnostics } from "./app/connectionState.ts";
import { IconChat, IconFiles, IconGallery, IconSettings } from "./app/icons.tsx";
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

type Tab = "chats" | "gallery" | "files" | "settings";
type Overlay = "none" | "pairing" | "diagnostics" | "thread";

export default function App() {
  const [tab, setTab] = useState<Tab>("chats");
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
        <div className="empty">Démarrage…</div>
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
      {session.phase !== "ready" && (
        <div
          className="status-banner"
          data-tone={banner.tone === "neutral" ? undefined : banner.tone}
          role="status"
        >
          {banner.label}
          {session.reconnectInfo.running && session.reconnectInfo.attempt > 0
            ? ` (essai ${session.reconnectInfo.attempt})`
            : ""}
        </div>
      )}

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
            <div className="screen" style={{ paddingBottom: 0 }}>
              <button type="button" className="back-btn" onClick={() => setOverlay("none")}>
                ← Réglages
              </button>
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
        <nav className="app-tabbar" aria-label="Navigation principale">
          <Tab id="chats" label="Chats" icon={<IconChat />} current={tab} onSelect={setTab} />
          <Tab
            id="gallery"
            label="Gallery"
            icon={<IconGallery />}
            current={tab}
            onSelect={setTab}
          />
          <Tab id="files" label="Fichiers" icon={<IconFiles />} current={tab} onSelect={setTab} />
          <Tab
            id="settings"
            label="Réglages"
            icon={<IconSettings />}
            current={tab}
            onSelect={setTab}
          />
        </nav>
      )}
    </div>
  );
}

function Tab(p: {
  id: Tab;
  label: string;
  current: Tab;
  icon: ReactNode;
  onSelect: (t: Tab) => void;
}) {
  const active = p.current === p.id;
  return (
    <button
      type="button"
      className="tab-btn"
      aria-current={active ? "page" : undefined}
      aria-label={p.label}
      onClick={() => p.onSelect(p.id)}
    >
      {p.icon}
      <span>{p.label}</span>
    </button>
  );
}
