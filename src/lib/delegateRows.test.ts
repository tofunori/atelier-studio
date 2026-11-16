import { describe, expect, it } from "vitest";
import { isContextLine, planDelegateRows } from "./delegateRows";
import type { AgentEvent } from "./ws";

const msg = (over: Record<string, unknown>): AgentEvent => ({
  kind: "agent_message", messageId: "m", direction: "sent", peerThreadId: "code",
  text: "", status: "delivered", ...over,
} as AgentEvent);

const job = (over: Record<string, unknown>): AgentEvent => ({
  kind: "compute_job", jobId: "j1", status: "proposed", forThreadId: "code", ...over,
} as AgentEvent);

describe("planDelegateRows", () => {
  it("une seule rangée à l'envoi ; rapport et remise s'y rattachent sans rien montrer", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "Vérifie le panel" } as AgentEvent,
      msg({ messageId: "m1", text: "Task delegated…", ts: 1_000 }),
      msg({ messageId: "m2", direction: "received", messageKind: "report", text: "VERDICT : …", ts: 185_000 }),
      // Remise qui réveille le coordinateur (porte l'expéditeur depuis 2026-11-16).
      msg({ messageId: undefined, direction: "received", text: "[Message d'un agent Atelier lié]\n…", ts: 185_100 }),
      { kind: "text", text: "@Code confirme la phrase." } as AgentEvent,
    ];
    const { rows } = planDelegateRows(events, new Set(["code"]));
    expect(rows.get(1)).toEqual({ peerIds: ["code"], latest: true, startedAt: 1_000, endedAt: 185_000, reports: 1, needsYou: false });
    expect(rows.get(2)).toBeNull();
    expect(rows.get(3)).toBeNull();
    expect(rows.has(4)).toBe(false);
  });

  it("ancienne recopie fusionnée (reçue) et ancienne remise sans expéditeur", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "m1", direction: "received", messageKind: "report", text: "Je lis d'abord…", ts: 9_000 }),
      { kind: "agent_message", messageId: undefined, direction: "received", status: "delivering",
        text: "[Message d'un agent Atelier lié]\nSource : Claude — Code · Pondérations\nRelation : enfant\nMessage :\nVERDICT" } as unknown as AgentEvent,
    ];
    const { rows } = planDelegateRows(events, new Set(["code"]));
    expect(rows.get(0)).toMatchObject({ peerIds: ["code"], latest: true, endedAt: 9_000 });
    expect(rows.get(1)).toBeNull();
  });

  it("une nouvelle rangée après un message de l'utilisateur ; seule la dernière est vivante", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "m1" }),
      { kind: "user", text: "Et la fenêtre du 15 septembre ?" } as AgentEvent,
      msg({ messageId: "m3" }),
    ];
    const { rows } = planDelegateRows(events, new Set(["code"]));
    expect(rows.get(0)).toMatchObject({ latest: false });
    expect(rows.get(2)).toMatchObject({ latest: true });
  });

  it("deux fils du même spécialiste dans la même demande : une rangée, deux rapports", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "r1", peerThreadId: "nature-a", direction: "received", messageKind: "report", ts: 5_000 }),
      msg({ messageId: "r2", peerThreadId: "nature-b", direction: "received", messageKind: "report", ts: 9_000 }),
    ];
    const group = (id: string) => (id.startsWith("nature") ? "@Nature" : id);
    const { rows } = planDelegateRows(events, new Set(["nature-a", "nature-b"]), group);
    expect(rows.get(0)).toMatchObject({ peerIds: ["nature-a", "nature-b"], reports: 2, endedAt: 9_000, latest: true });
    expect(rows.get(1)).toBeNull();
  });

  it("la carte de calcul du spécialiste vient sous sa rangée et la fait attendre ton feu vert", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "m1", ts: 1_000 }),
      { kind: "text", text: "J'ai envoyé @Code." } as AgentEvent,
      job({}),
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.cards.get(2)).toBe(0);
    expect(plan.rows.get(0)).toMatchObject({ needsYou: true });
    expect(plan.rows.has(2)).toBe(false);
    // Une fois lancée, plus rien n'attend.
    const lancee = planDelegateRows([events[0], events[1], job({ status: "running" })], new Set(["code"]));
    expect(lancee.rows.get(0)).toMatchObject({ needsYou: false });
  });

  it("sans rangée dans la demande, la carte porte la rangée elle-même", () => {
    const events: AgentEvent[] = [
      { kind: "user", text: "go pour le reste aussi" } as AgentEvent,
      job({}),
      msg({ messageId: "r1", direction: "received", messageKind: "report", ts: 9_000 }),
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.rows.get(1)).toMatchObject({ peerIds: ["code"], needsYou: true, reports: 1 });
    expect(plan.cards.size).toBe(0);
    expect(plan.rows.get(2)).toBeNull();
  });

  it("laisse les liés ordinaires, les messages retenus, les échecs et les calculs du fil lui-même", () => {
    const events: AgentEvent[] = [
      msg({ peerThreadId: "codex", direction: "received", text: "Avis de Codex" }),
      msg({ status: "paused" }),
      msg({ status: "failed" }),
      job({ forThreadId: undefined }),
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.rows.size).toBe(0);
    expect(plan.cards.size).toBe(0);
  });
});

describe("isContextLine", () => {
  it("reconnaît un chemin de projet, pas une tâche ordinaire", () => {
    expect(isContextLine("Projet : /Users/t/Documents/Doctorat/Chap…")).toBe(true);
    expect(isContextLine("/Users/t/proj")).toBe(true);
    expect(isContextLine("Version B′ : précipitation de Phelps seule")).toBe(false);
  });
});
