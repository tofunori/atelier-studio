import type { Settings } from "./settings";
import { galleryLegacyThemeVars, resolveAppearanceTheme, themeContractVars } from "./themes";
import { interfaceGeometry, interfaceTypography } from "./interfaceTheme";
import { atelierTargetOrigin, type AtelierOutboundMessage } from "./ipc";

// piles de police canoniques (mêmes valeurs que src/App.css et les :root des iframes)
export const CANON_UI_FONT = "-apple-system, 'SF Pro Text', 'Inter Variable', sans-serif";
export const CANON_CODE_FONT = "ui-monospace, 'SF Mono', Menlo, monospace";

export const THEME_GEOMETRY_VARS = new Set([
  "--radius-control", "--radius-surface", "--radius-pill", "--radius-composer",
  "--control-height", "--control-height-compact", "--surface-header-height",
  "--motion-fast", "--motion-standard", "--motion-panel", "--ease-out",
  "--elevation-overlay", "--elev", "--elev-soft", "--focus-ring-color",
  "--focus-ring-width", "--focus-ring-offset",
]);

export function effectiveTheme(settings: Settings, systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches) {
  const preset = resolveAppearanceTheme(settings, systemDark);
  const base = { ...preset.vars };
  if (settings.accentColor) base["--accent"] = settings.accentColor;
  if (settings.bgColor) base["--bg"] = settings.bgColor;
  if (settings.fgColor) base["--fg"] = settings.fgColor;
  return { ...preset, vars: base };
}

// vars de thème poussées aux iframes : couleurs du preset + police effective
// (police custom de l'utilisateur si définie, sinon la pile canonique) — garantit
// une police uniforme dans la galerie et les visionneuses comme dans l'app.
// Le shell ne reçoit pas la géométrie inline : data-density et les tokens CSS
// restent la source canonique pour ses dimensions, tandis que les iframes
// reçoivent le style calculé à la frontière du message.
export function themeVars(
  settings: Settings,
  includeRuntimeGeometry = true,
  preset = effectiveTheme(settings),
): Record<string, string> {
  const contract = themeContractVars({ dark: preset.dark, vars: preset.vars });
  const vars: Record<string, string> = {
    ...contract,
    ...interfaceTypography(settings.baseFontSize),
    "--ui-font": settings.uiFont ? `'${settings.uiFont}', ${CANON_UI_FONT}` : CANON_UI_FONT,
    "--code-font": settings.codeFont ? `'${settings.codeFont}', ${CANON_CODE_FONT}` : CANON_CODE_FONT,
  };
  if (includeRuntimeGeometry) {
    Object.assign(vars, interfaceGeometry(getComputedStyle(document.documentElement)));
  } else {
    THEME_GEOMETRY_VARS.forEach((name) => delete vars[name]);
  }
  return vars;
}

export function themeMessage(settings: Settings, nonce: string): AtelierOutboundMessage {
  const preset = effectiveTheme(settings);
  return {
    type: "atelier-theme",
    version: 2,
    colorScheme: preset.dark ? "dark" : "light",
    nonce,
    vars: {
      ...themeVars(settings, true, preset),
      ...galleryLegacyThemeVars(preset),
    },
  };
}

/** Applique réglages d'apparence et thème au document, puis les propage aux
 *  iframes atelier (galerie, visionneuses). Renvoie le nettoyage des minuteries
 *  et des écouteurs système posés ici. */
export function applyAppearance(settings: Settings, atelierNonce: string): () => void {
  const root = document.documentElement;
  const r = root.style;
  r.setProperty("--chat-fs", `${settings.chatFontSize}px`);
  r.setProperty("--chat-w", `${settings.chatWidth}px`);
  r.setProperty("--chat-lh", String(settings.chatLineHeight));
  // One resolver serves the shell and its embedded views.
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const applyPalette = () => {
    const preset = effectiveTheme(settings, systemTheme.matches);
    root.setAttribute("data-theme", preset.dark ? "dark" : "light");
    for (const [key, value] of Object.entries(themeVars(settings, false, preset))) r.setProperty(key, value);
    window.dispatchEvent(new CustomEvent("app-theme-changed", { detail: settings.themePreset }));
  };
  // propager aux iframes atelier (galerie, viewers)
  const pushThemeToAtelierFrames = () => {
    document.querySelectorAll("iframe.atelier").forEach((f) => {
      const iframe = f as HTMLIFrameElement;
      const targetOrigin = atelierTargetOrigin(iframe.src);
      if (!targetOrigin) return;
      const message = themeMessage(settings, atelierNonce);
      iframe.contentWindow?.postMessage(message, targetOrigin);
    });
  };
  const broadcastTheme = setTimeout(pushThemeToAtelierFrames, 50);
  // ré-essaimage périodique : le message de thème porte le nonce IPC — une
  // page dont WKWebView a purgé le sessionStorage (clics « Add to chat »
  // muets jusqu'au reload) le réadopte et redevient fonctionnelle seule
  const reseedNonce = setInterval(pushThemeToAtelierFrames, 30_000);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.addEventListener?.("change", pushThemeToAtelierFrames);
  const onSystemThemeChange = () => { applyPalette(); pushThemeToAtelierFrames(); };
  systemTheme.addEventListener?.("change", onSystemThemeChange);
  root.setAttribute("data-density", settings.density);
  root.style.fontSize = `${settings.baseFontSize}px`;
  for (const [name, value] of Object.entries(interfaceTypography(settings.baseFontSize))) {
    r.setProperty(name, value);
  }
  root.classList.toggle("no-smoothing", !settings.fontSmoothing);
  root.classList.toggle("no-stream-fade", !settings.streamFade);
  const setOrClear = (name: string, val: string) =>
    val ? r.setProperty(name, val) : r.removeProperty(name);
  setOrClear("--ui-font", settings.uiFont ? `'${settings.uiFont}', ${CANON_UI_FONT}` : "");
  setOrClear("--code-font", settings.codeFont ? `'${settings.codeFont}', ${CANON_CODE_FONT}` : "");
  // Notify widgets only after fonts and type scales are effective.
  applyPalette();
  return () => {
    clearTimeout(broadcastTheme);
    clearInterval(reseedNonce);
    reducedMotion.removeEventListener?.("change", pushThemeToAtelierFrames);
    systemTheme.removeEventListener?.("change", onSystemThemeChange);
  };
}
