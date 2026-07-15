// Fixtures déterministes du plan 015 — AUCUN Date.now()/UUID aléatoire :
// dates, identifiants, durées et compteurs sont figés. Les formes proviennent
// des types réseau réels (lib/ws, Rail, App) et ne doivent pas être « adaptées »
// pour faire passer un test : si une forme change, c'est le produit qui a changé.
import type { AgentEvent, HarnessEventMeta, Thread } from "../../lib/ws";
import type { HighlightEntry } from "../../components/Rail";
import type { Attachment } from "../../App";
import type { ProviderCapabilities, ProviderInfo } from "../../lib/providers";

/** Horodatage figé de référence (2026-07-09T12:00:00.000Z). */
export const FIXED_TS = 1783684800000;
/** ISO figée dérivée de FIXED_TS. */
export const FIXED_ISO = new Date(FIXED_TS).toISOString();

export const PROJECT_ROOT = "/tmp/fixtures/albedo-pipeline";
export const OTHER_PROJECT_ROOT = "/tmp/fixtures/manuscrit-ch1";

let seq = 0;
/** Identifiant stable et lisible ; réinitialisé par resetFixtureSeq() dans beforeEach. */
export function fid(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
export function resetFixtureSeq(): void {
  seq = 0;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------
export function makeThread(over: Partial<Thread> = {}): Thread {
  return {
    id: over.id ?? fid("thread"),
    projectRoot: PROJECT_ROOT,
    title: "Albédo glaciaire et aérosols",
    provider: "claude",
    sessionId: "11111111-1111-4111-8111-111111111111",
    status: "idle",
    updatedAt: FIXED_ISO,
    ...over,
  };
}

export const threads = {
  /** Thread neuf, jamais lancé (pas de session). */
  empty: (over: Partial<Thread> = {}) => makeThread({ sessionId: null, ...over }),
  /** Tour en cours. */
  running: (over: Partial<Thread> = {}) => makeThread({ status: "running", ...over }),
  /** Tour terminé. */
  done: (over: Partial<Thread> = {}) => makeThread({ status: "done", ...over }),
  /** Dernier tour en erreur (statut produit : idle + événement error dans le fil). */
  errored: (over: Partial<Thread> = {}) => makeThread({ status: "idle", ...over }),
};

// ---------------------------------------------------------------------------
// Événements agent (formes réseau de lib/ws.ts)
// ---------------------------------------------------------------------------
export const events = {
  user: (text = "Analyse l'albédo du glacier Saskatchewan.", ts = FIXED_TS): AgentEvent =>
    ({ kind: "user", text, ts }),
  delta: (text = "Je regarde ", ts = FIXED_TS + 100): AgentEvent =>
    ({ kind: "delta", text, ts }),
  text: (text = "Voici l'analyse finale de l'albédo.", ts = FIXED_TS + 500): AgentEvent =>
    ({ kind: "text", text, ts }),
  thinking: (text = "Je dois d'abord lire le fichier de tendances.", ts = FIXED_TS + 50): AgentEvent =>
    ({ kind: "thinking", text, ts }),
  thinkingDelta: (text = "hmm… ", ts = FIXED_TS + 40): AgentEvent =>
    ({ kind: "thinking_delta", text, ts }),
  started: (ts = FIXED_TS + 10): AgentEvent => ({ kind: "started", ts }),
  heartbeat: (elapsedMs = 1200, ts = FIXED_TS + 1200): AgentEvent =>
    ({ kind: "heartbeat", elapsedMs, ts }),
  tool: (
    over: Partial<Extract<AgentEvent, { kind: "tool_update" }>> = {},
  ): AgentEvent => ({
    kind: "tool_update",
    id: over.id ?? "tool-001",
    name: over.name ?? "Read",
    output: over.output ?? "albedo_trends.csv : 240 lignes",
    status: over.status ?? "completed",
    detail: over.detail ?? "albedo_trends.csv",
    input: over.input ?? { file_path: `${PROJECT_ROOT}/albedo_trends.csv` },
    source: over.source ?? null,
    ts: over.ts ?? FIXED_TS + 200,
  }),
  usage: (output = 512, context = 2048, ts = FIXED_TS + 600): AgentEvent =>
    ({ kind: "usage", usage: { context, output, cost: null, turns: 1 }, ts }),
  done: (over: Partial<Extract<AgentEvent, { kind: "done" }>> = {}): AgentEvent => ({
    kind: "done",
    ok: over.ok ?? true,
    result: over.result ?? "Analyse terminée.",
    projectRoot: over.projectRoot ?? PROJECT_ROOT,
    filesChanged: over.filesChanged ?? [],
    usage: over.usage ?? { context: 2048, output: 512, cost: null, turns: 1 },
    ts: over.ts ?? FIXED_TS + 700,
  }),
  error: (message = "provider indisponible"): AgentEvent => ({ kind: "error", message }),
};

/** Metadata harnais schema v1 figée (plan 025) — eventId/sequence/ts
 * déterministes, à surcharger par test. */
export function makeMeta(over: Partial<HarnessEventMeta> = {}): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId: over.eventId ?? fid("ev"),
    provider: "claude",
    threadId: "thread-001",
    turnId: "turn-1",
    sequence: over.sequence ?? 1,
    ts: FIXED_TS,
    durable: true,
    origin: "provider",
    ...over,
  };
}

