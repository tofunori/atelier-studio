// Rangées du premier lancement, PARTAGÉES par Réglages > Environnement et la
// fenêtre de bienvenue : un agent (Claude Code, Codex) ou un outil externe,
// son état, et l'action qui débloque (installer, se connecter, télécharger).
//
// Une commande part par runSetupCommand : dans le terminal intégré quand un
// projet est ouvert (App ferme alors ce qui le couvre), sinon elle s'affiche
// ici, à copier dans Terminal de macOS — c'est le cas du tout premier
// lancement, sans projet.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { X } from "lucide-react";
import { Row } from "../settings/primitives/Row";
import { Button, IconButton, StatusBadge, type BadgeStatus } from "../ui";
import { t } from "../../lib/i18n";
import { wsReady, wsSend } from "../../lib/wsBus";
import {
  OPENCODE_GO_LOGIN_COMMAND,
  OPENCODE_PROVIDER_LOGIN_COMMAND,
  agentLabel,
  consumePendingAgentCommand,
  installPlan,
  recheckAll,
  runSetupCommand,
  withResolvedBinary,
  type EnvironmentTool,
  type EnvironmentToolId,
  type SetupAgentId,
  type SetupCommandKind,
  type SetupOrigin,
  type SetupProviderStatus,
} from "../../lib/setupEnvironment";

const LazyTerminal = lazy(() => import("../Terminal"));

/** Terminal de macOS, ouvert à côté de la commande à coller. */
export const MACOS_TERMINAL_APP = "/System/Applications/Utilities/Terminal.app";

const AGENT_DESC = {
  claude: "setup.agent-claude",
  codex: "setup.agent-codex",
  opencode: "setup.agent-opencode",
} as const;

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

/** Commande en attente d'être lancée ou copiée, par rangée. */
export function useSetupCommand(origin: SetupOrigin) {
  const [fallback, setFallback] = useState<string | null>(null);
  const [inlineRun, setInlineRun] = useState<{ command: string; nonce: number } | null>(null);
  return {
    fallback,
    inlineRun,
    hide: () => {
      setFallback(null);
      setInlineRun(null);
    },
    run(command: string, kind: SetupCommandKind) {
      if (runSetupCommand(command, { kind, origin }) === "terminal") {
        setFallback(null);
        setInlineRun(null);
        return;
      }
      if (wsReady()) {
        setFallback(null);
        setInlineRun((prev) => ({ command, nonce: (prev?.nonce ?? 0) + 1 }));
        return;
      }
      setInlineRun(null);
      setFallback(command);
    },
  };
}

/** Terminal PTY intégré directement sous la rangée quand aucun projet n'est
 *  encore ouvert (premier lancement) : lance la commande en direct et relance
 *  automatiquement `recheckAll()` dès que le processus réussit. */
