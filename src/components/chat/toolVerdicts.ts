// Ce que le fil sait d'un appel d'outil au-delà de son statut : l'utilisateur
// l'a-t-il refusé, et son échec a-t-il arrêté le travail ? Module sans
// composant (React Doctor : only-export-components).
import { createContext, useMemo, useRef } from "react";
import type { ChatTurnViewModel } from "../../lib/chat/turnViewModel";
import type { AgentEvent } from "../../lib/ws";

type ToolUpdate = Extract<AgentEvent, { kind: "tool_update" }>;

/** `blocking` : échecs que l'agent n'a PAS rattrapés (le tour s'est arrêté
 * dessus) : les seuls à garder du rouge. `declined` : appels refusés par
 * l'utilisateur à la demande d'autorisation. */
export type ToolVerdicts = { blocking: ReadonlySet<string>; declined: ReadonlySet<string> };

const NONE: ToolVerdicts = { blocking: new Set(), declined: new Set() };
export const ToolVerdictsContext = createContext<ToolVerdicts>(NONE);

const FAILED_STATUS = /^(failed|interrupted|cancelled|canceled|declined|denied|stopped)$/;
const DECLINED_STATUS = /^(declined|denied)$/;
const STOPPED_STATUS = /^(interrupted|cancelled|canceled|stopped)$/;
const normalized = (status: string | undefined) =>
  status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? "";

/** Le code de sortie fait foi sur le statut : un provider peut très bien
 * annoncer « completed » sur un exit 2. */
export function toolFailed(event: ToolUpdate): boolean {
  return (event.exitCode != null && event.exitCode !== 0) || FAILED_STATUS.test(normalized(event.status));
}

/** Ton d'un appel qui n'a pas abouti. `soft` : sans succès, l'agent a
 * continué ; `declined` et `stopped` : décisions de l'utilisateur ; aucun des
 * trois n'est une alerte. `blocking` : l'échec a arrêté le travail. */
export type ToolSetback = "soft" | "declined" | "stopped" | "blocking";

export function toolSetback(event: ToolUpdate, verdicts: ToolVerdicts): ToolSetback | null {
  if (!toolFailed(event)) return null;
  const status = normalized(event.status);
  if (verdicts.declined.has(event.id) || DECLINED_STATUS.test(status)) return "declined";
  if (STOPPED_STATUS.test(status)) return "stopped";
  return verdicts.blocking.has(event.id) ? "blocking" : "soft";
}

/** Une demande d'autorisation que l'utilisateur a refusée (ou laissée
 * expirer) : l'appel qu'elle visait n'est pas une panne. */
function declinedApproval(event: AgentEvent): string | null {
  if (event.kind !== "interaction" || event.interactionType !== "approval" || !event.itemId) return null;
  if (event.state === "declined" || event.state === "expired") return event.itemId;
  if (event.state !== "answered") return null;
  const summary = event.answerSummary ?? "";
  const picked = (event.choices ?? []).filter((choice) => summary.startsWith(choice.label))
    .sort((a, b) => b.label.length - a.label.length)[0];
  const rejected = /^reject/.test(picked?.kind ?? "") || /^(refus|rejet|deny|denied|declined)/i.test(summary);
  return rejected ? event.itemId : null;
}

/** Événements qui ne disent rien du travail de l'agent : on les enjambe pour
 * trouver ce qu'il faisait quand le tour s'est arrêté. */
const SILENT = new Set<AgentEvent["kind"]>([
  "interaction", "permission", "usage", "heartbeat", "activity", "started", "drafting", "todos", "goal",
  "error", "done", "thinking_progress",
]);

/**
 * Lit le fil une fois : quels appels ont été refusés, et lesquels ont arrêté
 * le travail. Un échec n'est bloquant que si le tour a fini en erreur ET que
 * rien (ni phrase, ni réflexion, ni autre outil) ne l'a suivi. Tout autre
 * échec a été rattrapé : l'agent a continué.
 */
export function collectToolVerdicts(events: readonly AgentEvent[], turns: readonly ChatTurnViewModel[]): ToolVerdicts {
  const declined = new Set<string>();
  for (const event of events) {
    const id = declinedApproval(event);
    if (id) declined.add(id);
  }
  const blocking = new Set<string>();
  for (const turn of turns) {
    if (turn.phase !== "failed" || turn.terminalIndex == null) continue;
    for (let index = turn.terminalIndex - 1; index >= turn.startIndex; index -= 1) {
      const event = events[index];
      if (!event || SILENT.has(event.kind)) continue;
      if (event.kind === "tool_update" && toolFailed(event) && !event.agentActivity) blocking.add(event.id);
      break;
    }
  }
  return declined.size || blocking.size ? { blocking, declined } : NONE;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((id) => b.has(id));

/** Verdicts du fil, à identité STABLE tant que leur contenu ne change pas :
 * le fil reçoit un événement par bout de texte, et chaque rangée d'outil lit
 * ce contexte — une nouvelle référence les ferait toutes se redessiner. */
export function useToolVerdicts(events: readonly AgentEvent[], turns: readonly ChatTurnViewModel[]): ToolVerdicts {
  const last = useRef(NONE);
  return useMemo(() => {
    const next = collectToolVerdicts(events, turns);
    if (!sameSet(next.blocking, last.current.blocking) || !sameSet(next.declined, last.current.declined)) last.current = next;
    return last.current;
  }, [events, turns]);
}
