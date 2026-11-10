import type { ProjectedTimelineItem } from "../../lib/chat/turnViewModel";
import type { AgentEvent } from "../../lib/ws";
import { toolCategory } from "./toolPresentation";

type Approval = Extract<AgentEvent, { kind: "interaction" }>;

/** Autorisation simple d'une action : « une fois », sans règle retenue, sans
 *  consigne, sans plan ni aperçu à relire. C'est la seule qui se fond dans la
 *  rangée de l'action ; tout le reste (refus, règle, expiration) garde sa ligne. */
export function plainAllowed(e: AgentEvent): e is Approval {
  if (e.kind !== "interaction" || e.interactionType !== "approval" || e.state !== "answered"
    || e.markdown || e.preview || e.forThreadId) return false;
  if (!e.choices?.length) return e.answerSummary === "autorisé une fois";
  const at = e.choices.findIndex((c) => c.label === e.answerSummary);
  return at >= 0 && (e.choices[at].kind ?? (at ? "" : "allow_once")) === "allow_once";
}

/** Rangée d'outil capable de porter le bouclier (rendue par ToolOutputLine). */
const carrier = (e: AgentEvent): e is Extract<AgentEvent, { kind: "tool_update" }> =>
  e.kind === "tool_update" && !e.agentActivity && toolCategory(e.name, e.detail) !== "edit";

const narration = (e: AgentEvent) => /^(text|streaming|thinking(_live)?)$/.test(e.kind)
  || (e.kind === "tool" && e.name === "__thinking");

/**
 * Le reçu « Commande autorisée » ne fait plus une ligne : il devient un
 * bouclier dans la rangée de l'action qu'il a autorisée. L'action est celle
 * que désigne `itemId` (Claude, Codex) ; à défaut, la prochaine action du fil,
 * une narration pouvant s'intercaler. Sans action à qui le rattacher (elle
 * n'a pas encore démarré), le reçu reste affiché.
 */
export function fuseApprovals(rows: ProjectedTimelineItem[]): { rows: ProjectedTimelineItem[]; shields: Map<string, Approval> } {
  const shields = new Map<string, Approval>();
  const event = (at: number) => { const row = rows[at]; return row?.type === "event" ? row.event : null; };
  const kept = rows.filter((_row, at) => {
    const receipt = event(at);
    if (!receipt || !plainAllowed(receipt)) return true;
    let target = rows.some((other) => other.type === "event" && carrier(other.event) && other.event.id === receipt.itemId)
      ? receipt.itemId : null;
    for (let next = at + 1; !target; next += 1) {
      const after = event(next);
      if (after && carrier(after)) { if (!shields.has(after.id)) target = after.id; break; }
      if (!after || !narration(after)) break;
    }
    if (target) shields.set(target, receipt);
    return !target;
  });
  return { rows: shields.size ? kept : rows, shields };
}
