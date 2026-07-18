import { getSidecarInfo, refreshSidecarInfo, sidecarHeaders } from "./sidecarInfo";

type FetchLike = typeof fetch;

// Write-through de l'état UI (ui.json du sidecar). Le port/token sont lus dans
// SidecarInfo AU MOMENT du flush : après un redémarrage du sidecar (nouveau
// port), la reconnexion WS a déjà rafraîchi l'info et le flush suit.
// Sur échec réseau hors unload : un refresh (invoke) puis UN SEUL retry.
export function createUiStateFlusher(
  collect: () => Record<string, string>,
  fetchImpl?: FetchLike,
): (keepalive?: boolean) => Promise<boolean> {
  const doFetch: FetchLike = fetchImpl ?? ((...args) => fetch(...args));
  const post = async (
    port: number,
    headers: Record<string, string> | undefined,
    keepalive: boolean,
  ) => {
    const response = await doFetch(`http://127.0.0.1:${port}/uistate`, {
      method: "POST",
      headers,
      body: JSON.stringify(collect()),
      keepalive,
    });
    if (response.ok === false) throw new Error(`uistate HTTP ${response.status}`);
  };
  return async (keepalive = false) => {
    const info = getSidecarInfo();
    if (!info) return false;
    try {
      await post(info.port, sidecarHeaders(info), keepalive);
      return true;
    } catch {
      // pagehide/visibilitychange : pas de chaîne async non bornée pendant l'unload
      if (keepalive) return false;
      try {
        const fresh = await refreshSidecarInfo();
        await post(fresh.port, sidecarHeaders(fresh), false);
        return true;
      } catch {
        return false;
      }
    }
  };
}
