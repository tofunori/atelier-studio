// Thèmes complets de l'app (tokens CSS) — appliqués via data-theme + variables.
export type ThemePreset = {
  id: string;
  name: string;
  dark: boolean;
  vars: Record<string, string>;
  ansi?: string[]; // 16 couleurs terminal [noir..blanc, brillants]
};

const T = (
  id: string, name: string, dark: boolean,
  bg: string, side: string, pop: string, card: string, ctl: string,
  border: string, border2: string, fg: string, fg2: string,
  muted: string, muted2: string, accent: string,
  ansi?: string[],
): ThemePreset => ({
  id, name, dark, ansi,
  vars: {
    "--bg": bg, "--bg-side": side, "--bg-pop": pop, "--bg-card": card,
    "--bg-ctl": ctl, "--border": border, "--border2": border2,
    "--fg": fg, "--fg2": fg2, "--muted": muted, "--muted2": muted2,
    "--accent": accent,
  },
});

export const THEME_PRESETS: ThemePreset[] = [
  T("atelier", "Atelier (défaut)", true,
    "#1e2124", "#161a1e", "#24282d", "#24282d", "#2c2f34",
    "#383c41", "#43474c", "#dadee3", "#b9bec4", "#90969d", "#62666c", "#e77f3e",
    ["#161a1e", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#dcdfe4", "#5a616d", "#ff7a85", "#a9d47f", "#f0ca79", "#74bdf7", "#d894e8", "#6cd0dd", "#ffffff"]),
  T("graphite", "Graphite", true,
    "#202123", "#1a1b1d", "#292a2d", "#252628", "#303134",
    "#303134", "#494b4e", "#dfdfdc", "#c3c3bf", "#a0a19e", "#7f817e", "#ca926b",
    ["#1a1b1d", "#cf8e8e", "#a2b593", "#c7b18a", "#95acc7", "#b3a0bd", "#91b7b5", "#c3c3bf", "#7f817e", "#e1a3a3", "#b7c8a9", "#dcc5a0", "#aec1d9", "#c8b6d1", "#a8cdca", "#dfdfdc"]),
  T("obsidienne", "Obsidienne", true,
    "#17191c", "#121417", "#22252a", "#1d2024", "#2a2d33",
    "#2b2e33", "#41464e", "#dddfe2", "#bfc4ca", "#989fa9", "#7b838e", "#93a7bc",
    ["#121417", "#c88891", "#96ae9c", "#bdad8a", "#93a7bc", "#aa9bbb", "#8fadb4", "#bfc4ca", "#7b838e", "#dda0a8", "#adc5b3", "#d3c3a0", "#abc0d5", "#c0b2d1", "#a6c4cb", "#dddfe2"]),
  T("encre", "Encre", true,
    "#1c2027", "#171b21", "#272d36", "#222730", "#2d3440",
    "#2e3540", "#465162", "#dee1e7", "#c0c7d2", "#9aa6b8", "#7d899c", "#91a8ca",
    ["#171b21", "#cf919e", "#9fb7a3", "#c7b58e", "#91a8ca", "#afa0c4", "#8eb8c0", "#c0c7d2", "#7d899c", "#e3a7b3", "#b5cdb9", "#ddcba5", "#a9c0e1", "#c5b6da", "#a5ced6", "#dee1e7"]),
  T("pierre", "Pierre", true,
    "#242321", "#1d1c1b", "#2e2c29", "#292724", "#36332f",
    "#35322e", "#4e4942", "#e2ded7", "#c7c1b7", "#a8a093", "#8b8378", "#bba889",
    ["#1d1c1b", "#c79084", "#a4b095", "#c1ac83", "#9aaebb", "#b3a0b0", "#96b2ab", "#c7c1b7", "#8b8378", "#dca69a", "#bac6ab", "#d7c299", "#b1c4d1", "#c9b6c6", "#acc8c1", "#e2ded7"]),
  T("sous-bois", "Sous-bois", true,
    "#202421", "#191d1b", "#2a302b", "#252a26", "#303832",
    "#303832", "#465248", "#dee2dc", "#bec8bc", "#9eac9c", "#808f7f", "#9daf96",
    ["#191d1b", "#c78f89", "#9daf96", "#bdb18c", "#94aeb9", "#b0a0b4", "#8fb5ab", "#bec8bc", "#808f7f", "#dda59f", "#b3c5ac", "#d3c7a2", "#aac4cf", "#c6b6ca", "#a5cbc1", "#dee2dc"]),
  // Monokai classic surfaces and ANSI palette from VS Code's built-in theme.
  // https://github.com/microsoft/vscode/blob/main/extensions/theme-monokai/themes/monokai-color-theme.json
  T("monokai", "Monokai", true,
    "#272822", "#1e1f1c", "#34352f", "#2e2f28", "#3b3d33",
    "#34352f", "#57594c", "#f8f8f2", "#ccccc7", "#aaa797", "#90908a", "#a6e22e",
    ["#333333", "#c4265e", "#86b42b", "#b3b42b", "#6a7ec8", "#8c6bc8", "#56adbc", "#e3e3dd", "#666666", "#f92672", "#a6e22e", "#e2e22e", "#819aff", "#ae81ff", "#66d9ef", "#f8f8f2"]),
  T("onedark", "One Dark", true,
    "#282c34", "#21252b", "#21252b", "#2c313c", "#353b45",
    "#3e4451", "#4b5263", "#abb2bf", "#c8cdd4", "#828997", "#5c6370", "#61afef",
    ["#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf", "#5c6370", "#e06c75", "#98c379", "#d19a66", "#61afef", "#c678dd", "#56b6c2", "#ffffff"]),
  T("dracula", "Dracula", true,
    "#282a36", "#21222c", "#21222c", "#2e3040", "#343746",
    "#3d4051", "#4d5066", "#f8f8f2", "#e6e6e0", "#9ea8c7", "#6272a4", "#bd93f9",
    ["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2", "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"]),
  T("nord", "Nord", true,
    "#2e3440", "#272c36", "#272c36", "#343b49", "#3b4252",
    "#434c5e", "#4c566a", "#eceff4", "#d8dee9", "#9aa5b5", "#7b88a1", "#88c0d0",
    ["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0", "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"]),
  T("gruvbox", "Gruvbox Dark", true,
    "#282828", "#1d2021", "#1d2021", "#32302f", "#3c3836",
    "#504945", "#665c54", "#ebdbb2", "#d5c4a1", "#a89984", "#7c6f64", "#fe8019",
    ["#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984", "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2"]),
  T("catppuccin", "Catppuccin Mocha", true,
    "#1e1e2e", "#181825", "#181825", "#26263a", "#313244",
    "#3b3b54", "#45475a", "#cdd6f4", "#bac2de", "#8f95b3", "#6c7086", "#f5a97f",
    ["#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de", "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8"]),
  T("tokyonight", "Tokyo Night", true,
    "#1a1b26", "#16161e", "#16161e", "#20212e", "#292a3d",
    "#32344a", "#414868", "#c0caf5", "#a9b1d6", "#7f87ab", "#565f89", "#7aa2f7",
    ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"]),
  T("rosepine", "Rosé Pine", true,
    "#191724", "#13111d", "#13111d", "#1f1d2e", "#26233a",
    "#312e48", "#403d52", "#e0def4", "#cecacd", "#908caa", "#6e6a86", "#ebbcba",
    ["#26233a", "#eb6f92", "#9ccfd8", "#f6c177", "#31748f", "#c4a7e7", "#ebbcba", "#e0def4", "#6e6a86", "#eb6f92", "#9ccfd8", "#f6c177", "#31748f", "#c4a7e7", "#ebbcba", "#e0def4"]),
  T("solarized-dark", "Solarized Dark", true,
    "#002b36", "#00252e", "#00252e", "#073642", "#0a4050",
    "#0e4a5a", "#155a6c", "#eee8d5", "#cfd0c4", "#93a1a1", "#657b83", "#cb4b16",
    ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"]),
  T("github-light", "GitHub Light", false,
    "#ffffff", "#f6f8fa", "#ffffff", "#ffffff", "#eaeef2",
    "#d0d7de", "#afb8c1", "#1f2328", "#424a53", "#656d76", "#8c959f", "#fb8500",
    ["#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781", "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f"]),
  T("solarized-light", "Solarized Light", false,
    "#fdf6e3", "#eee8d5", "#fdf6e3", "#f7f0dd", "#e8e1cd",
    "#d9d2be", "#c5beab", "#073642", "#405a61", "#657b83", "#93a1a1", "#cb4b16",
    ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"]),
  T("catppuccin-latte", "Catppuccin Latte", false,
    "#eff1f5", "#e6e9ef", "#eff1f5", "#e9ecf2", "#dce0e8",
    "#ccd0da", "#bcc0cc", "#4c4f69", "#5c5f77", "#7c7f93", "#9ca0b0", "#fe640b",
    ["#5c5f77", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#acb0be", "#6c6f85", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#bcc0cc"]),
];

export function presetById(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

/** Named palettes are explicit choices. Atelier itself follows the mode. */
export function resolveAppearanceTheme(settings: { themePreset: string; theme: "dark" | "light" | "system" }, systemDark: boolean): ThemePreset {
  const preset = presetById(settings.themePreset);
  if (preset.id !== "atelier") return preset;
  const dark = settings.theme === "system" ? systemDark : settings.theme === "dark";
  if (dark) return { ...preset, vars: { ...preset.vars, "--border": "#2a2d31" } };
  return {
    ...preset, dark: false, ansi: presetById("github-light").ansi,
    vars: {
      "--bg": "#f1f4f7", "--bg-side": "#e3e7ec", "--bg-pop": "#fafcfe", "--bg-card": "#fafcfe",
      "--bg-ctl": "#dadee4", "--border": "#dde0e5", "--border2": "#b8bcc2", "--fg": "#1a1d22",
      "--fg2": "#32363b", "--muted": "#595e64", "--muted2": "#82878c", "--accent": "#cf630d",
    },
  };
}

export function xtermThemeFor(selection: string | { themePreset: string; theme: "dark" | "light" | "system" }, systemDark = true) {
  const p = typeof selection === "string" ? presetById(selection) : resolveAppearanceTheme(selection, systemDark);
  const a = p.ansi ?? [];
  return {
    background: p.vars["--bg-side"],
    foreground: p.vars["--fg"],
    cursor: p.vars["--accent"],
    selectionBackground: "rgba(128,160,255,0.30)",
    black: a[0], red: a[1], green: a[2], yellow: a[3],
    blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
    brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11],
    brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15],
  };
}
