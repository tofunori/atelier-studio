import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";

type Session = {
  active: boolean;
  endpoint: string;
  headers: Record<string, string>;
  revision: number;
  pending: Set<string>;
  refreshRequested: boolean;
  refresh: () => void;
};

/** The gallery is project-specific; its reading store is shared application data. */
export function useBiblioReadState(galleryUrl: string) {
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    setReady(false);
    setReadKeys(new Set());
    setPending(new Set());
    setError(null);
    let url: URL;
    try { url = new URL(galleryUrl); } catch { return; }
    const token = new URLSearchParams(url.hash.slice(1)).get("atelier_token");
    const session: Session = {
      active: true, endpoint: `${url.origin}/zotero-reading`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      revision: 0, pending: new Set(), refreshRequested: false, refresh: () => {},
    };
    sessionRef.current = session;
    session.refresh = async () => {
      if (session.pending.size) { session.refreshRequested = true; return; }
      session.refreshRequested = false;
      const revision = ++session.revision;
      try {
        const response = await fetch(session.endpoint, { headers: session.headers, cache: "no-store" });
        if (!response.ok) throw new Error("load");
        const data = await response.json();
        if (!Array.isArray(data.readKeys) || !data.readKeys.every((key: unknown) => typeof key === "string")) throw new Error("invalid response");
        if (!session.active || revision !== session.revision) return;
        setReadKeys(new Set(data.readKeys));
        setReady(true);
        setError(null);
      } catch {
        if (session.active && revision === session.revision) {
          setReady(false);
          setError(t("biblio.read-load-error"));
        }
      }
    };
    session.refresh();
    const onChanged = (event: Event) => {
      if ((event as CustomEvent).detail !== session) session.refresh();
    };
    window.addEventListener("focus", session.refresh);
    window.addEventListener("zotero-reading-changed", onChanged);
    return () => {
      session.active = false;
      sessionRef.current = null;
      window.removeEventListener("focus", session.refresh);
      window.removeEventListener("zotero-reading-changed", onChanged);
    };
  }, [galleryUrl]);

  const setRead = useCallback(async (key: string, read: boolean) => {
    const session = sessionRef.current;
    if (!session?.active || session.pending.has(key) || !ready) return;
    session.pending.add(key);
    ++session.revision; // Ignore a pre-click refresh returning after this mutation.
    setPending(new Set(session.pending));
    try {
      const response = await fetch(session.endpoint, {
        method: "POST", headers: { ...session.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key, read }),
      });
      if (!response.ok) throw new Error("save");
      const data = await response.json();
      if (data.key !== key || data.read !== read) throw new Error("invalid response");
      // A project may have changed while this write was in flight.
      window.dispatchEvent(new CustomEvent("zotero-reading-changed", { detail: session }));
      if (session.active) {
        setReadKeys(previous => {
          const next = new Set(previous);
          if (read) next.add(key); else next.delete(key);
          return next;
        });
        setError(null);
      }
    } catch {
      if (session.active) setError(t("biblio.read-save-error"));
    } finally {
      session.pending.delete(key);
      if (session.active) {
        setPending(new Set(session.pending));
        if (!session.pending.size && session.refreshRequested) session.refresh();
      }
    }
  }, [ready]);

  const refresh = useCallback(() => sessionRef.current?.refresh(), []);
  return { readKeys, pending, ready, error, setRead, refresh };
}
