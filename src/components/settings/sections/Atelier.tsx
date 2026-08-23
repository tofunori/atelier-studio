// Section Atelier (lot 1) : ex-« atelier » + ex-« review » + ex-« appsnap »
// fusionnées — Review et AppSnap n'étaient pas des destinations dans
// SECTIONS, ce sont des groupes de cette page. Migration verbatim depuis
// Settings.tsx:973-1005 (atelier), :863-901 (review), :903-970 (appsnap).
// L'état AppSnap (useState<AppSnapState>, abonnement onAppSnapState,
// requestAppSnapPermissions) déménage ici : cette section en est le seul
// consommateur. RemoteDevicesPanel N'EST PAS rendu ici — il appartient à la
// vraie section « avance » (Settings.tsx:1287), déjà migrée dans General.tsx
// à la tâche 5 ; le rendre aussi ici le monterait en double.
import { useEffect, useState } from "react";
import { Advanced, Group, Row, Toggle } from "../primitives";
import type { SectionProps } from "../shared";
import type { Settings } from "../../../lib/settings";
import { t } from "../../../lib/i18n";
import {
  getAppSnapState,
  onAppSnapState,
  requestAppSnapPermissions,
  setAppSnapEnabled,
  type AppSnapPermission,
  type AppSnapState,
} from "../../../lib/appSnap";
import { Select } from "../../Select";
import { Button, showError } from "../../ui";
import { Input } from "../../shadcn/input";
import { ScanLineIcon } from "lucide-react";

