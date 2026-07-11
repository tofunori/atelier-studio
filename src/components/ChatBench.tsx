// ChatBench (plan 020) — banc de captures DÉTERMINISTES du fil de chat et du
// composer. Monté par main.tsx sur #chatbench[-état][-light] ; jamais dans le
// parcours normal (chunk lazy). Rend le VRAI composant Chat avec des fixtures
// figées : aucun sidecar requis.
// États : rich (défaut) · running · error · contexts · markdown.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import Chat from "./Chat";
import type { AgentEvent } from "../lib/ws";
import type { ProviderInfo } from "../lib/providers";

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

const CONTEXTS_ATTACHMENTS = [
  { name: "albedo_trends.csv", lines: null, text: "ctx-1", kind: "file" as const },
  { name: "fig3_spatial.svg", lines: null, text: "ctx-2", kind: "file" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.4-9", text: "ctx-3", kind: "quote" as const },
  { name: "williamson_menounos_2021_supplementary_materials.pdf", lines: "p.12", text: "ctx-4", kind: "quote" as const },
  { name: "notes_reunion.md", lines: "40", text: "ctx-5", kind: "paste" as const },
  { name: "ch3_methodologie.tex", lines: null, text: "ctx-6", kind: "file" as const },
];

const STATES: Record<string, { events: AgentEvent[]; workingSince: number | null; attachments: typeof CONTEXTS_ATTACHMENTS; usage: { context: number; output: number; cost: number | null; turns: number | null } | null }> = {
  rich: { events: RICH, workingSince: null, attachments: [], usage: { context: 84200, output: 8120, cost: 0.42, turns: 3 } },
  running: { events: RUNNING, workingSince: ts(272), attachments: [], usage: { context: 21000, output: 300, cost: null, turns: 1 } },
  error: { events: ERROR, workingSince: null, attachments: [], usage: null },
  contexts: { events: MARKDOWN.slice(0, 1), workingSince: null, attachments: CONTEXTS_ATTACHMENTS, usage: null },
  markdown: { events: MARKDOWN, workingSince: null, attachments: [], usage: null },
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
        attachments={st.attachments}
        onRemoveAttachment={noop}
        onQuote={noop}
        threadId="bench-thread"
        threadTitle="Validation W&M — régions ouest"
        threadProvider={key === "goal" ? "codex" : "claude"}
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
