// Thèmes complets de l'app (tokens CSS) — appliqués via data-theme + variables.
export type ThemePreset = {
  id: string;
  name: string;
  dark: boolean;
  vars: Record<string, string>; // --bg, --bg-side, --bg-pop, --bg-card, --bg-ctl, --border, --border2, --fg, --fg2, --muted, --muted2, --accent
};

const T = (
  id: string, name: string, dark: boolean,
  bg: string, side: string, pop: string, card: string, ctl: string,
  border: string, border2: string, fg: string, fg2: string,
  muted: string, muted2: string, accent: string,
): ThemePreset => ({
  id, name, dark,
  vars: {
    "--bg": bg, "--bg-side": side, "--bg-pop": pop, "--bg-card": card,
    "--bg-ctl": ctl, "--border": border, "--border2": border2,
    "--fg": fg, "--fg2": fg2, "--muted": muted, "--muted2": muted2,
    "--accent": accent,
  },
});

export const THEME_PRESETS: ThemePreset[] = [
  T("atelier", "Atelier (défaut)", true,
    "#212429", "#1a1d22", "#1b1f26", "#262b31", "#2c313a",
    "#333a45", "#3f4652", "#e8eaed", "#cfd4dc", "#8a919e", "#6b7482", "#e8823a"),
  T("onedark", "One Dark", true,
    "#282c34", "#21252b", "#21252b", "#2c313c", "#353b45",
    "#3e4451", "#4b5263", "#abb2bf", "#c8cdd4", "#828997", "#5c6370", "#61afef"),
  T("dracula", "Dracula", true,
    "#282a36", "#21222c", "#21222c", "#2e3040", "#343746",
    "#3d4051", "#4d5066", "#f8f8f2", "#e6e6e0", "#9ea8c7", "#6272a4", "#bd93f9"),
  T("nord", "Nord", true,
    "#2e3440", "#272c36", "#272c36", "#343b49", "#3b4252",
    "#434c5e", "#4c566a", "#eceff4", "#d8dee9", "#9aa5b5", "#7b88a1", "#88c0d0"),
  T("gruvbox", "Gruvbox Dark", true,
    "#282828", "#1d2021", "#1d2021", "#32302f", "#3c3836",
    "#504945", "#665c54", "#ebdbb2", "#d5c4a1", "#a89984", "#7c6f64", "#fe8019"),
  T("catppuccin", "Catppuccin Mocha", true,
    "#1e1e2e", "#181825", "#181825", "#26263a", "#313244",
    "#3b3b54", "#45475a", "#cdd6f4", "#bac2de", "#8f95b3", "#6c7086", "#f5a97f"),
  T("tokyonight", "Tokyo Night", true,
    "#1a1b26", "#16161e", "#16161e", "#20212e", "#292a3d",
    "#32344a", "#414868", "#c0caf5", "#a9b1d6", "#7f87ab", "#565f89", "#7aa2f7"),
  T("rosepine", "Rosé Pine", true,
    "#191724", "#13111d", "#13111d", "#1f1d2e", "#26233a",
    "#312e48", "#403d52", "#e0def4", "#cecacd", "#908caa", "#6e6a86", "#ebbcba"),
  T("solarized-dark", "Solarized Dark", true,
    "#002b36", "#00252e", "#00252e", "#073642", "#0a4050",
    "#0e4a5a", "#155a6c", "#eee8d5", "#cfd0c4", "#93a1a1", "#657b83", "#cb4b16"),
  T("github-light", "GitHub Light", false,
    "#ffffff", "#f6f8fa", "#ffffff", "#ffffff", "#eaeef2",
    "#d0d7de", "#afb8c1", "#1f2328", "#424a53", "#656d76", "#8c959f", "#fb8500"),
  T("solarized-light", "Solarized Light", false,
    "#fdf6e3", "#eee8d5", "#fdf6e3", "#f7f0dd", "#e8e1cd",
    "#d9d2be", "#c5beab", "#073642", "#405a61", "#657b83", "#93a1a1", "#cb4b16"),
  T("catppuccin-latte", "Catppuccin Latte", false,
    "#eff1f5", "#e6e9ef", "#eff1f5", "#e9ecf2", "#dce0e8",
    "#ccd0da", "#bcc0cc", "#4c4f69", "#5c5f77", "#7c7f93", "#9ca0b0", "#fe640b"),
];
