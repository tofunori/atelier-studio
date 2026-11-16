// SetupBench — banc de captures DÉTERMINISTES de la prise en main : fenêtre
// de bienvenue (choix du compte, installation, connexion, échec, prêt) et
// rangées de Réglages > Environnement pendant une installation. Monté par
// main.tsx sur #setupbench-<état>[-light] avec VITE_VISUAL_BENCH=1 ; aucun
// serveur, aucune donnée personnelle : le store reçoit des messages factices.
import { useEffect, useState } from "react";
import "../../styles/tokens.css";
import "../../styles/shadcn.css";
import "../../styles/primitives.css";
import "../../App.css";
import "../../styles/settings-sheet.css";
import "../../styles/settings-refined.css";
import SetupWelcomeDialog from "./SetupWelcomeDialog";
import Environment from "../settings/sections/Environment";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import {
  applyEnvironmentStatus,
  applySetupRun,
  applySetupStatus,
  openSetupWelcome,
} from "../../lib/setupEnvironment";

const noop = () => {};

const agent = (id: "claude" | "codex", auth: string) => ({
  id,
  label: id === "claude" ? "Claude Code" : "Codex",
  kind: "cli",
  installed: auth !== "not_installed",
  version: auth === "not_installed" ? null : id === "claude" ? "2.1.150" : "0.155.1",
  binPath: auth === "not_installed" ? null : `/Users/demo/.local/bin/${id}`,
  auth,
  loginCommand: id === "claude" ? "claude auth login" : "codex login",
  installCommand: id === "claude"
    ? "curl -fsSL https://claude.ai/install.sh | bash"
    : "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
});

const TOOLS = [
  { id: "git", found: true, path: "/usr/bin/git", detail: null, installCommand: "xcode-select --install", installUrl: null },
  { id: "tex", found: false, path: null, detail: "on-demand", installCommand: null, installUrl: null },
  { id: "zotero", found: true, path: "/Users/demo/Zotero", detail: null, installCommand: null, installUrl: null },
];

const FAILURE = "curl: (6) Could not resolve host: claude.ai\nL’installeur s’est arrêté (code 6).";

/** Messages factices par état, dans l'ordre où le serveur les enverrait. */
function seed(state: string) {
  const status = (claude: string, codex: string) =>
    applySetupStatus({ type: "setupStatus", status: { providers: [agent("claude", claude), agent("codex", codex)] } });
  applyEnvironmentStatus({ type: "environmentStatus", tools: TOOLS });
  const run = (phase: string, extra: Record<string, unknown> = {}) =>
    applySetupRun({ type: "setupRun", agent: "claude", phase, detail: null, url: null, error: null, ...extra });
  if (state === "install" || state === "env-install") {
    status("not_installed", "not_installed");
    run("installing", { detail: "Downloading Claude Code 2.1.150…" });
  } else if (state === "login" || state === "env-login") {
    status("login_needed", "not_installed");
    run("signing_in", { url: "https://claude.ai/oauth/authorize" });
  } else if (state === "failed" || state === "env-failed") {
    status("not_installed", "not_installed");
    run("failed", { error: FAILURE });
  } else if (state === "ready") {
    status("ready", "not_installed");
  } else {
    status("not_installed", "not_installed");
  }
}

const STATES = ["env-install", "env-login", "env-failed", "install", "login", "failed", "ready", "choose"];

export function SetupBench() {
  const hash = window.location.hash;
  const light = hash.includes("-light");
  const state = STATES.find((key) => hash.includes(`-${key}`)) ?? "choose";
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);
  useEffect(() => {
    seed(state);
    if (!state.startsWith("env-")) openSetupWelcome();
    setSeeded(true);
  }, [state]);

  if (!seeded) return null;
  if (state.startsWith("env-")) {
    return (
      <div className="settings-page settings-refined" style={{ height: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
        <div className="set-body">
          <Environment s={{ ...DEFAULT_SETTINGS }} set={noop} ws={{ readyState: 1 } as WebSocket} onSaved={noop} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: "100vh", background: "var(--surface-app)" }}>
      <SetupWelcomeDialog open onOpenFolder={noop} />
    </div>
  );
}
