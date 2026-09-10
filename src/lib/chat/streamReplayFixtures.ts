import type { AgentEvent, HarnessEventMeta } from "../ws";

/**
 * Small, importable stream fixtures used by the model and Playwright harness.
 *
 * The two `observed` fixtures are minimized from the local Codex capture
 * `/tmp/atelier-methods-stream.jsonl`. Text, paths, UUIDs and native ids are
 * replaced; event kind, relative order and lifecycle status are retained.
 * The original captures contain one Codex and one Claude run. `codexComposite` is deliberately
 * marked `derived`: it combines observed shapes to exercise a complete
 * reasoning/tool/failure/streaming lifecycle that no single captured turn
 * contains. It is not evidence of a provider trace.
 */

export type ReplayFixtureProvenance = "observed" | "derived";

export type ReplayCheckpoint = {
  /** Number of wire events applied, starting at one. */
  after: number;
  label: string;
  /** Expected projection status at this point (if a turn is still active). */
  phase?: "prework" | "final_answer" | "completed" | "failed";
  activeState?: "thinking" | "reasoning" | "activity" | "answering" | null;
  statusKind?: "thinking" | "action" | "writing" | "failed";
};

export type StreamReplayFixture = {
  id: string;
  provider: "codex" | "claude";
  provenance: ReplayFixtureProvenance;
  sourceTrace: string;
  /** Genericized turn id; native/captured ids are intentionally absent. */
  turnId: string;
  events: readonly AgentEvent[];
  /** Wire-like batches for replay/reload tests. */
  frames: readonly (readonly AgentEvent[])[];
  checkpoints: readonly ReplayCheckpoint[];
};

const THREAD = "thread-replay-fixture";
const BASE_TS = 1_800_000_000_000;

function meta(
  eventId: string,
  turnId: string,
  sequence: number,
  overrides: Partial<HarnessEventMeta> = {},
): HarnessEventMeta {
  return {
    schemaVersion: 1,
    eventId,
    provider: "codex",
    threadId: THREAD,
    turnId,
    sequence,
    ts: BASE_TS + sequence * 100,
    durable: true,
    origin: "provider",
    ...overrides,
  };
}

function frameAt(events: readonly AgentEvent[], ...ends: number[]): readonly (readonly AgentEvent[])[] {
  let start = 0;
  return ends.map((end) => {
    const frame = events.slice(start, end);
    start = end;
    return frame;
  });
}

/**
 * Captured live stream shape (source seq 26267–26434, minimized): user,
 * deltas, text, two Bash item lifecycles, a thinking marker, more deltas, text,
 * and done. The original had many more tiny deltas; three representative
 * fragments are enough to retain the stream transition without user prose.
 */
const codexObservedLiveEvents: readonly AgentEvent[] = [
  {
    kind: "user",
    text: "fixture prompt",
    meta: meta("live-user", "turn-observed-live", 1, { messageId: "live-message" }),
  },
  { kind: "started", meta: meta("live-started", "turn-observed-live", 2, { durable: false }) },
  { kind: "delta", text: "fixture ", meta: meta("live-delta-1", "turn-observed-live", 3) },
  { kind: "delta", text: "streamed ", meta: meta("live-delta-2", "turn-observed-live", 4) },
  { kind: "delta", text: "answer", meta: meta("live-delta-3", "turn-observed-live", 5) },
  { kind: "text", text: "fixture streamed answer\n", meta: meta("live-text-1", "turn-observed-live", 6) },
  {
    kind: "tool_update",
    id: "item-bash-a",
    name: "Bash",
    output: "",
    status: "inProgress",
    detail: "fixture command",
    meta: meta("live-tool-a-running", "turn-observed-live", 7, { itemId: "item-bash-a" }),
  },
  {
    kind: "tool_update",
    id: "item-bash-a",
    name: "Bash",
    output: "fixture output",
    status: "completed",
    exitCode: 0,
    detail: "fixture command",
    meta: meta("live-tool-a-done", "turn-observed-live", 8, { itemId: "item-bash-a" }),
  },
  {
    kind: "tool_update",
    id: "item-bash-b",
    name: "Bash",
    output: "",
    status: "inProgress",
    detail: "fixture follow-up",
    meta: meta("live-tool-b-running", "turn-observed-live", 9, { itemId: "item-bash-b" }),
  },
  { kind: "tool", name: "__thinking", meta: meta("live-thinking-marker", "turn-observed-live", 10) },
  {
    kind: "tool_update",
    id: "item-bash-b",
    name: "Bash",
    output: "fixture output",
    status: "completed",
    exitCode: 0,
    detail: "fixture follow-up",
    meta: meta("live-tool-b-done", "turn-observed-live", 11, { itemId: "item-bash-b" }),
  },
  { kind: "delta", text: "fixture ", meta: meta("live-delta-4", "turn-observed-live", 12) },
  { kind: "delta", text: "final", meta: meta("live-delta-5", "turn-observed-live", 13) },
  { kind: "text", text: "fixture final answer", meta: meta("live-text-2", "turn-observed-live", 14) },
  { kind: "done", ok: true, result: "", meta: meta("live-done", "turn-observed-live", 15) },
];

