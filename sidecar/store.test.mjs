import { describe, it, expect } from "vitest";
import { ThreadStore } from "./store.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ThreadStore", () => {
  it("persiste et relit les threads", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    const s = new ThreadStore(file);
    s.upsert({
      id: "t1", projectRoot: "/p", title: "alo", provider: "claude",
      sessionId: null, status: "idle",
    });
    const s2 = new ThreadStore(file);
    expect(s2.get("t1").title).toBe("alo");
    expect(s2.list()).toHaveLength(1);
  });
  it("upsert met à jour sans dupliquer", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    const s = new ThreadStore(file);
    s.upsert({ id: "t1", title: "a" });
    s.upsert({ id: "t1", title: "b", status: "running" });
    expect(s.list()).toHaveLength(1);
    expect(s.get("t1").title).toBe("b");
  });
  it("normalise les anciens threads incomplets", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    writeFileSync(file, JSON.stringify([{ id: "legacy", sessionId: "019f33d1-efe4", status: "done" }]));
    const s = new ThreadStore(file);
    expect(s.get("legacy")).toMatchObject({
      id: "legacy",
      projectRoot: "",
      provider: "claude",
      title: "Session 019f33d1",
      sessionId: "019f33d1-efe4",
      status: "done",
    });
  });
  it("persiste et normalise le goal d'un thread", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    const s = new ThreadStore(file);
    s.upsert({
      id: "t1",
      title: "a",
      goal: { text: " finir la tranche ", status: "waiting" },
    });
    const s2 = new ThreadStore(file);
    expect(s2.get("t1").goal).toMatchObject({
      text: "finir la tranche",
      status: "active",
    });
  });
});
