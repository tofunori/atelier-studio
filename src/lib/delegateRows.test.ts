import { describe, expect, it } from "vitest";
import { planDelegateRows } from "./delegateRows";
import type { AgentEvent } from "./ws";

const msg = (over: Record<string, unknown>): AgentEvent => ({
  kind: "agent_message", messageId: "m", direction: "sent", peerThreadId: "code",
  text: "", status: "delivered", ...over,
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
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.get(1)).toEqual({ peerId: "code", latest: true, startedAt: 1_000, endedAt: 185_000 });
    expect(plan.get(2)).toBeNull();
    expect(plan.get(3)).toBeNull();
    expect(plan.has(4)).toBe(false);
  });

  it("ancienne recopie fusionnée (reçue) et ancienne remise sans expéditeur", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "m1", direction: "received", messageKind: "report", text: "Je lis d'abord…", ts: 9_000 }),
      { kind: "agent_message", messageId: undefined, direction: "received", status: "delivering",
        text: "[Message d'un agent Atelier lié]\nSource : Claude — Code · Pondérations\nRelation : enfant\nMessage :\nVERDICT" } as unknown as AgentEvent,
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.get(0)).toMatchObject({ peerId: "code", latest: true, endedAt: 9_000 });
    expect(plan.get(1)).toBeNull();
  });

  it("une nouvelle rangée après un message de l'utilisateur ; seule la dernière est vivante", () => {
    const events: AgentEvent[] = [
      msg({ messageId: "m1" }),
      { kind: "user", text: "Et la fenêtre du 15 septembre ?" } as AgentEvent,
      msg({ messageId: "m3" }),
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.get(0)).toMatchObject({ latest: false });
    expect(plan.get(2)).toMatchObject({ latest: true });
  });

  it("laisse les liés ordinaires, les messages retenus et les échecs à leur carte", () => {
    const events: AgentEvent[] = [
      msg({ peerThreadId: "codex", direction: "received", text: "Avis de Codex" }),
      msg({ status: "paused" }),
      msg({ status: "failed" }),
    ];
    const plan = planDelegateRows(events, new Set(["code"]));
    expect(plan.size).toBe(0);
  });
});
