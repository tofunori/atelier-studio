import { describe, expect, it } from "vitest";
import { usageFromHistory } from "./historyUsage";
import type { AgentEvent } from "./ws";

const usage = (context: number, window: number | null, turnId?: string): AgentEvent => ({
  kind: "usage",
  usage: { context, output: 10, cost: null, turns: null, window },
  ...(turnId ? { meta: { turnId } as any } : {}),
});
const done = (context: number, turnId?: string): AgentEvent => ({
  kind: "done", ok: true, result: "",
  usage: { context, output: 20, cost: null, turns: 1 },
  ...(turnId ? { meta: { turnId } as any } : {}),
});

describe("usageFromHistory", () => {
  it("renvoie null sans aucun usage", () => {
    expect(usageFromHistory([])).toBeNull();
    expect(usageFromHistory([{ kind: "user", text: "salut" } as AgentEvent])).toBeNull();
  });

  it("garde la fenêtre d'un usage du même tour sous le done qui le suit", () => {
    const out = usageFromHistory([usage(100, 200_000, "t1"), done(120, "t1")]);
    expect(out).toEqual(expect.objectContaining({ context: 120, window: 200_000 }));
  });

  it("n'attribue jamais la fenêtre d'un tour précédent au done suivant", () => {
    const out = usageFromHistory([usage(100, 200_000, "t1"), done(120, "t2")]);
    expect(out).toEqual(expect.objectContaining({ context: 120 }));
    expect(out).not.toHaveProperty("window");
  });

  it("sans turnId, un user entre usage et done sépare les tours", () => {
    const sameTurn = usageFromHistory([usage(100, 1000), done(120)]);
    expect(sameTurn).toEqual(expect.objectContaining({ window: 1000 }));
    const split = usageFromHistory([usage(100, 1000), { kind: "user", text: "suite" } as AgentEvent, done(120)]);
    expect(split).not.toHaveProperty("window");
  });

  it("un usage postérieur au dernier done fait foi", () => {
    const out = usageFromHistory([done(120, "t1"), usage(300, 1000, "t2")]);
    expect(out).toEqual(expect.objectContaining({ context: 300, window: 1000 }));
  });
});
