// Fenêtres de contexte connues (tokens) — source de vérité pour l'anneau UI.
// Grok 4.5 : docs.x.ai/developers/models/grok-4.5 → 500_000 (2026-07).
// Les providers qui n'y figurent pas tombent sur le fallback front (200k / 1M).
const CONTEXT_WINDOWS = {
  "grok-4.5": 500_000,
  "grok-4.5-latest": 500_000,
  "grok-build-latest": 500_000, // alias doc xAI de grok-4.5
};

/** Résout la fenêtre de contexte d'un id de modèle (match exact, puis préfixe). */
export function contextWindowFor(model) {
  if (!model || typeof model !== "string") return null;
  const id = model.trim();
  if (!id) return null;
  if (CONTEXT_WINDOWS[id] != null) return CONTEXT_WINDOWS[id];
  // suffixe Claude « [1m] » géré côté front ; ici match par préfixe stable
  for (const [key, n] of Object.entries(CONTEXT_WINDOWS)) {
    if (id === key || id.startsWith(key + "-") || id.startsWith(key + "@")) return n;
  }
  return null;
}

const PROVIDERS = [
  {
    id: "claude",
    label: "Claude Code",
    bin: "claude",
    defaultModel: "claude-fable-5",
    models: [
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-haiku-4-5-20251001",
    ],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    capabilities: { resume: true, steering: true, queue: true, goals: false, tools: true, toolOutput: true, permissions: true, interactiveInput: false, mcpElicitation: false, durableHistory: false, permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"] },
  },
  {
    id: "codex",
    label: "Codex",
    bin: "codex",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1-codex"],
    efforts: ["low", "medium", "high", "xhigh"],
    capabilities: { resume: true, steering: true, queue: true, goals: true, tools: true, toolOutput: true, permissions: true, interactiveInput: true, mcpElicitation: true, durableHistory: false, permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"] },
  },
  {
    id: "grok",
    label: "Grok",
    bin: "grok",
    defaultModel: "grok-4.5",
    models: ["grok-4.5", "grok-composer-2.5-fast"],
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    capabilities: { resume: true, steering: false, queue: true, goals: false, tools: true, toolOutput: false, permissions: false, interactiveInput: false, mcpElicitation: false, durableHistory: false, permissionModes: [] },
  },
  {
    id: "opencode",
    label: "OpenCode",
    bin: "opencode",
    defaultModel: "openrouter/z-ai/glm-5.2",
    models: [
      "openrouter/z-ai/glm-5.2",
      "openrouter/minimax/minimax-m3",
      "openrouter/tencent/hy3:free",
      "openrouter/qwen/qwen3-coder",
      "openrouter/moonshotai/kimi-k2.7-code",
      "openrouter/cohere/north-mini-code:free",
      "openrouter/openrouter/auto",
    ],
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    capabilities: { resume: true, steering: false, queue: true, goals: false, tools: true, toolOutput: false, permissions: false, interactiveInput: false, mcpElicitation: false, durableHistory: false, permissionModes: [] },
  },
  {
    id: "gemini",
    label: "Gemini",
    bin: "gemini",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: false, queue: true, goals: false, tools: true, toolOutput: false, permissions: false, interactiveInput: false, mcpElicitation: false, durableHistory: false, permissionModes: [] },
  },
];

import { loadApiProviderConfigs } from "./openai_api.mjs";

// Providers API (OpenRouter, GLM, …) déclarés dans APP_DIR/api_providers.json :
// chat pur, pas d'outils ni d'accès projet, resume local via historique rejoué.
function listApiProviders() {
  return loadApiProviderConfigs().map((cfg) => ({
    id: cfg.id,
    label: cfg.label,
    kind: "api",
    bin: null,
    defaultModel: cfg.defaultModel,
    models: [...cfg.models],
    modelReasoning: { ...(cfg.modelReasoning ?? {}) },
    efforts: [],
    capabilities: { resume: true, steering: false, queue: true, goals: false, tools: false, toolOutput: false, permissions: false, interactiveInput: false, mcpElicitation: false, durableHistory: false, permissionModes: [] },
  }));
}

export function listProviders() {
  const builtins = PROVIDERS.map((p) => ({
    ...p,
    kind: "cli",
    models: [...p.models],
    efforts: [...p.efforts],
    capabilities: { ...p.capabilities },
  }));
  const ids = new Set(builtins.map((p) => p.id));
  return [...builtins, ...listApiProviders().filter((p) => !ids.has(p.id))];
}

export function getProvider(id) {
  return listProviders().find((p) => p.id === id) ?? null;
}
