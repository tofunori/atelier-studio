// Carte « Atelier X est disponible » (maquette mises-a-jour-2026-11-24) :
// posée par Sonner en bas à droite (toast.custom), elle suit l'état du store
// d'appUpdate du téléchargement jusqu'au redémarrage. Chargée en différé.
import { useSyncExternalStore } from "react";
import { CircleAlert, CircleArrowDown, RotateCw } from "lucide-react";
import { t } from "../../lib/i18n";
import {
  getUpdateState,
  installUpdate,
  openReleasesPage,
  snoozeUpdate,
  subscribeUpdate,
} from "../../lib/appUpdate";
import { Button } from "../ui";
import "./update.css";

const MB = 1024 * 1024;
const mb = (bytes: number) => Math.max(1, Math.round(bytes / MB));

function Icon({ kind }: { kind: "download" | "restart" | "error" }) {
  const Glyph = kind === "download" ? CircleArrowDown : kind === "restart" ? RotateCw : CircleAlert;
  return <Glyph className="upd-ic" size={16} aria-hidden="true" />;
}

export function UpdateCard() {
  const { phase } = useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
  if (phase.kind === "available") {
    return (
      <div className="upd-card" role="status" data-phase="available">
        <Icon kind="download" />
        <div className="upd-body">
          <div className="upd-title">{t("update.available-title", { version: phase.info.version })}</div>
          <div className="upd-desc">
            {t("update.available-current", { version: phase.info.currentVersion })}{" "}
            <Button variant="ghost" className="upd-link" onClick={() => void openReleasesPage()}>{t("update.whats-new")}</Button>
          </div>
          <div className="upd-actions">
            <Button variant="ghost" onClick={snoozeUpdate}>{t("update.later")}</Button>
            <Button variant="secondary" onClick={() => void installUpdate()}>{t("update.install")}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (phase.kind === "downloading") {
    const pct = phase.total ? Math.min(100, (phase.downloaded / phase.total) * 100) : null;
    return (
      <div className="upd-card" role="status" data-phase="downloading">
        <Icon kind="download" />
        <div className="upd-body">
          <div className="upd-title">{t("update.downloading-title", { version: phase.info.version })}</div>
          <div className="upd-desc upd-num">
            {phase.total
              ? t("update.downloading-size", { done: mb(phase.downloaded), total: mb(phase.total) })
              : t("update.downloading-start")}
          </div>
          <div className="upd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={pct == null ? undefined : Math.round(pct)}>
            <b style={{ transform: `scaleX(${(pct ?? 0) / 100})` }} />
          </div>
        </div>
      </div>
    );
  }
  if (phase.kind === "installing") {
    return (
      <div className="upd-card" role="status" data-phase="installing">
        <Icon kind="restart" />
        <div className="upd-body">
          <div className="upd-title">{t("update.installing-title", { version: phase.info.version })}</div>
          <div className="upd-desc">{t(/Linux/.test(navigator.userAgent) ? "update.installing-help-linux" : "update.installing-help")}</div>
        </div>
      </div>
    );
  }
  if (phase.kind === "error" && phase.info) {
    return (
      <div className="upd-card is-error" role="alert" data-phase="error">
        <Icon kind="error" />
        <div className="upd-body">
          <div className="upd-title">{t("update.error-title")}</div>
          <div className="upd-desc">{t("update.error-help")}</div>
          <div className="upd-actions">
            <Button variant="ghost" onClick={() => { void openReleasesPage(); snoozeUpdate(); }}>{t("update.download")}</Button>
            <Button variant="secondary" onClick={() => void installUpdate()}>{t("update.retry")}</Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
