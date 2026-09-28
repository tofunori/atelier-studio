// Section Environnement (premier lancement) : ce dont Atelier a besoin sur ce
// Mac — un agent (Claude Code ou Codex) et des outils externes (Homebrew,
// git, TeX, Zotero) — avec de quoi installer ce qui manque.
//
// Tout vient du store lib/setupEnvironment (setupStatus + environmentStatus,
// demandés à la connexion). Rien n'est redemandé au montage : seul
// « Revérifier » relance les sondes, pour les deux groupes à la fois.
import { Group, Row } from "../primitives";
import type { SectionProps } from "../shared";
import { t } from "../../../lib/i18n";
import { SETUP_AGENTS, openSetupWelcome, recheckAll, useSetupEnvironment } from "../../../lib/setupEnvironment";
import { AgentSetupRow, ToolSetupRow } from "../../setup/SetupRows";
import { Button, InlineNotice } from "../../ui";

export default function Environment(p: SectionProps) {
  const env = useSetupEnvironment();
  const connected = p.ws?.readyState === 1;
  return (
    <>
      <div className="set-headline">
        <h1>{t("settings.environment")}</h1>
        <span className="set-headline-actions">
          <Button
            variant="ghost"
            className="set-btn quiet"
            title={t("settings.providers-recheck-title")}
            disabled={env.rechecking || !connected}
            onClick={() => { recheckAll(); }}
          >
            {env.rechecking ? t("settings.checking") : t("settings.providers-recheck")}
          </Button>
        </span>
      </div>
      <p className="set-sub">{t("settings.environment-sub")}</p>

      {!connected && (
        <InlineNotice tone="warning" className="set-notice">
          {t("settings.sidecar-disconnected-notice")}
        </InlineNotice>
      )}

      <Group label={t("settings.group.agents")}>
        {SETUP_AGENTS.map((id) => (
          <AgentSetupRow key={id} id={id} providers={env.providers} tools={env.tools} origin="environment" />
        ))}
      </Group>

      <Group label={t("settings.group.tools")}>
        {env.tools === null
          ? <p className="set-empty">{t("settings.checking")}</p>
          : env.tools.map((tool) => (
            <ToolSetupRow key={tool.id} tool={tool} tools={env.tools} origin="environment" />
          ))}
      </Group>

      <Group>
        <Row title={t("setup.welcome-row")} desc={t("setup.welcome-row-desc")}>
          <Button variant="ghost" className="set-btn quiet" onClick={openSetupWelcome}>
            {t("setup.welcome-open")}
          </Button>
        </Row>
      </Group>
    </>
  );
}