/** Un tour complet typique : user → thinking → tool → texte → done. */
export function makeTurnEvents(): AgentEvent[] {
  return [
    events.user(),
    events.thinking(),
    events.tool(),
    events.text(),
    events.done(),
  ];
}

// ---------------------------------------------------------------------------
// Catalogue providers (formes providerStatus du sidecar — plan 025, step 9)
// ---------------------------------------------------------------------------
/** Capabilities figées miroir du registry sidecar (claude par défaut). */
export function makeCapabilities(over: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
    reasoning: true,
    resume: true,
    steering: true,
    queue: true,
    goals: false,
    tools: true,
    toolOutput: true,
    permissions: true,
    interactiveInput: false,
    mcpElicitation: false,
    mcpTools: true,
    mcpWidgets: false,
    plugins: false,
    skills: true,
    review: false,
    compact: false,
    durableHistory: false,
    permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
    ...over,
  };
}

/** Entrée ProviderInfo telle que renvoyée par providerStatus (claude par défaut). */
export function makeProviderInfo(over: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "claude",
    label: "Claude Code",
    kind: "cli",
    version: "2.1.0",
    ok: true,
    models: ["claude-fable-5", "claude-sonnet-4-5"],
    defaultModel: "claude-fable-5",
    efforts: ["low", "medium", "high"],
    capabilities: makeCapabilities(),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Artefacts : fichiers projet, surlignés, figures, usage
// ---------------------------------------------------------------------------
/** Liste de fichiers projet telle que reçue par listFiles (chemins relatifs). */
export function makeFiles(): string[] {
  return [
    "analysis/albedo_trends.py",
    "manuscrit/fig3_spatial.svg",
    "manuscrit/fig4_melt_upper_bound.svg",
    "notes.md",
  ];
}

export function makeHighlight(over: Partial<HighlightEntry> = {}): HighlightEntry {
  return {
    id: over.id ?? fid("hl"),
    text: "le déclin d'albédo se concentre sous la snowline transitoire",
    context: "…la majorité des plus fortes baisses…",
    kind: "hl",
    projectRoot: PROJECT_ROOT,
    projectName: "albedo-pipeline",
    threadId: "thread-001",
    threadTitle: "Albédo glaciaire et aérosols",
    provider: "claude",
    createdAt: FIXED_ISO,
    ...over,
  };
}

/** Message galerie « ajouter au chat » (texte du postMessage atelier-add-to-chat). */
export function makeFigureAddToChatText(rel = "manuscrit/fig3_spatial.svg"): string {
  return `${PROJECT_ROOT}/${rel}\nFichier joint depuis la galerie atelier — lis-le (outil Read) avant de répondre.`;
}

export function makeAttachment(over: Partial<Attachment> = {}): Attachment {
  return {
    name: "fig3_spatial.svg",
    lines: null,
    text: makeFigureAddToChatText(),
    path: `${PROJECT_ROOT}/manuscrit/fig3_spatial.svg`,
    kind: "file",
    ...over,
  };
}

/** Payload getUsage → message { type: "usage" } (modèles du jour). */
export function makeUsageModels(): Record<string, { turns: number; output: number }> {
  return {
    "claude-sonnet-5": { turns: 3, output: 9210 },
    "gpt-5.5": { turns: 1, output: 1331 },
  };
}
