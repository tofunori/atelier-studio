import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_UI_COMPOSER_LIMITATIONS,
  AssistantUiComposerControls,
  type AssistantUiComposerSelection,
} from "./AssistantUiComposerControls";

afterEach(cleanup);

const selection: AssistantUiComposerSelection = {
  provider: "codex",
  model: "gpt-5.6-sol",
  effort: "medium",
  permissionMode: "acceptEdits",
  fastMode: false,
};

describe("AssistantUiComposerControls", () => {
  it("keeps native effort, context and prompt elements controlled by the host", () => {
    const onSelectionChange = vi.fn();
    const onPromptSelect = vi.fn();
    const { container } = render(
      <AssistantUiComposerControls
        selection={selection}
        onSelectionChange={onSelectionChange}
        effortLevels={[
          { key: "low", label: "Low", budget: 1024 },
          { key: "medium", label: "Medium", budget: 4096 },
          { key: "high", label: "High", budget: 8192 },
        ]}
        reasoningSpent={512}
        usage={{ context: 12_000, output: 800, cost: null, turns: 1, window: 100_000 }}
        prompts={[{ id: "concise", name: "Concis", body: "Répondre directement.", variables: [] }]}
        selectedPromptId="concise"
        onPromptSelect={onPromptSelect}
      />,
    );

    expect(container.querySelector('[data-slot="reasoning-effort"]')).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Thinking budget used" })).toHaveAttribute("aria-valuetext", "512 of 4,096");
    expect(container.querySelector('[data-slot="context-display-trigger"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="prompt-library"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "High" }));
    expect(onSelectionChange).toHaveBeenCalledWith({ ...selection, effort: "high" });
    fireEvent.click(screen.getByRole("option", { name: "Concis" }));
    expect(onPromptSelect).toHaveBeenCalledWith("concise");
  });

  it("uses the official button primitive for the Codex Fast service tier", () => {
    const onSelectionChange = vi.fn();
    render(
      <AssistantUiComposerControls
        selection={selection}
        onSelectionChange={onSelectionChange}
        fastModeSupported
      />,
    );
    const fast = screen.getByRole("button", { name: "Fast" });
    expect(fast).toHaveAttribute("data-slot", "assistant-ui-fast-mode");
    expect(fast).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(fast);
    expect(onSelectionChange).toHaveBeenCalledWith({ ...selection, fastMode: true });
  });

  it("keeps permission policy values host-controlled through the shared Select primitive", async () => {
    const onSelectionChange = vi.fn();
    render(
      <AssistantUiComposerControls
        selection={selection}
        onSelectionChange={onSelectionChange}
        permissionModes={[
          { value: "acceptEdits", label: "Accept edits" },
          { value: "plan", label: "Plan" },
        ]}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Permission mode" });
    expect(trigger).toHaveAttribute("data-slot", "assistant-ui-permission-mode");
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", { name: "Plan" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    await waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith({ ...selection, permissionMode: "plan" }));
  });

  it("does not invent a zero reasoning consumption when the provider gave no signal", () => {
    const { container } = render(
      <AssistantUiComposerControls
        selection={selection}
        onSelectionChange={vi.fn()}
        effortLevels={[{ key: "low", label: "Low" }, { key: "medium", label: "Medium" }]}
      />,
    );
    expect(container.querySelector('[data-slot="reasoning-effort"]')).toBeInTheDocument();
    expect(screen.getByText("Consommation indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not present PermissionGrant as a permission-mode selector", () => {
    expect(ASSISTANT_UI_COMPOSER_LIMITATIONS.permissionMode).toMatch(
      /no semantics-specific permission-mode element/u,
    );
    const onSelectionChange = vi.fn();
    render(
      <AssistantUiComposerControls
        selection={selection}
        onSelectionChange={onSelectionChange}
        permissionGrant={{
          capability: "Write files",
          requester: "Codex",
          reach: ["project files"],
          scope: "pending",
        }}
      />,
    );
    expect(document.querySelector('[data-slot="permission-grant"]')).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /permission/u })).not.toBeInTheDocument();
  });
});
