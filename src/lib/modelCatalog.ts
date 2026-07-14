// Libellés seulement : la liste des modèles disponibles vient toujours du
// catalogue providerStatus du sidecar. Un id inconnu reste affiché tel quel.
export const BUILTIN_MODEL_LABELS: Record<string, Record<string, string>> = {
  claude: {
    "claude-fable-5": "Fable 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-sonnet-5": "Sonnet 5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
  },
  grok: {
    "grok-4.5": "Grok 4.5",
    "grok-composer-2.5-fast": "Composer 2.5 Fast",
  },
  codex: {
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.5": "GPT-5.5",
    "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
    "gpt-5.1-codex": "GPT-5.1 Codex",
  },
};

export function modelDisplayLabel(provider: string, model: string): string {
  return BUILTIN_MODEL_LABELS[provider]?.[model] ?? model;
}
