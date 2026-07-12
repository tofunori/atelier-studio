import { describe, expect, it } from "vitest";
import {
  initialNetworkContext,
  reduceNetwork,
  toConnectionPhase,
} from "./networkMachine.ts";

describe("network machine", () => {
  it("connect → auth → sync → live", () => {
    let c = initialNetworkContext();
    c = reduceNetwork(c, { type: "START_CONNECT" });
    expect(c.state).toBe("connecting");
    c = reduceNetwork(c, { type: "AUTH_OK" });
    expect(c.state).toBe("syncing");
    c = reduceNetwork(c, { type: "SYNC_OK" });
    expect(c.state).toBe("live");
    expect(toConnectionPhase(c, true)).toBe("ready");
  });

  it("background then foreground forces resync path", () => {
    let c = initialNetworkContext();
    c = reduceNetwork(c, { type: "START_CONNECT" });
    c = reduceNetwork(c, { type: "AUTH_OK" });
    c = reduceNetwork(c, { type: "SYNC_OK" });
    c = reduceNetwork(c, { type: "BACKGROUND" });
    expect(c.backgrounded).toBe(true);
    c = reduceNetwork(c, { type: "FOREGROUND_RESUME" });
    expect(c.backgrounded).toBe(false);
    expect(c.state).toBe("syncing");
  });

  it("auth fail → auth_expired phase", () => {
    let c = initialNetworkContext();
    c = reduceNetwork(c, { type: "AUTH_FAIL" });
    expect(toConnectionPhase(c, true)).toBe("auth_expired");
  });

  it("version incompatible sticky", () => {
    let c = initialNetworkContext();
    c = reduceNetwork(c, { type: "VERSION_INCOMPATIBLE" });
    c = reduceNetwork(c, { type: "START_CONNECT" });
    expect(c.uiReason).toBe("version_incompatible");
    expect(toConnectionPhase(c, true)).toBe("version_incompatible");
  });

  it("never_paired when not paired", () => {
    const c = initialNetworkContext();
    expect(toConnectionPhase(c, false)).toBe("never_paired");
  });
});
