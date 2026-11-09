import type { InteractionResponse } from "../../lib/ws";
import type { InteractionEvent } from "./HarnessInteraction";

/** Réponse envoyée à App (WS `interactionResponse`). Carte recopiée d'un fil
 *  lié (spécialiste délégué) : la réponse part au nom de ce fil, seul
 *  détenteur de la demande côté serveur. */
export const sendInteractionAnswer = (e: InteractionEvent, threadId: string | null, response: InteractionResponse) =>
  window.dispatchEvent(new CustomEvent("interaction-answer", {
    detail: { threadId: e.forThreadId ?? threadId, requestId: e.requestId, response },
  }));
