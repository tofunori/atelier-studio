/**
 * UI Mac minimale — appareils appairés (plan 034 jalon C).
 * Parle à la gateway distante en loopback (admin token), jamais au token device.
 */
import { useCallback, useEffect, useState } from "react";

const LS_URL = "atelier-studio.remote-gateway-url";
const LS_ADMIN = "atelier-studio.remote-admin-token";

type DeviceRow = {
  deviceId: string;
  name: string;
  scopes: string[];
  createdAt: number;
  lastSeenAt: number;
  revoked: boolean;
  revokedAt?: number | null;
};

type Props = {
  /** Default gateway base, e.g. http://127.0.0.1:18765 */
  defaultUrl?: string;
};

export function RemoteDevicesPanel(p: Props) {
  const [url, setUrl] = useState(
    () => localStorage.getItem(LS_URL) || p.defaultUrl || "http://127.0.0.1:18765",
  );
  const [admin, setAdmin] = useState(() => localStorage.getItem(LS_ADMIN) || "");
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpires, setPairingExpires] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(LS_URL, url);
  }, [url]);
  useEffect(() => {
    if (admin) localStorage.setItem(LS_ADMIN, admin);
  }, [admin]);

  const headers = useCallback((): HeadersInit => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (admin) h["x-atelier-admin-token"] = admin;
    return h;
  }, [admin]);

  const refresh = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/remote/admin/devices`, {
        headers: headers(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        setDevices(null);
        return;
      }
      setDevices(body.devices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDevices(null);
    } finally {
      setBusy(false);
    }
  }, [url, headers]);

  const startPairing = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/remote/admin/pairing/start`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        return;
      }
      setPairingCode(body.code ?? null);
      setPairingExpires(body.expiresAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (deviceId: string) => {
    if (!window.confirm(`Révoquer l'appareil ${deviceId} ?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${url.replace(/\/$/, "")}/remote/admin/devices/${encodeURIComponent(deviceId)}/revoke`,
        { method: "POST", headers: headers() },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="remote-devices" style={{ display: "grid", gap: 12 }}>
      <p className="set-row-desc" style={{ margin: 0 }}>
        Gateway distante (Tailscale privé). Le jeton admin s'affiche une fois au démarrage de
        <code style={{ marginLeft: 4 }}>atelier-remote-gateway</code>. Ne jamais exposer Funnel.
      </p>
      <div className="set-row">
        <div className="set-row-txt">
          <div className="set-row-title">URL gateway</div>
        </div>
        <div className="set-row-ctl">
          <input
            className="set-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            aria-label="URL gateway"
          />
        </div>
      </div>
      <div className="set-row">
        <div className="set-row-txt">
          <div className="set-row-title">Jeton admin</div>
          <div className="set-row-desc">Loopback seulement — stocké localement sur ce Mac</div>
        </div>
        <div className="set-row-ctl">
          <input
            className="set-input"
            type="password"
            value={admin}
            onChange={(e) => setAdmin(e.target.value)}
            spellCheck={false}
            aria-label="Jeton admin"
            autoComplete="off"
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="set-btn" disabled={busy} onClick={() => void refresh()}>
          Actualiser
        </button>
        <button type="button" className="set-btn" disabled={busy} onClick={() => void startPairing()}>
          Démarrer l'appairage
        </button>
      </div>
      {pairingCode && (
        <div className="set-card" style={{ padding: 12 }}>
          <div className="set-row-title">Code d'appairage</div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", fontVariantNumeric: "tabular-nums" }}>
            {pairingCode}
          </div>
          {pairingExpires != null && (
            <div className="set-row-desc">Expire (unix) {pairingExpires}</div>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="set-row-desc" style={{ color: "var(--status-error, #e06c75)" }}>
          {error}
        </div>
      )}
      {devices && (
        <div className="set-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Nom</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>État</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 12 }} className="set-row-desc">
                    Aucun appareil
                  </td>
                </tr>
              )}
              {devices.map((d) => (
                <tr key={d.deviceId} style={{ borderTop: "1px solid var(--border-subtle, #333)" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <div>{d.name}</div>
                    <div className="set-row-desc" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {d.deviceId.slice(0, 8)}…
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px" }}>{d.revoked ? "révoqué" : "actif"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    {!d.revoked && (
                      <button
                        type="button"
                        className="set-btn quiet"
                        disabled={busy}
                        onClick={() => void revoke(d.deviceId)}
                      >
                        Révoquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RemoteDevicesPanel;
