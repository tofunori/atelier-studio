import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import {
  AgentActivityGroup,
  AgentDetailPanel,
  agentsFromActions,
  agentWithTranscriptState,
  type AgentToolAction,
} from "./AgentActivity";
import type { AgentEvent } from "../../lib/ws";

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
  it("recognizes terminal native statuses and a later child completion", () => {
    const [agent] = agentsFromActions([action({ ts: 10 })]);
    expect(agentWithTranscriptState(agent, [
      { kind: "started", ts: 11 }, { kind: "done", ok: true, result: "Finished", ts: 20 },
    ]).status).toBe("done");
    expect(agentWithTranscriptState(agent, [{ kind: "done", ok: false, result: "Failed", ts: 20 }]).status).toBe("failed");
    expect(agentWithTranscriptState({ ...agent, statusTs: 30 }, [
      { kind: "done", ok: true, result: "Previous turn", ts: 20 },
    ]).status).toBe("working");
    expect(agentWithTranscriptState(agent, [{ kind: "text", text: "Reading" }]).status).toBe("working");
    expect(agentWithTranscriptState({ ...agent, status: "done" }, [{ kind: "started" }]).status).toBe("done");
    expect(agentWithTranscriptState({ ...agent, status: "done", statusTs: 20 }, [{ kind: "started", ts: 30 }]).status).toBe("working");
    for (const status of ["done", "completed", "finished"]) {
      expect(agentsFromActions([action({ agentActivity: {
        ...action().agentActivity, agentsStates: { "child-1": { status } },
      } })])[0].status).toBe("done");
    }
  });

  it("keeps a parent completion received just after the child's final event", () => {
    const [agent] = agentsFromActions([action({
      ts: 1788738060767,
      agentActivity: {
        ...action().agentActivity,
        activityKind: "completed",
        agentsStates: { "child-1": { status: "completed" } },
      },
    })]);
    const settled = agentWithTranscriptState(agent, [
      { kind: "done", ok: true, result: "Lecture terminée.", ts: 1788738060764 },
    ]);
    renderUi(<AgentDetailPanel agent={settled} onClose={() => {}} events={[]} />);
    expect(screen.getByRole("status").textContent).toBe("Done");
  });

  it("shows readable activity rather than orchestration code or opaque messages", () => {
    renderUi(<AgentDetailPanel agent={agentsFromActions([action()])[0]} onClose={() => {}}
      events={[
        { kind: "tool_update", id: "exec", name: "functions.exec", detail: "const r = await tools.exec_command({cmd:'cat Makefile'});", input: {raw: "const r = await tools.exec_command({cmd:'cat Makefile'});"}, output: "verify:\n", status: "completed" },
        { kind: "tool_update", id: "message", name: "collaboration.send_message", detail: '{"message":"gAAAAAabcdefghijklmnopqrstuvwxyz0123456789"}', output: "", status: "completed" },
        { kind: "text", text: "I am reading the project README." },
      ]} />);
    const transcript = screen.getByTestId("agent-transcript");
    expect(transcript).toHaveTextContent("Reading Makefile");
    expect(transcript).toHaveTextContent("I am reading the project README.");
    expect(transcript).not.toHaveTextContent("const r");
    expect(transcript).not.toHaveTextContent("gAAAAA");
    expect(transcript.querySelector("pre")).toHaveTextContent("verify:");
  });

  it("names wrapped reads, searches and verification commands precisely", () => {
    const wrapped = (id: string, command: string): AgentEvent => ({
      kind: "tool_update", id, name: "functions.exec",
      detail: `const result = await tools.exec_command({cmd: '${command}'});`,
      input: { raw: `const result = await tools.exec_command({cmd: '${command}'});` },
      output: "ok", status: "completed",
    });
    renderUi(<AgentDetailPanel agent={agentsFromActions([action()])[0]} onClose={() => {}}
      events={[
        wrapped("read", "cat Makefile"),
        wrapped("search", "rg -n verify Makefile"),
        wrapped("verify", "make verify"),
      ]} />);
    const transcript = screen.getByTestId("agent-transcript");
    expect(transcript).toHaveTextContent("Reading Makefile");
    expect(transcript).toHaveTextContent("Searching Makefile");
    expect(transcript).toHaveTextContent("Ran make verify");
    expect(transcript).not.toHaveTextContent("const result");
  });
  it("opens every agent beyond the three-chip preview", () => {
    const onOpenAgent = vi.fn();
    renderUi(<AgentActivityGroup actions={Array.from({ length: 5 }, (_, i) => action({
      id: `spawn-${i}`, agentActivity: { tool: "spawnAgent", receiverThreadIds: [`child-${i}`],
        agentThreadId: `child-${i}`, agentPath: `/root/reviewer_${i}`,
        agentsStates: { [`child-${i}`]: { status: "running", message: null } } },
    }))} onOpenAgent={onOpenAgent} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Reviewer 4 subagent" }));
    expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ threadId: "child-4" }));
    fireEvent.click(screen.getByRole("button", {name: /5 subagents/}));
    expect(screen.queryByRole("button", { name: "Open Reviewer 4 subagent" })).toBeNull();
  });

  it("does not promise a pending response after an agent has stopped", () => {
    renderUi(<AgentDetailPanel agent={{ threadId: "done", displayName: "Done", status: "interrupted",
      statusMessage: null, prompt: null, model: null, reasoningEffort: null, agentPath: null }} onClose={() => {}} />);
    expect(screen.getByTestId("agent-transcript-empty")).toHaveTextContent("No transcript was recorded");
  });
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
    expect(screen.getByText("1 working")).toBeTruthy();
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

  it("le panneau montre les outils de l'enfant, pas seulement sa prose", () => {
    renderUi(<AgentDetailPanel
      agent={{ threadId: "child-1", displayName: "Chercheur", status: "working",
        statusMessage: null, prompt: null, model: null, reasoningEffort: null, agentPath: null }}
      onClose={() => {}}
      events={[
        { kind: "tool_update", id: "c1", name: "exec", detail: "wc -l a.py", output: "42 a.py", status: "completed" } as AgentEvent,
        { kind: "text", text: "Fini." } as AgentEvent,
      ]}
    />);
    const ligne = screen.getByTestId("agent-tool-line");
    expect(ligne.textContent).toContain("wc -l a.py");
    expect(ligne.querySelector("summary")).toHaveTextContent("Completed");
    expect(ligne.querySelector("pre")).toHaveTextContent("42 a.py");
    expect(screen.getByText("Fini.")).toBeTruthy();
  });
});

