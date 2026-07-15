export type ProviderId = string;

// vue active du panneau latéral (barre d'activité) — "highlights" arrive
// fonctionnellement au lot 2, seul le placeholder existe pour l'instant
export type ViewId = "chats" | "highlights";

export type Settings = {
  defaultProvider: ProviderId;
  defaultModel: Record<string, string>;
  defaultEffort: Record<string, string>;
  defaultPermissionMode: string;
  threadOrder: "recent" | "manual";
  chatFontSize: number;
  chatWidth: number;
  chatLineHeight: number;
  galleryPath: string;
  galleryExts: string; // extensions par défaut de la galerie ("" = liste intégrée)
  galleryExtsByProject: Record<string, string>; // racine projet -> extensions
  autoRefreshAtelier: boolean;
  enableAppSnap: boolean;
  appSnapPlaySound: boolean;
  autoReview: {
    enabled: boolean;
    provider: ProviderId;
    model: string;
    effort: string;
    trigger: "always" | "files-changed" | "manual";
    autofix: boolean;
  };
  language: "fr" | "en" | "system";
  theme: "dark" | "light" | "system";
  themePreset: string;
  accentColor: string;
  bgColor: string;
  fgColor: string;
  uiFont: string;
  codeFont: string;
  density: "compact" | "comfortable" | "spacious";
  baseFontSize: number;
  fontSmoothing: boolean;
  timeFormat: "system" | "24h" | "12h";
  customModels: { provider: ProviderId; id: string }[];
  modelEfforts: Record<string, string>; // "provider:modelId" -> effort
  webSearch: boolean;
  additionalDirectories: string;
  providerOrder: ProviderId[]; // ordre du picker ([] = ordre du catalogue)
  hiddenProviders: ProviderId[]; // masqués du picker (le provider du thread actif reste visible)
  activeView: ViewId;
};

export const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "claude",
  defaultModel: { claude: "claude-sonnet-5[1m]", codex: "gpt-5.6-sol" },
  defaultEffort: { claude: "xhigh", codex: "medium", grok: "high" },
  defaultPermissionMode: "bypassPermissions",
  threadOrder: "recent",
  chatFontSize: 15,
  chatWidth: 760,
  chatLineHeight: 1.7,
  galleryPath: "", // vide = galerie embarquée (gallery/ du repo ou ressource bundlée)
  galleryExts: "",
  galleryExtsByProject: {},
  autoRefreshAtelier: true,
  enableAppSnap: false,
  appSnapPlaySound: true,
  autoReview: { enabled: false, provider: "codex", model: "gpt-5.5", effort: "high", trigger: "files-changed", autofix: false },
  language: "system",
  theme: "dark",
  themePreset: "atelier",
  accentColor: "",
  bgColor: "",
  fgColor: "",
  uiFont: "",
  codeFont: "",
  density: "comfortable",
  baseFontSize: 15,
  fontSmoothing: true,
  timeFormat: "system",
  customModels: [],
  modelEfforts: {},
  webSearch: false,
  additionalDirectories: "",
  providerOrder: [],
  hiddenProviders: [],
  activeView: "chats",
};

const KEY = "atelier-studio.settings";
const CLAUDE_DEFAULTS_MIGRATION_KEY = "atelier-studio.defaults.claude-sonnet-1m-xhigh";

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // GPT-5.5 était l'ancien défaut Codex. Le migrer vers le nouveau défaut
    // demandé; les autres choix explicites restent intacts.
    const storedDefaultModel = {
      ...stored.defaultModel,
      ...(stored.defaultModel?.codex === "gpt-5.5" ? { codex: DEFAULT_SETTINGS.defaultModel.codex } : {}),
    };
    const storedDefaultEffort = { ...stored.defaultEffort };
    // Migration ponctuelle : appliquer la nouvelle préférence demandée à
    // l'installation existante, puis laisser les changements futurs libres.
    if (localStorage.getItem(CLAUDE_DEFAULTS_MIGRATION_KEY) !== "1") {
      storedDefaultModel.claude = DEFAULT_SETTINGS.defaultModel.claude;
      storedDefaultEffort.claude = DEFAULT_SETTINGS.defaultEffort.claude;
      localStorage.setItem(CLAUDE_DEFAULTS_MIGRATION_KEY, "1");
    }
    // migration : ancienne clé de taille de police
    const legacyFs = localStorage.getItem("atelier-studio.chatFontSize");
    return {
      ...DEFAULT_SETTINGS,
      ...(legacyFs ? { chatFontSize: Number(legacyFs) } : {}),
      ...stored,
      defaultModel: { ...DEFAULT_SETTINGS.defaultModel, ...storedDefaultModel },
      autoReview: { ...DEFAULT_SETTINGS.autoReview, ...(stored as any).autoReview },
      defaultEffort: { ...DEFAULT_SETTINGS.defaultEffort, ...storedDefaultEffort },
      customModels: stored.customModels ?? [],
      modelEfforts: stored.modelEfforts ?? {},
      // La vue latérale est un état de session : un démarrage à froid revient
      // toujours aux conversations, même si l'app a été quittée sur Highlights.
      activeView: "chats",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
