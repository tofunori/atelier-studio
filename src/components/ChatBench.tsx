// ChatBench (plan 020) — banc de captures DÉTERMINISTES du fil de chat et du
// composer. Monté par main.tsx sur #chatbench[-état][-light] ; jamais dans le
// parcours normal (chunk lazy). Rend le VRAI composant Chat avec des fixtures
// figées : aucun sidecar requis.
// États : rich (défaut) · running · stream · activityparity · slottransition · thinking · agents · error · contexts · markdown.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/typeset.css";
import "../styles/primitives.css";
import "../App.css";
import Chat from "./Chat";
import type { AgentEvent } from "../lib/ws";
import type { ProviderInfo } from "../lib/providers";
import type { QueuedTurn } from "../lib/chatDraftStore";

const NOW = Date.now();
const ts = (offsetS: number) => NOW - offsetS * 1000;
const noop = () => {};

const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude", label: "Claude Code", kind: "cli", version: "2.1.0", ok: true,
    models: ["claude-fable-5", "claude-sonnet-5"], defaultModel: "claude-fable-5",
    efforts: ["low", "medium", "high"],
    capabilities: {
      resume: true, steering: true, queue: true, goals: false, tools: true,
      toolOutput: true, permissions: true,
      permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
    },
  },
  {
    id: "codex", label: "Codex", kind: "cli", version: "0.142.5", ok: true,
    models: ["gpt-5.5"], defaultModel: "gpt-5.5", efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: true, queue: true, goals: true, tools: true, toolOutput: true, permissions: true, permissionModes: ["default"] },
  },
];

function tool(id: string, name: string, detail: string, output: string, dur: number, offsetS: number): AgentEvent {
  return {
    kind: "tool_update", id, name, detail, output, status: "completed",
    input: { file_path: detail }, source: null, durationMs: dur, ts: ts(offsetS),
  } as AgentEvent;
}

const RICH: AgentEvent[] = [
  { kind: "user", text: "Reproduis la validation Williamson & Menounos sur les régions RGI ouest, puis mets à jour la figure 3.", ts: ts(400), label: "albedo_trends.csv · fig3_spatial.svg" } as AgentEvent,
  { kind: "thinking", text: "Je dois d'abord relire la méthodologie de W&M 2021, vérifier les seuils par région, puis recalculer les tendances avant de régénérer la figure.", ts: ts(395) } as AgentEvent,
  tool("t1", "Read", "analysis/albedo_trends.py", "240 lignes", 900, 390),
  tool("t2", "Bash", "python analysis/albedo_trends.py --regions west", "Tendance moyenne : −0,35 %/an (vs −0,33 attendu)", 8200, 380),
  tool("t3", "Edit", "manuscrit/fig3_spatial.svg", "Figure régénérée", 1400, 370),
  { kind: "edit", projectRoot: "/tmp/bench", files: [{ path: "manuscrit/fig3_spatial.svg", add: 12, del: 4 }], ts: ts(365) } as AgentEvent,
  {
    kind: "text",
    text: "La validation reproduit le résultat de Williamson & Menounos : **−0,35 %/an** sur les régions ouest (écart +0,02 attribuable au masque de neige transitoire).\n\n| Région | Tendance | n |\n|---|---|---|\n| Coast | −0,41 | 214 |\n| Rockies | −0,29 | 187 |\n\nLa figure 3 a été régénérée avec les nouvelles pentes.",
    ts: ts(360),
  } as AgentEvent,
  {
    kind: "done", ok: true, result: "Validation terminée.", projectRoot: "/tmp/bench",
    filesChanged: ["manuscrit/fig3_spatial.svg", "analysis/albedo_trends.py"],
    usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 }, ts: ts(355),
  } as AgentEvent,
];

const RUNNING: AgentEvent[] = [
  { kind: "user", text: "Analyse la tendance d'albédo 2000–2025 sur les 11 régions.", ts: ts(272) } as AgentEvent,
  { kind: "started", ts: ts(271) } as AgentEvent,
  {
    kind: "tool_update", id: "r1", name: "Bash", detail: "python analysis/albedo_trends.py --all",
    output: "", status: "running", input: {}, source: null, ts: ts(180),
  } as AgentEvent,
  { kind: "streaming", text: "Je lance le calcul des tendances par région. Les premières valeurs pour Coast et Rockies sont cohérentes avec…", ts: ts(10) } as AgentEvent,
];

