export type ProviderId = string;

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
};

export const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "claude",
  defaultModel: { claude: "claude-fable-5", codex: "gpt-5.5" },
  defaultEffort: { claude: "low", codex: "medium" },
  defaultPermissionMode: "bypassPermissions",
  threadOrder: "recent",
  chatFontSize: 15,
  chatWidth: 760,
  chatLineHeight: 1.7,
  galleryPath: "", // vide = galerie embarquée (gallery/ du repo ou ressource bundlée)
  galleryExts: "",
  galleryExtsByProject: {},
  autoRefreshAtelier: true,
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
};

const KEY = "atelier-studio.settings";

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // migration : ancienne clé de taille de police
    const legacyFs = localStorage.getItem("atelier-studio.chatFontSize");
    return {
      ...DEFAULT_SETTINGS,
      ...(legacyFs ? { chatFontSize: Number(legacyFs) } : {}),
      ...stored,
      defaultModel: { ...DEFAULT_SETTINGS.defaultModel, ...stored.defaultModel },
      autoReview: { ...DEFAULT_SETTINGS.autoReview, ...(stored as any).autoReview },
      defaultEffort: { ...DEFAULT_SETTINGS.defaultEffort, ...stored.defaultEffort },
      customModels: stored.customModels ?? [],
      modelEfforts: stored.modelEfforts ?? {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
