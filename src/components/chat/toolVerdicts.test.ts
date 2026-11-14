import { describe, expect, it } from "vitest";
import { buildChatTurnViewModels } from "../../lib/chat/turnViewModel";
import type { AgentEvent } from "../../lib/ws";
import { events, FIXED_TS } from "../../test/fixtures";
import { collectToolVerdicts, toolSetback } from "./toolVerdicts";

type ToolUpdate = Extract<AgentEvent, { kind: "tool_update" }>;
// La fixture ne recopie pas `exitCode` : on le repose après coup.
const tool = (over: Partial<ToolUpdate>) => ({
  ...events.tool({ name: "Bash", detail: "make", ...over }), ...(over.exitCode == null ? {} : { exitCode: over.exitCode }),
}) as ToolUpdate;
const verdicts = (evs: AgentEvent[]) => collectToolVerdicts(evs, buildChatTurnViewModels(evs, null));
const approval = (over: Partial<Extract<AgentEvent, { kind: "interaction" }>>): AgentEvent => ({
  kind: "interaction", requestId: "r1", interactionType: "approval", title: "Exécuter la commande ?",
  state: "answered", itemId: "cmd", ...over,
});

// Variante A « rangées calmes » (2026-11-14) : un appel d'outil en échec n'est
// rouge que s'il a arrêté le travail. Tout le reste est rattrapé ou voulu.
describe("verdicts des appels d'outil", () => {
  it("un échec que l'agent a rattrapé n'est pas bloquant", () => {
    const missing = tool({ id: "read", name: "Read", status: "failed" });
    const evs = [events.user(), missing, tool({ id: "next" }), events.text(), events.done()];
    const found = verdicts(evs);
    expect(found.blocking.size).toBe(0);
    expect(toolSetback(missing, found)).toBe("soft");
  });

  it("un échec suivi d'une phrase de l'agent n'est pas bloquant, même si le tour finit en erreur", () => {
    const failed = tool({ id: "cmd", status: "failed", exitCode: 2 });
    const evs = [events.user(), failed, events.text("Je n'ai pas pu compiler.", FIXED_TS + 400), events.error("provider indisponible")];
    expect(verdicts(evs).blocking.size).toBe(0);
  });

  it("le dernier appel d'un tour qui finit en erreur est celui qui a arrêté le travail", () => {
    const early = tool({ id: "early", status: "failed", exitCode: 1 });
    const last = tool({ id: "last", status: "completed", exitCode: 127 });
    const evs = [events.user(), early, events.thinking(), last, events.usage(), events.error("le processus s'est arrêté : exit 127")];
    const found = verdicts(evs);
    expect([...found.blocking]).toEqual(["last"]);
    expect(toolSetback(last, found)).toBe("blocking");
    expect(toolSetback(early, found)).toBe("soft");
  });

  it("un tour qui finit bien ne porte aucun échec bloquant", () => {
    const evs = [events.user(), tool({ id: "cmd", status: "failed", exitCode: 1 }), events.done()];
    expect(verdicts(evs).blocking.size).toBe(0);
  });

  it("un appel refusé à la demande d'autorisation est une décision, pas une panne", () => {
    const denied = tool({ id: "cmd", status: "failed" });
    const choices = [
      { optionId: "y", label: "Oui", kind: "allow_once" as const },
      { optionId: "n", label: "Non", kind: "reject_once" as const },
    ];
    const found = verdicts([events.user(), approval({ choices, answerSummary: "Non" }), denied, events.text(), events.done()]);
    expect([...found.declined]).toEqual(["cmd"]);
    expect(toolSetback(denied, found)).toBe("declined");
    expect(verdicts([events.user(), approval({ choices, answerSummary: "Oui" }), denied, events.done()]).declined.size).toBe(0);
    expect([...verdicts([events.user(), approval({ state: "declined" }), denied, events.done()]).declined]).toEqual(["cmd"]);
  });

  it("le statut dit seul qu'un appel a été refusé ou interrompu", () => {
    const none = verdicts([]);
    expect(toolSetback(tool({ status: "denied" }), none)).toBe("declined");
    expect(toolSetback(tool({ status: "interrupted" }), none)).toBe("stopped");
    expect(toolSetback(tool({ status: "cancelled" }), none)).toBe("stopped");
    expect(toolSetback(tool({ status: "completed" }), none)).toBeNull();
    expect(toolSetback(tool({ status: "inProgress" }), none)).toBeNull();
  });

  it("garde la même référence quand rien n'est à signaler", () => {
    expect(verdicts([events.user(), events.done()])).toBe(verdicts([]));
  });
});
