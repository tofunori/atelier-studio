import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GitSurface from "./GitSurface";
import { t } from "../lib/i18n";
import { renderUi, resetTestState } from "../test/render";

const projectRoot = "/tmp/atelier-git-surface";

function makeSocket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function emit(name: string, detail: Record<string, unknown>) {
  act(() => window.dispatchEvent(new CustomEvent(name, { detail })));
}

function status(files: Array<{ path: string; status: string }>) {
  emit("git-status", {
    projectRoot,
    status: { branch: "main", ahead: 0, behind: 0, files },
  });
}

beforeEach(resetTestState);
afterEach(cleanup);

describe("GitSurface staging-first", () => {
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

  it("génère depuis les changements quand aucun fichier n’est encore indexé", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "changed.ts", status: ".M" },
      { path: "new.ts", status: "?" },
    ]);

    const generate = screen.getByRole("button", { name: t("git.generate-ai") });
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "generateCommitMsg",
      projectRoot,
      scope: "changes",
    }));
    const generating = screen.getByRole("button", { name: t("git.generating-ai") });
    expect(generating).toBeDisabled();
    expect(generating).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(t("git.generation-note"));
    const summary = screen.getByRole("textbox", { name: t("git.commit-placeholder") });
    expect(summary).toHaveValue("Update project files");
    expect(summary).toHaveFocus();

    emit("commit-msg", { projectRoot, message: "Résume les changements Git" });
    expect(summary).toHaveValue("Résume les changements Git");
    expect(summary).toHaveFocus();
    expect(screen.getByText(t("git.generated-ready"))).toBeTruthy();
  });

  it("commit tous les changements quand aucun fichier n’est indexé", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([
      { path: "changed.ts", status: ".M" },
      { path: "new.ts", status: "?" },
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: t("git.commit-placeholder") }), {
      target: { value: "Commit sans staging manuel" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitCommit",
      projectRoot,
      message: "Commit sans staging manuel",
      files: null,
    }));
  });

  it("affiche les erreurs IA puis commit seulement l’index existant", () => {
    const ws = makeSocket();
    renderUi(<GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={null} />);
    status([{ path: "staged.ts", status: "M." }]);

    fireEvent.click(screen.getByRole("button", { name: t("git.generate-ai") }));
    emit("commit-msg", { projectRoot, error: "Claude indisponible" });
    expect(screen.getByText("Claude indisponible")).toBeTruthy();

    emit("commit-msg", { projectRoot, message: "Améliore le flux Git" });
    const summary = screen.getByRole("textbox", { name: t("git.commit-placeholder") });
    expect(summary).toHaveValue("Améliore le flux Git");

    fireEvent.click(screen.getByRole("button", { name: t("git.commit-branch", { branch: "main" }) }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "gitCommit",
      projectRoot,
      message: "Améliore le flux Git",
      files: [],
    }));
    expect(summary).toHaveValue("Améliore le flux Git");

    emit("git-changed", { type: "gitCommitDone", projectRoot });
    expect(summary).toHaveValue("");
  });
});
