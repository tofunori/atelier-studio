import { useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { AssistantUiHostBench } from "./AssistantUiHostBench";
import { AssistantUiData } from "./AssistantUiData";
import { Thread } from "./assistant-ui/elements/thread.aui";
import { ModelSelector } from "./assistant-ui/elements/model-selector.aui";
import { ReasoningEffort } from "./assistant-ui/elements/reasoning-effort";
import { codexObservedLive, claudeObservedLive } from "../lib/chat/streamReplayFixtures";
import { projectAgentEventsToThreadMessages } from "../lib/chat/assistantUiProjection";
import "../styles/assistant-ui.css";

// This is an isolated integration bench. The chat itself is the upstream
// Thread, including its composer, attachments, grouped parts and viewport.
const adapters = {
  attachments: new CompositeAttachmentAdapter([
    new SimpleImageAttachmentAdapter(),
    new SimpleTextAttachmentAdapter(),
  ]),
};

function sampleMessages(stage: string): ThreadMessageLike[] {
  if (stage === "codex-replay" || stage === "claude-replay") {
    const fixture = stage === "codex-replay" ? codexObservedLive : claudeObservedLive;
    return [...projectAgentEventsToThreadMessages(fixture.events, { workingSince: null }).messages];
  }
  if (stage === "empty") return [];
  const content: Exclude<ThreadMessageLike["content"], string>[number][] = [];
  content.push({ type: "reasoning", text: "Je vérifie les fichiers et les résultats disponibles." });
  for (let index = 0; index < 15; index++) {
    content.push({
      type: "tool-call", toolCallId: `sample-tool-${index}`,
      toolName: index % 3 === 0 ? "read_file" : "run_command",
      args: index % 3 === 0 ? { path: `documents/resultats-${index + 1}.tex` } : { command: `verify --section ${index + 1}` },
      ...(stage !== "tools" || index < 14 ? { result: { status: "ok", output: `Vérification ${index + 1} terminée.` } } : {}),
    });
  }
  if (stage === "reasoning") content.push({ type: "reasoning", text: "Les vérifications sont terminées. Je rapproche les résultats avant de rédiger la réponse." });
  if (stage === "done") content.push({ type: "text", text: "Les vérifications sont terminées. Les fichiers concordent avec les résultats conservés.\n\nTu peux ouvrir le groupe d’outils pour consulter chaque vérification." });
  return [
    { id: "sample-user", role: "user", content: "Vérifie les résultats dans les fichiers." },
    { id: "sample-assistant", role: "assistant", content, status: stage === "done" ? { type: "complete", reason: "stop" } : { type: "running" } },
  ];
}

export function AssistantUiBench() {
  const [stage, setStage] = useState("reasoning");
  const [sent, setSent] = useState<ThreadMessageLike[]>([]);
  const [model, setModel] = useState("codex");
  const [effort, setEffort] = useState("medium");
  const [showEffort, setShowEffort] = useState(false);
  const messages = useMemo(() => [...sampleMessages(stage), ...sent], [stage, sent]);
  const runtime = useExternalStoreRuntime({
    convertMessage: (message: ThreadMessageLike) => message,
    messages, isRunning: stage === "tools" || stage === "reasoning", adapters,
    onNew: async (message) => {
      setSent(current => [...current,
        { ...message, id: crypto.randomUUID(), role: "user" },
        { id: crypto.randomUUID(), role: "assistant", content: "Message reçu dans le prototype. Aucun agent n’a été lancé.", status: { type: "complete", reason: "stop" } },
      ]);
    },
    onCancel: async () => setStage("done"),
  });
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
        <span>Prototype · composants assistant-ui officiels · scénario simulé</span>
        <select aria-label="Scénario" value={stage} onChange={event => { setSent([]); setStage(event.target.value); }}>
          <option value="native-host">Raccordement Atelier · envois simulés</option>
          <option value="empty">Nouveau chat</option>
          <option value="tools">15 outils · dernier en cours</option>
          <option value="reasoning">15 outils terminés · réflexion</option>
          <option value="done">Réponse terminée</option>
          <option value="codex-replay">Replay observé · Codex · anonymisé</option>
          <option value="claude-replay">Replay observé · Claude · anonymisé</option>
        </select>
        <label><input type="checkbox" checked={showEffort} onChange={event => setShowEffort(event.target.checked)} /> Reasoning Effort officiel</label>
      </div>
      {showEffort && <div className="assistant-ui-host" style={{ padding: 20 }}>
        <p style={{ fontSize: 12 }}>Element officiel · budgets et consommation simulés pour cette démonstration.</p>
        <ReasoningEffort levels={[{ key: "low", label: "Low", budget: 1024 }, { key: "medium", label: "Medium", budget: 4096 }, { key: "high", label: "High", budget: 8192 }]} selectedKey={effort} spent={640} onSelect={setEffort} />
      </div>}
      {stage === "native-host" ? <AssistantUiHostBench /> : <div className="assistant-ui-host" style={{ flex: 1, minHeight: 0 }}>
        <AssistantRuntimeProvider runtime={runtime}>
          <AssistantUiData />
          <Thread composerControls={<ModelSelector models={[{ id: "codex", name: "Codex" }, { id: "claude", name: "Claude" }]} value={model} onValueChange={setModel} variant="ghost" size="sm" />} />
        </AssistantRuntimeProvider>
      </div>}
    </div>
  );
}
