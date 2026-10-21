// Groupe Notifications de la section Général (2026-10-21, « les
// notifications ne fonctionnent pas ») : on peut enfin les couper, choisir le
// bandeau dans l'app, et vérifier que macOS les laisse passer.
import { useState } from "react";
import { Group, Row, Toggle } from "../primitives";
import { t } from "../../../lib/i18n";
import { isInAppEnabled, isSystemEnabled, setInAppEnabled } from "../../../lib/notifyPrefs";
import { Button, InlineNotice } from "../../ui";

export function NotificationsGroup(p: { onSaved: () => void }) {
  const [system, setSystem] = useState(isSystemEnabled);
  const [inApp, setInApp] = useState(isInAppEnabled);
  const [test, setTest] = useState<"" | "sent" | "failed">("");

  const changeSystem = async (enabled: boolean) => {
    setSystem(enabled);
    setTest("");
    // notify.ts remet aussi la permission à redemander ; chargé à la demande
    const notify = await import("../../../lib/notify");
    notify.setEnabled(enabled);
    p.onSaved();
  };
  const sendTest = async () => {
    try {
      const notify = await import("../../../lib/notify");
      setTest((await notify.demoNotification()) ? "sent" : "failed");
    } catch {
      setTest("failed");
    }
  };

  return (
    <Group label={t("settings.group.notifications")}>
      <Row title={t("settings.notifications-system")} desc={t("settings.notifications-system-desc")}>
        <Toggle label={t("settings.notifications-system")} checked={system} onChange={(v) => { void changeSystem(v); }} />
      </Row>
      <Row title={t("settings.notifications-in-app")} desc={t("settings.notifications-in-app-desc")}>
        <Toggle label={t("settings.notifications-in-app")} checked={inApp}
          onChange={(v) => { setInApp(v); setInAppEnabled(v); p.onSaved(); }} />
      </Row>
      <Row title={t("settings.notifications-test")} desc={t("settings.notifications-test-desc")}>
        {test && (
          <InlineNotice tone={test === "sent" ? "info" : "warning"} className="set-notice">
            {t(test === "sent" ? "settings.notifications-test-sent" : "settings.notifications-test-failed")}
          </InlineNotice>
        )}
        <Button disabled={!system} onClick={() => { void sendTest(); }}>{t("settings.notifications-test")}</Button>
      </Row>
    </Group>
  );
}
