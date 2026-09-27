// Premier lancement et Réglages > Environnement : ce qui manque sur ce Mac
// (agents Claude Code / Codex, outils externes) et de quoi l'installer.
// Store module-level, même patron que lib/integrations : App relaie les
// messages `setupStatus` et `environmentStatus` (sidecarRelays → événements
// fenêtre `setup-status` / `environment-status`), les surfaces lisent via
// useSyncExternalStore.
//
// Contrat (côté Rust, ws_router/environment.rs) :
//   → { type:"setupStatus" }        ← { type:"setupStatus", status:{ providers } }
//   → { type:"environmentStatus" }  ← { type:"environmentStatus", tools }
//   → { type:"refreshProviders" }   ← providerStatus puis setupStatus
// Les deux premiers partent à chaque connexion (lib/ws.ts), et plus jamais
// sans un clic sur « Revérifier » : rien ici ne sonde en boucle.
//
// Les réglages Modèles et Général écoutent `setupStatus` sur la socket brute
// pour leur propre état local ; ce store ne les remplace pas.
import { useSyncExternalStore } from "react";
import { wsSend } from "./wsBus";

export type SetupProviderStatus = {
  id: string;
  label: string;
  kind: "cli" | "api";
  installed: boolean;
  version: string | null;
  binPath: string | null;
  /** "ready" | "login_needed" | "not_installed" | états des autres sondes. */
  auth: string;
  loginCommand: string | null;
  installCommand: string | null;
};

export type EnvironmentToolId = "homebrew" | "git" | "poppler" | "tex" | "zotero";

export type EnvironmentTool = {
  id: EnvironmentToolId;
  found: boolean;
  /** Binaire trouvé (zotero : dossier de données résolu). */
  path: string | null;
  /** tex : "latexmk" | "tectonic" ; poppler : binaire manquant si un seul manque. */
  detail: string | null;
  installCommand: string | null;
  /** Page officielle, https uniquement (sinon null). */
  installUrl: string | null;
};

export type SetupEnvironmentState = {
  /** null tant qu'aucun setupStatus n'est arrivé. */
  providers: SetupProviderStatus[] | null;
  /** null tant qu'aucun environmentStatus n'est arrivé. */
  tools: EnvironmentTool[] | null;
  /** « Revérifier » en cours : jusqu'aux deux réponses, 10 s au plus. */
  rechecking: boolean;
  welcomeOpen: boolean;
};

/** D'où part une commande d'installation : décide où « Revérifier » ramène. */
export type SetupOrigin = "welcome" | "environment" | "models";
export type SetupCommandKind = "install" | "login";
export type SetupCommandRequest = { kind: SetupCommandKind; origin: SetupOrigin };
/** App enregistre ce lanceur tant qu'un projet est ouvert (terminal intégré
 *  disponible) ; il renvoie false s'il ne peut pas prendre la commande. */
export type SetupTerminalOpener = (command: string, request: SetupCommandRequest) => boolean;

export const WELCOME_DONE_KEY = "atelier.setup.welcomeDone";
export const RECHECK_TIMEOUT_MS = 10_000;
const TOOL_IDS: readonly EnvironmentToolId[] = ["homebrew", "git", "poppler", "tex", "zotero"];

const INITIAL: SetupEnvironmentState = { providers: null, tools: null, rechecking: false, welcomeOpen: false };

let state: SetupEnvironmentState = INITIAL;
let pendingSetup = false;
let pendingTools = false;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;
/** La décision d'ouverture automatique se prend UNE fois par lancement. */
let welcomeDecided = false;
let terminalOpener: SetupTerminalOpener | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function update(patch: Partial<SetupEnvironmentState>) {
  state = { ...state, ...patch };
  emit();
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Lecture défensive d'une ligne `setupStatus.status.providers[]`. */
export function normalizeProviders(value: unknown): SetupProviderStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const id = text(raw.id);
    if (!id) return [];
    return [{
      id,
      label: text(raw.label) ?? id,
      kind: raw.kind === "api" ? "api" as const : "cli" as const,
      installed: raw.installed === true,
      version: text(raw.version),
      binPath: text(raw.binPath),
      auth: text(raw.auth) ?? "unknown",
      loginCommand: text(raw.loginCommand),
      installCommand: text(raw.installCommand),
    }];
  });
}

