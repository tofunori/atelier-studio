/** Plan 025 interaction contract (mobile subset). */

export type InteractionType = "approval" | "user_input" | "mcp_elicitation";
export type InteractionState = "pending" | "answered" | "declined" | "expired";

export type InteractionField = {
  id: string;
  question: string;
  header?: string;
  options?: { label: string; description?: string }[];
  allowOther?: boolean;
  secret?: boolean;
};

export type InteractionPayload = {
  requestId: string;
  interactionType: InteractionType;
  title: string;
  detail?: string;
  urlDomain?: string;
  fields?: InteractionField[];
  state: InteractionState;
  answerSummary?: string;
};

export type InteractionResponse =
  | { allow: boolean }
  | { answers: Record<string, string> }
  | { action: "accept" | "decline"; content?: Record<string, string> };

export function parseInteractionFromWire(ev: {
  kind: string;
  requestId?: string;
  title?: string;
  detail?: string;
  interactionType?: string;
  state?: string;
  fields?: InteractionField[];
  urlDomain?: string;
  answerSummary?: string;
  meta?: { itemId?: string; eventId?: string };
}): InteractionPayload | null {
  if (ev.kind !== "interaction") return null;
  const requestId = ev.requestId || (ev.meta?.itemId as string) || "";
  if (!requestId) return null;
  const interactionType = (ev.interactionType || "approval") as InteractionType;
  const state = (ev.state || "pending") as InteractionState;
  return {
    requestId,
    interactionType,
    title: ev.title || "Interaction",
    detail: ev.detail,
    urlDomain: ev.urlDomain,
    fields: ev.fields,
    state,
    answerSummary: ev.answerSummary,
  };
}
