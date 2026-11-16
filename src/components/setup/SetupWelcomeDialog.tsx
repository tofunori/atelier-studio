// Fenêtre de bienvenue du premier lancement : ouverte une fois par lancement
// tant qu'aucun agent n'est prêt (règle dans lib/setupEnvironment), ou à la
// demande (Réglages > Environnement, « Terminer la configuration »).
//
// Une question, un bouton (variante B, choix de Thierry 2026-11-15) :
//   1. choisir l'agent dont on a déjà le compte, puis « Installer et
//      connecter » — Atelier lance l'installeur officiel et ouvre la page de
//      connexion lui-même (ws_router/setup_run.rs), sans Terminal ;
//   2. suivre les deux étapes (installer, se connecter), annulables ;
//   3. en cas d'échec : la fin de la sortie, « Réessayer », et la commande à
//      coller dans Terminal en dernier recours ;
//   4. une fois un agent prêt : ouvrir un dossier, et ce qu'il y a d'autre
//      sur ce Mac.
// L'écran affiché se déduit du store (installation en cours, agents prêts) :
// fermer puis rouvrir la fenêtre retrouve l'installation où elle en est.
//
// « Plus tard » ferme sans rien retenir : elle reviendra au prochain lancement
// tant qu'aucun agent n'est prêt. « Terminer » et « Ouvrir un dossier » ne la
// rouvrent plus jamais d'elle-même.
import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, FolderOpen } from "lucide-react";
import { DialogSurface } from "../ui/DialogSurface";
import { Button, InlineNotice, RowButton, Spinner } from "../ui";
import { Input } from "../shadcn/input";
import { Group } from "../settings/primitives";
import { t } from "../../lib/i18n";
import {
  SETUP_AGENTS,
  agentLabel,
  agentReady,
  cancelSetupRun,
  clearSetupRun,
  closeSetupWelcome,
  markWelcomeDone,
  recheckAll,
  sendSetupRunInput,
  setupRunActive,
  startSetupRun,
  useSetupEnvironment,
  withResolvedBinary,
  type SetupAgentId,
  type SetupEnvironmentState,
  type SetupProviderStatus,
  type SetupRun,
} from "../../lib/setupEnvironment";
import { AgentSetupRow, SetupCommandFallback, ToolSetupRow } from "./SetupRows";

// LaTeX n'y figure plus : faute de MacTeX, la première compilation télécharge
// tectonic d'elle-même. Les PDF se lisent sans rien installer.
const OPTIONAL_TOOLS = new Set(["zotero"]);

const PICK_DESC = { claude: "setup.pick-claude", codex: "setup.pick-codex" } as const;
/** Le compte auquel l'agent se relie, tel que la personne le connaît. */
const ACCOUNT = { claude: "Claude", codex: "ChatGPT" } as const;
const SIGNUP_URL = { claude: "https://claude.ai", codex: "https://chatgpt.com" } as const;
const SIGNUP_LABEL = { claude: "setup.create-claude", codex: "setup.create-chatgpt" } as const;

type Screen =
  | { kind: "choose" }
  | { kind: "progress"; agent: SetupAgentId; run: SetupRun }
  | { kind: "failed"; agent: SetupAgentId; run: SetupRun }
  | { kind: "ready"; agent: string };

function providerOf(env: SetupEnvironmentState, id: string): SetupProviderStatus | null {
  return env.providers?.find((provider) => provider.id === id) ?? null;
}