/**
 * Captured history shape (source seq 24458–25001, minimized): the history
 * replay has reasoning markers, multiple completed tools, one failed command,
 * an agent activity item that goes running→completed, edits, text and done.
 * The real history's sequence numbers are not monotonic because tool events
 * completed in parallel; this fixture preserves the stored event order while
 * using local monotonic sequence values for deterministic replay assertions.
 */
const codexObservedRichEvents: readonly AgentEvent[] = [
  {
    kind: "user",
    text: "fixture history prompt",
    meta: meta("rich-user", "turn-observed-rich", 1, { messageId: "rich-message" }),
  },
  { kind: "tool", name: "__thinking", meta: meta("rich-thinking-1", "turn-observed-rich", 2) },
  { kind: "text", text: "fixture commentary", meta: meta("rich-text-1", "turn-observed-rich", 3) },
  {
    kind: "tool_update",
    id: "item-read",
    name: "Bash",
    output: "fixture output",
    status: "completed",
    exitCode: 0,
    meta: meta("rich-tool-read", "turn-observed-rich", 4, { itemId: "item-read" }),
  },
  {
    kind: "tool_update",
    id: "item-check",
    name: "Bash",
    output: "fixture output",
    status: "completed",
    exitCode: 0,
    meta: meta("rich-tool-check", "turn-observed-rich", 5, { itemId: "item-check" }),
  },
  {
    kind: "tool_update",
    id: "item-agent",
    name: "agent:activity",
    output: "",
    status: "inProgress",
    meta: meta("rich-agent-running", "turn-observed-rich", 6, { itemId: "item-agent" }),
    agentActivity: {
      tool: "spawnAgent",
      receiverThreadIds: ["child-fixture"],
      agentsStates: { "child-fixture": { status: "running", message: null } },
      activityKind: "interacted",
    },
  },
  {
    kind: "tool_update",
    id: "item-failed",
    name: "Bash",
    output: "fixture failure",
    status: "failed",
    exitCode: 2,
    meta: meta("rich-tool-failed", "turn-observed-rich", 7, { itemId: "item-failed" }),
  },
  {
    kind: "tool_update",
    id: "item-agent",
    name: "agent:activity",
    output: "",
    status: "completed",
    meta: meta("rich-agent-done", "turn-observed-rich", 8, { itemId: "item-agent" }),
    agentActivity: {
      tool: "spawnAgent",
      receiverThreadIds: ["child-fixture"],
      agentsStates: { "child-fixture": { status: "completed", message: null } },
      activityKind: "completed",
    },
  },
  { kind: "tool", name: "__thinking", meta: meta("rich-thinking-2", "turn-observed-rich", 9) },
  {
    kind: "edit",
    files: [{ path: "fixture/file.txt", add: 1, del: 1 }],
    meta: meta("rich-edit", "turn-observed-rich", 10),
  },
  { kind: "text", text: "fixture final response", meta: meta("rich-text-2", "turn-observed-rich", 11) },
  { kind: "done", ok: true, result: "", meta: meta("rich-done", "turn-observed-rich", 12) },
];

/**
 * Derived full lifecycle. Each transition uses a shape present in the
 * observed Codex fixtures above; the combination and the reasoning deltas are
 * synthetic and must not be reported as captured provider output.
 */
