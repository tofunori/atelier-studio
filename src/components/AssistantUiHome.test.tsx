import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantUiHome } from "./AssistantUiHome";
import type { ResearchHomeBundle } from "./ResearchHome";
import { t } from "../lib/i18n";

afterEach(cleanup);
const actions = () => ({ onNewChat: vi.fn(), onOpenProject: vi.fn(), onResume: vi.fn(), onOpenArtefact: vi.fn(), onOpenGallery: vi.fn(), onOpenPalette: vi.fn(), onResumeSession: vi.fn() });
it("opens a project through the native action when no project is selected", () => {
  const callbacks = actions();
  render(<AssistantUiHome home={{ model: { state: "no-project" }, actions: callbacks }} />);
  fireEvent.click(screen.getByRole("button", { name: t("action.open-project") }));
  expect(callbacks.onOpenProject).toHaveBeenCalledOnce();
});
it("keeps project-scoped resume and catalogue file targets intact", () => {
  const callbacks = actions();
  const home: ResearchHomeBundle = { actions: callbacks, model: {
    state: "project", projectRoot: "/project-A", projectName: "Projet A", projectPath: "/project-A", degraded: false, loading: false, hasThreads: true, attention: [],
    continueItem: { threadId: "thread-A", projectRoot: "/project-A", title: "Analyse", provider: "codex", status: "done", updatedAtIso: null, relative: null, runningForMs: null, lastAction: null, hasUsage: false },
    artefacts: [{ rel: "sections/results.tex", name: "results.tex", dir: "sections", kind: "document" }],
  } };
  render(<AssistantUiHome home={home} />);
  fireEvent.click(screen.getByRole("button", { name: /Analyse/ }));
  expect(callbacks.onResume).toHaveBeenCalledWith("thread-A", "/project-A");
  fireEvent.click(screen.getByRole("button", { name: "results.tex" }));
  expect(callbacks.onOpenArtefact).toHaveBeenCalledWith("sections/results.tex");
  fireEvent.click(screen.getByRole("button", { name: t("home.start") }));
  expect(callbacks.onNewChat).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: t("action.resume-session") }));
  expect(callbacks.onResumeSession).toHaveBeenCalledOnce();
});
