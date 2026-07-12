import { describe, expect, it } from "vitest";
import {
  parseJsonMessage,
  validateClientHello,
  validateGetHistory,
  validateHarnessMeta,
  validateWireAgentEvent,
} from "../src/validate.ts";

describe("parseJsonMessage", () => {
  it("refuse JSON invalide", () => {
    const r = parseJsonMessage("{");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid_payload");
  });

  it("refuse objet sans type", () => {
    const r = parseJsonMessage(JSON.stringify({ foo: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("missing_field");
  });
});

describe("validateClientHello", () => {
  it("accepte hello valide et ignore champs inconnus", () => {
    const r = validateClientHello({
      type: "clientHello",
      protocolVersion: 1,
      clientInstanceId: "dev-1",
      clientKind: "mobile",
      futureField: { nested: true },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.protocolVersion).toBe(1);
      expect(r.value.clientKind).toBe("mobile");
    }
  });

  it("refuse protocolVersion absent", () => {
    const r = validateClientHello({
      type: "clientHello",
      clientInstanceId: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("missing_field");
      expect(r.error.message).toMatch(/protocolVersion/);
    }
  });

  it("refuse version non supportée explicitement", () => {
    const r = validateClientHello({
      type: "clientHello",
      protocolVersion: 9,
      clientInstanceId: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("protocol_version_unsupported");
      expect(r.error.minProtocolVersion).toBe(1);
      expect(r.error.maxProtocolVersion).toBe(1);
      expect(r.error.clientVersion).toBe(9);
    }
  });
});

describe("validateHarnessMeta", () => {
  const good = {
    schemaVersion: 1,
    eventId: "ev-1",
    provider: "claude",
    threadId: "t1",
    turnId: "turn-1",
    sequence: 1,
    ts: 1000,
    durable: true,
    origin: "provider",
    unknownFuture: "ok",
  };

  it("accepte meta valide + champ inconnu", () => {
    const r = validateHarnessMeta(good);
    expect(r.ok).toBe(true);
  });

  it("refuse champ obligatoire absent", () => {
    const { eventId: _drop, ...rest } = good;
    const r = validateHarnessMeta(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/eventId/);
  });

  it("refuse sequence invalide", () => {
    const r = validateHarnessMeta({ ...good, sequence: 0 });
    expect(r.ok).toBe(false);
  });
});

describe("validateWireAgentEvent", () => {
  it("exige kind", () => {
    const r = validateWireAgentEvent({ text: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("missing_field");
  });

  it("tolère event legacy sans meta", () => {
    const r = validateWireAgentEvent({ kind: "text", text: "hi", extra: 1 });
    expect(r.ok).toBe(true);
  });

  it("valide meta si présente", () => {
    const r = validateWireAgentEvent({
      kind: "text",
      text: "hi",
      meta: {
        schemaVersion: 1,
        eventId: "e",
        provider: "claude",
        threadId: "t",
        turnId: "u",
        sequence: 2,
        ts: 1,
        durable: true,
        origin: "provider",
      },
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateGetHistory", () => {
  it("refuse threadId absent", () => {
    const r = validateGetHistory({ type: "getHistory" });
    expect(r.ok).toBe(false);
  });

  it("accepte afterSequence", () => {
    const r = validateGetHistory({ type: "getHistory", threadId: "t", afterSequence: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.afterSequence).toBe(3);
  });
});
