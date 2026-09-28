// Rangées du premier lancement, PARTAGÉES par Réglages > Environnement et la
// fenêtre de bienvenue : un agent (Claude Code, Codex) ou un outil externe,
// son état, et l'action qui débloque (installer, se connecter, télécharger).
//
// Une commande part par runSetupCommand : dans le terminal intégré quand un
// projet est ouvert (App ferme alors ce qui le couvre), sinon elle s'affiche
// ici, à copier dans Terminal de macOS — c'est le cas du tout premier
// lancement, sans projet.
import { useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { X } from "lucide-react";
import { Row } from "../settings/primitives/Row";
import { Button, IconButton, StatusBadge, type BadgeStatus } from "../ui";
import { t } from "../../lib/i18n";
import {
  agentLabel,
  installPlan,
  runSetupCommand,
  withResolvedBinary,
  type EnvironmentTool,
  type EnvironmentToolId,
  type SetupAgentId,
  type SetupCommandKind,
  type SetupOrigin,
  type SetupProviderStatus,
} from "../../lib/setupEnvironment";

/** Terminal de macOS, ouvert à côté de la commande à coller. */
export const MACOS_TERMINAL_APP = "/System/Applications/Utilities/Terminal.app";

const AGENT_DESC = { claude: "setup.agent-claude", codex: "setup.agent-codex" } as const;

const TOOL_DESC = {
  homebrew: "setup.tool-homebrew",
  git: "setup.tool-git",
  tex: "setup.tool-tex",
  zotero: "setup.tool-zotero",
} as const;

function toolTitle(id: EnvironmentToolId): string {
  switch (id) {
    case "homebrew": return "Homebrew";
    case "git": return t("setup.tool-git-title");
    case "tex": return "LaTeX";
    case "zotero": return "Zotero";
  }
}

/** Commande en attente d'être copiée, par rangée. */
function useSetupCommand(origin: SetupOrigin) {
  const [fallback, setFallback] = useState<string | null>(null);
  return {
    fallback,
    hide: () => setFallback(null),
    run(command: string, kind: SetupCommandKind) {
      setFallback(runSetupCommand(command, { kind, origin }) === "copy" ? command : null);
    },
  };
}

/** Commande à coller dans Terminal quand le terminal intégré n'existe pas. */
export function SetupCommandFallback(p: { command: string; onHide: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) return;
    void clipboard.writeText(p.command).then(() => setCopied(true), () => setCopied(false));
  };
  return (
    <div className="setup-fallback" role="group" aria-label={t("setup.fallback-label")}>
      <p className="setup-fallback-hint">{t("setup.fallback-hint")}</p>
      <div className="setup-fallback-line">
        <code className="setup-fallback-cmd">{p.command}</code>
        <IconButton size="s" label={t("setup.hide-command")} onClick={p.onHide}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div className="setup-fallback-actions">
        <Button variant="secondary" className="set-btn" onClick={copy}>
          {copied ? t("setup.copied") : t("action.copy")}
        </Button>
        <Button
          variant="ghost"
          className="set-btn quiet"
          onClick={() => { void openPath(MACOS_TERMINAL_APP).catch(() => {}); }}
        >
          {t("setup.open-terminal")}
        </Button>
      </div>
    </div>
  );
}

function agentBadge(provider: SetupProviderStatus | null): { status: BadgeStatus; label: string } {
  if (!provider) return { status: "neutral", label: t("settings.checking") };
  if (provider.auth === "ready") return { status: "success", label: t("setup.ready") };
  if (provider.auth === "login_needed") return { status: "warning", label: t("setup.login-needed") };
  if (provider.auth === "not_installed" || !provider.installed) {
    return { status: "neutral", label: t("settings.setup-auth-not-installed") };
  }
  return { status: "warning", label: t("settings.setup-auth-unknown") };
}

