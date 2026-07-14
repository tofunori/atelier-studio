export type ChatProvider = {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
};

/** Le même catalogue de base que le sélecteur d'Atelier Studio. */
export const CHAT_PROVIDERS: ChatProvider[] = [
  {
    id: "codex",
    label: "Codex",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1-codex"],
  },
  {
    id: "claude",
    label: "Claude",
    defaultModel: "claude-fable-5",
    models: ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  },
  {
    id: "grok",
    label: "Grok",
    defaultModel: "grok-4.5",
    models: ["grok-4.5", "grok-composer-2.5-fast"],
  },
  {
    id: "opencode",
    label: "OpenCode",
    defaultModel: "openrouter/z-ai/glm-5.2",
    models: ["openrouter/z-ai/glm-5.2", "openrouter/minimax/minimax-m3", "openrouter/qwen/qwen3-coder", "openrouter/openrouter/auto"],
  },
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
];

export function providerLabel(id: string): string {
  return CHAT_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

const MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "claude-fable-5": "Fable 5",
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "grok-4.5": "Grok 4.5",
  "grok-composer-2.5-fast": "Composer 2.5 Fast",
  "openrouter/z-ai/glm-5.2": "GLM 5.2",
  "openrouter/minimax/minimax-m3": "MiniMax M3",
  "openrouter/qwen/qwen3-coder": "Qwen 3 Coder",
  "openrouter/openrouter/auto": "Auto",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
};

export function modelLabel(id: string): string {
  return MODEL_LABELS[id] ?? id;
}
