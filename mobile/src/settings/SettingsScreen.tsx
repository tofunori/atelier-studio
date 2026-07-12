import { useState } from "react";
import type { ConnectionPhase, DeviceCredentials } from "../transport/types.ts";
import {
  ensureNotificationPermission,
  loadNotifPrefs,
  saveNotifPrefs,
  type NotificationPrefs,
} from "../native/notifications.ts";
import { getBadgeCount, clearBadge } from "../native/badge.ts";

type Props = {
  phase: ConnectionPhase;
  credentials: DeviceCredentials | null;
  gatewayUrl: string;
  onOpenPairing: () => void;
  onOpenDiagnostics: () => void;
  onRevokeLocal: () => void;
  onRefresh: () => void;
};

export function SettingsScreen(p: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotifPrefs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifPrefs(next);
  };

  const enableNotifs = async () => {
    setBusy(true);
    setMsg(null);
    // Permission only on first enable (contextual need)
    const perm = await ensureNotificationPermission();
    if (perm === "granted") {
      update({ enabled: true, permission: perm });
      setMsg("Notifications activées");
    } else if (perm === "unsupported") {
      update({ enabled: false, permission: perm });
      setMsg("Notifications non supportées sur cette plateforme");
    } else {
      update({ enabled: false, permission: perm });
      setMsg("Permission refusée — activez-la dans Réglages iOS");
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <h1 className="screen-title">Réglages</h1>
      <p className="screen-sub">Connexion au Mac Atelier via gateway distante.</p>
      <div className="card stack">
        <div>
          <div className="list-item-meta">État</div>
          <div className="list-item-title">{p.phase}</div>
        </div>
        <div>
          <div className="list-item-meta">Gateway</div>
          <div className="list-item-title" style={{ fontSize: "var(--fs-m)", wordBreak: "break-all" }}>
            {p.credentials?.gatewayBaseUrl ?? p.gatewayUrl}
          </div>
        </div>
        {p.credentials && (
          <div>
            <div className="list-item-meta">Appareil</div>
            <div className="list-item-title">{p.credentials.name}</div>
            <div className="list-item-meta">{p.credentials.deviceId}</div>
          </div>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={p.onRefresh}>
            Rafraîchir
          </button>
          <button type="button" className="btn btn-ghost" onClick={p.onOpenPairing}>
            {p.credentials ? "Réappareiller" : "Appairer"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={p.onOpenDiagnostics}>
            Diagnostics
          </button>
          {p.credentials && (
            <button type="button" className="btn btn-ghost" onClick={p.onRevokeLocal}>
              Oublier cet appareil
            </button>
          )}
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 16 }}>
        <div className="list-item-title">Notifications</div>
        <p className="list-item-meta" style={{ margin: 0 }}>
          Opt-in. Contenu minimal sur écran verrouillé (pas de prompt ni données
          scientifiques par défaut).
        </p>
        {!prefs.enabled ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void enableNotifs()}>
            Activer les notifications
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => update({ enabled: false })}
          >
            Désactiver
          </button>
        )}
        <label className="int-opt">
          <input
            type="checkbox"
            checked={prefs.onDone}
            disabled={!prefs.enabled}
            onChange={(e) => update({ onDone: e.target.checked })}
          />
          <span>Tour terminé</span>
        </label>
        <label className="int-opt">
          <input
            type="checkbox"
            checked={prefs.onError}
            disabled={!prefs.enabled}
            onChange={(e) => update({ onError: e.target.checked })}
          />
          <span>Erreur</span>
        </label>
        <label className="int-opt">
          <input
            type="checkbox"
            checked={prefs.onInteraction}
            disabled={!prefs.enabled}
            onChange={(e) => update({ onInteraction: e.target.checked })}
          />
          <span>Action requise</span>
        </label>
        <label className="int-opt">
          <input
            type="checkbox"
            checked={prefs.showThreadTitle}
            disabled={!prefs.enabled}
            onChange={(e) => update({ showThreadTitle: e.target.checked })}
          />
          <span>Afficher le titre du fil (jamais le prompt)</span>
        </label>
        <div className="list-item-meta">
          Badge : {getBadgeCount()}{" "}
          <button type="button" className="btn btn-ghost" onClick={() => clearBadge()}>
            Réinitialiser
          </button>
        </div>
        {msg && <div className="list-item-meta">{msg}</div>}
      </div>
    </div>
  );
}