const THINKING: AgentEvent[] = [
  { kind: "user", text: "Analyse les données locales et prépare une réponse.", ts: ts(20) } as AgentEvent,
  { kind: "started", ts: ts(19) } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

const STREAM: AgentEvent[] = [
  { kind: "user", text: "Inspecte puis corrige le composer.", ts: ts(30) } as AgentEvent,
  { kind: "text", text: "Je commence par lire les composants concernés.", ts: ts(28) } as AgentEvent,
  tool("stream-read", "Read", "src/components/Chat.tsx", "Lecture terminée", 420, 26),
  tool("stream-test", "Bash", "npx vitest run src/components/chat", "38 tests verts", 2100, 24),
  { kind: "text", text: "Le premier contrôle passe. Je vérifie maintenant la présentation active.", ts: ts(20) } as AgentEvent,
  {
    kind: "tool_update", id: "stream-search", name: "Bash", detail: "rg -n active-turn src",
    output: "", status: "running", input: {}, source: null, ts: ts(4),
  } as AgentEvent,
];

const ACTIVITY_PARITY: AgentEvent[] = [
  { kind: "user", text: "Lis le composant puis génère une visualisation de contrôle.", ts: ts(36) } as AgentEvent,
  { kind: "text", text: "Je vérifie d’abord l’état réel du composant et ses tests.", ts: ts(34) } as AgentEvent,
  {
    kind: "tool_update", id: "parity-read", name: "Bash", detail: "pwd && sed -n '1,160p' src/components/Chat.tsx",
    output: "", status: "completed", source: "codex", ts: ts(31),
    input: {
      command: "pwd && sed -n '1,160p' src/components/Chat.tsx",
      commandActions: [
        { type: "unknown", command: "pwd" },
        { type: "read", command: "sed -n '1,160p' src/components/Chat.tsx", name: "Chat.tsx", path: "/repo/src/components/Chat.tsx" },
      ],
    },
  } as AgentEvent,
  { kind: "text", text: "La lecture confirme le chemin de rendu. Je produis maintenant l’aperçu demandé.", ts: ts(25) } as AgentEvent,
  {
    kind: "tool_update", id: "parity-image", name: "image_generation", detail: "Scientific activity timeline",
    output: "", status: "inProgress", source: "codex", ts: ts(4),
    input: { revisedPrompt: "Scientific activity timeline" },
  } as AgentEvent,
  { kind: "thinking_live", text: "Je prépare aussi le libellé final.", ts: ts(2) } as AgentEvent,
];

const SLOT_TRANSITION: AgentEvent[] = [
  { kind: "user", text: "Lis le composant puis poursuis l’analyse.", ts: ts(24) } as AgentEvent,
  { kind: "text", text: "Je vérifie le composant concerné.", ts: ts(22) } as AgentEvent,
  {
    kind: "tool_update", id: "slot-read", name: "Read", detail: "src/components/Chat.tsx",
    output: "", status: "completed", source: "codex", ts: ts(8),
    input: { file_path: "src/components/Chat.tsx" },
  } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

const IMAGE_VIEW: AgentEvent[] = [
  { kind: "user", text: "Inspecte cette capture.", ts: ts(20) } as AgentEvent,
  {
    kind: "tool_update", id: "image-1", name: "view_image", output: "", status: "completed",
    input: {
      paths: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160' viewBox='0 0 240 160'%3E%3Crect width='240' height='160' fill='%23282b31'/%3E%3Crect x='18' y='18' width='204' height='124' rx='10' fill='%23373b43' stroke='%238b929f'/%3E%3Ccircle cx='70' cy='62' r='15' fill='%23aeb6c4'/%3E%3Cpath d='M34 124l48-42 34 28 28-24 62 38' fill='none' stroke='%23d5d9e0' stroke-width='8'/%3E%3C/svg%3E"],
    },
    source: "codex", ts: ts(10),
  } as AgentEvent,
];

const AGENTS: AgentEvent[] = [
  { kind: "user", text: "/recherche Trouve les meilleures pratiques pour nos figures scientifiques.", ts: ts(32) } as AgentEvent,
  { kind: "text", text: "Je sépare la recherche éditoriale, la télédétection et la pile Python, puis je recoupe les résultats.", ts: ts(30) } as AgentEvent,
  {
    kind: "tool_update", id: "spawn-editorial", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: { tool: "spawnAgent", receiverThreadIds: ["agent-editorial"], agentsStates: { "agent-editorial": { status: "running", message: null } }, prompt: "Review editorial figure guidelines", model: "gpt-5.6-codex", reasoningEffort: "high" },
    ts: ts(28),
  } as AgentEvent,
  {
    kind: "tool_update", id: "activity-editorial", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: { tool: "activity", receiverThreadIds: ["agent-editorial"], agentsStates: { "agent-editorial": { status: "running", message: null } }, agentThreadId: "agent-editorial", agentPath: "/root/editorial", activityKind: "started" },
    ts: ts(27),
  } as AgentEvent,
  {
    kind: "tool_update", id: "spawn-remote", name: "agent:spawnAgent", output: "", status: "completed", source: "codex",
    agentActivity: { tool: "spawnAgent", receiverThreadIds: ["agent-remote"], agentsStates: { "agent-remote": { status: "running", message: null } }, prompt: "Review remote sensing figure design", model: "gpt-5.6-codex", reasoningEffort: "high" },
    ts: ts(26),
  } as AgentEvent,
  {
    kind: "tool_update", id: "activity-remote", name: "agent:activity", output: "", status: "inProgress", source: "codex",
    agentActivity: { tool: "activity", receiverThreadIds: ["agent-remote"], agentsStates: { "agent-remote": { status: "running", message: null } }, agentThreadId: "agent-remote", agentPath: "/root/remote_sensing", activityKind: "started" },
    ts: ts(25),
  } as AgentEvent,
  { kind: "tool", name: "__thinking" } as AgentEvent,
];

const ERROR: AgentEvent[] = [
  { kind: "user", text: "Relance l'extraction GEE MOD10A1 pour 2024.", ts: ts(500) } as AgentEvent,
  tool("e1", "Bash", "python extraction_gee_albedo.py --year 2024", "…", 4000, 490),
  tool("e2", "WebFetch", "earthengine.googleapis.com", "429 Too Many Requests", 1200, 480),
  { kind: "error", message: "Quota Earth Engine dépassé (429) — reprise possible après 60 min." } as AgentEvent,
  { kind: "done", ok: false, result: "Interrompu.", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 21000, output: 900, cost: 0.04, turns: 1 }, ts: ts(470) } as AgentEvent,
];

const MARKDOWN: AgentEvent[] = [
  { kind: "user", text: "Montre-moi le pipeline en Mermaid et un extrait du script.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: "Voici le pipeline :\n\n```mermaid\nflowchart LR\n  GEE[GEE MOD10A1] --> CSV[Drive CSV]\n  CSV --> NAS[(NAS DuckDB)]\n  NAS --> FIG[fig3_spatial.svg]\n```\n\nEt l'extrait :\n\n```python\ndef trend(df, region):\n    slope = theilslopes(df.albedo, df.year)\n    return slope[0] * 100  # %/an\n```",
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], usage: { context: 12000, output: 640, cost: 0.02, turns: 1 }, ts: ts(290) } as AgentEvent,
];

