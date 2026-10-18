import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UNKNOWN_COMMIT,
  formatBuildDate,
  gitShortCommit,
  resolveBuildIdentity,
} from "../../scripts/build-identity.mts";

const repoRoot = path.resolve(__dirname, "../..");
const temps: string[] = [];
function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "build-identity-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("scripts/build-identity", () => {
  it("lit le commit court du dépôt, comme git rev-parse --short HEAD", () => {
    const expected = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    expect(gitShortCommit(repoRoot)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{4,40}$/);
  });

  it("rend « inconnu » sans échouer quand git est absent du PATH", () => {
    const empty = tempDir();
    expect(gitShortCommit(repoRoot, { ...process.env, PATH: empty })).toBe(UNKNOWN_COMMIT);
    expect(resolveBuildIdentity({ cwd: repoRoot, env: { ...process.env, PATH: empty } }).commit).toBe("inconnu");
  });

  it("rend « inconnu » hors d'un dépôt git (archive sans .git)", () => {
    const dir = tempDir();
    expect(gitShortCommit(dir, { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) })).toBe(UNKNOWN_COMMIT);
  });

  it("date le build à la minute, en heure locale", () => {
    expect(formatBuildDate(new Date(2026, 9, 8, 7, 5, 59))).toBe("2026-10-08 07:05");
    const identity = resolveBuildIdentity({ cwd: repoRoot, now: new Date(2026, 9, 18, 22, 48) });
    expect(identity.date).toBe("2026-10-18 22:48");
  });
});
