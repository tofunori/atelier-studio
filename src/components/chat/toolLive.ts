// Partie vivante des rangées d'outil du fil : chrono propre d'un appel,
// traîne de sortie d'une commande en cours, faits d'une grappe. Module sans
// composant (React Doctor : only-export-components).
import type { AgentEvent } from "../../lib/ws";
import type { ActivityAction } from "./groupActivityRows";
import { activeToolLabel, stripAnsi, tickerRows, toolOutcome } from "./toolPresentation";

type ToolUpdate = Extract<AgentEvent, { kind: "tool_update" }>;

/** Instant où l'interface a vu un appel d'outil pour la première fois. Le
 * réducteur réécrit `ts` à chaque mise à jour (chaque bout de sortie Codex),
 * il ne peut donc pas dater le DÉBUT d'une commande : on le retient ici, au
 * niveau du module, pour qu'un démontage de la liste virtualisée ne remette
 * pas le chrono à zéro. */
const toolFirstSeen = new Map<string, number>();
export function toolStartedAt(action: ToolUpdate): number {
  const known = toolFirstSeen.get(action.id);
  if (known != null) return known;
  const now = Date.now();
  if (toolFirstSeen.size > 2000) toolFirstSeen.clear();
  toolFirstSeen.set(action.id, now);
  return now;
}

/** Dernières lignes non vides d'une sortie, pour la traîne d'une commande en
 * cours (Codex envoie sa sortie au fil de l'eau ; Claude seulement à la fin). */
export function outputTail(output: string, lines = 3): string[] {
  return stripAnsi(output).split(/\r?\n/u).map((line) => line.replace(/\s+$/u, ""))
    .filter((line) => line.trim() !== "").slice(-lines);
}
/** Ce qu'une grappe dit d'elle-même : durée cumulée, échec, action seule en
 * cours, et l'appel qui tourne s'il est seul — il prête à la rangée vivante
 * son chrono (le SIEN, pas celui du tour), sa commande en mono et sa traîne. */
export function clusterFacts(actions: ActivityAction[], liveLabel: string | undefined) {
  const updates = actions.filter((action): action is ActivityAction & ToolUpdate => action.kind === "tool_update");
  const totalMs = updates.reduce((sum, action) => (
    typeof action.durationMs === "number" && action.durationMs > 0 ? sum + action.durationMs : sum), 0);
  const running = updates.filter((action) => toolOutcome(action) === "running");
  const soloRunning = actions.length === 1
    && (actions[0].kind === "tool" || toolOutcome(actions[0] as ToolUpdate) === "running");
  const runningOne = liveLabel != null && running.length === 1 ? running[0] : null;
  return {
    totalMs,
    failed: updates.some((action) => toolOutcome(action) === "failed"),
    soloRunning,
    runningOne,
    liveRow: runningOne && activeToolLabel(runningOne) === liveLabel ? tickerRows([runningOne])[0] : null,
    tail: runningOne ? outputTail(runningOne.output) : [],
  };
}
