import { describe, expect, it } from "vitest";
import { attentionFromEvents, scanThreadEvents, strongest, threadSignal } from "./railSignals";
import { buildInbox, shortAge } from "./railInbox";
import type { AgentEvent, Thread } from "./ws";

const ev = (e: unknown) => e as AgentEvent;
const thread = (over: Partial<Thread>): Thread => ({
  id: "t", projectRoot: "/Users/t/albedo", title: "Calibration", provider: "claude", sessionId: null,
  status: "idle", updatedAt: "2026-10-21T18:00:00Z", ...over,
}) as Thread;

describe("scanThreadEvents", () => {
  it("une autorisation sans réponse depuis le dernier tour attend", () => {
    const a = scanThreadEvents([ev({ kind: "user", text: "go" }), ev({ kind: "permission", requestId: "r", toolName: "Bash", answered: null, ts: 5 })]);
    expect(a.pending).toEqual({ reason: "permission", label: "Bash", at: 5 });
  });
  it("une question en attente attend ; répondue, plus rien", () => {
    const pending = ev({ kind: "interaction", requestId: "q", interactionType: "user_input", title: "Quelle région ?", state: "pending" });
    expect(scanThreadEvents([pending]).pending?.reason).toBe("question");
    expect(scanThreadEvents([ev({ ...(pending as object), state: "answered" })]).pending).toBeNull();
  });
  it("une autorisation restée null AVANT la fin d'un tour est périmée", () => {
    const a = scanThreadEvents([
      ev({ kind: "permission", requestId: "r", toolName: "Bash", answered: null }),
      ev({ kind: "done", ok: true, result: "" }),
    ]);
    expect(a).toEqual({ pending: null, failed: false });
  });
  it("un dernier tour en échec ou en erreur est un échec ; un nouveau message l'efface", () => {
    expect(scanThreadEvents([ev({ kind: "done", ok: false, result: "x" })]).failed).toBe(true);
    expect(scanThreadEvents([ev({ kind: "error", message: "x" })]).failed).toBe(true);
    expect(scanThreadEvents([ev({ kind: "error", message: "x" }), ev({ kind: "user", text: "encore" })]).failed).toBe(false);
  });
  it("seuls les fils qui demandent quelque chose figurent dans la carte", () => {
    const map = attentionFromEvents({ a: [ev({ kind: "done", ok: true, result: "" })], b: [ev({ kind: "error", message: "x" })] });
    expect(Object.keys(map)).toEqual(["b"]);
  });
});

describe("threadSignal et strongest", () => {
  const unread = new Set(["t"]);
  it("attente > échec > en cours > non lu", () => {
    expect(strongest(["unread", "run", "fail"])).toBe("fail");
    expect(strongest(["unread", "wait", "run"])).toBe("wait");
    expect(strongest([null, undefined])).toBeNull();
  });
  it("le fil affiché n'est jamais non lu, mais une demande y reste visible", () => {
    expect(threadSignal(thread({}), undefined, unread, null)).toBe("unread");
    expect(threadSignal(thread({}), undefined, unread, "t")).toBeNull();
    expect(threadSignal(thread({}), { pending: { reason: "permission", label: "Bash", at: null }, failed: false }, unread, "t")).toBe("wait");
  });
  it("un échec non vu passe avant l'agent en cours ; un agent en cours se voit", () => {
    expect(threadSignal(thread({}), { pending: null, failed: true }, unread, null)).toBe("fail");
    expect(threadSignal(thread({ status: "running" }), undefined, new Set(), null)).toBe("run");
  });
});

describe("buildInbox", () => {
  it("liste ce qui t'attend, dans l'ordre attente, échecs, terminé", () => {
    const threads = [
      thread({ id: "done", title: "Chapitre 2" }),
      thread({ id: "wait", title: "Calibration k_p" }),
      thread({ id: "fail", title: "Albédo", projectRoot: "" }),
      thread({ id: "run", status: "running" }),
    ];
    const items = buildInbox(threads, {
      wait: { pending: { reason: "permission", label: "Bash", at: null }, failed: false },
      fail: { pending: null, failed: true },
    }, new Set(["done", "fail", "run"]), null, (root) => !root);
    expect(items.map((i) => i.group)).toEqual(["wait", "fail", "done"]);
    expect(items[0]).toMatchObject({ title: "Autorisation : Bash", detail: "Calibration k_p · albedo" });
    expect(items[1].detail).toBe("Tour en échec · Discussion libre");
    expect(items.some((i) => i.threadId === "run")).toBe(false);
  });
});

it("shortAge reste court", () => {
  const now = Date.parse("2026-10-21T18:00:00Z");
  expect(shortAge(now - 20_000, now)).toBe("à l’instant");
  expect(shortAge(now - 6 * 60_000, now)).toBe("6 min");
  expect(shortAge(now - 3 * 3_600_000, now)).toBe("3 h");
  expect(shortAge(null, now)).toBe("");
});
