import { useEffect, useMemo } from "react";
import { useThreadEvents } from "../../hooks/useThreadEvents";
import type { ThreadEventStore } from "../../lib/threadEventStore";
import { AgentDetailPanel, agentsFromActions, agentWithTranscriptState, isAgentActivityAction, type AgentDisplay } from "./AgentActivity";

export default function ThreadAgent({ store, agent, parentThreadId, parentWorkingSince, ws, visible, onClose }: {
  store: ThreadEventStore;
  agent: AgentDisplay;
  parentThreadId: string | null;
  parentWorkingSince: number | null;
  ws: WebSocket | null;
  visible: boolean;
  onClose: () => void;
}) {
  const parent = useThreadEvents(store, visible ? parentThreadId : null);
  const events = useThreadEvents(store, visible ? agent.threadId : null);
  const current = useMemo(() => {
    const refreshed = agentsFromActions(parent.filter(isAgentActivityAction));
    return agentWithTranscriptState(refreshed.find(a => a.threadId === agent.threadId) ?? agent, events);
  }, [parent, events, agent]);
  useEffect(() => {
    if (!visible || !parentThreadId || ws?.readyState !== WebSocket.OPEN) return;
    const request = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
        type: "getAgentHistory", parentThreadId, agentThreadId: agent.threadId,
      }));
    };
    request();
    // A stale working status alone must not keep rereading an old transcript.
    if (current.status !== "working" || parentWorkingSince == null) return;
    const timer = window.setInterval(request, 2500);
    return () => window.clearInterval(timer);
  }, [visible, parentThreadId, agent.threadId, current.status, parentWorkingSince, ws]);
  return <AgentDetailPanel agent={current} events={events} embedded onClose={onClose} />;
}
