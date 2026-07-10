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

export function xtermThemeFor(id: string) {
  const p = presetById(id);
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