/** Lecture défensive de `environmentStatus.tools[]` : ids connus seulement,
 *  lien d'installation retenu s'il est en https. */
export function normalizeTools(value: unknown): EnvironmentTool[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const id = TOOL_IDS.find((known) => known === raw.id);
    if (!id) return [];
    const url = text(raw.installUrl);
    return [{
      id,
      found: raw.found === true,
      path: text(raw.path),
      detail: text(raw.detail),
      installCommand: text(raw.installCommand),
      installUrl: url && url.startsWith("https://") ? url : null,
    }];
  });
}

/** Au moins un fournisseur prêt, quel qu'il soit (CLI ou API). */
export function agentReady(providers: readonly SetupProviderStatus[] | null | undefined): boolean {
  return Boolean(providers?.some((provider) => provider.auth === "ready"));
}

export function welcomeDone(): boolean {
  try {
    return localStorage.getItem(WELCOME_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeDone(): void {
  try {
    localStorage.setItem(WELCOME_DONE_KEY, "1");
  } catch {
    // stockage indisponible : l'accueil reviendra au prochain lancement
  }
}

/** Règle d'ouverture automatique : aucun agent prêt et accueil jamais terminé.
 *  Le cas de l'auteur (Claude Code et Codex prêts) ne voit donc rien. */
export function shouldAutoShowWelcome(
  providers: readonly SetupProviderStatus[] | null,
  done: boolean,
): boolean {
  return providers !== null && !agentReady(providers) && !done;
}

function settleRecheck() {
  if (pendingSetup || pendingTools) return;
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = null;
  if (state.rechecking) update({ rechecking: false });
}

/** Applique un message `setupStatus` du serveur. */
export function applySetupStatus(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const status = (msg as { status?: unknown }).status;
  const providers = normalizeProviders(
    status && typeof status === "object" ? (status as { providers?: unknown }).providers : undefined,
  );
  const patch: Partial<SetupEnvironmentState> = { providers };
  if (!welcomeDecided) {
    welcomeDecided = true;
    if (shouldAutoShowWelcome(providers, welcomeDone())) patch.welcomeOpen = true;
  }
  update(patch);
  pendingSetup = false;
  settleRecheck();
}

/** Applique un message `environmentStatus` du serveur. */
export function applyEnvironmentStatus(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  update({ tools: normalizeTools((msg as { tools?: unknown }).tools) });
  pendingTools = false;
  settleRecheck();
}

/** « Revérifier » : redétection des CLI d'agents (réponse providerStatus +
 *  setupStatus) et nouveau diagnostic des outils. Renvoie false si rien n'est
 *  parti (déjà en cours, ou socket fermée). */
export function recheckAll(): boolean {
  if (state.rechecking) return false;
  if (!wsSend({ type: "refreshProviders" })) return false;
  pendingSetup = true;
  pendingTools = wsSend({ type: "environmentStatus" });
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    pendingSetup = false;
    pendingTools = false;
    if (state.rechecking) update({ rechecking: false });
  }, RECHECK_TIMEOUT_MS);
  update({ rechecking: true });
  return true;
}

export function openSetupWelcome(): void {
  if (!state.welcomeOpen) update({ welcomeOpen: true });
}

export function closeSetupWelcome(): void {
  if (state.welcomeOpen) update({ welcomeOpen: false });
}

/** Enregistre le lanceur du terminal intégré ; renvoie de quoi le retirer. */
export function registerSetupTerminal(opener: SetupTerminalOpener | null): () => void {
  terminalOpener = opener;
  return () => {
    if (terminalOpener === opener) terminalOpener = null;
  };
}

/** Lance une commande d'installation ou de connexion. « terminal » : le
 *  terminal intégré l'a prise (App a fermé ce qui le couvrait) ; « copy » :
 *  aucun terminal intégré (pas de projet ouvert) — l'appelant montre la
 *  commande à copier dans Terminal de macOS. */
export function runSetupCommand(command: string, request: SetupCommandRequest): "terminal" | "copy" {
  const opener = terminalOpener;
  if (command.trim() && opener && opener(command, request)) return "terminal";
  return "copy";
}

// ----- Commandes : binaires résolus plutôt que dépendants du PATH -----

/** Chemin passé tel quel au shell s'il est sûr, sinon entre apostrophes. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./~-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Remplace le premier mot de `command` par `binPath` quand c'est le même
 *  binaire : juste après une installation, `~/.local/bin` ou
 *  `/opt/homebrew/bin` ne sont pas forcément dans le PATH du shell. */
export function withResolvedBinary(command: string, binPath: string | null | undefined): string {
  if (!binPath) return command;
  const match = /^(\S+)(\s.*)?$/.exec(command.trim());
  if (!match) return command;
  const name = binPath.split("/").pop();
  if (!name || match[1] !== name) return command;
  return shellQuote(binPath) + (match[2] ?? "");
}

function tool(tools: readonly EnvironmentTool[] | null, id: EnvironmentToolId): EnvironmentTool | null {
  return tools?.find((entry) => entry.id === id) ?? null;
}

/** Une commande `brew …` exige Homebrew. */
export function needsHomebrew(command: string | null | undefined): boolean {
  return Boolean(command && /^brew\s/.test(command.trim()));
}

/** Ce qu'une action d'installation doit réellement lancer : Homebrew d'abord
 *  s'il manque (diagnostic reçu et négatif), sinon la commande avec `brew`
 *  résolu en chemin absolu quand on le connaît. */
export function installPlan(
  command: string,
  tools: readonly EnvironmentTool[] | null,
): { command: string; homebrewFirst: boolean } {
  if (!needsHomebrew(command)) return { command, homebrewFirst: false };
  const brew = tool(tools, "homebrew");
  if (brew && !brew.found && brew.installCommand) return { command: brew.installCommand, homebrewFirst: true };
  return { command: withResolvedBinary(command, brew?.found ? brew.path : null), homebrewFirst: false };
}

// ----- Lecture React -----

export function setupEnvironmentSnapshot(): SetupEnvironmentState {
  return state;
}

export function subscribeSetupEnvironment(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSetupEnvironment(): SetupEnvironmentState {
  return useSyncExternalStore(subscribeSetupEnvironment, setupEnvironmentSnapshot);
}

/** Abonnement étroit (App) : ne re-rend qu'à l'ouverture/fermeture. */
export function useSetupWelcomeOpen(): boolean {
  return useSyncExternalStore(subscribeSetupEnvironment, () => state.welcomeOpen);
}

/** Vrai quand le serveur a répondu ET qu'aucun agent n'est prêt : l'accueil
 *  montre alors « Terminer la configuration ». Faux tant qu'on ne sait pas. */
export function useSetupNeeded(): boolean {
  return useSyncExternalStore(
    subscribeSetupEnvironment,
    () => state.providers !== null && !agentReady(state.providers),
  );
}

// tests seulement : retour à l'état « rien reçu, rien décidé »
export function resetSetupEnvironmentForTests(): void {
  state = INITIAL;
  pendingSetup = false;
  pendingTools = false;
  welcomeDecided = false;
  terminalOpener = null;
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = null;
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("setup-status", (e) => applySetupStatus((e as CustomEvent).detail));
  window.addEventListener("environment-status", (e) => applyEnvironmentStatus((e as CustomEvent).detail));
}
