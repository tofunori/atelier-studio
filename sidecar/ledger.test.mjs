import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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

  it("getAll agrège plusieurs projets triés du plus récent au plus ancien", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "atelier-ledger-all-"));
    await ledger.append("/tmp/alpha", { ts: "2026-01-01T00:00:00.000Z", threadId: "a1" }, { baseDir });
    await ledger.append("/tmp/beta", { ts: "2026-01-03T00:00:00.000Z", threadId: "b1" }, { baseDir });
    await ledger.append("/tmp/alpha", { ts: "2026-01-02T00:00:00.000Z", threadId: "a2" }, { baseDir });

    const all = await ledger.getAll(500, { baseDir });

    expect(all.map((e) => e.threadId)).toEqual(["b1", "a2", "a1"]);
  });

  it("getAll respecte la limite globale", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "atelier-ledger-lim-"));
    for (let i = 0; i < 5; i++) {
      await ledger.append("/tmp/p", { ts: `2026-01-0${i + 1}T00:00:00.000Z`, threadId: `t${i}` }, { baseDir });
    }
    const all = await ledger.getAll(2, { baseDir });
    expect(all.map((e) => e.threadId)).toEqual(["t4", "t3"]);
  });

  it("getAll ignore les lignes corrompues individuellement, garde le reste", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "atelier-ledger-corr-"));
    writeFileSync(join(baseDir, "p.jsonl"),
      '{"ts":"2026-01-01T00:00:00.000Z","threadId":"ok1"}\n{pas du json}\n{"ts":"2026-01-02T00:00:00.000Z","threadId":"ok2"}\n');

    const all = await ledger.getAll(500, { baseDir });

    expect(all.map((e) => e.threadId)).toEqual(["ok2", "ok1"]);
  });

  it("getAll retourne [] quand le dossier n'existe pas", async () => {
    const all = await ledger.getAll(500, { baseDir: join(tmpdir(), "atelier-ledger-absent-inexistant") });
    expect(all).toEqual([]);
  });
});
