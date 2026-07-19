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
  // displayName officiels du CLI (`kimi provider list --json`, 0.26.0) — la
  // LISTE reste découverte dynamiquement, seul l'affichage est mappé ici.
  kimi: {
    "kimi-code/k3": "K3",
    "kimi-code/kimi-for-coding": "K2.7 Coding",
    "kimi-code/kimi-for-coding-highspeed": "K2.7 Coding Highspeed",
  },
  opencode: {
    "kimi-for-coding/k3": "Kimi K3",
  },
};

export function modelDisplayLabel(provider: string, model: string): string {
  const known = BUILTIN_MODEL_LABELS[provider]?.[model];
  if (known) return known;
  if (provider !== "opencode") return model;

  // OpenCode renvoie des ids routés (`opencode/...`, `openrouter/...`, etc.).
  // Le provider est déjà visible dans l'en-tête du picker : n'afficher que le
  // nom humain du modèle, tout en conservant l'id exact pour l'envoi/tooltip.
  const leaf = model.split("/").filter(Boolean).pop() ?? model;
  const free = /(?::|-)(?:free)$/i.test(leaf);
  const base = leaf.replace(/(?::|-)(?:free)$/i, "");
  const words = base.split("-").filter(Boolean).map((word) => {
    const lower = word.toLowerCase();
    const exact: Record<string, string> = {
      auto: "Auto",
      claude: "Claude",
      code: "Code",
      coder: "Coder",
      deepseek: "DeepSeek",
      flash: "Flash",
      glm: "GLM",
      gpt: "GPT",
      grok: "Grok",
      kimi: "Kimi",
      minimax: "MiniMax",
      mimo: "MiMo",
      nano: "Nano",
      nemotron: "Nemotron",
      north: "North",
      opus: "Opus",
      pro: "Pro",
      qwen: "Qwen",
      sonnet: "Sonnet",
      spark: "Spark",
      terra: "Terra",
      luna: "Luna",
      sol: "Sol",
      ultra: "Ultra",
    };
    if (exact[lower]) return exact[lower];
    if (/^(?:m|k|hy)\d/i.test(word)) return word.toUpperCase();
    const qwen = /^qwen(.+)$/i.exec(word);
    if (qwen) return `Qwen ${qwen[1]}`;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return `${words.join(" ")}${free ? " · Free" : ""}` || model;
}
