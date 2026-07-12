/**
 * Network / session state machine (plan 034 F).
 * Orthogonal to pairing: never_paired is handled at app layer.
 */

export type NetworkState =
  | "offline"
  | "connecting"
  | "authenticating"
  | "syncing"
  | "live"
  | "degraded";

export type NetworkEvent =
  | { type: "GO_ONLINE" }
  | { type: "GO_OFFLINE" }
  | { type: "START_CONNECT" }
  | { type: "AUTH_OK" }
  | { type: "AUTH_FAIL" }
  | { type: "START_SYNC" }
  | { type: "SYNC_OK" }
  | { type: "SYNC_PARTIAL" } // catch-up incomplete / high lag → degraded
  | { type: "SYNC_FAIL" }
  | { type: "STREAM_HEALTHY" }
  | { type: "STREAM_DEGRADED" }
  | { type: "VERSION_INCOMPATIBLE" }
  | { type: "TAILSCALE_MISSING" }
  | { type: "FOREGROUND_RESUME" }
  | { type: "BACKGROUND" };

export type NetworkContext = {
  state: NetworkState;
  attempt: number;
  lastError: string | null;
  /** True while app is backgrounded — do not claim continuous stream. */
  backgrounded: boolean;
  /** Special UI reasons mapped from network layer. */
  uiReason: "none" | "tailscale_missing" | "version_incompatible" | "auth_expired";
};

export function initialNetworkContext(): NetworkContext {
  return {
    state: "offline",
    attempt: 0,
    lastError: null,
    backgrounded: false,
    uiReason: "none",
  };
}

export function reduceNetwork(ctx: NetworkContext, ev: NetworkEvent): NetworkContext {
  switch (ev.type) {
    case "BACKGROUND":
      return { ...ctx, backgrounded: true };
    case "FOREGROUND_RESUME":
      return {
        ...ctx,
        backgrounded: false,
        // force resync path
        state: ctx.state === "live" || ctx.state === "degraded" ? "syncing" : "connecting",
        attempt: 0,
      };
    case "GO_OFFLINE":
      return {
        ...ctx,
        state: "offline",
        lastError: "offline",
        uiReason: "none",
      };
    case "TAILSCALE_MISSING":
      return {
        ...ctx,
        state: "offline",
        uiReason: "tailscale_missing",
        lastError: "tailscale",
      };
    case "VERSION_INCOMPATIBLE":
      return {
        ...ctx,
        state: "offline",
        uiReason: "version_incompatible",
        lastError: "protocol",
      };
    case "START_CONNECT":
    case "GO_ONLINE":
      if (ctx.uiReason === "version_incompatible") return ctx;
      return {
        ...ctx,
        state: "connecting",
        lastError: null,
        uiReason: ctx.uiReason === "tailscale_missing" ? "none" : ctx.uiReason,
      };
    case "AUTH_OK":
      return { ...ctx, state: "syncing", attempt: 0, uiReason: "none" };
    case "AUTH_FAIL":
      return {
        ...ctx,
        state: "offline",
        uiReason: "auth_expired",
        lastError: "auth",
      };
    case "START_SYNC":
      return { ...ctx, state: "syncing" };
    case "SYNC_OK":
    case "STREAM_HEALTHY":
      return {
        ...ctx,
        state: ctx.backgrounded ? "degraded" : "live",
        attempt: 0,
        lastError: null,
      };
    case "SYNC_PARTIAL":
    case "STREAM_DEGRADED":
      return { ...ctx, state: "degraded", lastError: ctx.lastError };
    case "SYNC_FAIL":
      return {
        ...ctx,
        state: "offline",
        attempt: ctx.attempt + 1,
        lastError: "sync_fail",
      };
    default:
      return ctx;
  }
}

/** Map network + pairing to legacy ConnectionPhase for banners. */
export function toConnectionPhase(
  ctx: NetworkContext,
  paired: boolean,
): import("./types.ts").ConnectionPhase {
  if (!paired) return "never_paired";
  if (ctx.uiReason === "auth_expired") return "auth_expired";
  if (ctx.uiReason === "version_incompatible") return "version_incompatible";
  if (ctx.uiReason === "tailscale_missing") return "tailscale_missing";
  switch (ctx.state) {
    case "offline":
      return "offline";
    case "connecting":
    case "authenticating":
    case "syncing":
      return "connecting";
    case "live":
      return "ready";
    case "degraded":
      // Keep visible via connecting-style banner (detail = degraded label)
      return "connecting";
  }
}

export function networkBannerLabel(ctx: NetworkContext): string | null {
  if (ctx.backgrounded && (ctx.state === "live" || ctx.state === "degraded")) {
    return "Arrière-plan — le flux sera resynchronisé au retour";
  }
  if (ctx.state === "syncing") return "Synchronisation du journal…";
  if (ctx.state === "degraded") return "Connexion dégradée — rattrapage en cours";
  if (ctx.state === "connecting" || ctx.state === "authenticating") return "Reconnexion…";
  return null;
}
