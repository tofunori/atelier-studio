import { useEffect, useState } from "react";
import AssistantUiChat, { type AssistantUiChatProps } from "./AssistantUiChat";
import type { DraftAttachment, QueuedTurn } from "../lib/chatDraftStore";
import type { AgentEvent } from "../lib/ws";
import { codexObservedLive } from "../lib/chat/streamReplayFixtures";
import { CONSIGNES_LIVREES, type ConsigneDuFil } from "../lib/consignes";

const noop = () => {};
/** Exercises the production adapter against explicitly simulated native callbacks. */
export function AssistantUiHostBench() {
  const [events, setEvents] = useState<AgentEvent[]>([...codexObservedLive.events]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [consigne, setConsigne] = useState<ConsigneDuFil | null>(null);
  const [queue, setQueue] = useState<QueuedTurn[]>([]);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [scenario, setScenario] = useState("idle");
  const [mode, setMode] = useState<"queue" | "steer">("queue");
  const [notice, setNotice] = useState("Prototype : envois simulés, aucun agent lancé.");
  useEffect(() => {
    const answered = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.threadId !== "assistant-ui-host-bench" || detail?.requestId !== "bench-approval") return;
      setNotice(`Réponse simulée · ${JSON.stringify(detail.response)}`);
      setEvents(current => current.map(item => item.kind === "interaction" && item.requestId === detail.requestId
        ? { ...item, state: "answered", answerSummary: "Réponse enregistrée dans le prototype" } : item));
    };
    window.addEventListener("interaction-answer", answered);
    return () => window.removeEventListener("interaction-answer", answered);
  }, []);
  const changeScenario = (next: string) => {
    setScenario(next);
    setQueue([]);
    setRunningSince(next === "idle" ? null : Date.now());
    setEvents(next === "idle" ? [...codexObservedLive.events] : [
      { kind: "user", text: "Vérifie les fichiers du projet.", ts: Date.now() },
      ...(next === "approval" ? [{ kind: "interaction" as const, requestId: "bench-approval", interactionType: "approval" as const,
        title: "Autoriser la lecture du fichier ?", detail: "Lire results_en.tex", state: "pending" as const, ts: Date.now() }]
        : next === "thinking" ? [
          { kind: "tool_update" as const, id: "bench-read", name: "Read", input: { path: "results_en.tex" }, output: "Lecture terminée", status: "completed" as const },
          { kind: "tool" as const, name: "__thinking" },
          { kind: "thinking_progress" as const, count: 5 },
        ] : [{ kind: "text" as const, text: "Je vérifie les fichiers.", ts: Date.now() }]),
    ]);
  };
  const props: AssistantUiChatProps = {
    events, workingSince: runningSince, threadId: "assistant-ui-host-bench", threadTitle: "Vérification des résultats",
    commands: [{ name: "review", source: "Atelier" }, { name: "redaction-article", source: "Skill" }],
    files: ["manuscrit/results_en.tex", "manuscrit/methods_en.tex"], recentFiles: ["manuscrit/results_en.tex"], zoteroItems: [],
    draftText: draft, onDraftTextChange: setDraft, injectText: null, onInjected: noop,
    attachments, onRemoveAttachment: index => setAttachments(items => items.filter((_, i) => i !== index)),
    onRestoreAttachment: (attachment, index) => setAttachments(items => [...items.slice(0, index), attachment, ...items.slice(index)]),
    onAttachPath: path => setAttachments(items => [...items, { name: path.split("/").pop()!, path, text: path, lines: null, kind: "file" }]),
    onPasteImage: noop, onPasteText: noop, onQuote: noop, onStop: () => setRunningSince(null),
    onFork: () => setNotice("Prototype : ouverture d’une branche demandée."),
    onRevert: noop, onEditSend: () => setNotice("Prototype : modification du message demandée."),
    onNewChat: () => setEvents([]), onOpenProject: noop, layout: "chat", onToggleExpand: noop,
    pins: [], highlights: [], onStylePin: noop, onTogglePin: () => setNotice("Prototype : épinglage demandé."),
    usage: { context: 12500, output: 1800, cost: null, turns: 1, window: 200000 },
    consigneDuFil: consigne, onChoisirConsigne: setConsigne,
    followUpMode: mode, onFollowUpModeChange: setMode, queuedTurns: queue,
    onEditQueued: id => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return;
      setDraft(item.prompt);
      setQueue(current => current.filter(entry => entry.id !== id));
    },
    defaults: { defaultProvider: "codex", defaultModel: { codex: "gpt-6-astra", claude: "claude-fable-5-1" },
      defaultEffort: { codex: "medium", claude: "medium" }, defaultPermissionMode: "default", consignes: CONSIGNES_LIVREES },
    providers: [
      { id: "codex", label: "Codex", kind: "cli", version: null, ok: true, models: ["gpt-6-astra"], defaultModel: "gpt-6-astra", efforts: ["low", "medium", "high"], capabilities: { permissionModes: ["default", "acceptEdits", "bypassPermissions", "plan"] } },
      { id: "claude", label: "Claude", kind: "cli", version: null, ok: true, models: ["claude-fable-5-1"], defaultModel: "claude-fable-5-1", efforts: ["low", "medium", "high"], capabilities: { permissionModes: ["default", "acceptEdits", "bypassPermissions", "plan"] } },
    ],
    disabled: false,
    onSubmit: (text, provider, model, effort, permission, followUp, fast, files) => {
      setNotice(`Envoi simulé · ${provider} · ${model} · ${effort} · ${permission} · ${followUp} · ${files?.length ?? 0} pièce(s) jointe(s)${fast ? " · Fast" : ""}`);
      setDraft("");
      setAttachments([]);
      if (runningSince !== null && followUp === "queue") {
        setQueue(current => [...current, { id: crypto.randomUUID(), prompt: text, provider, model, effort, permissionMode: permission,
          fastMode: fast ?? false, attachments: files ?? [], webSearch: false, additionalDirectories: [], pluginSkills: [], autoReview: null, createdAt: Date.now() }]);
        return;
      }
      setEvents(current => [...current, { kind: "user", text, ts: Date.now() }, { kind: "text", text: "Message reçu dans le prototype. Aucun agent n’a été lancé.", ts: Date.now() }, { kind: "done", ok: true, result: "", ts: Date.now() }]);
    },
  };
  return <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <label style={{ padding: "0 12px", fontSize: 12 }}>État simulé · <select aria-label="État du raccordement" value={scenario} onChange={event => changeScenario(event.target.value)}>
      <option value="idle">Terminé</option><option value="running">En cours</option><option value="thinking">Réflexion sans texte fourni</option><option value="approval">Demande d’autorisation</option>
    </select></label>
    <p role="status" style={{ padding: "0 12px", fontSize: 12 }}>{notice}</p>
    <div style={{ flex: 1, minHeight: 0 }}><AssistantUiChat {...props} /></div>
  </div>;
}
