export type Settings = {
  defaultProvider: "claude" | "codex";
  defaultModel: { claude: string; codex: string };
  defaultEffort: { claude: string; codex: string };
  defaultPermissionMode: string;
  threadOrder: "recent" | "manual";
  chatFontSize: number;
  chatWidth: number;
  chatLineHeight: number;
  galleryPath: string;
  autoRefreshAtelier: boolean;
  theme: "dark" | "light" | "system";
  accentColor: string;
  bgColor: string;
  fgColor: string;
  uiFont: string;
  codeFont: string;
  density: "compact" | "comfortable" | "spacious";
  baseFontSize: number;
  fontSmoothing: boolean;
  timeFormat: "system" | "24h" | "12h";
};

export const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "claude",
  defaultModel: { claude: "", codex: "" },
  defaultEffort: { claude: "", codex: "" },
  defaultPermissionMode: "bypassPermissions",
  threadOrder: "recent",
  chatFontSize: 15,
  chatWidth: 760,
  chatLineHeight: 1.7,
  galleryPath: "~/Documents/cmux-gallery",
  autoRefreshAtelier: true,
  theme: "dark",
  accentColor: "",
  bgColor: "",
  fgColor: "",
  uiFont: "",
  codeFont: "",
  density: "comfortable",
  baseFontSize: 15,
  fontSmoothing: true,
  timeFormat: "system",
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
      defaultEffort: { ...DEFAULT_SETTINGS.defaultEffort, ...stored.defaultEffort },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