/** Claude Code ou Codex : prêt, connexion requise ou non installé. */
export function AgentSetupRow(p: {
  id: SetupAgentId;
  providers: readonly SetupProviderStatus[] | null;
  tools: readonly EnvironmentTool[] | null;
  origin: SetupOrigin;
}) {
  const provider = p.providers?.find((entry) => entry.id === p.id) ?? null;
  const command = useSetupCommand(p.origin);
  const badge = agentBadge(provider);
  const login = provider?.auth === "login_needed" ? provider.loginCommand : null;
  const install = provider?.auth === "not_installed" ? provider.installCommand : null;
  const plan = install ? installPlan(install, p.tools) : null;
  return (
    <>
      <Row title={agentLabel(p.id, provider)} desc={t(AGENT_DESC[p.id])}>
        {provider?.version && provider.auth !== "not_installed" && (
          <span className="setup-version">{provider.version}</span>
        )}
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {login && (
          <Button
            variant="secondary"
            className="set-btn"
            onClick={() => command.run(withResolvedBinary(login, provider?.binPath), "login")}
          >
            {t("setup.sign-in")}
          </Button>
        )}
        {plan && (
          <Button variant="secondary" className="set-btn" onClick={() => command.run(plan.command, "install")}>
            {plan.homebrewFirst ? t("setup.install-homebrew-first") : t("setup.install")}
          </Button>
        )}
      </Row>
      {command.fallback && (
        <SetupCommandFallback key={command.fallback} command={command.fallback} onHide={command.hide} />
      )}
    </>
  );
}

/** LaTeX absent : rien à installer, la première compilation télécharge
 *  tectonic. */
function onDemand(tool: EnvironmentTool): boolean {
  return !tool.found && tool.id === "tex" && tool.detail === "on-demand";
}

function toolBadge(tool: EnvironmentTool): { status: BadgeStatus; label: string } {
  if (onDemand(tool)) return { status: "neutral", label: t("setup.automatic") };
  if (tool.found) {
    return tool.id === "tex" && tool.detail
      ? { status: "success", label: t("setup.found-variant", { variant: tool.detail }) }
      : { status: "success", label: t("setup.found") };
  }
  if (tool.id === "zotero") return { status: "neutral", label: t("settings.integrations-not-found") };
  return { status: "warning", label: t("setup.missing") };
}

function toolDesc(tool: EnvironmentTool): string {
  const parts = [t(TOOL_DESC[tool.id])];
  if (tool.found && tool.path) parts.push(tool.path);
  if (onDemand(tool)) parts.push(t("setup.tex-on-demand"));
  if (!tool.found && tool.id === "zotero") parts.push(t("setup.zotero-hint"));
  return parts.join(" — ");
}

/** Un outil externe : trouvé ou non, et de quoi l'installer. */
export function ToolSetupRow(p: {
  tool: EnvironmentTool;
  tools: readonly EnvironmentTool[] | null;
  origin: SetupOrigin;
}) {
  const { tool } = p;
  const command = useSetupCommand(p.origin);
  const badge = toolBadge(tool);
  const plan = !tool.found && tool.installCommand ? installPlan(tool.installCommand, p.tools) : null;
  const download = !tool.found && !tool.installCommand && !onDemand(tool) ? tool.installUrl : null;
  return (
    <>
      <Row title={toolTitle(tool.id)} desc={toolDesc(tool)}>
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {plan && (
          <Button variant="secondary" className="set-btn" onClick={() => command.run(plan.command, "install")}>
            {plan.homebrewFirst ? t("setup.install-homebrew-first") : t("setup.install")}
          </Button>
        )}
        {download && (
          <Button variant="secondary" className="set-btn" onClick={() => { void openUrl(download).catch(() => {}); }}>
            {t("setup.download")}
          </Button>
        )}
      </Row>
      {command.fallback && (
        <SetupCommandFallback key={command.fallback} command={command.fallback} onHide={command.hide} />
      )}
    </>
  );
}
