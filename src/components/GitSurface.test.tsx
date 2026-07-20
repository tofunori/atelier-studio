import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import GitSurface from "./GitSurface";
import { t } from "../lib/i18n";
import { renderUi, resetTestState } from "../test/render";

const projectRoot = "/tmp/atelier-git-surface";
const originalGetAnimations = Element.prototype.getAnimations;

function makeSocket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function emit(name: string, detail: Record<string, unknown>) {
  act(() => window.dispatchEvent(new CustomEvent(name, { detail })));
}

function status(
  files: Array<{ path: string; status: string; add?: number; del?: number }>,
  sync: { ahead?: number; behind?: number } = {},
) {
  emit("git-status", {
    projectRoot,
    status: { branch: "main", ahead: sync.ahead ?? 0, behind: sync.behind ?? 0, files },
  });
}

beforeAll(() => {
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});
beforeEach(resetTestState);
afterEach(cleanup);

describe("GitSurface staging-first", () => {
  it("affiche le choix du diff avec des icônes accessibles et bascule la disposition", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);

    const unified = screen.getByRole("radio", { name: t("git.unified") });
    const split = screen.getByRole("radio", { name: t("git.split") });
    expect(unified).toHaveAttribute("aria-checked", "true");
    expect(unified.querySelector("svg")).toBeTruthy();
    expect(split.querySelector("svg")).toBeTruthy();

    fireEvent.click(split);
    expect(split).toHaveAttribute("aria-checked", "true");
  });

  it("affiche les branches, les commits et l’activité directement dans l’en-tête", async () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    emit("git-status", {
      projectRoot,
      status: { branch: "main", branches: ["main", "topic"], ahead: 0, behind: 0, files: [] },
    });

    fireEvent.click(screen.getByRole("button", { name: t("git.switch-branch", { branch: "main" }) }));
    fireEvent.click(await screen.findByRole("button", { name: "topic" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitSwitchBranch",
      projectRoot,
      branch: "topic",
    }));

    expect(screen.getByRole("button", { name: t("git.commits") })).toBeEnabled();
    expect(screen.getByRole("button", { name: t("git.activity") })).toBeEnabled();
  });

  it("pagine le graphe, ouvre un commit et affiche son fichier en diff unifié ou split", async () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    fireEvent.click(screen.getByRole("button", { name: t("git.commits") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitLog", projectRoot, all: false, query: "", skip: 0, limit: 50 }));
    emit("git-log", { projectRoot, skip: 0, hasMore: true, commits: [
      { sha: "a".repeat(40), shortSha: "aaaaaaa", parents: ["b".repeat(40), "c".repeat(40)], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T12:00:00Z", subject: "Ajoute le log", decorations: ["HEAD -> main"] },
      { sha: "b".repeat(40), shortSha: "bbbbbbb", parents: ["d".repeat(40)], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T11:00:00Z", subject: "Branche principale", decorations: [] },
      { sha: "c".repeat(40), shortSha: "ccccccc", parents: ["d".repeat(40)], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T10:00:00Z", subject: "Branche fusionnée", decorations: ["topic"] },
    ] });
    expect(document.querySelector('.git-commit-graph[data-merge="true"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("action.load-more") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitLog", projectRoot, all: false, query: "", skip: 3, limit: 50 }));
    fireEvent.click(screen.getByRole("button", { name: /Ajoute le log/ }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitCommitDetails", projectRoot, sha: "a".repeat(40) }));
    emit("git-commit-details", { projectRoot, details: { sha: "a".repeat(40), shortSha: "aaaaaaa", parents: ["b".repeat(40), "c".repeat(40)], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T12:00:00Z", subject: "Ajoute le log", decorations: [], body: "", files: [{ status: "M", path: "src/App.tsx" }], diff: "-ancien\n+nouveau", head: "a".repeat(40), upstream: null, isHead: true, isPublished: false } });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitCommitFileDiff", projectRoot, sha: "a".repeat(40), path: "src/App.tsx" }));
    emit("git-commit-file-diff", { projectRoot, sha: "a".repeat(40), path: "src/App.tsx", before: "const oldValue = 1;\n", after: "const newValue = 2;\n", binary: false });
    expect(screen.getByRole("button", { name: t("git.branch-from-commit") })).toBeEnabled();
    expect(screen.getByRole("button", { name: t("git.undo-commit") })).toBeEnabled();
    expect(screen.getByRole("button", { name: t("git.revert-commit") })).toBeDisabled();
    expect(screen.getByRole("radiogroup", { name: t("git.commits-scope") })).toBeTruthy();
    const diffView = await screen.findByLabelText("Diff src/App.tsx");
    await waitFor(() => expect(diffView.querySelector(".hljs-keyword")).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: t("git.split") }));
    await waitFor(() => expect(diffView).toHaveAttribute("data-layout", "split"));
    expect(screen.getByRole("button", { name: t("git.restore-file") })).toBeEnabled();
  });

  it("conserve le patch rouge et vert comme repli sans fichier textuel", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    fireEvent.click(screen.getByRole("button", { name: t("git.commits") }));
    emit("git-log", { projectRoot, skip: 0, hasMore: false, commits: [{ sha: "a".repeat(40), shortSha: "aaaaaaa", parents: [], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T12:00:00Z", subject: "Patch brut", decorations: [] }] });
    fireEvent.click(screen.getByRole("button", { name: /Patch brut/ }));
    emit("git-commit-details", { projectRoot, details: { sha: "a".repeat(40), shortSha: "aaaaaaa", parents: [], author: "Thierry", authorEmail: "t@example.com", authoredAt: "2026-07-20T12:00:00Z", subject: "Patch brut", decorations: [], body: "", files: [], diff: "-ancien\n+nouveau", head: "a".repeat(40), upstream: null, isHead: true, isPublished: false } });
    expect(screen.getByText("-ancien")).toHaveClass("del");
    expect(screen.getByText("+nouveau")).toHaveClass("add");
  });

  it("crée, fusionne et supprime une branche depuis ses actions contextuelles", async () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    emit("git-status", {
      projectRoot,
      status: { branch: "main", branches: ["main", "topic"], ahead: 0, behind: 0, files: [] },
    });

    fireEvent.click(screen.getByRole("button", { name: t("git.switch-branch", { branch: "main" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("git.create-branch") }));
    fireEvent.change(screen.getByRole("textbox", { name: t("git.branch-name") }), {
      target: { value: "figures-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("git.create-branch-title") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitCreateBranch",
      projectRoot,
      branch: "figures-2026",
    }));

    emit("git-sync-done", { projectRoot, op: "create-branch", out: "figures-2026" });
    fireEvent.click(screen.getByRole("button", { name: t("git.switch-branch", { branch: "main" }) }));
    fireEvent.click(await screen.findByRole("button", {
      name: t("git.merge-branch-into", { branch: "topic", current: "main" }),
    }));
    expect(screen.getByText(t("git.merge-branch-title", { branch: "topic", current: "main" }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("git.merge-branch") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitMergeBranch",
      projectRoot,
      branch: "topic",
    }));

    emit("git-sync-done", { projectRoot, op: "merge-branch", out: "topic" });
    fireEvent.click(screen.getByRole("button", { name: t("git.switch-branch", { branch: "main" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("git.delete-branch-named", { branch: "topic" }) }));
    expect(screen.getByText(t("git.delete-branch-title", { branch: "topic" }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("git.delete-branch-action") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitDeleteBranch",
      projectRoot,
      branch: "topic",
    }));
  });

  it("garde la génération IA désactivée quand le dépôt est propre", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([]);

    expect(screen.getByRole("button", { name: t("git.generate-ai") })).toBeDisabled();
  });

  it("ancre le compositeur dans la colonne des fichiers et conserve une seule ligne d’état", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "staged.ts", status: "M." }]);

    const workspace = document.querySelector(".git-workspace");
    const composer = document.querySelector(".git-commit-zone");
    const statusLine = document.querySelector(".git-commit-status");
    expect(composer?.parentElement).toBe(workspace);
    expect(statusLine).toHaveTextContent(t("git.commit-scope-staged"));

    fireEvent.click(screen.getByRole("button", { name: t("git.generate-ai") }));
    expect(document.querySelector(".git-commit-status")).toBe(statusLine);
    expect(statusLine).toHaveTextContent(t("git.generation-note"));

    emit("commit-msg", { projectRoot, message: "Stabilise le compositeur", description: "" });
    expect(document.querySelector(".git-commit-status")).toBe(statusLine);
    expect(statusLine).toHaveTextContent(t("git.generated-ready"));
  });

  it("indexe les fichiers par groupe et génère uniquement depuis l’index", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "staged.ts", status: "M." },
      { path: "changed.ts", status: ".M" },
      { path: "new.ts", status: "?" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: t("git.stage-file", { path: "changed.ts" }) }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitStage",
      projectRoot,
      paths: ["changed.ts"],
    }));

    fireEvent.click(screen.getByRole("button", { name: t("git.generate-ai") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "generateCommitMsg",
      projectRoot,
      scope: "staged",
    }));
  });

  it("génère depuis les changements visibles avant leur indexation", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "changed.ts", status: ".M" },
      { path: "new.ts", status: "?" },
    ]);

    expect(screen.getByText(t("git.commit-scope-required"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("git.generate-ai") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "generateCommitMsg",
      projectRoot,
      scope: "changes",
    }));
    expect(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) })).toBeDisabled();
    expect(screen.getByText(t("git.generation-note"))).toBeTruthy();
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"gitCommit"'));
  });

  it("affiche les erreurs IA puis commit seulement l’index existant", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "staged.ts", status: "M." }]);

    fireEvent.click(screen.getByRole("button", { name: t("git.generate-ai") }));
    emit("commit-msg", { projectRoot, error: "Claude indisponible" });
    expect(screen.getByText("Claude indisponible")).toBeTruthy();

    emit("commit-msg", {
      projectRoot,
      message: "Améliore le flux Git",
      description: "Analyse le diff indexé et décrit la raison du changement.",
    });
    const summary = screen.getByRole("textbox", { name: t("git.commit-placeholder") });
    expect(summary).toHaveValue("Améliore le flux Git");
    expect(screen.getByRole("textbox", { name: t("git.description-placeholder") }))
      .toHaveValue("Analyse le diff indexé et décrit la raison du changement.");
    expect(screen.getByRole("button", { name: t("git.regenerate-ai") })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitCommit",
      projectRoot,
      message: "Améliore le flux Git\n\nAnalyse le diff indexé et décrit la raison du changement.",
      files: [],
    }));
    expect(summary).toHaveValue("Améliore le flux Git");

    emit("git-changed", { type: "gitCommitDone", projectRoot });
    expect(summary).toHaveValue("");
  });

  it("agrandit la surface au clic et conserve le fichier sélectionné quand il passe à l’index", () => {
    const ws = makeSocket();
    const onRequestExpand = vi.fn();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} onRequestExpand={onRequestExpand} />);
    status([{ path: "src/changed.ts", status: ".M", add: 4, del: 1 }]);

    const fileRow = screen.getByRole("button", { pressed: false });
    fireEvent.click(fileRow);
    expect(onRequestExpand).toHaveBeenCalledOnce();
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitDiff",
      projectRoot,
      path: "src/changed.ts",
      scope: "changes",
    }));

    status([{ path: "src/changed.ts", status: "M.", add: 4, del: 1 }]);
    expect(ws.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: "gitDiff",
      projectRoot,
      path: "src/changed.ts",
      scope: "staged",
    }));
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("changed.ts");
    expect(screen.queryByRole("button", { name: t("git.inspect-diff") })).toBeNull();
  });

  it("indexe et désindexe une section entière", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "a.ts", status: "M." },
      { path: "b.ts", status: "A." },
      { path: "c.ts", status: ".M" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: t("git.unstage-all") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitUnstage",
      projectRoot,
      paths: ["a.ts", "b.ts"],
    }));

    fireEvent.click(screen.getByRole("button", { name: t("git.stage-all") }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitStage",
      projectRoot,
      paths: ["c.ts"],
    }));
  });

  it("ajoute une description au corps du commit", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "staged.ts", status: "M." }]);

    fireEvent.change(screen.getByRole("textbox", { name: t("git.commit-placeholder") }), {
      target: { value: "Titre du commit" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("git.add-description") }));
    fireEvent.change(screen.getByRole("textbox", { name: t("git.description-placeholder") }), {
      target: { value: "Contexte détaillé" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) }));

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitCommit",
      projectRoot,
      message: "Titre du commit\n\nContexte détaillé",
      files: [],
    }));
  });

  it("enchaîne le push seulement après la confirmation du commit", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "staged.ts", status: "M." }]);
    fireEvent.change(screen.getByRole("textbox", { name: t("git.commit-placeholder") }), {
      target: { value: "Commit puis push" },
    });

    fireEvent.click(screen.getByRole("button", { name: t("git.commit-push") }));
    expect(ws.send).toHaveBeenLastCalledWith(JSON.stringify({
      type: "gitCommit",
      projectRoot,
      message: "Commit puis push",
      files: [],
    }));

    emit("git-changed", { type: "gitCommitDone", projectRoot });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitPush", projectRoot }));
  });

  it("affiche les compteurs de synchronisation et envoie pull/push", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "changed.ts", status: ".M" }], { ahead: 2, behind: 1 });

    fireEvent.click(screen.getByRole("button", { name: `${t("git.pull-short")} 1` }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitPull", projectRoot }));
    emit("git-sync-done", { op: "pull", out: "Already up to date." });

    fireEvent.click(screen.getByRole("button", { name: `${t("git.push-short")} 2` }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "gitPush", projectRoot }));
  });
});