const codexCompositeEvents: readonly AgentEvent[] = [
  {
    kind: "user",
    text: "fixture composite prompt",
    meta: meta("composite-user", "turn-derived-composite", 1, { messageId: "composite-message" }),
  },
  { kind: "thinking_delta", text: "fixture reasoning ", meta: meta("composite-think-1", "turn-derived-composite", 2) },
  { kind: "thinking_delta", text: "resumes", meta: meta("composite-think-2", "turn-derived-composite", 3) },
  {
    kind: "tool_update",
    id: "item-read",
    name: "Read",
    output: "",
    status: "running",
    meta: meta("composite-read-running", "turn-derived-composite", 4, { itemId: "item-read" }),
  },
  {
    kind: "tool_update",
    id: "item-search",
    name: "web_search",
    output: "",
    status: "running",
    meta: meta("composite-search-running", "turn-derived-composite", 5, { itemId: "item-search" }),
  },
  {
    kind: "tool_update",
    id: "item-read",
    name: "Read",
    output: "fixture read output",
    status: "completed",
    exitCode: 0,
    meta: meta("composite-read-done", "turn-derived-composite", 6, { itemId: "item-read" }),
  },
  {
    kind: "tool_update",
    id: "item-search",
    name: "web_search",
    output: "fixture search failure",
    status: "failed",
    exitCode: 1,
    meta: meta("composite-search-failed", "turn-derived-composite", 7, { itemId: "item-search" }),
  },
  { kind: "thinking_delta", text: "fixture return thinking", meta: meta("composite-think-3", "turn-derived-composite", 8) },
  { kind: "thinking", text: "fixture return thinking", meta: meta("composite-think-final", "turn-derived-composite", 9) },
  { kind: "delta", text: "fixture streamed ", meta: meta("composite-delta-1", "turn-derived-composite", 10) },
  { kind: "delta", text: "answer", meta: meta("composite-delta-2", "turn-derived-composite", 11) },
  { kind: "text", text: "fixture streamed answer", meta: meta("composite-text", "turn-derived-composite", 12) },
  { kind: "done", ok: true, result: "", meta: meta("composite-done", "turn-derived-composite", 13) },
];

/** Separate terminal failure path, also derived from observed event shapes. */
const codexFailureEvents: readonly AgentEvent[] = [
  {
    kind: "user",
    text: "fixture failure prompt",
    meta: meta("failure-user", "turn-derived-failure", 1, { messageId: "failure-message" }),
  },
  { kind: "thinking_delta", text: "fixture partial reasoning", meta: meta("failure-think", "turn-derived-failure", 2) },
  { kind: "delta", text: "fixture partial answer", meta: meta("failure-delta", "turn-derived-failure", 3) },
  { kind: "error", message: "fixture failure", meta: meta("failure-error", "turn-derived-failure", 4) },
];

/**
 * Captured Claude run (`/tmp/atelier-live-claude-1789007345043.jsonl`,
 * minimized): heartbeat while waiting, streamed narration, ephemeral
 * drafting, one Read running→completed, then streamed final text and done.
 * The original user/tool strings and native item id are genericized here.
 */
