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
    expect(status.branches).toContain("main");
    expect(status.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tracked file.txt", status: ".M" }),
      expect.objectContaining({ path: "new file.txt", status: "?" }),
    ]));
  });

  it("liste et change de branche uniquement avec un arbre propre", async () => {
    const root = await makeRepo();
    await git(root, ["branch", "topic"]);

    expect((await gitops.status(root)).branches).toEqual(["main", "topic"]);
    await expect(gitops.switchBranch(root, "topic")).resolves.toBe("topic");
    expect((await gitops.status(root)).branch).toBe("topic");

    writeFileSync(join(root, "tracked file.txt"), "dirty\n");
    await expect(gitops.switchBranch(root, "main")).rejects.toThrow(/arbre de travail doit être propre/);
    expect((await gitops.status(root)).branch).toBe("topic");
  });

  it("crée une branche et ne supprime qu’une branche fusionnée et inactive", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "dirty but preserved\n");

    await expect(gitops.createBranch(root, "figures-2026")).resolves.toBe("figures-2026");
    expect((await gitops.status(root)).branch).toBe("figures-2026");
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("dirty but preserved\n");
    await expect(gitops.deleteBranch(root, "figures-2026")).rejects.toThrow(/branche active/);

    await git(root, ["restore", "--", "tracked file.txt"]);
    await gitops.switchBranch(root, "main");
    await expect(gitops.deleteBranch(root, "figures-2026")).resolves.toBe("figures-2026");
    expect((await gitops.status(root)).branches).toEqual(["main"]);
  });

  it("fusionne la branche choisie dans la branche active et refuse un arbre sale", async () => {
    const root = await makeRepo();
    await git(root, ["switch", "-c", "topic"]);
    writeFileSync(join(root, "merged.txt"), "from topic\n");
    await git(root, ["add", "merged.txt"]);
    await git(root, ["commit", "-m", "topic change"]);
    await git(root, ["switch", "main"]);

    await expect(gitops.mergeBranch(root, "topic")).resolves.toBe("topic");
    expect((await gitops.status(root)).branch).toBe("main");
    expect(readFileSync(join(root, "merged.txt"), "utf8")).toBe("from topic\n");

    writeFileSync(join(root, "tracked file.txt"), "dirty\n");
    await expect(gitops.mergeBranch(root, "topic")).rejects.toThrow(/arbre de travail doit être propre/);
  });

  it("préserve l’état Git lorsqu’une fusion produit un conflit", async () => {
    const root = await makeRepo();
    await git(root, ["switch", "-c", "topic"]);
    writeFileSync(join(root, "tracked file.txt"), "topic\n");
    await git(root, ["add", "tracked file.txt"]);
    await git(root, ["commit", "-m", "topic side"]);
    await git(root, ["switch", "main"]);
    writeFileSync(join(root, "tracked file.txt"), "main\n");
    await git(root, ["add", "tracked file.txt"]);
    await git(root, ["commit", "-m", "main side"]);

    await expect(gitops.mergeBranch(root, "topic")).rejects.toThrow(/CONFLICT|conflict/i);
    expect((await gitops.status(root)).files.length).toBeGreaterThan(0);
    await expect(git(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).resolves.toBeDefined();
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

  it("restauration ciblée : les créations d'autres sessions ne bloquent plus", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    writeFileSync(join(root, "other.txt"), "other snapshot\n");
    const sha = await gitops.snapshot(root);
    // le tour modifie sa cible ; une AUTRE session crée un fichier et en modifie un autre
    writeFileSync(join(root, "tracked file.txt"), "turn change\n");
    writeFileSync(join(root, "appeared.txt"), "keep me\n");
    writeFileSync(join(root, "other.txt"), "other change\n");

    await gitops.restore(root, sha, ["tracked file.txt"]);

    // la cible du tour est revenue au snapshot ; le reste est intact
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("snapshot\n");
    expect(readFileSync(join(root, "appeared.txt"), "utf8")).toBe("keep me\n");
    expect(readFileSync(join(root, "other.txt"), "utf8")).toBe("other change\n");
  });

  it("restauration ciblée : un chemin créé par le tour (hors snapshot) est laissé en place", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "snapshot\n");
    const sha = await gitops.snapshot(root);
    writeFileSync(join(root, "created-by-turn.txt"), "created\n");
    writeFileSync(join(root, "tracked file.txt"), "turn change\n");

    await gitops.restore(root, sha, ["tracked file.txt", "created-by-turn.txt"]);

    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("snapshot\n");
    expect(readFileSync(join(root, "created-by-turn.txt"), "utf8")).toBe("created\n");
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
    const hash = await gitops.commit(root, "change tracked", []);
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

  it("retourne les contenus exacts HEAD, index et working tree pour CodeMirror", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "staged\n");
    await gitops.stageFile(root, "tracked file.txt");
    writeFileSync(join(root, "tracked file.txt"), "working\n");

    await expect(gitops.diffContents(root, "tracked file.txt", { scope: "staged" }))
      .resolves.toMatchObject({ before: "initial\n", after: "staged\n", binary: false });
    await expect(gitops.diffContents(root, "tracked file.txt", { scope: "changes" }))
      .resolves.toMatchObject({ before: "initial\n", after: "working\n", binary: false });
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

  it("refuse tout commit sans sélection explicite sans toucher à l’index", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "changed\n");
    writeFileSync(join(root, "new file.txt"), "new\n");

    await expect(gitops.commit(root, "ne doit pas tout prendre")).rejects.toThrow(/sélection explicite/);
    const { stdout } = await git(root, ["diff", "--cached", "--name-only"]);
    expect(stdout).toBe("");
  });

  it("pagine le log et retourne les détails et le diff d’un commit", async () => {
    const root = await makeRepo();
    writeFileSync(join(root, "tracked file.txt"), "second\n");
    await git(root, ["add", "."]); await git(root, ["commit", "-m", "second commit"]);
    const page = await gitops.log(root, { limit: 1 });
    expect(page.commits).toHaveLength(1); expect(page.hasMore).toBe(true);
    const details = await gitops.commitDetails(root, page.commits[0].sha);
    expect(details.subject).toBe("second commit"); expect(details.diff).toContain("+second");
    expect(details.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "tracked file.txt" })]));
    const contents = await gitops.commitFileContents(root, page.commits[0].sha, "tracked file.txt");
    expect(contents).toEqual({ before: "initial\n", after: "second\n", binary: false });
  });

  it("restaure un fichier depuis un commit historique sans créer de commit", async () => {
    const root = await makeRepo(); const old = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    writeFileSync(join(root, "tracked file.txt"), "new\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "new"]);
    const head = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    await gitops.restoreFileFromCommit(root, old, "tracked file.txt", head);
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("initial\n");
    expect((await gitops.status(root)).files).toHaveLength(1);
  });

  it("crée une branche historique sans réécrire la branche courante", async () => {
    const root = await makeRepo(); const old = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    writeFileSync(join(root, "tracked file.txt"), "new\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "new"]);
    await gitops.createBranchAt(root, "inspect-old", old);
    expect((await gitops.status(root)).branch).toBe("inspect-old");
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("initial\n");
    expect((await git(root, ["rev-parse", "main"])).stdout.trim()).not.toBe(old);
  });

  it("annule le dernier commit local en conservant ses changements", async () => {
    const root = await makeRepo(); writeFileSync(join(root, "tracked file.txt"), "local\n");
    await git(root, ["add", "."]); await git(root, ["commit", "-m", "local"]); const head = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    await gitops.undoLastCommit(root, head);
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("local\n");
    expect((await gitops.status(root)).files).toHaveLength(1);
  });

  it("refuse d’annuler un commit publié et le revert sans réécrire l’historique", async () => {
    const root = await makeRepo(); writeFileSync(join(root, "tracked file.txt"), "published\n");
    await git(root, ["add", "."]); await git(root, ["commit", "-m", "published"]); const published = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    await git(root, ["branch", "published-tip", published]); await git(root, ["branch", "--set-upstream-to=published-tip", "main"]);
    await expect(gitops.undoLastCommit(root, published)).rejects.toThrow(/déjà publié/);
    const reverted = await gitops.revertCommit(root, published, published);
    expect(reverted).not.toBe(published);
    expect(readFileSync(join(root, "tracked file.txt"), "utf8")).toBe("initial\n");
  });

  it("crée une référence de sécurité avant un reset", async () => {
    const root = await makeRepo(); const target = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    writeFileSync(join(root, "tracked file.txt"), "later\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "later"]); const head = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    const result = await gitops.resetToCommit(root, target, "hard", head);
    expect(result.safetyRef).toMatch(/^refs\/atelier\/safety\/reset-/);
    expect((await git(root, ["rev-parse", result.safetyRef])).stdout.trim()).toBe(head);
  });

  it("refuse un reset avant l’upstream et un HEAD devenu obsolète", async () => {
    const root = await makeRepo(); const initial = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    writeFileSync(join(root, "tracked file.txt"), "published\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "published"]);
    const published = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    await git(root, ["branch", "published-tip", published]); await git(root, ["branch", "--set-upstream-to=published-tip", "main"]);
    writeFileSync(join(root, "tracked file.txt"), "local\n"); await git(root, ["add", "."]); await git(root, ["commit", "-m", "local"]);
    const head = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
    await expect(gitops.resetToCommit(root, initial, "hard", head)).rejects.toThrow(/avant le dernier commit publié/);
    await expect(gitops.resetToCommit(root, published, "mixed", "f".repeat(40))).rejects.toThrow(/HEAD a changé/);
    expect((await git(root, ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  });
});
