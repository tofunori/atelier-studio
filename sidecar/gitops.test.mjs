import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import * as gitops from "./gitops.mjs";

const execFileAsync = promisify(execFile);

async function git(root, args) {
  return execFileAsync("git", args, { cwd: root, encoding: "utf8" });
}

async function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "atelier-gitops-"));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "tester@example.com"]);
  await git(root, ["config", "user.name", "Tester"]);
  writeFileSync(join(root, "tracked file.txt"), "initial\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "initial"]);
  return root;
}

describe("gitops", () => {
  it("lit le status porcelain v2", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "changed\n");
    writeFileSync(join(root, "new file.txt"), "new\n");

    const status = await gitops.status(root);

    expect(status.branch).toBe("main");
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.files).toEqual(expect.arrayContaining([
      { path: "tracked file.txt", status: ".M" },
      { path: "new file.txt", status: "?" },
    ]));
  });

  it("crée un snapshot puis restaure le fichier modifié et supprime le nouveau fichier", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);

    writeFileSync(join(root, "tracked file.txt"), "after\n");
    writeFileSync(join(root, "appeared.txt"), "remove me\n");

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("snapshot\n");
    expect(existsSync(join(root, "appeared.txt"))).toBe(false);
  });

  it("snapshot et restore fonctionnent avec HEAD unborn", async () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-gitops-unborn-"));
    await git(root, ["init"]);
    writeFileSync(join(root, "first file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);

    writeFileSync(join(root, "first file.txt"), "after\n");
    writeFileSync(join(root, "appeared.txt"), "remove me\n");

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "first file.txt"), "utf8")).toBe("snapshot\n");
    expect(existsSync(join(root, "appeared.txt"))).toBe(false);
  });

  it("retourne un diff non vide incluant les fichiers non suivis", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "changed\n");
    writeFileSync(join(root, "new file.txt"), "new\n");

    const text = await gitops.diff(root, null);

    expect(text).toContain("tracked file.txt");
    expect(text).toContain("new file.txt");
    expect(text).toContain("+new");
  });

  it("stage et commit les fichiers", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "committed\n");

    await gitops.stageFile(root, "tracked file.txt");
    const hash = await gitops.commit(root, "change tracked");
    const { stdout } = await git(root, ["rev-parse", "HEAD"]);

    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(stdout.trim()).toBe(hash);
  });
});
