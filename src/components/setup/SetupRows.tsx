// Rangées du premier lancement, PARTAGÉES par Réglages > Environnement et la
// fenêtre de bienvenue : un agent (Claude Code, Codex) ou un outil externe,
// son état, et l'action qui débloque (installer, se connecter, télécharger).
//
// Un agent s'installe et se connecte depuis Atelier (startSetupRun : le
// serveur lance l'installeur officiel puis ouvre la page de connexion) ; la
// rangée suit l'avancement, s'annule, et montre la fin de la sortie en cas
// d'échec. La commande à coller n'est plus que le dernier recours : échec, ou
// serveur injoignable.
//
// Une commande d'outil part par runSetupCommand : dans le terminal intégré
// quand un projet est ouvert (App ferme alors ce qui le couvre), sinon elle
// s'affiche ici, à copier dans Terminal de macOS.
import { useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { X } from "lucide-react";
import { Row } from "../settings/primitives/Row";
import { Button, IconButton, InlineNotice, StatusBadge, type BadgeStatus } from "../ui";
import { t } from "../../lib/i18n";
import {
  agentLabel,
  cancelSetupRun,
  clearSetupRun,
  installPlan,
  runSetupCommand,
  setupRunActive,
  startSetupRun,
  useSetupEnvironment,
  withResolvedBinary,
  type EnvironmentTool,
  type EnvironmentToolId,
  type SetupAgentId,
  type SetupCommandKind,
  type SetupOrigin,
  type SetupProviderStatus,
  type SetupRun,
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
        <Button variant="secondary" onClick={copy}>
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

function agentBadge(
  provider: SetupProviderStatus | null,
  run: SetupRun | null,
): { status: BadgeStatus; label: string } {
  if (run?.phase === "signing_in") return { status: "running", label: t("setup.signing-in") };
  if (setupRunActive(run)) return { status: "running", label: t("setup.installing") };
  if (!provider) return { status: "neutral", label: t("settings.checking") };
  if (provider.auth === "ready") return { status: "success", label: t("setup.ready") };
  if (run?.phase === "failed") return { status: "error", label: t("setup.failed") };
  if (provider.auth === "login_needed") return { status: "warning", label: t("setup.login-needed") };
  if (provider.auth === "not_installed" || !provider.installed) {
    return { status: "neutral", label: t("settings.setup-auth-not-installed") };
  }
  return { status: "warning", label: t("settings.setup-auth-unknown") };
}

/** Ce qu'une rangée d'agent doit montrer, déduit de la sonde et de
 *  l'installation en cours. */
function agentRowState(id: SetupAgentId, provider: SetupProviderStatus | null, run: SetupRun | null) {
  const active = setupRunActive(run);
  const signingIn = run?.phase === "signing_in";
  const login = provider?.auth === "login_needed" ? provider.loginCommand : null;
  const install = provider?.auth === "not_installed" ? provider.installCommand : null;
  let desc = t(AGENT_DESC[id]);
  if (signingIn) desc = t("setup.run-login-desc");
  else if (active) desc = run?.detail ?? t("setup.run-install-desc");
  return {
    active,
    failed: run?.phase === "failed" && provider?.auth !== "ready",
    login,
    install,
    // Dernier recours : la commande à coller (connexion si l'agent est déjà là).
    manual: login ? withResolvedBinary(login, provider?.binPath) : install,
    url: signingIn ? run.url : null,
    version: provider?.version && provider.auth !== "not_installed" && !active ? provider.version : null,
    desc,
  };
}

/** Pendant une installation : rouvrir la page de connexion, annuler. */
function AgentRunControls(p: { id: SetupAgentId; url: string | null }) {
  const { url } = p;
  return (
    <>
      {url && (
        <Button variant="secondary" onClick={() => { void openUrl(url).catch(() => {}); }}>
          {t("setup.reopen-page")}
        </Button>
      )}
      <Button variant="ghost" className="set-btn quiet" onClick={() => cancelSetupRun(p.id)}>
        {t("action.cancel")}
      </Button>
    </>
  );
}

/** Après un échec : la fin de la sortie, et la commande à coller. */
function AgentRunFailure(p: { id: SetupAgentId; error: string | null; manual: string | null }) {
  return (
    <div className="setup-run-failed">
      {p.error && (
        <InlineNotice tone="error">
          <pre className="setup-run-error">{p.error}</pre>
        </InlineNotice>
      )}
      {p.manual && (
        <SetupCommandFallback key={p.manual} command={p.manual} onHide={() => clearSetupRun(p.id)} />
      )}
    </div>
  );
}

function startLabel(failed: boolean, login: string | null): string {
  if (failed) return t("action.retry");
  return login ? t("setup.sign-in") : t("setup.install");
}

/** Claude Code ou Codex : prêt, connexion requise ou non installé. Le bouton
 *  installe et connecte depuis Atelier, et la rangée suit l'avancement. */
export function AgentSetupRow(p: {
  id: SetupAgentId;
  providers: readonly SetupProviderStatus[] | null;
  tools: readonly EnvironmentTool[] | null;
  origin: SetupOrigin;
}) {
  const provider = p.providers?.find((entry) => entry.id === p.id) ?? null;
  const run = useSetupEnvironment().runs[p.id] ?? null;
  const command = useSetupCommand(p.origin);
  const row = agentRowState(p.id, provider, run);
  const badge = agentBadge(provider, run);
  const start = () => {
    command.hide();
    if (startSetupRun(p.id) || !row.manual) return;
    // Serveur injoignable : on retombe sur la commande à lancer soi-même.
    const line = row.install ? installPlan(row.install, p.tools).command : row.manual;
    command.run(line, row.login ? "login" : "install");
  };
  const canStart = !row.active && Boolean(row.manual);
  const fallback = row.failed ? null : command.fallback;
  return (
    <>
      <Row title={agentLabel(p.id, provider)} desc={row.desc}>
        {row.version && <span className="setup-version">{row.version}</span>}
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {row.active && <AgentRunControls id={p.id} url={row.url} />}
        {canStart && (
          <Button variant="secondary" onClick={start}>{startLabel(row.failed, row.login)}</Button>
        )}
      </Row>
      {row.failed && <AgentRunFailure id={p.id} error={run?.error ?? null} manual={row.manual} />}
      {fallback && <SetupCommandFallback key={fallback} command={fallback} onHide={command.hide} />}
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
          <Button variant="secondary" onClick={() => command.run(plan.command, "install")}>
            {plan.homebrewFirst ? t("setup.install-homebrew-first") : t("setup.install")}
          </Button>
        )}
        {download && (
          <Button variant="secondary" onClick={() => { void openUrl(download).catch(() => {}); }}>
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
