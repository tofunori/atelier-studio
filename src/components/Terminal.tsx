import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { wsSend, wsReady } from "../lib/wsBus";
import { xtermThemeFor } from "../lib/themes";
import { loadSettings } from "../lib/settings";
import { terminalShortcutFor, type TerminalShortcut } from "../lib/terminalShortcuts";

// Monaspace Neon (Nerd Font Mono) bundlée en WOFF2 (cf. @font-face dans App.css) ;
// repli sur les Nerd Fonts système puis Menlo. Les glyphes powerline/icônes sont
// dans Monaspace même (variante NF), pas besoin de police de symboles séparée.
const TERM_FONT = "'Monaspace Neon', 'JetBrainsMono Nerd Font', 'Symbols Nerd Font Mono', Menlo, monospace";
const TERM_FONT_SIZE = 13;
const TERM_FONT_SIZE_MIN = 9;
const TERM_FONT_SIZE_MAX = 28;

export default function Terminal(p: {
  termId: string;
  cwd: string;
  ws: WebSocket | null;
  visible: boolean;
  onShortcut?: (termId: string, shortcut: TerminalShortcut) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const mounted = useRef(false);   // term.open() effectué (après préchargement police)
  const opened = useRef(false);    // PTY ouvert côté sidecar
  const shortcutRef = useRef(p.onShortcut);
  useEffect(() => { shortcutRef.current = p.onShortcut; }, [p.onShortcut]);
  function tryOpen() {
    const term = xtermRef.current;
    if (opened.current || !term || !mounted.current || !wsReady()) return;
    opened.current = true;
    wsSend({ type: "termOpen", termId: p.termId, cwd: p.cwd, cols: term.cols, rows: term.rows });
    setTimeout(() => term.focus(), 100);
  }

  useEffect(() => {
    if (!ref.current || xtermRef.current) return;
    const term = new XTerm({
      fontSize: TERM_FONT_SIZE,
      fontFamily: TERM_FONT,
      fontWeight: "400",
      fontWeightBold: "700",
      lineHeight: 1.2,        // aère l'interligne (défaut 1.0 = trop serré)
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 10000,
      // Sur les claviers français, Option compose des caractères essentiels
      // (par ex. ⌥É → /). Le mode Meta de xterm avale ces compositions.
      macOptionIsMeta: false,
      allowProposedApi: true,
      theme: xtermThemeFor(loadSettings().themePreset),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri)));
    xtermRef.current = term;
    fitRef.current = fit;

    let webgl: WebglAddon | null = null;
    const setFontSize = (fontSize: number) => {
      term.options.fontSize = Math.max(TERM_FONT_SIZE_MIN, Math.min(TERM_FONT_SIZE_MAX, fontSize));
      fit.fit();
      webgl?.clearTextureAtlas();
    };
    term.attachCustomKeyEventHandler((event) => {
      const shortcut = terminalShortcutFor(event);
      if (!shortcut) return true;

      event.preventDefault();
      event.stopPropagation();
      if (event.type !== "keydown") return false;

      switch (shortcut.kind) {
        case "copy": {
          const selection = term.getSelection();
          if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
          break;
        }
        case "paste":
          void navigator.clipboard.readText().then((text) => term.paste(text)).catch(() => {});
          break;
        case "select-all": term.selectAll(); break;
        case "clear": term.clear(); break;
        case "font-increase": setFontSize((term.options.fontSize ?? TERM_FONT_SIZE) + 1); break;
        case "font-decrease": setFontSize((term.options.fontSize ?? TERM_FONT_SIZE) - 1); break;
        case "font-reset": setFontSize(TERM_FONT_SIZE); break;
        default: shortcutRef.current?.(p.termId, shortcut);
      }
      return false;
    });

    term.onData((data) => wsSend({ type: "termInput", termId: p.termId, data }));
    term.onResize(({ cols, rows }) => wsSend({ type: "termResize", termId: p.termId, cols, rows }));

    // flux de données routé par App via CustomEvent
    const onData = (e: Event) => term.write((e as CustomEvent).detail);
    const onExit = () => term.write("\r\n\x1b[90m[processus terminé]\x1b[0m\r\n");
    window.addEventListener(`term-data:${p.termId}`, onData);
    window.addEventListener(`term-exit:${p.termId}`, onExit);

    // Précharger Monaspace Neon (4 faces) AVANT term.open() : xterm mesure la
    // taille de cellule de façon synchrone et la met en cache ; si la police
    // n'est pas prête, il mesure une police de repli → tout est décalé.
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          document.fonts.load('13px "Monaspace Neon"'),
          document.fonts.load('700 13px "Monaspace Neon"'),
          document.fonts.load('italic 13px "Monaspace Neon"'),
          document.fonts.load('italic 700 13px "Monaspace Neon"'),
        ]);
        await document.fonts.ready;
      } catch { /* la police de repli prendra le relais */ }
      if (cancelled || !ref.current) return;
      term.open(ref.current);
      try { webgl = new WebglAddon(); term.loadAddon(webgl); } catch {} // fallback canvas
      mounted.current = true;
      fit.fit();
      webgl?.clearTextureAtlas();   // l'atlas WebGL est clé sur la police mesurée
      term.focus();
      tryOpen();
    })();

    // ouvrir le PTY (retry si le WS n'est pas encore prêt ; garde-fou mounted)
    const retry = setInterval(() => {
      if (opened.current) { clearInterval(retry); return; }
      tryOpen();
    }, 500);

    const onTheme = (e: Event) => {
      term.options.theme = xtermThemeFor((e as CustomEvent).detail as string);
      webgl?.clearTextureAtlas();
    };
    window.addEventListener("app-theme-changed", onTheme);
    const onWinResize = () => { if (mounted.current) fit.fit(); };
    window.addEventListener("resize", onWinResize);
    // le drag des séparateurs ne déclenche pas window.resize : observer le conteneur
    const ro = new ResizeObserver(() => { if (mounted.current) fit.fit(); });
    ro.observe(ref.current);
    return () => {
      cancelled = true;
      clearInterval(retry);
      ro.disconnect();
      window.removeEventListener(`term-data:${p.termId}`, onData);
      window.removeEventListener(`term-exit:${p.termId}`, onExit);
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("app-theme-changed", onTheme);
    };
  }, []);

  // re-mesurer quand l'onglet redevient visible + focus
  useEffect(() => {
    if (!p.visible) return;
    const focusTimer = setTimeout(() => {
      if (mounted.current) { fitRef.current?.fit(); xtermRef.current?.focus(); }
    }, 30);
    tryOpen();
    return () => clearTimeout(focusTimer);
  }, [p.visible]);

  return (
    <div
      ref={ref}
      className="term-host"
      style={{ display: p.visible ? "block" : "none" }}
      onMouseDown={() => setTimeout(() => xtermRef.current?.focus(), 0)}
    />
  );
}