const NO_HORIZONTAL_SCROLL: AgentEvent[] = [
  { kind: "user", text: "Explique le pipeline scientifique complet.", ts: ts(300) } as AgentEvent,
  {
    kind: "text",
    text: [
      "### Ce que la figure montre",
      "",
      "| Panneau | Contenu |",
      "| --- | --- |",
      "| a | Somme domaine (11 régions) de l’équivalent de fonte potentiel, en Gt w.e./an, avec une description volontairement longue |",
      "| b | Intensité régionale (mm w.e./an, moyenne pondérée par aire glacier) : 22 points scientifiques |",
      "",
      "$$",
      "\\mathrm{RF}=-\\Delta\\alpha_{fire,JJA}\\times SW\\qquad[\\mathrm{W\\,m^{-2}}]",
      "$$",
      "",
      "$$",
      "\\mathrm{melt}=\\mathrm{RF}\\times92\\times86400/L_f\\qquad[\\mathrm{mm\\,w.e.}]",
      "$$",
      "",
      "```python",
      "result = compute_fire_melt_budget_for_every_region_and_year_with_a_deliberately_long_identifier(dataset)",
      "```",
    ].join("\n"),
    ts: ts(295),
  } as AgentEvent,
  { kind: "done", ok: true, result: "ok", projectRoot: "/tmp/bench", filesChanged: [], ts: ts(290) } as AgentEvent,
];

const CONTEXTS_ATTACHMENTS = [
  { name: "albedo_trends.csv", lines: null, text: "ctx-1", kind: "file" as const },
  { name: "fig3_spatial.svg", lines: null, text: "ctx-2", kind: "file" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.4-9", text: "ctx-3", kind: "quote" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.12", text: "ctx-4", kind: "quote" as const },
  { name: "notes_reunion.md", lines: "40", text: "ctx-5", kind: "paste" as const },
  { name: "ch3_methodologie.tex", lines: null, text: "ctx-6", kind: "file" as const },
];

