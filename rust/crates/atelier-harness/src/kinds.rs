//! Durable vs ephemeral event kinds (Node harness_events.mjs).

pub const DURABLE_KINDS: &[&str] = &[
    "user",
    "text",
    "thinking",
    "tool",
    "tool_update",
    "edit",
    "todos",
    "goal",
    "interaction",
    "proposed_plan",
    "usage",
    "done",
    "error",
    "permission",
    "agent_message",
];

const EPHEMERAL: &[&str] = &[
    "delta",
    "thinking_delta",
    "thinking_live",
    "stream_set",
    "streaming",
    "started",
    "heartbeat",
];

pub fn is_durable(kind: &str) -> bool {
    DURABLE_KINDS.contains(&kind)
}

pub fn is_ephemeral(kind: &str) -> bool {
    EPHEMERAL.contains(&kind)
}
