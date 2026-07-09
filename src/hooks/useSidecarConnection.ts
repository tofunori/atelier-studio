// Hook d'infrastructure (plan 015, slice 2.1) : cycle de vie de la connexion
// sidecar — extraction à COMPORTEMENT IDENTIQUE de l'effet historique d'App.
// Contrats conservés du plan 009 : AbortController, retry 3 s après échec,
// onclose → reconnexion auto (gérée dans connectSidecar), une seule socket
// active après StrictMode, SidecarInfo rafraîchie à chaque (re)connexion.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { connectSidecar } from "../lib/ws";
import { setWs as publishWs } from "../lib/wsBus";

export type SidecarStatus =
  /** première connexion réussie (bootstrap : getSettings/listHighlights côté App) */
  | "connected"
  /** reconnexion réussie après une coupure */
  | "reconnected"
  /** socket fermée (sidecar mort) — la reconnexion interne est déjà armée */
  | "disconnected"
  /** tentative échouée — un retry est programmé (3 s) */
  | "failed";

export function useSidecarConnection(
  onMessage: (msg: unknown) => void,
  onStatus?: (status: SidecarStatus, sock: WebSocket | null) => void,
): {
  wsRef: MutableRefObject<WebSocket | null>;
  wsReady: boolean;
  mock: boolean;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [mock, setMock] = useState(false);
  // identités fraîches à chaque render : aucune closure ne conserve un
  // handler périmé (invariant slice 2), sans redéclencher l'effet
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    // Annulation explicite plutôt que garde connectedOnce : StrictMode monte
    // l'effet 2× en dev, le cleanup abort/ferme la 1re connexion — il ne reste
    // toujours qu'une seule socket active, sans état module résiduel.
    const ctrl = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const adopt = (sock: WebSocket, status: "connected" | "reconnected") => {
      wsRef.current = sock;
      publishWs(sock);
      setMock(false);
      setWsReady(true);
      onStatusRef.current?.(status, sock);
    };
    const scheduleConnect = (delay = 0) => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (ctrl.signal.aborted) return;
        connectSidecar(
          (msg) => onMessageRef.current(msg),
          (next) => {
            if (ctrl.signal.aborted) return;
            adopt(next, "reconnected");
          },
          () => {
            setWsReady(false);
            onStatusRef.current?.("disconnected", null);
          },
          ctrl.signal,
        )
          .then((sock) => {
            if (ctrl.signal.aborted) return;
            adopt(sock, "connected");
          })
          .catch(() => {
            if (ctrl.signal.aborted) return;
            setMock(true);
            setWsReady(false);
            onStatusRef.current?.("failed", null);
            scheduleConnect(3000);
          });
      }, delay);
    };
    scheduleConnect();
    return () => {
      ctrl.abort();
      if (retryTimer) clearTimeout(retryTimer);
      try { wsRef.current?.close(); } catch { /* déjà fermée */ }
    };
  }, []);

  return { wsRef, wsReady, mock };
}
