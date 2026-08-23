import { describe, expect, it } from "vitest";
import {
  initialJumpState,
  nextJumpAction,
  JUMP_MAX_ATTEMPTS,
  type JumpProbe,
  type JumpState,
} from "./margeJump";

// Le saut de marge atterrit d'abord sur la position ESTIMÉE de LegendList :
// cette machine décide, frame par frame, quand attendre, corriger sur la
// géométrie réelle, re-viser ou s'arrêter. Scénarios mesurés 2026-08-23.

function drive(probes: JumpProbe[], from: JumpState = initialJumpState()) {
  let state = from;
  const actions = probes.map((probe) => {
    const [next, action] = nextJumpAction(state, probe);
    state = next;
    return action;
  });
  return { state, actions };
}

describe("nextJumpAction", () => {
  it("attend tant que le défilement (animé) bouge encore", () => {
    const { actions } = drive([
      { scrollTop: 100, rowDelta: null },
      { scrollTop: 300, rowDelta: null },
      { scrollTop: 500, rowDelta: 40 },
    ]);
    expect(actions.every((a) => a.kind === "wait")).toBe(true);
  });

  it("déclare le saut réussi quand, stabilisé, la rangée est au bord à la tolérance près", () => {
    const { actions } = drive([
      { scrollTop: 500, rowDelta: 2 },
      { scrollTop: 500, rowDelta: 2 },
      { scrollTop: 500, rowDelta: 2 },
    ]);
    expect(actions[2]).toEqual({ kind: "done" });
  });

  it("corrige de l'écart mesuré quand l'estimation a raté la cible", () => {
    const { actions } = drive([
      { scrollTop: 500, rowDelta: -260 },
      { scrollTop: 500, rowDelta: -260 },
      { scrollTop: 500, rowDelta: -260 },
    ]);
    expect(actions[2]).toEqual({ kind: "correct", delta: -260 });
  });

  it("re-vise (non animé) quand la rangée cible n'est toujours pas rendue", () => {
    const { actions } = drive([
      { scrollTop: 500, rowDelta: null },
      { scrollTop: 500, rowDelta: null },
      { scrollTop: 500, rowDelta: null },
    ]);
    expect(actions[2]).toEqual({ kind: "rescroll" });
  });

  it("s'arrête à la butée : une correction sans effet ne boucle pas jusqu'au cap", () => {
    // stabilisation → correction, puis le scroller est déjà au maximum :
    // scrollTop ne bouge pas, l'écart demeure — on rend les armes proprement
    const first = drive([
      { scrollTop: 500, rowDelta: 90 },
      { scrollTop: 500, rowDelta: 90 },
      { scrollTop: 500, rowDelta: 90 },
    ]);
    expect(first.actions[2]).toEqual({ kind: "correct", delta: 90 });
    const second = drive([
      { scrollTop: 500, rowDelta: 90 },
      { scrollTop: 500, rowDelta: 90 },
      { scrollTop: 500, rowDelta: 90 },
    ], first.state);
    expect(second.actions[2]).toEqual({ kind: "done" });
  });

  it("abandonne après le plafond d'essais", () => {
    let state = initialJumpState();
    let last;
    for (let i = 0; i <= JUMP_MAX_ATTEMPTS; i += 1) {
      [state, last] = nextJumpAction(state, { scrollTop: i, rowDelta: null });
    }
    expect(last).toEqual({ kind: "abandon" });
  });
});
