// Banc visuel déterministe du Quick Ask. Activé uniquement par
// VITE_VISUAL_BENCH=1 + #qabench; aucun sidecar requis.
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../styles/shadcn.css";
import "../App.css";
import QuickAsk from "./QuickAsk";
import type { ProviderInfo } from "../lib/providers";

const PROVIDERS: ProviderInfo[] = [
  { id: "claude", label: "Claude", kind: "cli", version: "5", ok: true, defaultModel: "claude-fable-5", models: ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"], efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "codex", label: "Codex", kind: "cli", version: "0.145", ok: true, defaultModel: "gpt-5.5", models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1-codex"], efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "grok", label: "Grok", kind: "cli", version: "4.5", ok: true, defaultModel: "grok-4.5", models: ["grok-4.5", "grok-composer-2.5-fast"], efforts: ["minimal", "low", "medium", "high", "xhigh", "max"] },
];

export function QuickAskBench() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      <QuickAsk
        open
        minimized={false}
        draft=""
        providers={PROVIDERS}
        defaultModels={{ grok: "grok-4.5" }}
        defaultEfforts={{ grok: "high" }}
        onMinimize={() => {}}
        onClose={() => {}}
        onInject={() => {}}
        onPromote={() => {}}
      />
    </div>
  );
}
