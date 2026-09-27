// Intégrations distantes (Ragdoc, gbrain, NAS, grappes Slurm, Crossref,
// Zotero) : petit store module-level, même patron que lib/kbSources — le
// dernier message `integrations` du serveur, relayé par App (sidecarRelays →
// événement fenêtre `integrations-state`) et lu via useSyncExternalStore.
//
// Contrat (côté Rust, atelier-integrations) :
//   → { type:"integrations" }                         lire
//   → { type:"saveIntegrations", config }              remplacer le fichier
//   ← { type:"integrations", config, effective, error? }
// `error` n'est présent que si saveIntegrations a été refusé ; `config` est
// alors l'ANCIENNE valeur.
//
// Tant qu'aucun message n'est arrivé, TOUT est désactivé : aucune surface ne
// doit tenter une connexion SSH vers un hôte qu'on ne connaît pas encore.
import { useSyncExternalStore } from "react";
import { wsSend } from "./wsBus";

export type IntegrationsConfig = {
  ragdoc?: { host: string; root: string };
  /** `sshHost: ""` = binaire gbrain de ce Mac. */
  gbrain?: { sshHost: string };
  compute?: {
    nasHost?: string;
    /** Passerelle SSH vers les grappes ("" ou absent = connexion directe). */
    clusterGateway?: string;
    clusters?: { narval?: string; rorqual?: string };
  };
  crossrefMailto?: string;
  /** Dossier de données Zotero (absolu ; "" = détection auto). */
  zoteroDir?: string;
};

export type ClusterTarget = { host: string; gateway: string | null };
export type ClusterId = "narval" | "rorqual";
export type ZoteroSource = "env" | "config" | "zotero-prefs" | "default";

export type IntegrationsEffective = {
  ragdoc: boolean;
  gbrain: "ssh" | "local" | null;
  nasHost: string | null;
  clusters: { narval: ClusterTarget | null; rorqual: ClusterTarget | null };
  crossref: boolean;
  zoteroDir: string;
  zoteroFound: boolean;
  zoteroSource: ZoteroSource;
};

export type IntegrationsState = {
  config: IntegrationsConfig;
  effective: IntegrationsEffective;
  /** Refus du dernier saveIntegrations, sinon null. */
  error: string | null;
  /** Vrai dès le premier message du serveur. */
  loaded: boolean;
};

/** Repli tant que le serveur n'a rien dit (et pour les chemins d'invite). */
export const DEFAULT_ZOTERO_DIR = "~/Zotero";

export const DISABLED_INTEGRATIONS: IntegrationsEffective = {
  ragdoc: false,
  gbrain: null,
  nasHost: null,
  clusters: { narval: null, rorqual: null },
  crossref: false,
  zoteroDir: DEFAULT_ZOTERO_DIR,
  zoteroFound: false,
  zoteroSource: "default",
};

const INITIAL: IntegrationsState = {
  config: {},
  effective: DISABLED_INTEGRATIONS,
  error: null,
  loaded: false,
};

let state: IntegrationsState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function clusterTarget(value: unknown): ClusterTarget | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { host?: unknown; gateway?: unknown };
  const host = text(raw.host);
  if (!host) return null;
  return { host, gateway: text(raw.gateway) || null };
}

/** Lecture défensive de `effective` : un champ absent ou mal typé retombe sur
 *  « désactivé », jamais sur un hôte deviné. */
export function normalizeEffective(value: unknown): IntegrationsEffective {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const clusters = (raw.clusters && typeof raw.clusters === "object" ? raw.clusters : {}) as Record<string, unknown>;
  const source = raw.zoteroSource;
  return {
    ragdoc: raw.ragdoc === true,
    gbrain: raw.gbrain === "ssh" || raw.gbrain === "local" ? raw.gbrain : null,
    nasHost: text(raw.nasHost) || null,
    clusters: { narval: clusterTarget(clusters.narval), rorqual: clusterTarget(clusters.rorqual) },
    crossref: raw.crossref === true,
    zoteroDir: text(raw.zoteroDir) || DEFAULT_ZOTERO_DIR,
    zoteroFound: raw.zoteroFound === true,
    zoteroSource: source === "env" || source === "config" || source === "zotero-prefs" ? source : "default",
  };
}

/** Applique un message `integrations` du serveur. */
export function applyIntegrationsMessage(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const raw = msg as { config?: unknown; effective?: unknown; error?: unknown };
  state = {
    config: raw.config && typeof raw.config === "object" ? (raw.config as IntegrationsConfig) : {},
    effective: normalizeEffective(raw.effective),
    error: typeof raw.error === "string" && raw.error.trim() ? raw.error : null,
    loaded: true,
  };
  emit();
}

export function integrationsSnapshot(): IntegrationsState {
  return state;
}

export function subscribeIntegrations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIntegrations(): IntegrationsState {
  return useSyncExternalStore(subscribeIntegrations, integrationsSnapshot);
}

export function requestIntegrations(): boolean {
  return wsSend({ type: "integrations" });
}

/** Remplace le fichier côté serveur ; la réponse arrive comme un message
 *  `integrations` (avec `error` en cas de refus). */
export function saveIntegrations(config: IntegrationsConfig): boolean {
  return wsSend({ type: "saveIntegrations", config });
}

/** Ragdoc est-il utilisable ? Lu au moment de l'appel (bibliothèques pures). */
export function ragdocEnabled(): boolean {
  return state.effective.ragdoc;
}

/** Dossier Zotero à citer dans une invite — jamais vide. */
export function zoteroDataDir(effective: IntegrationsEffective = state.effective): string {
  return effective.zoteroDir || DEFAULT_ZOTERO_DIR;
}

/** Chemin d'un PDF du stockage Zotero, tel qu'on le donne à lire à un agent. */
export function zoteroStoragePath(dir: string, pdfKey: string, pdfFile: string): string {
  const base = (dir || DEFAULT_ZOTERO_DIR).replace(/\/+$/, "");
  return `${base}/storage/${pdfKey}/${pdfFile}`;
}

/** Commande SSH d'une grappe configurée : via la passerelle si elle existe. */
export function clusterSshCommand(target: ClusterTarget): string {
  return target.gateway ? `ssh ${target.gateway} -t ssh ${target.host}` : `ssh ${target.host}`;
}

// tests seulement : fixe l'état effectif (le reste retombe sur « désactivé »)
export function setIntegrationsForTests(
  effective: Partial<IntegrationsEffective> = {},
  config: IntegrationsConfig = {},
  error: string | null = null,
): void {
  state = {
    config,
    effective: {
      ...DISABLED_INTEGRATIONS,
      ...effective,
      clusters: { ...DISABLED_INTEGRATIONS.clusters, ...(effective.clusters ?? {}) },
    },
    error,
    loaded: true,
  };
  emit();
}

// tests seulement : retour à l'état « rien reçu »
export function resetIntegrationsForTests(): void {
  state = INITIAL;
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("integrations-state", (e) => applyIntegrationsMessage((e as CustomEvent).detail));
}
