import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetSecureStorageForTests } from "../native/secureStorage.ts";
import {
  clearCredentials,
  loadCredentials,
  loadLastGatewayUrl,
  saveCredentials,
  saveLastGatewayUrl,
} from "./credentials.ts";

beforeEach(() => {
  __resetSecureStorageForTests();
});

describe("credentials storage", () => {
  it("roundtrip save/load", async () => {
    await saveCredentials({
      deviceId: "d1",
      token: "secret",
      name: "iPhone",
      scopes: ["chat:read"],
      gatewayBaseUrl: "http://127.0.0.1:18765",
      pairedAt: 42,
    });
    const c = await loadCredentials();
    expect(c?.deviceId).toBe("d1");
    expect(c?.token).toBe("secret");
  });

  it("clear", async () => {
    await saveCredentials({
      deviceId: "d1",
      token: "secret",
      name: "iPhone",
      scopes: [],
      gatewayBaseUrl: "http://x",
      pairedAt: 1,
    });
    await clearCredentials();
    expect(await loadCredentials()).toBeNull();
  });
});

describe("dernière adresse du Mac", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("app native jamais appairée : aucune adresse devinée", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(await loadLastGatewayUrl()).toBe("");
  });

  it("l'adresse enregistrée l'emporte", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    await saveLastGatewayUrl("https://mon-mac.ts.net:8443");
    expect(await loadLastGatewayUrl()).toBe("https://mon-mac.ts.net:8443");
  });
});