export function SetupInlineTerminal(p: { command: string; onClose: () => void }) {
  const [termId] = useState(() => `setup-${crypto.randomUUID()}`);
  const sent = useRef(false);
  const onCloseRef = useRef(p.onClose);
  useEffect(() => { onCloseRef.current = p.onClose; }, [p.onClose]);

  useEffect(() => {
    const onExit = () => {
      recheckAll();
      window.setTimeout(() => onCloseRef.current(), 600);
    };
    window.addEventListener(`term-exit:${termId}`, onExit);
    return () => {
      window.removeEventListener(`term-exit:${termId}`, onExit);
      wsSend({ type: "termClose", termId });
    };
  }, [termId]);

  const handleReady = (id: string) => {
    if (sent.current) return;
    sent.current = true;
    window.setTimeout(() => {
      wsSend({ type: "termInput", termId: id, data: `{ ${p.command}; } && exit\r` });
    }, 150);
  };

  return (
    <div className="setup-fallback setup-inline-term" role="group" aria-label={t("setup.inline-term-running")}>
      <div className="setup-inline-term-head">
        <span className="setup-fallback-hint">{t("setup.inline-term-running")}</span>
        <IconButton size="s" label={t("setup.hide-command")} onClick={p.onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div
        className="setup-inline-term-box"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Suspense fallback={<code className="setup-fallback-cmd">{p.command}</code>}>
          <LazyTerminal termId={termId} cwd="" ws={null} visible onReady={handleReady} />
        </Suspense>
      </div>
    </div>
  );
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

function agentBadge(provider: SetupProviderStatus | null): { status: BadgeStatus; label: string } {
  if (!provider) return { status: "neutral", label: t("settings.checking") };
  if (provider.auth === "ready") return { status: "success", label: t("setup.ready") };
  if (provider.auth === "login_needed") return { status: "warning", label: t("setup.login-needed") };
  if (provider.auth === "not_installed" || !provider.installed) {
    return { status: "neutral", label: t("settings.setup-auth-not-installed") };
  }
  return { status: "warning", label: t("settings.setup-auth-unknown") };
}

/** Claude Code, Codex ou OpenCode : prêt, connexion requise ou non installé. */
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

  useEffect(() => {
    const pending = consumePendingAgentCommand(p.id);
    if (pending) {
      command.run(withResolvedBinary(pending.command, provider?.binPath), pending.kind);
    }
  });

  return (
    <>
      <Row title={agentLabel(p.id, provider)} desc={t(AGENT_DESC[p.id])}>
        {provider?.version && provider.auth !== "not_installed" && (
          <span className="setup-version">{provider.version}</span>
        )}
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {p.id === "opencode" && login && (
          <Button
            variant="secondary"
            onClick={() => command.run(withResolvedBinary(OPENCODE_GO_LOGIN_COMMAND, provider?.binPath), "login")}
          >
            {t("setup.connect-opencode-go")}
          </Button>
        )}
        {login && (
          <Button
            variant="secondary"
            onClick={() => command.run(withResolvedBinary(login, provider?.binPath), "login")}
          >
            {t("setup.sign-in")}
          </Button>
        )}
        {p.id === "opencode" && provider?.auth === "ready" && (
          <>
            <Button
              variant="ghost"
              className="set-btn quiet"
              onClick={() => command.run(withResolvedBinary(OPENCODE_GO_LOGIN_COMMAND, provider.binPath), "login")}
            >
              {t("setup.connect-opencode-go")}
            </Button>
            <Button
              variant="ghost"
              className="set-btn quiet"
              onClick={() => command.run(withResolvedBinary(OPENCODE_PROVIDER_LOGIN_COMMAND, provider.binPath), "login")}
            >
              {t("setup.add-provider")}
            </Button>
          </>
        )}
        {plan && (
          <Button variant="secondary" onClick={() => command.run(plan.command, "install")}>
            {plan.homebrewFirst ? t("setup.install-homebrew-first") : t("setup.install")}
          </Button>
        )}
      </Row>
      {command.inlineRun && (
        <SetupInlineTerminal
          key={`${command.inlineRun.nonce}:${command.inlineRun.command}`}
          command={command.inlineRun.command}
          onClose={command.hide}
        />
      )}
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
  const plan = !tool.found && tool.installCommand && !onDemand(tool)
    ? installPlan(tool.installCommand, p.tools)
    : null;
  const texUpgrade = tool.id === "tex" && tool.detail !== "latexmk" && tool.installCommand
    ? tool.installCommand
    : null;
  const download = !tool.found && !tool.installCommand && !onDemand(tool) ? tool.installUrl : null;
  return (
    <>
      <Row title={toolTitle(tool.id)} desc={toolDesc(tool)}>
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {texUpgrade && (
          <Button
            variant="ghost"
            className="set-btn quiet"
            onClick={() => command.run(texUpgrade, "install")}
          >
            {t("setup.install-texlive")}
          </Button>
        )}
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
      {command.inlineRun && (
        <SetupInlineTerminal
          key={`${command.inlineRun.nonce}:${command.inlineRun.command}`}
          command={command.inlineRun.command}
          onClose={command.hide}
        />
      )}
      {command.fallback && (
        <SetupCommandFallback key={command.fallback} command={command.fallback} onHide={command.hide} />
      )}
    </>
  );
}
