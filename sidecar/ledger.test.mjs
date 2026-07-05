import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as ledger from "./ledger.mjs";

describe("ledger", () => {
  it("append et relit les entrées récentes en JSONL", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "atelier-ledger-"));
    const projectRoot = "/tmp/projet test";

    await ledger.append(projectRoot, { ts: "2026-01-01T00:00:00.000Z", threadId: "a" }, { baseDir });
    await ledger.append(projectRoot, { ts: "2026-01-02T00:00:00.000Z", threadId: "b" }, { baseDir });

    const entries = await ledger.get(projectRoot, 1, { baseDir });

    expect(ledger.slugFor(projectRoot)).toBe("projet-test");
    expect(entries).toEqual([{ ts: "2026-01-02T00:00:00.000Z", threadId: "b" }]);
  });
});
