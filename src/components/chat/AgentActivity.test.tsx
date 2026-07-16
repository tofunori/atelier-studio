import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import {
  AgentActivityGroup,
  AgentDetailPanel,
  agentsFromActions,
  type AgentToolAction,
} from "./AgentActivity";

function action(over: Partial<AgentToolAction> = {}): AgentToolAction {
  return {
    kind: "tool_update",
    id: "spawn-1",
    name: "agent:spawnAgent",
    output: "",
    status: "inProgress",
    source: "codex",
    agentActivity: {
      tool: "spawnAgent",
      receiverThreadIds: ["child-1"],
      agentsStates: { "child-1": { status: "running", message: null } },
      prompt: "Inspect the editor",
      model: "gpt-5.6-codex",
      reasoningEffort: "high",
    },
    ...over,
  };
}

beforeEach(() => { resetTestState(); setLanguage("en"); });
afterEach(cleanup);

describe("Codex subagent activity", () => {
  it("merges the spawn state with the later agent path", () => {
    const agents = agentsFromActions([
      action(),
      action({
        id: "activity-1",
        name: "agent:activity",
        agentActivity: {
          tool: "activity",
          receiverThreadIds: ["child-1"],
          agentsStates: { "child-1": { status: "running", message: null } },
          agentThreadId: "child-1",
          agentPath: "/root/remote_sensing",
          activityKind: "started",
        },
      }),
    ]);
    expect(agents).toEqual([expect.objectContaining({
      threadId: "child-1",
      displayName: "Remote sensing",
      status: "working",
      prompt: "Inspect the editor",
      model: "gpt-5.6-codex",
    })]);
  });

  it("renders Codex-style chips and opens the selected agent", () => {
    const onOpenAgent = vi.fn();
    renderUi(<AgentActivityGroup actions={[
      action({
        agentActivity: {
          ...action().agentActivity,
          agentThreadId: "child-1",
          agentPath: "/root/editorial",
        },
      }),
    ]} onOpenAgent={onOpenAgent} />);

    expect(screen.getByTestId("subagent-activity-inline-group").textContent)
      .toContain("Editorial");
    expect(screen.getByText("started working")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Editorial subagent" }));
    expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ threadId: "child-1" }));
  });

  it("renders the child transcript instead of an empty working panel", () => {
    renderUi(<AgentDetailPanel
      agent={{
        threadId: "child-1", displayName: "Editorial", status: "working", statusMessage: null,
        prompt: null, model: null, reasoningEffort: null, agentPath: "/root/editorial",
      }}
      events={[{ kind: "text", text: "The child has produced this update." }]}
      onClose={() => {}}
    />);

    expect(screen.getByTestId("agent-transcript")).toHaveTextContent("The child has produced this update.");
    expect(screen.queryByTestId("agent-transcript-empty")).not.toBeInTheDocument();
  });
});