export default function Atelier(p: SectionProps) {
  const save = (patch: Partial<Settings>) => { p.set(patch); p.onSaved(); };
  const s = p.s;

  // État AppSnap — copié tel quel de Settings.tsx:239-240 ; seul consommateur.
  const [appSnapState, setAppSnapState] = useState<AppSnapState | null>(null);
  const [appSnapBusy, setAppSnapBusy] = useState(false);

  // Copié tel quel de Settings.tsx:325-340.
  useEffect(() => {
    let disposed = false;
    let unlisten = () => {};
    void getAppSnapState()
      .then((state) => { if (!disposed) setAppSnapState(state); })
      .catch((error) => { if (!disposed) void showError(String(error)); });
    void onAppSnapState((state) => { if (!disposed) setAppSnapState(state); })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten();
    };
  }, []);

  // Copié tel quel de Settings.tsx:351-363.
  async function toggleAppSnap(enabled: boolean) {
    setAppSnapBusy(true);
    try {
      if (enabled) setAppSnapState(await requestAppSnapPermissions());
      const state = await setAppSnapEnabled(enabled);
      setAppSnapState(state);
      save({ enableAppSnap: enabled });
    } catch (error) {
      void showError(t("appsnap.action-failed", { error: String(error) }));
    } finally {
      setAppSnapBusy(false);
    }
  }

  // Copié tel quel de Settings.tsx:365-376.
  async function recheckAppSnap() {
    setAppSnapBusy(true);
    try {
      let state = await getAppSnapState();
      if (s.enableAppSnap) state = await setAppSnapEnabled(true);
      setAppSnapState(state);
    } catch (error) {
      void showError(t("appsnap.action-failed", { error: String(error) }));
    } finally {
      setAppSnapBusy(false);
    }
  }

  // Copié tel quel de Settings.tsx:378-388.
  function permissionBadge(permission: AppSnapPermission) {
    return (
      <span className={`set-badge ${permission === "granted" ? "ok" : permission === "denied" ? "ko" : "warn"}`}>
        {permission === "granted"
          ? t("appsnap.permission-granted")
          : permission === "denied"
            ? t("appsnap.permission-required")
            : t("appsnap.permission-unknown")}
      </span>
    );
  }

  return (
    <>
      <h1>{t("settings.atelier")}</h1>
      <p className="set-sub">{t("settings.atelier-sub")}</p>

      {/* Settings.tsx:977-985 */}
      <Group>
        <Row title={t("settings.gallery-folder")} desc={t("settings.gallery-folder-desc")}>
          <Input className="set-text" value={s.galleryPath}
            onChange={(e) => save({ galleryPath: e.target.value })} />
        </Row>
        <Row title={t("settings.auto-refresh")} desc={t("settings.auto-refresh-desc")}>
          <Toggle label={t("settings.auto-refresh")} checked={s.autoRefreshAtelier} onChange={(v) => save({ autoRefreshAtelier: v })} />
        </Row>
      </Group>

      {/* Settings.tsx:986-1003 */}
      <Group label={t("settings.group.gallery-exts")}>
        <Row title={t("settings.gallery-exts-default")} desc={t("settings.gallery-exts-desc")}>
          <Input className="set-text" placeholder="png, svg, pdf, html, md…" value={s.galleryExts}
            onChange={(e) => save({ galleryExts: e.target.value })} />
        </Row>
        {(p.projects ?? []).map((root) => (
          <Row key={root} title={root.split("/").pop() ?? root} desc={root}>
            <Input className="set-text" placeholder={s.galleryExts || t("settings.gallery-exts-inherit")}
              value={(s.galleryExtsByProject ?? {})[root] ?? ""}
              onChange={(e) => {
                const next = { ...(s.galleryExtsByProject ?? {}) };
                if (e.target.value.trim()) next[root] = e.target.value;
                else delete next[root];
                save({ galleryExtsByProject: next });
              }} />
          </Row>
        ))}
      </Group>

      {/* Settings.tsx:867-900 — ex-section « review », devenue un groupe.
          Le sélecteur de modèle utilise une liste en dur (pas de catalogue
          providerStatus) : aucun état supplémentaire à porter. */}
      <Group label={t("settings.review")}>
        <Row title={t("settings.autoreview-enable")} desc={t("settings.autoreview-enable-desc")}>
          <Toggle label={t("settings.autoreview-enable")} checked={s.autoReview.enabled}
            onChange={(v) => save({ autoReview: { ...s.autoReview, enabled: v } })} />
        </Row>
        <Row title={t("settings.autoreview-agent")} desc={t("settings.autoreview-agent-desc")}>
          <Select
            title={t("settings.autoreview-agent")}
            value={`${s.autoReview.provider}:${s.autoReview.model}:${s.autoReview.effort}`}
            onChange={(value) => {
              const [provider, model, effort] = value.split(":");
              save({ autoReview: { ...s.autoReview, provider: provider as "claude" | "codex", model, effort } });
            }}
            options={[
              { value: "codex:gpt-5.5:high", label: "GPT-5.5 · high" },
              { value: "codex:gpt-5.5:medium", label: "GPT-5.5 · medium" },
              { value: "claude:claude-opus-4-8:high", label: "Opus 4.8 · high" },
              { value: "claude:claude-sonnet-5:high", label: "Sonnet 5 · high" },
            ]}
          />
        </Row>
        <Row title={t("settings.autoreview-trigger")}>
          <Select
            title={t("settings.autoreview-trigger")}
            value={s.autoReview.trigger}
            onChange={(value) => save({ autoReview: { ...s.autoReview, trigger: value as "always" | "files-changed" | "manual" } })}
            options={[
              { value: "files-changed", label: t("settings.autoreview-files") },
              { value: "always", label: t("settings.autoreview-always") },
              { value: "manual", label: t("settings.autoreview-manual") },
            ]}
          />
        </Row>
      </Group>

      {/* Settings.tsx:903-970 — ex-section « appsnap », entièrement absorbée
          sous le repli « Avancé » (8 rangées : enable, raccourci,
          destination, son, 3 permissions, statut). RemoteDevicesPanel n'est
          PAS ici — voir en-tête du fichier. */}
      <Advanced count={8}>
        <div className="appsnap-intro" role="note">
          <div className="appsnap-intro-icon" aria-hidden="true">
            <ScanLineIcon />
          </div>
          <div>
            <div className="appsnap-intro-title">{t("appsnap.card-title")}</div>
            <p>
              {t("appsnap.card-prefix")}{" "}
              <kbd className="appsnap-key">⌥ Option</kbd>{" "}
              {t("appsnap.card-suffix")}
            </p>
          </div>
        </div>
        <Group label={t("appsnap.group.capture")}>
          <Row title={t("appsnap.enable")} desc={t("appsnap.enable-desc")}>
            <Toggle
              label={t("appsnap.enable")}
              checked={s.enableAppSnap}
              onChange={(enabled) => { void toggleAppSnap(enabled); }}
            />
          </Row>
          <Row title={t("appsnap.shortcut")} desc={t("appsnap.shortcut-desc")}>
            <span className="appsnap-shortcut" aria-label={t("appsnap.shortcut-value-label")}>
              <kbd>⌥ {t("appsnap.left")}</kbd>
              <span>+</span>
              <kbd>⌥ {t("appsnap.right")}</kbd>
            </span>
          </Row>
          <Row title={t("appsnap.destination")} desc={t("appsnap.destination-desc")}>
            <span className="set-badge ok">{t("appsnap.destination-auto")}</span>
          </Row>
          <Row title={t("appsnap.sound")} desc={t("appsnap.sound-desc")}>
            <Toggle
              label={t("appsnap.sound")}
              checked={s.appSnapPlaySound}
              onChange={(appSnapPlaySound) => save({ appSnapPlaySound })}
            />
          </Row>
        </Group>
        <Group label={t("appsnap.group.permissions")}>
          <Row title={t("appsnap.input-monitoring")} desc={t("appsnap.input-monitoring-desc")}>
            {permissionBadge(appSnapState?.inputMonitoringPermission ?? "unknown")}
          </Row>
          <Row title={t("appsnap.screen-recording")} desc={t("appsnap.screen-recording-desc")}>
            {permissionBadge(appSnapState?.screenRecordingPermission ?? "unknown")}
          </Row>
          <Row title={t("appsnap.accessibility")} desc={t("appsnap.accessibility-desc")}>
            {permissionBadge(appSnapState?.accessibilityPermission ?? "unknown")}
          </Row>
          <Row
            title={t("appsnap.status")}
            desc={appSnapState?.message || t(`appsnap.status-${appSnapState?.status ?? "disabled"}` as any)}
          >
            <Button
              variant="ghost"
              className="set-btn quiet"
              disabled={appSnapBusy}
              onClick={() => { void recheckAppSnap(); }}
            >
              {appSnapBusy ? t("settings.checking") : t("appsnap.recheck")}
            </Button>
          </Row>
        </Group>
        <p className="appsnap-local-note">{t("appsnap.local-note")}</p>
      </Advanced>
    </>
  );
}