const QUEUED_TURNS: QueuedTurn[] = [
  {
    id: "queue-1", prompt: "Compare ensuite les résultats avec la version précédente.",
    provider: "claude", model: "claude-fable-5", effort: "medium", permissionMode: "acceptEdits",
    attachments: [], webSearch: false, additionalDirectories: [], pluginSkills: [], autoReview: null, createdAt: ts(8),
  },
  {
    id: "queue-2", prompt: "Prépare finalement une légende courte pour la figure 3.",
    provider: "claude", model: "claude-fable-5", effort: "medium", permissionMode: "acceptEdits",
    attachments: [], webSearch: false, additionalDirectories: [], pluginSkills: [], autoReview: null, createdAt: ts(4),
  },
];

type BenchState = {
  events: AgentEvent[];
  workingSince: number | null;
  attachments: typeof CONTEXTS_ATTACHMENTS;
  usage: { context: number; output: number; cost: number | null; turns: number | null } | null;
  queuedTurns?: QueuedTurn[];
  draftText?: string;
};

const STATES: Record<string, BenchState> = {
  rich: { events: RICH, workingSince: null, attachments: [], usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 } },
  running: { events: RUNNING, workingSince: ts(272), attachments: [], usage: { context: 21000, output: 300, cost: null, turns: 1 } },
  stream: { events: STREAM, workingSince: ts(30), attachments: [], usage: { context: 18500, output: 420, cost: null, turns: 1 } },
  activityparity: { events: ACTIVITY_PARITY, workingSince: ts(36), attachments: [], usage: { context: 16200, output: 280, cost: null, turns: 1 } },
  slottransition: { events: SLOT_TRANSITION, workingSince: ts(24), attachments: [], usage: { context: 15100, output: 210, cost: null, turns: 1 } },
  thinking: { events: THINKING, workingSince: ts(20), attachments: [], usage: { context: 14000, output: 0, cost: null, turns: 1 } },
  image: { events: IMAGE_VIEW, workingSince: ts(20), attachments: [], usage: { context: 14000, output: 0, cost: null, turns: 1 } },
  agents: { events: AGENTS, workingSince: ts(32), attachments: [], usage: { context: 22000, output: 420, cost: null, turns: 1 } },
  error: { events: ERROR, workingSince: null, attachments: [], usage: null },
  contexts: { events: MARKDOWN.slice(0, 1), workingSince: null, attachments: CONTEXTS_ATTACHMENTS, usage: null },
  markdown: { events: MARKDOWN, workingSince: null, attachments: [], usage: null },
  overflow: { events: NO_HORIZONTAL_SCROLL, workingSince: null, attachments: [], usage: null },
  queue: {
    events: RUNNING, workingSince: ts(272), attachments: [],
    usage: { context: 21000, output: 300, cost: null, turns: 1 },
    queuedTurns: QUEUED_TURNS,
    draftText: "Ajoute aussi une vérification des unités.",
  },
  goal: {
    events: [...RICH, { kind: "goal", goal: {
      objective: "Reprendre l'analyse des tendances régionales et produire une figure 3 vérifiée pour le manuscrit",
      status: "blocked", tokenBudget: 120000, tokensUsed: 34800, timeUsedSeconds: 305,
    }, ts: ts(2) } as AgentEvent],
    workingSince: null, attachments: [], usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 },
  },
};

export function ChatBench() {
  const hash = window.location.hash;
  const light = hash.includes("-light");
  const key = Object.keys(STATES).find((k) => hash.includes(`-${k}`)) ?? "rich";
  const st = STATES[key];

  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--fg)" }}>
      <Chat
        events={st.events}
        workingSince={st.workingSince}
        commands={[{ name: "recherche", source: "user" }]}
        files={[]} recentFiles={[]} zoteroItems={[]}
        injectText={null} onInjected={noop}
        draftText={st.draftText}
        queuedTurns={st.queuedTurns}
        onSteerQueued={noop}
        onEditQueued={noop}
        onRemoveQueued={noop}
        onReorderQueued={noop}
        attachments={st.attachments}
        onRemoveAttachment={noop}
        onQuote={noop}
        threadId="bench-thread"
        threadTitle="Validation W&M — régions ouest"
        threadProvider={key === "goal" || key === "agents" ? "codex" : "claude"}
        onPasteImage={noop} onPasteText={noop} onStop={noop}
        layout="chat" onToggleExpand={noop}
        usage={st.usage}
        onRevert={noop} onFork={noop} onEditSend={noop}
        onNewChat={noop} onOpenProject={noop}
        highlights={[]}
        defaults={{ defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "acceptEdits" }}
        providers={PROVIDERS}
        pins={[]} onStylePin={noop} onTogglePin={noop}
        disabled={false} onSubmit={noop}
        onGoal={noop}
      />
    </div>
  );
}
