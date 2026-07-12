import { describe, expect, it } from "vitest";
import {
  MAX_PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  negotiateProtocolVersion,
  PROTOCOL_VERSION,
} from "../src/version.ts";

describe("negotiateProtocolVersion", () => {
  it("accepte la version courante", () => {
    const r = negotiateProtocolVersion(PROTOCOL_VERSION);
    expect(r).toEqual({ ok: true, negotiated: 1 });
  });

  it("refuse un client trop ancien", () => {
    const r = negotiateProtocolVersion(0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("protocol_version_unsupported");
      expect(r.min).toBe(MIN_PROTOCOL_VERSION);
      expect(r.max).toBe(MAX_PROTOCOL_VERSION);
    }
  });

  it("refuse un client trop récent", () => {
    const r = negotiateProtocolVersion(99);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/trop récent/);
      expect(r.clientVersion).toBe(99);
    }
  });

  it("refuse un non-entier", () => {
    const r = negotiateProtocolVersion(1.5);
    expect(r.ok).toBe(false);
  });
});