/** L'écran à montrer, déduit du store seul. */
function screenOf(env: SetupEnvironmentState): Screen {
  const active = SETUP_AGENTS.find((id) => setupRunActive(env.runs[id]));
  if (active) return { kind: "progress", agent: active, run: env.runs[active]! };
  const failed = SETUP_AGENTS.find(
    (id) => env.runs[id]?.phase === "failed" && providerOf(env, id)?.auth !== "ready",
  );
  if (failed) return { kind: "failed", agent: failed, run: env.runs[failed]! };
  if (agentReady(env.providers)) {
    // Celui qu'on vient d'installer d'abord, sinon le premier prêt.
    const fresh = SETUP_AGENTS.find((id) => env.runs[id]?.phase === "ready" && providerOf(env, id)?.auth === "ready");
    const known = fresh ?? SETUP_AGENTS.find((id) => providerOf(env, id)?.auth === "ready");
    if (known) return { kind: "ready", agent: agentLabel(known, providerOf(env, known)) };
    return { kind: "ready", agent: env.providers?.find((provider) => provider.auth === "ready")?.label ?? "" };
  }
  return { kind: "choose" };
}

/** Présélection : un agent déjà installé à qui il ne manque que la
 *  connexion, sinon Claude Code. */
function defaultPick(env: SetupEnvironmentState): SetupAgentId {
  return SETUP_AGENTS.find((id) => providerOf(env, id)?.auth === "login_needed") ?? "claude";
}

export default function SetupWelcomeDialog(p: { open: boolean; onOpenFolder?: () => void }) {
  const env = useSetupEnvironment();
  const screen = screenOf(env);
  const [picked, setPicked] = useState<SetupAgentId | null>(null);
  const [offline, setOffline] = useState(false);
  const choice = picked ?? defaultPick(env);

  const start = (agent: SetupAgentId) => { setOffline(!startSetupRun(agent)); };
  const finish = () => {
    markWelcomeDone();
    closeSetupWelcome();
  };

  let title = t("setup.welcome-title");
  let description = t("setup.welcome-intro");
  if (screen.kind === "progress") {
    const name = agentLabel(screen.agent, providerOf(env, screen.agent));
    const signingIn = screen.run.phase === "signing_in";
    title = signingIn
      ? t("setup.run-login-title", { account: ACCOUNT[screen.agent] })
      : t("setup.run-install-title", { agent: name });
    description = signingIn ? t("setup.run-login-desc") : t("setup.run-install-desc");
  } else if (screen.kind === "failed") {
    title = t("setup.run-failed-title", { agent: agentLabel(screen.agent, providerOf(env, screen.agent)) });
    description = t("setup.run-failed-desc");
  } else if (screen.kind === "ready") {
    title = t("setup.ready-title", { agent: screen.agent });
    description = t("setup.ready-desc");
  }

  return (
    <DialogSurface
      open={p.open}
      onOpenChange={(open) => { if (!open) closeSetupWelcome(); }}
      title={title}
      description={description}
      closeLabel={t("action.close")}
      className="setup-welcome-dialog"
      focusSurface
    >
      {screen.kind === "choose" && (
        <ChooseScreen
          env={env}
          choice={choice}
          offline={offline}
          onPick={setPicked}
          onStart={() => start(choice)}
        />
      )}
      {screen.kind === "progress" && (
        <ProgressScreen key={screen.agent} agent={screen.agent} run={screen.run} provider={providerOf(env, screen.agent)} />
      )}
      {screen.kind === "failed" && (
        <FailedScreen
          agent={screen.agent}
          run={screen.run}
          provider={providerOf(env, screen.agent)}
          rechecking={env.rechecking}
          onRetry={() => start(screen.agent)}
        />
      )}
      {screen.kind === "ready" && (
        <ReadyScreen
          env={env}
          onFinish={finish}
          onOpenFolder={p.onOpenFolder ? () => { finish(); p.onOpenFolder?.(); } : undefined}
        />
      )}
    </DialogSurface>
  );
}

