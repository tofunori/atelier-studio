import { describe, expect, it } from "vitest";
import { fromThreadMessageLike } from "@assistant-ui/react";

import type { AgentEvent, HarnessEventMeta } from "../ws";
import {
  assistantUiApprovalToInteractionResponse,
  projectAgentEventsToThreadMessageList,
  projectAgentEventsToThreadMessages,
} from "./assistantUiProjection";

function meta(
  turnId: string,
  eventId: string,
  sequence: number,
  itemId?: string,
): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId,
    provider: "codex",
    threadId: "thread-a",
    turnId,
    ...(itemId ? { itemId } : {}),
    sequence,
    ts: sequence * 1000,
    durable: true,
    origin: "provider",
  };
}

const user = (turnId: string, text = "Question", sequence = 1): AgentEvent => ({
  kind: "user",
  text,
  meta: meta(turnId, `${turnId}-user`, sequence),
});

const assistant = (messages: ReturnType<typeof projectAgentEventsToThreadMessages>["messages"]) =>
  messages.find((message) => message.role === "assistant")!;

const partsOf = (message: ReturnType<typeof assistant>) =>
  (typeof message.content === "string" ? [] : message.content);

describe("assistant-ui AgentEvent projection", () => {
  it.each([
    { kind: "thinking", text: "" },
    { kind: "thinking_live", text: "" },
    { kind: "thinking_progress", count: 4 },
    { kind: "tool", name: "__thinking" },
    { kind: "tool", name: "__thinking-step" },
  ] as AgentEvent[])("uses native empty reasoning for $kind signals and removes empty history", signal => {
    const events: AgentEvent[] = [{ kind: "user", text: "Question" }, signal, signal];
    const active = assistant(projectAgentEventsToThreadMessages(events, { workingSince: 1 }).messages);
    expect(partsOf(active)).toEqual([expect.objectContaining({ type: "reasoning", text: "", status: { type: "running" } })]);
    const settled = assistant(projectAgentEventsToThreadMessages([...events, { kind: "done", ok: true, result: "" }], { workingSince: null }).messages);
    expect(partsOf(settled).filter(part => part.type === "reasoning")).toEqual([]);
    expect(JSON.stringify(settled.content)).not.toContain("__thinking");
  });

  it("keeps reasoning on either side of a tool in order and completes the earlier phase", () => {
    const events: AgentEvent[] = [{ kind: "user", text: "Question" },
      { kind: "thinking_delta", text: "Avant" },
      { kind: "tool_update", id: "read", name: "Read", input: { path: "a.tex" }, output: "ok", status: "completed" },
      { kind: "thinking_delta", text: "Après" },
      { kind: "thinking_delta", text: " la lecture" },
    ];
    const active = assistant(projectAgentEventsToThreadMessages(events, { workingSince: 1 }).messages);
    expect(partsOf(active)).toMatchObject([
      { type: "reasoning", text: "Avant", status: { type: "complete" } },
      { type: "tool-call", result: "ok" },
      { type: "reasoning", text: "Après la lecture", status: { type: "running" } },
    ]);
    const next = assistant(projectAgentEventsToThreadMessages([...events, { kind: "delta", text: "Réponse" }], { workingSince: 1 }).messages);
    expect(partsOf(next).filter(part => part.type === "reasoning")).toMatchObject([
      { status: { type: "complete" } }, { status: { type: "complete" } },
    ]);
  });

  it("keeps the native run clock active before the first event arrives", () => {
    const result = projectAgentEventsToThreadMessages([], { workingSince: 1234 });
    expect(result.messages).toEqual([]);
    expect(result.isRunning).toBe(true);
    expect(result.activeTurnId).toBeNull();
  });

  it("keeps stable user/assistant identities and marks terminal final text", () => {
    const events: AgentEvent[] = [
      user("turn-a", "Analyse la figure."),
      { kind: "streaming", text: "Je vérifie", meta: meta("turn-a", "stream-1", 2) },
      { kind: "text", text: "Je vérifie la figure.", meta: meta("turn-a", "text-1", 3) },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done-1", 4) },
    ];

    const first = projectAgentEventsToThreadMessages(events, { workingSince: 1000, threadId: "thread-a" });
    const second = projectAgentEventsToThreadMessages(events, { workingSince: 1000, threadId: "thread-a" });
    expect(first.isRunning).toBe(false);
    expect(first.messages.map((message) => message.id)).toEqual(second.messages.map((message) => message.id));
    expect(first.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    const reply = assistant(first.messages);
    expect(reply.status).toEqual({ type: "complete", reason: "stop" });
    expect(partsOf(reply).filter((part) => part.type === "text").map((part) => part.text)).toEqual(["Je vérifie la figure."]);
    expect(first.messages[0]?.metadata).toMatchObject({
      custom: { atelier: { sourceEventIndex: 0, eventIndexes: [0, 1, 2, 3] } },
    });
    expect(reply.metadata).toMatchObject({
      custom: { atelier: { sourceEventIndex: 2, eventIndexes: [0, 1, 2, 3] } },
    });
  });

  it("falls back to the latest raw event when a turn has no assistant text", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update",
        id: "read",
        name: "Read",
        input: { path: "methods.tex" },
        output: "ok",
        status: "completed",
        meta: meta("turn-a", "tool-complete", 2, "read"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done", 3) },
    ];

    const result = projectAgentEventsToThreadMessages(events);
    const reply = assistant(result.messages);
    expect(reply.metadata).toMatchObject({
      custom: { atelier: { sourceEventIndex: 2, eventIndexes: [0, 1, 2] } },
    });
  });

  it("groups tool snapshots by turn/item and keeps the newest completed result", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update",
        id: "same-tool",
        name: "exec_command",
        input: { command: "rg figure" },
        output: "",
        status: "running",
        meta: meta("turn-a", "tool-running", 2, "same-tool"),
      },
      {
        kind: "tool_update",
        id: "same-tool",
        name: "exec_command",
        input: { command: "rg figure" },
        output: "figure.tex:2",
        status: "completed",
        durationMs: 42,
        meta: meta("turn-a", "tool-complete", 3, "same-tool"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done-1", 4) },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 0 });
    const toolParts = partsOf(assistant(result.messages)).filter((part) => part.type === "tool-call");
    expect(toolParts).toHaveLength(1);
    expect(toolParts[0]).toMatchObject({
      toolCallId: "thread-a:turn-a:item:same-tool",
      toolName: "exec_command",
      result: "figure.tex:2",
      isError: false,
      args: { command: "rg figure" },
    });
  });

  it("conserve le détail fournisseur d'un tool_update sans écraser son input", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update",
        id: "same-tool",
        name: "Bash",
        input: { command: "printf hello", detail: "input detail" },
        detail: "premier appel",
        output: "sortie",
        status: "completed",
        meta: meta("turn-a", "tool-detail", 2, "same-tool"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done-detail", 3) },
    ];

    const result = projectAgentEventsToThreadMessages(events);
    const tool = partsOf(assistant(result.messages)).find((part) => part.type === "tool-call");
    expect(tool).toMatchObject({
      args: { command: "printf hello", detail: "input detail" },
      argsText: expect.stringContaining("premier appel"),
    });
    expect(tool?.argsText).toContain("input detail");
  });

  it("does not turn a failed tool into a failed turn while the turn remains active", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update",
        id: "failed-tool",
        name: "exec_command",
        input: { command: "false" },
        output: "permission denied",
        status: "failed",
        exitCode: 1,
        meta: meta("turn-a", "tool-failed", 2, "failed-tool"),
      },
      { kind: "thinking_live", text: "Je poursuis avec une autre vérification.", meta: meta("turn-a", "thinking-1", 3) },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1 });
    expect(result.isRunning).toBe(true);
    const reply = assistant(result.messages);
    expect(reply.status).toEqual({ type: "running" });
    expect(partsOf(reply).find((part) => part.type === "tool-call")).toMatchObject({
      result: "permission denied",
      isError: true,
    });
  });

  it("keeps a completed tool followed by provider-free thinking in a running turn", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update",
        id: "read",
        name: "Read",
        input: { path: "methods.tex" },
        output: "ok",
        status: "completed",
        meta: meta("turn-a", "tool-complete", 2, "read"),
      },
      { kind: "thinking_progress", count: 3, meta: meta("turn-a", "thinking-progress", 3, "reasoning") },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1 });
    expect(result.isRunning).toBe(true);
    expect(assistant(result.messages).status).toEqual({ type: "running" });
    expect(partsOf(assistant(result.messages)).slice(-1)[0]).toMatchObject({ type: "reasoning", text: "", status: { type: "running" } });
  });

  it("maps pending permissions and generic interactions to native approval seams", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "permission",
        requestId: "approval-opaque",
        toolName: "exec_command",
        input: { command: "rm -i file" },
        answered: null,
        meta: meta("turn-a", "permission-1", 2, "approval-opaque"),
      },
      {
        kind: "interaction",
        requestId: "question-opaque",
        interactionType: "user_input",
        title: "Choisir une région",
        fields: [{ id: "region", question: "Région ?", options: [{ label: "Ouest", value: "west" }] }],
        state: "pending",
        meta: meta("turn-a", "interaction-1", 3, "question-opaque"),
      },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1 });
    const reply = assistant(result.messages);
    expect(reply.status).toEqual({ type: "requires-action", reason: "tool-calls" });
    const calls = partsOf(reply).filter((part) => part.type === "tool-call");
    expect(calls.map((part) => part.toolCallId)).toEqual([
      "thread-a:turn-a:item:approval-opaque",
      "thread-a:turn-a:item:question-opaque",
    ]);
    expect(calls[0]).toMatchObject({
      approval: { id: "approval-opaque" },
      toolName: "exec_command",
    });
    expect(calls[1]).toMatchObject({
      interrupt: { type: "human", payload: { requestId: "question-opaque" } },
    });
  });

  it("keeps a pending interaction actionable after reload without a live clock", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "interaction",
        requestId: "approval-reload",
        interactionType: "approval",
        title: "Autoriser la lecture ?",
        state: "pending",
        meta: meta("turn-a", "approval-reload", 2, "approval-reload"),
      },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: null });
    const reply = assistant(result.messages);
    expect(result.isRunning).toBe(true);
    expect(reply.status).toEqual({ type: "requires-action", reason: "interrupt" });
    expect(partsOf(reply)).toContainEqual(expect.objectContaining({
      type: "tool-call",
      interrupt: { type: "human", payload: expect.objectContaining({ requestId: "approval-reload" }) },
    }));
  });

  it("does not resurrect a pending interaction that precedes a terminal event", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "interaction",
        requestId: "approval-settled",
        interactionType: "approval",
        title: "Autoriser la lecture ?",
        state: "pending",
        meta: meta("turn-a", "approval-settled", 2, "approval-settled"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done-settled", 3) },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: null });
    const reply = assistant(result.messages);
    expect(result.isRunning).toBe(false);
    expect(reply.status).toEqual({ type: "complete", reason: "stop" });
  });

  it("retains a resolved generic interaction question and safe answer summary", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "interaction",
        requestId: "approval-resolved",
        interactionType: "approval",
        title: "Autoriser la lecture ?",
        detail: "Lire results_en.tex",
        state: "answered",
        answerSummary: "autorisé une fois",
        meta: meta("turn-a", "approval-resolved", 2, "approval-resolved"),
      },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: null });
    const tool = partsOf(assistant(result.messages)).find((part) => part.type === "tool-call");
    expect(tool).toMatchObject({
      args: { question: "Autoriser la lecture ?", detail: "Lire results_en.tex" },
      result: "autorisé une fois",
      isError: false,
    });
  });

  it("retains edits, agent state, image references, and annotations as native data parts", () => {
    const events: AgentEvent[] = [
      {
        kind: "user",
        text: "Inspecte cette capture.",
        imageUrl: "data:image/png;base64,AAAA",
        notes: [{ n: 1, text: "zone bleue" }],
        meta: meta("turn-a", "user-1", 1),
      },
      {
        kind: "edit",
        projectRoot: "/tmp/project",
        files: [{ path: "figure.svg", add: 4, del: 1 }],
        meta: meta("turn-a", "edit-1", 2),
      },
      {
        kind: "tool_update",
        id: "agent-call",
        name: "agent:research",
        input: { prompt: "Compare methods" },
        output: "",
        status: "running",
        agentActivity: {
          tool: "agent",
          receiverThreadIds: ["child-1"],
          agentsStates: { "child-1": { status: "running", message: "Recherche" } },
        },
        meta: meta("turn-a", "agent-1", 3, "agent-call"),
      },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1 });
    const userMessage = result.messages.find((message) => message.role === "user")!;
    expect(typeof userMessage.content === "string" ? [] : userMessage.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image", image: "data:image/png;base64,AAAA" }),
      expect.objectContaining({ type: "data", name: "atelier-annotations" }),
    ]));
    const reply = assistant(result.messages);
    expect(partsOf(reply)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "data", name: "atelier-edit" }),
      expect.objectContaining({ type: "tool-call", toolName: "agent:research" }),
    ]));
  });

  it("scopes reused tool ids by turn and ignores a stale lower-sequence running snapshot", () => {
    const events: AgentEvent[] = [
      user("turn-a", "Premier"),
      {
        kind: "tool_update", id: "reused", name: "Read", input: {}, output: "ok", status: "completed",
        meta: meta("turn-a", "a-tool-complete", 3, "reused"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "a-done", 4) },
      user("turn-b", "Deuxième", 5),
      {
        kind: "tool_update", id: "reused", name: "Read", input: {}, output: "", status: "running",
        meta: meta("turn-b", "b-tool-running", 6, "reused"),
      },
      {
        kind: "tool_update", id: "reused", name: "Read", input: {}, output: "ok", status: "completed",
        meta: meta("turn-b", "b-tool-complete", 7, "reused"),
      },
      {
        kind: "tool_update", id: "reused", name: "Read", input: {}, output: "old", status: "running",
        meta: meta("turn-b", "b-tool-stale", 6, "reused"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-b", "b-done", 8) },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1, threadId: "thread-a" });
    const replies = result.messages.filter((message) => message.role === "assistant");
    const firstTool = partsOf(replies[0]!).find((part) => part.type === "tool-call");
    const secondTool = partsOf(replies[1]!).find((part) => part.type === "tool-call");
    expect(firstTool?.toolCallId).toBe("thread-a:turn-a:item:reused");
    expect(secondTool?.toolCallId).toBe("thread-a:turn-b:item:reused");
    expect(secondTool).toMatchObject({ result: "ok", isError: false });
    expect(result.isRunning).toBe(false);
  });

  it("does not revive active state from a stale running tool after terminal settlement", () => {
    const events: AgentEvent[] = [
      user("turn-a"),
      {
        kind: "tool_update", id: "tool", name: "Read", input: {}, output: "ok", status: "completed",
        meta: meta("turn-a", "tool-complete", 3, "tool"),
      },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done", 4) },
      {
        kind: "tool_update", id: "tool", name: "Read", input: {}, output: "late", status: "running",
        meta: meta("turn-a", "tool-stale", 2, "tool"),
      },
    ];

    const result = projectAgentEventsToThreadMessages(events, { workingSince: 1 });
    expect(result.isRunning).toBe(false);
    expect(assistant(result.messages).status).toEqual({ type: "complete", reason: "stop" });
    expect(partsOf(assistant(result.messages)).find((part) => part.type === "tool-call")).toMatchObject({ result: "ok" });
  });

  it("exposes the message-list-only helper for ExternalStore adapters", () => {
    const events: AgentEvent[] = [user("turn-a"), { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done", 2) }];
    const projection = projectAgentEventsToThreadMessages(events);
    expect(projectAgentEventsToThreadMessageList(events)).toEqual(projection.messages);
  });

  it("keeps opaque approval options and routes free-form answers explicitly", () => {
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "approval-1",
      approved: false,
      optionId: "opaque-reject",
    })).toEqual({ requestId: "approval-1", response: { optionId: "opaque-reject" } });
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "question-1",
      approved: true,
      text: "Ouest",
      fieldId: "region",
    })).toEqual({ requestId: "question-1", response: { answers: { region: "Ouest" } } });
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "question-2",
      text: "Ouest",
    }, { fields: [{ id: "region" }] })).toEqual({
      requestId: "question-2",
      response: { answers: { region: "Ouest" } },
    });
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "question-3",
      text: "Ouest",
    }, [{
      kind: "interaction",
      requestId: "question-3",
      interactionType: "user_input",
      title: "Région",
      fields: [{ id: "region", question: "Région ?" }],
      state: "pending",
    }])).toEqual({
      requestId: "question-3",
      response: { answers: { region: "Ouest" } },
    });
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "question-other",
      optionId: "__other__",
      text: "Autre région",
    }, {
      fields: [{ id: "region", allowOther: true }],
    })).toEqual({
      requestId: "question-other",
      response: { answers: { region: "Autre région" } },
    });
    expect(() => assistantUiApprovalToInteractionResponse({
      approvalId: "form-other",
      optionId: "__other__",
      text: "ambiguous",
    }, { fields: [{ id: "region" }, { id: "secret" }] })).toThrow(/plusieurs champs/u);
    expect(assistantUiApprovalToInteractionResponse({
      approvalId: "form-1",
      answers: { region: "west", secret: "s3cret" },
    })).toEqual({
      requestId: "form-1",
      response: { answers: { region: "west", secret: "s3cret" } },
    });
    expect(() => assistantUiApprovalToInteractionResponse({
      approvalId: "form-2",
      text: "ambiguous",
    }, { fields: [{ id: "region" }, { id: "secret" }] })).toThrow(/plusieurs champs/u);
    expect(() => assistantUiApprovalToInteractionResponse({
      approvalId: "approval-2",
    })).toThrow(/approved/u);
  });

  it("stays consumable by assistant-ui's native message converter", () => {
    const events: AgentEvent[] = [
      {
        kind: "user",
        text: "Inspecte",
        imageUrl: "data:image/png;base64,AAAA",
        pastes: [{ name: "notes.txt", text: "extrait", lines: 1 }],
        meta: meta("turn-a", "user", 1),
      },
      {
        kind: "tool_update",
        id: "tool",
        name: "Read",
        input: { path: "notes.txt" },
        output: "extrait",
        status: "completed",
        meta: meta("turn-a", "tool", 2, "tool"),
      },
      { kind: "text", text: "Voici le résultat.", meta: meta("turn-a", "text", 3) },
      { kind: "done", ok: true, result: "ok", meta: meta("turn-a", "done", 4) },
    ];
    const result = projectAgentEventsToThreadMessages(events);
    expect(() => result.messages.map((message) => fromThreadMessageLike(
      message,
      message.id ?? "fallback",
      message.status ?? { type: "complete", reason: "unknown" },
    ))).not.toThrow();
  });
});
