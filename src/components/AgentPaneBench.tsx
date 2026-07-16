// Fixture visuelle déterministe de l'ouverture d'un sous-agent dans le panneau
// Atelier. Activée uniquement par #agentbench avec VITE_VISUAL_BENCH=1.
import { useState } from "react";
import "../styles/tokens.css";
import "../styles/shadcn.css";
import "../styles/primitives.css";
import "../App.css";
import AtelierPane from "./AtelierPane";
import {
  AgentActivityGroup,
  type AgentDisplay,
  type AgentToolAction,
} from "./chat/AgentActivity";

const ACTIONS: AgentToolAction[] = [
  {
    kind: "tool_update", id: "spawn-editorial", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: {
      tool: "spawnAgent", receiverThreadIds: ["agent-editorial"],
      agentsStates: { "agent-editorial": { status: "running", message: null } },
      prompt: "Review editorial figure guidelines", model: "gpt-5.6-codex", reasoningEffort: "high",
    }, ts: 1,
  },
  {
    kind: "tool_update", id: "activity-editorial", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: {
      tool: "activity", receiverThreadIds: ["agent-editorial"],
      agentsStates: { "agent-editorial": { status: "running", message: null } },
      agentThreadId: "agent-editorial", agentPath: "/root/editorial", activityKind: "started",
    }, ts: 2,
  },
  {
    kind: "tool_update", id: "spawn-remote", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: {
      tool: "spawnAgent", receiverThreadIds: ["agent-remote"],
      agentsStates: { "agent-remote": { status: "running", message: null } },
      prompt: "Review remote sensing figure design", model: "gpt-5.6-codex", reasoningEffort: "high",
    }, ts: 3,
  },
  {
    kind: "tool_update", id: "activity-remote", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: {
      tool: "activity", receiverThreadIds: ["agent-remote"],
      agentsStates: { "agent-remote": { status: "running", message: null } },
      agentThreadId: "agent-remote", agentPath: "/root/remote_sensing", activityKind: "started",
    }, ts: 4,
  },
];

const TRANSCRIPT = [
  { kind: "text" as const, text: "Je vérifie les recommandations éditoriales et les contraintes statistiques des figures.", ts: 5 },
  { kind: "thinking" as const, text: "Je prépare une synthèse exploitable dans R…", ts: 6 },
];

export function AgentPaneBench() {
  const [agent, setAgent] = useState<AgentDisplay | null>(null);
  const [activeTab, setActiveTab] = useState("gallery");
  const openAgent = (next: AgentDisplay) => {
    setAgent(next);
    setActiveTab(`agent:${next.threadId}`);
  };
  const closeAgent = () => {
    setAgent(null);
    setActiveTab("gallery");
  };

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(380px, 44%)", background: "var(--bg)" }}>
      <main style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, padding: 48, borderRight: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 650 }}>
          <div className="work-row"><span className="spin" /> Travaille depuis 38 s</div>
          <p className="agent-pane-bench-copy">Je sépare la recherche éditoriale, la télédétection et la pile Python, puis je recoupe les résultats.</p>
          <AgentActivityGroup actions={ACTIONS} onOpenAgent={openAgent} />
          <div className="thinking-live" style={{ marginTop: 30 }}>Thinking</div>
        </div>
      </main>
      <div className="atelier-host">
        <AtelierPane
          url=""
          projectRoot="/tmp/agent-bench"
          activeThreadId="parent-bench"
          ws={null}
          files={[]}
          onOpenFile={() => {}}
          onPinTab={() => {}}
          onColorTab={() => {}}
          onReorderTabs={() => {}}
          tabs={[]}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onCloseTab={() => {}}
          reloadKey={0}
          showExplorer={false}
          recentFiles={[]}
          onOpenExplorer={() => {}}
          layout="split"
          onToggleExpand={() => {}}
          agent={agent}
          agentEvents={agent ? TRANSCRIPT : []}
          onCloseAgent={closeAgent}
        />
      </div>
    </div>
  );
}
