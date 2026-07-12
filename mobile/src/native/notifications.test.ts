import { describe, expect, it } from "vitest";
import {
  buildDeepLink,
  buildNotifContent,
  DEFAULT_NOTIF_PREFS,
  parseDeepLink,
} from "./notifications.ts";

describe("notifications privacy", () => {
  it("disabled → no content", () => {
    expect(
      buildNotifContent(DEFAULT_NOTIF_PREFS, {
        kind: "done",
        threadId: "t1",
        threadTitle: "secret thesis",
        safeSummary: "albedo numbers",
      }),
    ).toBeNull();
  });

  it("enabled default body is generic", () => {
    const c = buildNotifContent(
      { ...DEFAULT_NOTIF_PREFS, enabled: true },
      {
        kind: "interaction",
        threadId: "t1",
        threadTitle: "Mon fil sensible",
        safeSummary: "ne doit pas apparaître",
      },
    );
    expect(c?.title).toMatch(/action requise/i);
    expect(c?.body).not.toContain("sensible");
    expect(c?.body).not.toContain("ne doit pas");
  });

  it("showThreadTitle still omits scientific summary", () => {
    const c = buildNotifContent(
      { ...DEFAULT_NOTIF_PREFS, enabled: true, showThreadTitle: true },
      {
        kind: "done",
        threadId: "t1",
        threadTitle: "Titre fil",
        safeSummary: "données albedo 0.42",
      },
    );
    expect(c?.body).toContain("Titre fil");
    expect(c?.body).not.toContain("0.42");
  });
});

describe("deep links", () => {
  it("roundtrip", () => {
    const url = buildDeepLink({ threadId: "th-1", requestId: "req-9", projectId: "p1" });
    expect(url.startsWith("atelier://")).toBe(true);
    const t = parseDeepLink(url);
    expect(t?.threadId).toBe("th-1");
    expect(t?.requestId).toBe("req-9");
    expect(t?.projectId).toBe("p1");
  });
});
