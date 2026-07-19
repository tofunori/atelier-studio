import { act, cleanup, fireEvent, screen } from "@testing-library/react";
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

  it("affiche les branches et l’historique directement dans l’en-tête", async () => {
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

    expect(screen.getByRole("button", { name: t("git.history") })).toBeEnabled();
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

  it("exige des fichiers indexés avant toute génération IA", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "changed.ts", status: ".M" },
      { path: "new.ts", status: "?" },
    ]);

    expect(screen.getByRole("button", { name: t("git.generate-ai") })).toBeDisabled();
    expect(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) })).toBeDisabled();
    expect(screen.getByText(t("git.commit-scope-required"))).toBeTruthy();
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"generateCommitMsg"'));
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

  it("conserve le fichier sélectionné quand il passe des changements à l’index", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "src/changed.ts", status: ".M", add: 4, del: 1 }]);

    const fileRow = screen.getByRole("button", { pressed: false });
    fireEvent.click(fileRow);
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
    expect(screen.getByRole("button", { name: t("git.inspect-diff") })).toBeEnabled();
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
