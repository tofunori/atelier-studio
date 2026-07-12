import { describe, expect, it } from "vitest";
import { bannerFor, redactDiagnostics } from "./connectionState.ts";
import type { DeviceCredentials } from "../transport/types.ts";

describe("bannerFor", () => {
  it("couvre tous les états produit", () => {
    const phases = [
      "never_paired",
      "offline",
      "tailscale_missing",
      "auth_expired",
      "version_incompatible",
      "connecting",
      "ready",
    ] as const;
    for (const p of phases) {
      const b = bannerFor(p);
      expect(b.phase).toBe(p);
      expect(b.label.length).toBeGreaterThan(3);
    }
  });
});

describe("redactDiagnostics", () => {
  it("n'inclut jamais le token en clair", () => {
    const creds: DeviceCredentials = {
      deviceId: "dev-1",
      token: "SUPER_SECRET_TOKEN_VALUE",
      name: "iPhone",
      scopes: ["chat:read"],
      gatewayBaseUrl: "http://127.0.0.1:18765",
      pairedAt: 1,
    };
    const text = redactDiagnostics({
      phase: "ready",
      gatewayBaseUrl: creds.gatewayBaseUrl,
      credentials: creds,
      lastError: "failed token=SUPER_SECRET_TOKEN_VALUE",
      appVersion: "0.1.0",
      protocolVersion: 1,
    });
    expect(text).not.toContain("SUPER_SECRET_TOKEN_VALUE");
    expect(text).toContain("[redacted]");
    expect(text).toContain("deviceId: dev-1");
  });
});