it('collapses on completion, exposes the report, and reopens on follow-up', () => {
  const running=action({agentActivity:{...action().agentActivity,agentThreadId:'child-1',agentPath:'/root/editorial'}});
  const done=action({id:'done',agentActivity:{...running.agentActivity,agentsStates:{'child-1':{status:'completed'}}}});
  const open=vi.fn();
  const {rerender}=renderUi(<AgentActivityGroup actions={[running]} onOpenAgent={open}/>);
  const header=screen.getByRole('button',{name:/One subagent/});
  expect(header).toHaveAttribute('aria-expanded','true');
  rerender(<AgentActivityGroup actions={[running,done]} onOpenAgent={open}/>);
  expect(header).toHaveAttribute('aria-expanded','false');
  expect(screen.queryByRole('button',{name:'Open Editorial subagent'})).toBeNull();
  fireEvent.click(header);
  fireEvent.click(screen.getByRole('button',{name:'Open Editorial subagent'}));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({status:'done'}));
  rerender(<AgentActivityGroup actions={[running,done,{...running,id:'followup'}]} onOpenAgent={open}/>);
  expect(header).toHaveAttribute('aria-expanded','true');
});


it("streams prose openly while preserving collapsed task and activity disclosures", () => {
  const agent = agentsFromActions([action()])[0];
  const tool: AgentEvent = {kind: "tool_update", id: "read", name: "exec", detail: "Read README", output: "Contents", status: "completed"};
  const {rerender} = renderUi(<AgentDetailPanel agent={agent} onClose={() => {}} events={[tool, {kind: "streaming", text: "First words"}]} />);
  expect(document.querySelector(".agent-report")).toHaveTextContent("First words");
  expect(screen.getByText("Inspect the editor")).not.toBeVisible();
  expect(screen.getByText("Contents")).not.toBeVisible();
  expect(document.querySelector(".agent-report")?.closest("details")).toBeNull();
  const disclosure = screen.getByText(/View activity/).closest("details")!;
  fireEvent.click(screen.getByText(/View activity/));
  expect(disclosure.open).toBe(true);
  rerender(<AgentDetailPanel agent={agent} onClose={() => {}} events={[tool, {kind: "streaming", text: "First words and the next sentence"}]} />);
  expect(document.querySelector(".agent-report")).toHaveTextContent("First words and the next sentence");
  expect(disclosure.open).toBe(true);
  rerender(<AgentDetailPanel agent={{...agent, status: "done", statusMessage: "First words and the next sentence"}} onClose={() => {}} events={[tool, {kind: "text", text: "First words and the next sentence"}]} />);
  expect(screen.getAllByText("First words and the next sentence")).toHaveLength(1);
  expect(document.querySelector(".agent-detail-live")).toBeNull();
});

it("updates the compact row from child events and clears activity on follow-up", () => {
  const parent = action({ts: 10});
  const {rerender} = renderUi(<AgentActivityGroup actions={[parent]} onOpenAgent={() => {}}
    eventsByThreadId={new Map([["child-1", [{kind: "started", ts: 10}, {kind: "streaming", text: "Reading the sources", ts: 11}]]])} />);
  expect(screen.getByText("Reading the sources")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: /One subagent/}));
  rerender(<AgentActivityGroup actions={[parent]} onOpenAgent={() => {}}
    eventsByThreadId={new Map([["child-1", [{kind: "done", ok: true, result: "Finished", ts: 20}]]])} />);
  expect(screen.getByRole("button", {name: /One subagent/})).toHaveAttribute("aria-expanded", "false");
  rerender(<AgentActivityGroup actions={[{...parent, ts: 30}]} onOpenAgent={() => {}}
    eventsByThreadId={new Map([["child-1", [{kind: "streaming", text: "Reading the sources", ts: 11}, {kind: "done", ok: true, result: "Finished", ts: 20}]]])} />);
  expect(screen.getByRole("button", {name: /One subagent/})).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByText("Reading the sources")).toBeNull();
});