const claudeObservedLiveEvents: readonly AgentEvent[] = [
  {
    kind: "user",
    text: "fixture Claude prompt",
    meta: meta("claude-user", "turn-observed-claude", 1, {
      provider: "claude",
      messageId: "claude-message",
    }),
  },
  {
    kind: "heartbeat",
    elapsedMs: 1200,
    tokens: 0,
    meta: meta("claude-heartbeat-wait", "turn-observed-claude", 2, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "delta",
    text: "fixture Claude ",
    meta: meta("claude-delta-1", "turn-observed-claude", 3, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "delta",
    text: "narration",
    meta: meta("claude-delta-2", "turn-observed-claude", 4, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "text",
    text: "fixture Claude narration\n",
    meta: meta("claude-text-1", "turn-observed-claude", 5, { provider: "claude" }),
  },
  {
    kind: "drafting",
    tool: "Read",
    meta: meta("claude-drafting-read", "turn-observed-claude", 6, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "tool_update",
    id: "item-claude-read",
    name: "Read",
    output: "",
    status: "running",
    detail: "fixture file",
    meta: meta("claude-read-running", "turn-observed-claude", 7, {
      provider: "claude",
      itemId: "item-claude-read",
    }),
  },
  {
    kind: "tool_update",
    id: "item-claude-read",
    name: "Read",
    output: "fixture file contents",
    status: "completed",
    exitCode: 0,
    detail: "fixture file",
    meta: meta("claude-read-done", "turn-observed-claude", 8, {
      provider: "claude",
      itemId: "item-claude-read",
    }),
  },
  {
    kind: "delta",
    text: "fixture final ",
    meta: meta("claude-delta-3", "turn-observed-claude", 9, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "delta",
    text: "answer",
    meta: meta("claude-delta-4", "turn-observed-claude", 10, {
      provider: "claude",
      durable: false,
    }),
  },
  {
    kind: "text",
    text: "fixture Claude final answer",
    meta: meta("claude-text-2", "turn-observed-claude", 11, { provider: "claude" }),
  },
  {
    kind: "done",
    ok: true,
    result: "",
    meta: meta("claude-done", "turn-observed-claude", 12, { provider: "claude" }),
  },
];

export const codexObservedLive: StreamReplayFixture = {
  id: "codex-observed-live",
  provider: "codex",
  provenance: "observed",
  sourceTrace: "/tmp/atelier-methods-stream.jsonl",
  turnId: "turn-observed-live",
  events: codexObservedLiveEvents,
  frames: frameAt(codexObservedLiveEvents, 2, 6, 9, 11, 15),
  checkpoints: [
    { after: 2, label: "started is ephemeral", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 6, label: "first response text", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 9, label: "second Bash starts", phase: "prework", activeState: "activity", statusKind: "action" },
    { after: 11, label: "tools return to thinking marker", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 15, label: "terminal done", phase: "completed", activeState: null },
  ],
};

export const codexObservedRich: StreamReplayFixture = {
  id: "codex-observed-rich",
  provider: "codex",
  provenance: "observed",
  sourceTrace: "/tmp/atelier-methods-stream.jsonl",
  turnId: "turn-observed-rich",
  events: codexObservedRichEvents,
  frames: frameAt(codexObservedRichEvents, 3, 6, 8, 10, 12),
  checkpoints: [
    { after: 3, label: "reasoning marker and commentary", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 6, label: "agent child is running", phase: "prework", activeState: "activity", statusKind: "action" },
    { after: 8, label: "agent child completed; failed command remains detail", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 12, label: "history terminal", phase: "completed", activeState: null },
  ],
};

export const codexComposite: StreamReplayFixture = {
  id: "codex-derived-composite",
  provider: "codex",
  provenance: "derived",
  sourceTrace: "/tmp/atelier-methods-stream.jsonl (event shapes only)",
  turnId: "turn-derived-composite",
  events: codexCompositeEvents,
  frames: frameAt(codexCompositeEvents, 1, 3, 5, 7, 9, 11, 13),
  checkpoints: [
    { after: 1, label: "empty active turn", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 3, label: "reasoning deltas", phase: "prework", activeState: "reasoning", statusKind: "thinking" },
    { after: 5, label: "two parallel tools running", phase: "prework", activeState: "activity", statusKind: "action" },
    { after: 7, label: "one completed and one failed tool", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 9, label: "return to reasoning", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 11, label: "answer streaming", phase: "final_answer", activeState: "answering", statusKind: "writing" },
    { after: 13, label: "completed", phase: "completed", activeState: null },
  ],
};

export const codexFailure: StreamReplayFixture = {
  id: "codex-derived-failure",
  provider: "codex",
  provenance: "derived",
  sourceTrace: "/tmp/atelier-methods-stream.jsonl (event shapes only)",
  turnId: "turn-derived-failure",
  events: codexFailureEvents,
  frames: frameAt(codexFailureEvents, 1, 2, 3, 4),
  checkpoints: [
    { after: 3, label: "partial answer before terminal error", phase: "prework", activeState: "answering", statusKind: "writing" },
    { after: 4, label: "error freezes partial answer", phase: "failed", activeState: null, statusKind: "failed" },
  ],
};

export const claudeObservedLive: StreamReplayFixture = {
  id: "claude-observed-live",
  provider: "claude",
  provenance: "observed",
  sourceTrace: "/tmp/atelier-live-claude-1789007345043.jsonl",
  turnId: "turn-observed-claude",
  events: claudeObservedLiveEvents,
  frames: frameAt(claudeObservedLiveEvents, 2, 5, 8, 12),
  checkpoints: [
    { after: 2, label: "heartbeat waiting is ephemeral", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 5, label: "Claude narration is streaming", phase: "prework", activeState: "thinking", statusKind: "thinking" },
    { after: 7, label: "Read starts after drafting", phase: "prework", activeState: "activity", statusKind: "action" },
    { after: 10, label: "Claude resumes final streaming", phase: "final_answer", activeState: "answering", statusKind: "writing" },
    { after: 12, label: "Claude done", phase: "completed", activeState: null },
  ],
};

export const streamReplayFixtures = [
  codexObservedLive,
  codexObservedRich,
  codexComposite,
  codexFailure,
  claudeObservedLive,
] as const;

/** Backward-compatible name for callers that started with the Codex-only set. */
export const codexStreamReplayFixtures = streamReplayFixtures;
