// Fenêtre de bienvenue du premier lancement : ouverte une fois par lancement
// tant qu'aucun agent n'est prêt (règle dans lib/setupEnvironment), ou à la
// demande (Réglages > Environnement, « Terminer la configuration »).
//
// « Plus tard » ferme sans rien retenir : elle reviendra au prochain lancement
// tant qu'aucun agent n'est prêt. « Terminer » n'est actif qu'une fois un
// agent prêt et ne la rouvre plus jamais d'elle-même. Un agent qui devient
// prêt pendant qu'elle est ouverte ne la ferme pas : elle le dit.
import { DialogSurface } from "../ui/DialogSurface";
import { Button, InlineNotice } from "../ui";
import { Group } from "../settings/primitives";
import { t } from "../../lib/i18n";
import {
  SETUP_AGENTS,
  agentLabel,
  agentReady,
  closeSetupWelcome,
  markWelcomeDone,
  recheckAll,
  useSetupEnvironment,
} from "../../lib/setupEnvironment";
import { AgentSetupRow, ToolSetupRow } from "./SetupRows";

// LaTeX n'y figure plus : faute de MacTeX, la première compilation télécharge
// tectonic d'elle-même. Les PDF se lisent sans rien installer.
const OPTIONAL_TOOLS = new Set(["zotero"]);

export default function SetupWelcomeDialog(p: { open: boolean }) {
  const env = useSetupEnvironment();
  const ready = agentReady(env.providers);
  const readyAgent = SETUP_AGENTS.map((id) => env.providers?.find((provider) => provider.id === id))
    .find((provider) => provider?.auth === "ready")
    ?? env.providers?.find((provider) => provider.auth === "ready")
    ?? null;
  const readyName = readyAgent
    ? (readyAgent.id === "claude" || readyAgent.id === "codex" ? agentLabel(readyAgent.id, readyAgent) : readyAgent.label)
    : "";
  const optional = (env.tools ?? []).filter((tool) => OPTIONAL_TOOLS.has(tool.id));

  return (
    <DialogSurface
      open={p.open}
      onOpenChange={(open) => { if (!open) closeSetupWelcome(); }}
      title={t("setup.welcome-title")}
      description={t("setup.welcome-intro")}
      closeLabel={t("action.close")}
      className="setup-welcome-dialog"
    >
      <div className="setup-welcome-body">
        {ready && (
          <InlineNotice tone="success">{t("setup.welcome-ready", { agent: readyName })}</InlineNotice>
        )}
        <Group label={t("settings.group.agents")}>
          {SETUP_AGENTS.map((id) => (
            <AgentSetupRow key={id} id={id} providers={env.providers} tools={env.tools} origin="welcome" />
          ))}
        </Group>
        {optional.length > 0 && (
          <Group label={t("setup.welcome-optional")}>
            {optional.map((tool) => (
              <ToolSetupRow key={tool.id} tool={tool} tools={env.tools} origin="welcome" />
            ))}
          </Group>
        )}
      </div>
      <div className="setup-welcome-foot">
        <Button variant="ghost" onClick={closeSetupWelcome}>{t("setup.later")}</Button>
        <Button
          variant="secondary"
          disabled={env.rechecking}
          onClick={() => { recheckAll(); }}
        >
          {env.rechecking ? t("settings.checking") : t("settings.providers-recheck")}
        </Button>
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => {
            markWelcomeDone();
            closeSetupWelcome();
          }}
        >
          {t("setup.finish")}
        </Button>
      </div>
    </DialogSurface>
  );
}
