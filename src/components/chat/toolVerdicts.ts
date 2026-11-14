// Ce que le fil sait d'un appel d'outil au-delà de son statut : l'utilisateur
// l'a-t-il refusé, et son échec a-t-il arrêté le travail ? Module sans
// composant (React Doctor : only-export-components).
import { createContext, useMemo } from "react";
import type { ChatTurnViewModel } from "../../lib/chat/turnViewModel";
import { t } from "../../lib/i18n";
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

const NOT_FOUND = /no such file|does not exist|doesn't exist|not found|cannot find|enoent|introuvable|n'existe pas/iu;
const TIMED_OUT = /timed? ?out|timeout|délai dépassé/iu;
const NO_MATCH = /no (?:matches|files|results) found|aucun résultat/iu;

/** Pourquoi un appel n'a pas abouti, en un ou deux mots lisibles : la rangée
 * le dit en clair plutôt que de le signaler par une couleur. */
export function setbackReason(event: ToolUpdate, setback: ToolSetback): string {
  if (setback === "declined") return t("tools.setback.declined");
  if (setback === "stopped") return t("tools.setback.stopped");
  const output = (event.output ?? "").slice(-400);
  if (NO_MATCH.test(output)) return t("tools.setback.no-match");
  if (NOT_FOUND.test(output)) return t("tools.setback.not-found");
  if (TIMED_OUT.test(output)) return t("tools.setback.timeout");
  // `grep`, `rg`, `test` : un exit 1 muet veut dire « rien trouvé ».
  if (event.exitCode === 1 && !output.trim()) return t("tools.setback.no-match");
  if (event.exitCode != null && event.exitCode !== 0) return `exit ${event.exitCode}`;
  return t("tools.setback.generic");
}

/** Dernière ligne parlante de la sortie d'un échec bloquant : c'est elle qui
 * dit ce qui a arrêté le travail (« libreoffice : commande introuvable »). */
export function lastOutputLine(output: string): string {
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const line = lines[lines.length - 1] ?? "";
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
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

const ids = (set: ReadonlySet<string>) => [...set].sort();

/** Verdicts du fil, à identité STABLE tant que leur contenu ne change pas :
 * le fil reçoit un événement par bout de texte, et chaque rangée d'outil lit
 * ce contexte — une nouvelle référence les ferait toutes se redessiner. Le
 * contenu passe par une clé texte : le rendu reste pur, sans ref à écrire. */
export function useToolVerdicts(events: readonly AgentEvent[], turns: readonly ChatTurnViewModel[]): ToolVerdicts {
  const key = useMemo(() => {
    const found = collectToolVerdicts(events, turns);
    return found === NONE ? "" : JSON.stringify([ids(found.blocking), ids(found.declined)]);
  }, [events, turns]);
  return useMemo(() => {
    if (!key) return NONE;
    const [blocking, declined] = JSON.parse(key) as [string[], string[]];
    return { blocking: new Set(blocking), declined: new Set(declined) };
  }, [key]);
}
