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
    defaultModel: "grok-4",
    models: ["grok-4", "grok-code-fast-1"],
    efforts: ["low", "medium", "high", "xhigh", "max"],
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

export function listProviders() {
  return PROVIDERS.map((p) => ({
    ...p,
    models: [...p.models],
    efforts: [...p.efforts],
    capabilities: { ...p.capabilities },
  }));
}

export function getProvider(id) {
  return listProviders().find((p) => p.id === id) ?? null;
}
