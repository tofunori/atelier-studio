import type { TurnPhase } from "./turnViewModel";

export type ScrollPolicyEvent =
  | { type: "thread-changed"; phase: TurnPhase }
  | { type: "phase-changed"; phase: TurnPhase }
  | { type: "user-scrolled-up" }
  | { type: "reached-end" }
  | { type: "jump-bottom" };

export type ScrollPolicyDecision = {
  follow: boolean;
  phase: TurnPhase;
  effect: "none" | "anchor-final" | "scroll-end";
};

/** Politique pure inspirée de Codex : suivre le pré-travail, respecter toute
 * lecture manuelle, puis ancrer une seule fois le début de la réponse finale. */
export function transitionScrollPolicy(
  current: Pick<ScrollPolicyDecision, "follow" | "phase">,
  event: ScrollPolicyEvent,
): ScrollPolicyDecision {
  if (event.type === "thread-changed") return { follow: true, phase: event.phase, effect: "scroll-end" };
  if (event.type === "user-scrolled-up") return { ...current, follow: false, effect: "none" };
  if (event.type === "reached-end") return { ...current, follow: true, effect: "none" };
  if (event.type === "jump-bottom") return { ...current, follow: true, effect: "scroll-end" };
  if (event.phase === "final_answer" && current.phase !== "final_answer" && current.follow) {
    return { follow: false, phase: event.phase, effect: "anchor-final" };
  }
  return { follow: current.follow, phase: event.phase, effect: "none" };
}