function ChooseScreen(p: {
  env: SetupEnvironmentState;
  choice: SetupAgentId;
  offline: boolean;
  onPick: (agent: SetupAgentId) => void;
  onStart: () => void;
}) {
  const [noAccount, setNoAccount] = useState(false);
  const installed = providerOf(p.env, p.choice)?.auth === "login_needed";
  return (
    <>
      <div className="setup-welcome-body">
        <div className="setup-pick-grid" role="radiogroup" aria-label={t("setup.pick-label")}>
          {SETUP_AGENTS.map((id) => {
            const provider = providerOf(p.env, id);
            const on = id === p.choice;
            return (
              <RowButton
                key={id}
                role="radio"
                aria-checked={on}
                className="setup-pick"
                data-on={on || undefined}
                onClick={() => p.onPick(id)}
              >
                <span className="setup-pick-txt">
                  <span className="setup-pick-title">{agentLabel(id, provider)}</span>
                  <span className="setup-pick-desc">
                    {t(PICK_DESC[id])}
                    {provider?.auth === "login_needed" ? ` ${t("setup.pick-installed")}` : ""}
                  </span>
                </span>
                <Check className="setup-pick-check" size={14} strokeWidth={1.5} aria-hidden="true" />
              </RowButton>
            );
          })}
        </div>
        <p className="setup-quiet">{t("setup.private-note")}</p>
        <div className="setup-no-account">
          <Button
            variant="ghost"
            className="set-btn quiet"
            aria-expanded={noAccount}
            onClick={() => setNoAccount((shown) => !shown)}
          >
            {t("setup.no-account")}
          </Button>
          {noAccount && (
            <div className="setup-no-account-body">
              <p className="setup-quiet">{t("setup.no-account-hint")}</p>
              <div className="setup-run-actions">
                {SETUP_AGENTS.map((id) => (
                  <Button key={id} variant="secondary" onClick={() => { void openUrl(SIGNUP_URL[id]).catch(() => {}); }}>
                    {t(SIGNUP_LABEL[id])}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        {p.offline && (
          <InlineNotice tone="warning">{t("settings.sidecar-disconnected-notice")}</InlineNotice>
        )}
      </div>
      <div className="setup-welcome-foot">
        <Button variant="ghost" onClick={closeSetupWelcome}>{t("setup.later")}</Button>
        <Button variant="primary" onClick={p.onStart}>
          {installed ? t("setup.sign-in") : t("setup.install-and-connect")}
        </Button>
      </div>
    </>
  );
}

type StepState = "done" | "now" | "todo";

function Step(p: { state: StepState; title: string; desc?: string | null }) {
  return (
    <div className="setup-step" data-state={p.state}>
      <span className="setup-step-mark" aria-hidden="true">
        {p.state === "done" && <Check size={14} strokeWidth={1.5} />}
        {p.state === "now" && <Spinner size={14} aria-hidden="true" />}
        {p.state === "todo" && <span className="setup-step-dot" />}
      </span>
      <span className="setup-step-txt">
        <span className="setup-step-title">{p.title}</span>
        {p.desc && <span className="setup-step-desc">{p.desc}</span>}
      </span>
    </div>
  );
}

function ProgressScreen(p: { agent: SetupAgentId; run: SetupRun; provider: SetupProviderStatus | null }) {
  const [codeShown, setCodeShown] = useState(false);
  const [code, setCode] = useState("");
  const name = agentLabel(p.agent, p.provider);
  const signingIn = p.run.phase === "signing_in";
  const url = p.run.url;
  const installedDesc = p.provider?.version && p.provider.auth !== "not_installed"
    ? t("setup.step-version", { version: p.provider.version })
    : null;
  const sendCode = () => {
    if (sendSetupRunInput(p.agent, code)) setCode("");
  };
  return (
    <>
      <div className="setup-welcome-body">
        <div className="set-card setup-steps" role="status" aria-live="polite">
          <Step
            state={signingIn ? "done" : "now"}
            title={t("setup.step-install", { agent: name })}
            desc={signingIn ? installedDesc : p.run.detail ?? t("setup.step-install-where")}
          />
          <Step
            state={signingIn ? "now" : "todo"}
            title={t("setup.step-login", { account: ACCOUNT[p.agent] })}
            desc={signingIn ? t("setup.step-login-waiting") : null}
          />
        </div>
        {signingIn && (
          <div className="setup-run-actions">
            {url && (
              <Button variant="secondary" onClick={() => { void openUrl(url).catch(() => {}); }}>
                {t("setup.reopen-page")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="set-btn quiet"
              aria-expanded={codeShown}
              onClick={() => setCodeShown((shown) => !shown)}
            >
              {t("setup.code-toggle")}
            </Button>
          </div>
        )}
        {signingIn && codeShown && (
          <form
            className="setup-code"
            onSubmit={(event) => {
              event.preventDefault();
              sendCode();
            }}
          >
            <Input
              className="set-text setup-code-input"
              aria-label={t("setup.code-label")}
              placeholder={t("setup.code-label")}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button variant="secondary" type="submit" disabled={!code.trim()}>{t("action.send")}</Button>
          </form>
        )}
      </div>
      <div className="setup-welcome-foot">
        <Button variant="ghost" onClick={() => cancelSetupRun(p.agent)}>{t("action.cancel")}</Button>
      </div>
    </>
  );
}

function FailedScreen(p: {
  agent: SetupAgentId;
  run: SetupRun;
  provider: SetupProviderStatus | null;
  rechecking: boolean;
  onRetry: () => void;
}) {
  const [manual, setManual] = useState(false);
  // À la main : la connexion si l'agent est déjà là, sinon l'installation.
  const login = p.provider?.auth === "login_needed" && p.provider.loginCommand
    ? withResolvedBinary(p.provider.loginCommand, p.provider.binPath)
    : null;
  const command = login ?? p.provider?.installCommand ?? null;
  return (
    <>
      <div className="setup-welcome-body">
        {p.run.error && (
          <InlineNotice tone="error">
            <pre className="setup-run-error">{p.run.error}</pre>
          </InlineNotice>
        )}
        {command && !manual && (
          <div className="setup-run-actions">
            <Button variant="ghost" className="set-btn quiet" onClick={() => setManual(true)}>
              {t("setup.manual")}
            </Button>
          </div>
        )}
        {command && manual && (
          <SetupCommandFallback command={command} onHide={() => setManual(false)} />
        )}
      </div>
      <div className="setup-welcome-foot">
        <Button variant="ghost" onClick={() => clearSetupRun(p.agent)}>{t("setup.back")}</Button>
        <Button variant="secondary" disabled={p.rechecking} onClick={() => { recheckAll(); }}>
          {p.rechecking ? t("settings.checking") : t("settings.providers-recheck")}
        </Button>
        <Button variant="primary" onClick={p.onRetry}>{t("action.retry")}</Button>
      </div>
    </>
  );
}

function ReadyScreen(p: { env: SetupEnvironmentState; onFinish: () => void; onOpenFolder?: () => void }) {
  const others = SETUP_AGENTS.filter((id) => providerOf(p.env, id)?.auth !== "ready");
  const optional = (p.env.tools ?? []).filter((tool) => OPTIONAL_TOOLS.has(tool.id));
  return (
    <>
      <div className="setup-welcome-body">
        {p.onOpenFolder && (
          <RowButton className="setup-pick setup-next" onClick={p.onOpenFolder}>
            <FolderOpen className="setup-next-icon" size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="setup-pick-txt">
              <span className="setup-pick-title">{t("setup.open-folder")}</span>
              <span className="setup-pick-desc">{t("setup.open-folder-desc")}</span>
            </span>
          </RowButton>
        )}
        {(optional.length > 0 || others.length > 0) && (
          <Group label={t("setup.also-here")}>
            {optional.map((tool) => (
              <ToolSetupRow key={tool.id} tool={tool} tools={p.env.tools} origin="welcome" />
            ))}
            {others.map((id) => (
              <AgentSetupRow key={id} id={id} providers={p.env.providers} tools={p.env.tools} origin="welcome" />
            ))}
          </Group>
        )}
      </div>
      <div className="setup-welcome-foot">
        <Button variant="secondary" onClick={p.onFinish}>{t("setup.finish")}</Button>
      </div>
    </>
  );
}
