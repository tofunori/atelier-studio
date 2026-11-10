import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProjectedTimelineItem } from "../../lib/chat/turnViewModel";
import type { AgentEvent } from "../../lib/ws";
import { fuseApprovals, plainAllowed } from "./approvalFusion";

const CHOICES = [
  { optionId: "allow", label: "Autoriser", kind: "allow_once" },
  { optionId: "always", label: "Oui, et ne plus demander pour « ls * »", kind: "allow_always" },
  { optionId: "deny", label: "Refuser", kind: "reject_once" },
];
const appr = (id: string, answerSummary: string | null, extra: Record<string, unknown> = {}) => ({
  kind: "interaction", requestId: id, interactionType: "approval", title: "Exécution de commande",
  detail: "ls", choices: CHOICES, state: answerSummary == null ? "pending" : "answered",
  ...(answerSummary == null ? {} : { answerSummary }), ...extra,
}) as AgentEvent;
const bash = (id: string, extra: Record<string, unknown> = {}) => ({
  kind: "tool_update", id, name: "Bash", detail: "ls", output: "", status: "completed", ...extra,
}) as AgentEvent;
const text = (value: string) => ({ kind: "text", text: value }) as AgentEvent;
const rows = (events: AgentEvent[]): ProjectedTimelineItem[] =>
  events.map((event, index) => ({ type: "event", key: `k${index}`, event, index }));
const kinds = (items: ProjectedTimelineItem[]) =>
  items.map((row) => (row.type === "event" ? ("id" in row.event ? row.event.id : "requestId" in row.event ? row.event.requestId : row.event.kind) : row.type));

describe("plainAllowed", () => {
  it("ne retient que l'autorisation « une fois », sans règle ni consigne", () => {
    expect(plainAllowed(appr("a", "Autoriser"))).toBe(true);
    expect(plainAllowed(appr("a", "Oui, et ne plus demander pour « ls * »"))).toBe(false);
    expect(plainAllowed(appr("a", "Refuser"))).toBe(false);
    expect(plainAllowed(appr("a", "Refuser · « Lis plutôt le fichier »"))).toBe(false);
    expect(plainAllowed(appr("a", null))).toBe(false);
    expect(plainAllowed(appr("a", "Autoriser", { state: "expired" }))).toBe(false);
  });

  it("Codex (sans choix) : « autorisé une fois » seulement", () => {
    expect(plainAllowed(appr("a", "autorisé une fois", { choices: undefined }))).toBe(true);
    expect(plainAllowed(appr("a", "toujours autorisé pour cette session", { choices: undefined }))).toBe(false);
    expect(plainAllowed(appr("a", "refusé", { choices: undefined }))).toBe(false);
  });

  it("un plan validé, un aperçu de modification ou la demande d'un autre fil gardent leur ligne", () => {
    expect(plainAllowed(appr("a", "Autoriser", { markdown: "# Plan" }))).toBe(false);
    expect(plainAllowed(appr("a", "Autoriser", { preview: { path: "a.tex", oldText: "a", newText: "b" } }))).toBe(false);
    expect(plainAllowed(appr("a", "Autoriser", { forThreadId: "child" }))).toBe(false);
  });
});

describe("fuseApprovals", () => {
  it("fond le reçu dans l'action qui suit : les actions redeviennent voisines", () => {
    const out = fuseApprovals(rows([appr("r1", "Autoriser"), bash("t1"), appr("r2", "Autoriser"), bash("t2"), bash("t3")]));
    expect(kinds(out.rows)).toEqual(["t1", "t2", "t3"]);
    expect([...out.shields.keys()]).toEqual(["t1", "t2"]);
  });

  it("une narration peut s'intercaler entre le reçu et son action", () => {
    const out = fuseApprovals(rows([appr("r1", "Autoriser"), text("Je recalcule."), bash("t1")]));
    expect(kinds(out.rows)).toEqual(["text", "t1"]);
    expect(out.shields.has("t1")).toBe(true);
  });

  it("rattache par itemId quand l'action précède la demande (ordre de Claude)", () => {
    const out = fuseApprovals(rows([bash("toolu_1"), appr("r1", "Autoriser", { itemId: "toolu_1" }), bash("toolu_2")]));
    expect(kinds(out.rows)).toEqual(["toolu_1", "toolu_2"]);
    expect([...out.shields.keys()]).toEqual(["toolu_1"]);
  });

  it("sans action à qui le rattacher, le reçu reste affiché", () => {
    const alone = rows([bash("t0"), appr("r1", "Autoriser")]);
    expect(fuseApprovals(alone).rows).toHaveLength(2);
    const cut = rows([appr("r1", "Autoriser"), { kind: "user", text: "Autre chose" } as AgentEvent, bash("t1")]);
    expect(kinds(fuseApprovals(cut).rows)).toEqual(["r1", "user", "t1"]);
  });

  it("un refus, une règle retenue ou une demande en attente gardent leur ligne", () => {
    const out = fuseApprovals(rows([
      appr("deny", "Refuser"), bash("t1"),
      appr("rule", "Oui, et ne plus demander pour « ls * »"), bash("t2"),
      appr("wait", null), bash("t3"),
    ]));
    expect(kinds(out.rows)).toEqual(["deny", "t1", "rule", "t2", "wait", "t3"]);
    expect(out.shields.size).toBe(0);
  });

  it("deux reçus ne se posent pas sur la même action ; une modification ne porte pas de bouclier", () => {
    const twice = fuseApprovals(rows([appr("r1", "Autoriser"), appr("r2", "Autoriser"), bash("t1")]));
    expect(kinds(twice.rows)).toEqual(["r1", "t1"]);
    const edit = fuseApprovals(rows([appr("r1", "Autoriser"), bash("e1", { name: "Edit", detail: "a.tex" })]));
    expect(kinds(edit.rows)).toEqual(["r1", "e1"]);
  });

  it("rend le fil tel quel quand il n'y a rien à fondre", () => {
    const input = rows([bash("t1"), text("ok")]);
    expect(fuseApprovals(input).rows).toBe(input);
  });
});

describe("rangées d'action : bloc serré et chevron au survol", () => {
  const css = readFileSync("src/App.css", "utf8");
  it("les actions d'une étape se touchent, rangées de 28 px", () => {
    expect(css).toMatch(/\.activity-action-list \{[^}]*gap: 0;/);
    expect(css).toMatch(/\.activity-action-list \.tool-output-head \{ min-height: 28px; padding-block: 4px; \}/);
  });
  it("le chevron est masqué au repos, visible au survol, au focus clavier et rangée ouverte", () => {
    expect(css).toMatch(/\.tool-output\.is-compact \.tool-output-head > \.tool-tick, \.activity-thought-head > \.tool-tick \{\s*opacity: 0;/);
    expect(css).toContain(".tool-output.is-compact .tool-output-head:is(:hover, :focus-visible) > .tool-tick");
    expect(css).toContain(".tool-output.is-compact.open .tool-output-head > .tool-tick");
  });
});
