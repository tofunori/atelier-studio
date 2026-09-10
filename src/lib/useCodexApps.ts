import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "./i18n";

export type CodexApp = {
  id: string; name: string; description?: string | null; installUrl?: string | null;
  isAccessible: boolean; isEnabled: boolean;
};

/** Catalog requests remain local to the panel and are discarded when it closes. */
export function useCodexApps(socket: WebSocket | null | undefined, projectRoot: string) {
  const [apps, setApps] = useState<CodexApp[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedCursor = useRef<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    setApps([]); setCursor(null); setLoading(false); setError(null);
    return () => { pending.current?.(); pending.current = null; };
  }, [socket, projectRoot]);
  const load = useCallback((next: string | null = null) => {
    pending.current?.();
    requestedCursor.current = next;
    if (!socket || socket.readyState !== 1) { setError(t("plugins.disconnected")); setLoading(false); return; }
    const requestId = crypto.randomUUID();
    setLoading(true); setError(null);
    const finish = () => {
      clearTimeout(timer); socket.removeEventListener("message", receive); socket.removeEventListener("close", closed);
      pending.current = null;
    };
    const closed = () => { finish(); setLoading(false); setError(t("plugins.disconnected")); };
    const receive = (event: MessageEvent) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type !== "codexApps" || message.requestId !== requestId) return;
      finish(); setLoading(false);
      if (message.error) { setError(String(message.error)); return; }
      const page = Array.isArray(message.data) ? message.data : [];
      setApps(previous => [...new Map([...(next ? previous : []), ...page].map(app => [app.id, app])).values()]);
      setCursor(typeof message.nextCursor === "string" ? message.nextCursor : null);
    };
    const timer = setTimeout(() => { finish(); setLoading(false); setError(t("plugins.catalog-timeout")); }, 45_000);
    pending.current = finish;
    socket.addEventListener("message", receive); socket.addEventListener("close", closed);
    try { socket.send(JSON.stringify({ type: "listCodexApps", projectRoot, requestId, cursor: next })); }
    catch { closed(); }
  }, [socket, projectRoot]);
  return { apps, cursor, loading, error, load, retry: () => load(requestedCursor.current) };
}
