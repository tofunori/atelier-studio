// Groupe Mises à jour de la section Général (2026-11-24, maquette
// mises-a-jour-2026-11-24) : version installée, recherche à la main et
// vérification automatique. La carte d'installation est celle d'UpdateCard.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Group, Row, Toggle } from "../primitives";
import { t } from "../../../lib/i18n";
import {
  autoCheckPreference,
  checkForUpdate,
  getUpdateState,
  setAutoCheckPreference,
  subscribeUpdate,
  updateStatus,
  type UpdateState,
  type UpdateStatus,
} from "../../../lib/appUpdate";
import { Button } from "../../ui";

/** Ligne d'état sous « Version x.y.z ». */
function describe({ phase, lastCheck, upToDate }: UpdateState): string {
  if (phase.kind === "checking") return t("settings.update-checking");
  if (phase.kind === "available" || phase.kind === "downloading" || phase.kind === "installing") {
    return t("settings.update-available", { version: phase.info.version });
  }
  if (phase.kind === "error" && !phase.info) return t("settings.update-failed");
  if (lastCheck == null) return t("settings.update-never");
  return t(upToDate ? "settings.update-up-to-date" : "settings.update-checked", { time: clock(lastCheck) });
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function UpdatesGroup(p: { onSaved: () => void }) {
  const update = useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [auto, setAuto] = useState(autoCheckPreference);
  useEffect(() => { void updateStatus().then(setStatus); }, []);
  // coquille sans la commande (navigateur, tests) : rien à montrer
  if (!status) return null;

  const { phase } = update;
  const desc = describe(update);
  const busy = phase.kind === "checking" || phase.kind === "downloading" || phase.kind === "installing";

  return (
    <Group label={t("settings.group.updates")}>
      <Row title={t("settings.update-version", { version: status.currentVersion })} desc={desc}>
        <Button loading={phase.kind === "checking"} disabled={busy && phase.kind !== "checking"}
          onClick={() => void checkForUpdate(true)}>
          {t("settings.update-check")}
        </Button>
      </Row>
      <Row title={t("settings.update-auto")}
        desc={status.autoCheck ? t("settings.update-auto-desc") : t("settings.update-auto-local")}>
        <Toggle label={t("settings.update-auto")} checked={status.autoCheck && auto}
          onChange={(v) => { setAuto(v); setAutoCheckPreference(v); p.onSaved(); }} />
      </Row>
    </Group>
  );
}
