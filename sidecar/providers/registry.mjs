const PROVIDERS = [
  {
    id: "claude",
    label: "Claude Code",
    bin: "claude",
    defaultModel: "claude-fable-5",
    models: [
      "claude-fable-5",
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-haiku-4-5",
    ],
    efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: true, goals: false },
  },
  {
    id: "codex",
    label: "Codex",
    bin: "codex",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1-codex"],
    efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: true, goals: true },
  },
  {
    id: "grok",
    label: "Grok",
    bin: "grok",
    defaultModel: "grok-4.5",
    models: ["grok-4.5", "grok-composer-2.5-fast"],
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    capabilities: { resume: true, steering: false, goals: false },
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
    capabilities: { resume: true, steering: false, goals: false },
  },
  {
    id: "gemini",
    label: "Gemini",
    bin: "gemini",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    efforts: ["low", "medium", "high"],
    capabilities: { resume: true, steering: false, goals: false },
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
    capabilities: { resume: true, steering: false, goals: false },
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
