import { describe, expect, it } from "vitest";
import { transitionScrollPolicy } from "./scrollPolicy";

describe("chat scroll policy", () => {
  it("suit le pré-travail puis ancre une seule fois le début de la réponse finale", () => {
    const prework = { follow: true, phase: "prework" as const };
    const final = transitionScrollPolicy(prework, { type: "phase-changed", phase: "final_answer" });
    expect(final).toEqual({ follow: false, phase: "final_answer", effect: "anchor-final" });
    expect(transitionScrollPolicy(final, { type: "phase-changed", phase: "final_answer" }).effect).toBe("none");
  });

  it("ne déplace jamais un utilisateur qui lit plus haut", () => {
    const detached = transitionScrollPolicy(
      { follow: true, phase: "prework" },
      { type: "user-scrolled-up" },
    );
    expect(transitionScrollPolicy(detached, { type: "phase-changed", phase: "final_answer" }))
      .toEqual({ follow: false, phase: "final_answer", effect: "none" });
  });

  it("le bouton de bas réactive explicitement le suivi", () => {
    expect(transitionScrollPolicy(
      { follow: false, phase: "final_answer" },
      { type: "jump-bottom" },
    )).toEqual({ follow: true, phase: "final_answer", effect: "scroll-end" });
  });
});
