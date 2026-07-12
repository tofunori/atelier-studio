import { beforeEach, describe, expect, it } from "vitest";
import { __resetSecureStorageForTests } from "../native/secureStorage.ts";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
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
