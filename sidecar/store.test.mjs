import { describe, it, expect } from "vitest";
import { ThreadStore } from "./store.mjs";
import { mkdtempSync } from "node:fs";
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
});
