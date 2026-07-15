import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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
  await git(root, ["init", "-b", "main"]);
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
      expect.objectContaining({ path: "tracked file.txt", status: ".M" }),
      expect.objectContaining({ path: "new file.txt", status: "?" }),
    ]));
  });

  it("ancre le snapshot dans une ref durable qui survit à git gc --prune=now", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);

    const { stdout: refOut } = await git(root, ["show-ref", `refs/atelier/snapshots/${sha}`]);
    expect(refOut).toContain(sha);
    await git(root, ["gc", "--prune=now"]);
    await expect(git(root, ["cat-file", "-e", `${sha}^{commit}`])).resolves.toBeDefined();
  });

  it("restaure un fichier modifié depuis le snapshot", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "tracked file.txt"), "after\n");

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("snapshot\n");
  });

  it("recrée un fichier supprimé depuis le snapshot", async () => {
    const root = await makeRepo();
    const sha = await gitops.snapshot(root);
    rmSync(join(root, "tracked file.txt"));

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("initial\n");
  });

  it("restaure un untracked présent au snapshot sans jamais le supprimer", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "notes.txt"), "au snapshot\n"); // untracked au moment du snapshot
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "notes.txt"), "modifié après\n");

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("au snapshot\n");
  });

  it("refuse atomiquement quand un untracked est apparu après le snapshot", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "tracked file.txt"), "after\n");
    writeFileSync(join(root, "appeared.txt"), "keep me\n");

    await expect(gitops.restore(root, sha)).rejects.toThrow(/refusée/);

    // refus atomique : le nouveau fichier survit ET rien d'autre n'a bougé
    expect(readFileSync(join(root, "appeared.txt"), "utf8")).toBe("keep me\n");
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("after\n");
  });

  it("refuse atomiquement quand un fichier a été stagé après le snapshot", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "staged.txt"), "keep me\n");
    await git(root, ["add", "staged.txt"]);
    writeFileSync(join(root, "tracked file.txt"), "after\n");

    await expect(gitops.restore(root, sha)).rejects.toThrow(/refusée/);

    expect(readFileSync(join(root, "staged.txt"), "utf8")).toBe("keep me\n");
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("after\n");
  });

  it("snapshot et restore fonctionnent avec HEAD unborn", async () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-gitops-unborn-"));
    await git(root, ["init"]);
    writeFileSync(join(root, "first file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);

    writeFileSync(join(root, "first file.txt"), "after\n");

    await gitops.restore(root, sha);

    expect(readFileSync(join(root, "first file.txt"), "utf8")).toBe("snapshot\n");
  });

  it("rejette un sha invalide sans toucher au worktree", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "untouched\n");

    await expect(gitops.restore(root, "zzz not a sha")).rejects.toThrow(/sha invalide/);

    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("untouched\n");
  });

  it("liste les fichiers changés depuis un snapshot", async () => {
    const root = await makeRepo();
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "tracked file.txt"), "changed\n");
    writeFileSync(join(root, "new file.txt"), "new\n");

    const changed = await gitops.changedSince(root, sha);

    expect(changed).toEqual(expect.arrayContaining(["tracked file.txt", "new file.txt"]));
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

  it("limite le diff IA aux changements indexés", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "staged\n");
    await gitops.stageFile(root, "tracked file.txt");
    writeFileSync(join(root, "tracked file.txt"), "unstaged\n");

    const text = await gitops.diffStaged(root, "tracked file.txt");

    expect(text).toContain("+staged");
    expect(text).not.toContain("unstaged");
  });

  it("commit avec files vide conserve les changements non indexés", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "staged\n");
    await gitops.stageFile(root, "tracked file.txt");
    writeFileSync(join(root, "left-out.txt"), "untracked\n");

    await gitops.commit(root, "staged only", []);
    const current = await gitops.status(root);

    expect(current.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "left-out.txt", status: "?" }),
    ]));
    expect(current.files.some((file) => file.path === "tracked file.txt")).toBe(false);
  });
});
