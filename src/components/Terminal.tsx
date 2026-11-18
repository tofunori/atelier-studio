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

async function readNativeClipboard(): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const text = await invoke<string>("clipboard_read_text");
      if (typeof text === "string" && text.length > 0) return text;
    } catch { /* fallback navigator.clipboard */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  return "";
}

async function writeNativeClipboard(text: string): Promise<void> {
  if (!text) return;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clipboard_write_text", { text });
      return;
    } catch { /* fallback navigator.clipboard */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
// repli sur les Nerd Fonts système, les polices mono Linux/macOS puis monospace.
// Les glyphes powerline/icônes sont dans Monaspace même (variante NF).
const TERM_FONT = "'Monaspace Neon', 'JetBrainsMono Nerd Font', 'Symbols Nerd Font Mono', 'Ubuntu Mono', 'DejaVu Sans Mono', 'Liberation Mono', Menlo, monospace";
const TERM_FONT_SIZE = 13;
const TERM_FONT_SIZE_MIN = 9;
const TERM_FONT_SIZE_MAX = 28;

export default function Terminal(p: {
  termId: string;
  cwd: string;
  ws: WebSocket | null;
  visible: boolean;
  onShortcut?: (termId: string, shortcut: TerminalShortcut) => void;
  onReady?: (termId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const mounted = useRef(false);   // term.open() effectué
  const opened = useRef(false);    // PTY ouvert côté sidecar
  const exited = useRef(false);    // processus terminé (Entrée relance un shell neuf)
  const shortcutRef = useRef(p.onShortcut);
  const readyRef = useRef(p.onReady);
  const cwdRef = useRef(p.cwd);
  useEffect(() => { shortcutRef.current = p.onShortcut; }, [p.onShortcut]);
  useEffect(() => { readyRef.current = p.onReady; }, [p.onReady]);
  useEffect(() => { cwdRef.current = p.cwd; }, [p.cwd]);
  function tryOpen() {
    const term = xtermRef.current;
    if (opened.current || !term || !mounted.current || !wsReady()) return;
    opened.current = true;
    exited.current = false;
    if (!wsSend({ type: "termOpen", termId: p.termId, cwd: cwdRef.current, cols: term.cols, rows: term.rows })) {
      opened.current = false;
      return;
    }
    readyRef.current?.(p.termId);
    setTimeout(() => term.focus(), 80);
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
      theme: xtermThemeFor(loadSettings(), window.matchMedia("(prefers-color-scheme: dark)").matches),
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
      // Sur Linux/Windows (et Parallels qui traduit ⌘C/⌘V du Mac en Ctrl+C/Ctrl+V) :
      // - Ctrl+V sans Shift colle depuis le presse-papiers natif ;
      // - Ctrl+C copie si une sélection existe, sinon laisse passer SIGINT (^C).
      const isNonMac = typeof navigator !== "undefined" && !/Mac/i.test(navigator.platform);
      if (isNonMac && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (event.code === "KeyV") {
          event.preventDefault();
          event.stopPropagation();
          if (event.type === "keydown") {
            void readNativeClipboard().then((text) => { if (text) term.paste(text); }).catch(() => {});
          }
          return false;
        }
        if (event.code === "KeyC" && term.hasSelection()) {
          event.preventDefault();
          event.stopPropagation();
          if (event.type === "keydown") {
            const sel = term.getSelection();
            term.clearSelection();
            void writeNativeClipboard(sel).catch(() => {});
          }
          return false;
        }
      }

      const shortcut = terminalShortcutFor(event);
      if (!shortcut) return true;

      event.preventDefault();
      event.stopPropagation();
      if (event.type !== "keydown") return false;

      switch (shortcut.kind) {
        case "copy": {
          const selection = term.getSelection();
          if (selection) void writeNativeClipboard(selection).catch(() => {});
          break;
        }
        case "paste":
          void readNativeClipboard().then((text) => { if (text) term.paste(text); }).catch(() => {});
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

    term.onData((data) => {
      if (exited.current) {
        if (data.includes("\r") || data.includes("\n")) {
          term.write("\r\n");
          tryOpen();
        }
        return;
      }
      wsSend({ type: "termInput", termId: p.termId, data });
    });
    term.onResize(({ cols, rows }) => {
      if (opened.current) wsSend({ type: "termResize", termId: p.termId, cols, rows });
    });

    // flux de données routé par App via CustomEvent (tamponné tant que term.open n'a pas fini)
    const pendingChunks: string[] = [];
    const onData = (e: Event) => {
      const chunk = String((e as CustomEvent).detail ?? "");
      if (!mounted.current) pendingChunks.push(chunk);
      else term.write(chunk);
    };
    const onExit = () => {
      opened.current = false;
      exited.current = true;
      term.write("\r\n\x1b[90m[processus terminé — Entrée pour relancer]\x1b[0m\r\n");
    };
    window.addEventListener(`term-data:${p.termId}`, onData);
    window.addEventListener(`term-exit:${p.termId}`, onExit);

    // Précharger Monaspace Neon (4 faces) AVANT term.open() avec plafond 500 ms :
    // sur Linux/WebKitGTK, WebglAddon produit un canvas transparent sous
    // WEBKIT_DISABLE_DMABUF_RENDERER=1 — le moteur DOM natif d'xterm v6 y est
    // net, fluide et sans artefact WebGL.
    let cancelled = false;
    let rafId = 0;
    const safeFit = () => {
      if (!mounted.current || !ref.current) return;
      if (ref.current.clientWidth < 20 || ref.current.clientHeight < 20) return;
      try { fit.fit(); } catch {}
    };
    const scheduleFit = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        safeFit();
      });
    };
    (async () => {
      try {
        const fontLoad = Promise.all([
          document.fonts.load('13px "Monaspace Neon"'),
          document.fonts.load('700 13px "Monaspace Neon"'),
          document.fonts.load('italic 13px "Monaspace Neon"'),
          document.fonts.load('italic 700 13px "Monaspace Neon"'),
        ]).then(() => document.fonts.ready);
        await Promise.race([
          fontLoad,
          new Promise<void>((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch { /* la police de repli prendra le relais */ }
      if (cancelled || !ref.current) return;
      term.open(ref.current);
      const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
      if (isMac) {
        try {
          webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            webgl?.dispose();
            webgl = null;
          });
          term.loadAddon(webgl);
        } catch {
          webgl = null;
        }
      }
      mounted.current = true;
      if (pendingChunks.length > 0) {
        term.write(pendingChunks.splice(0).join(""));
      }
      safeFit();
      webgl?.clearTextureAtlas();
      term.focus();
      tryOpen();
      scheduleFit();
    })();

    // ouvrir le PTY (retry si le WS n'est pas encore prêt ; garde-fou mounted)
    const retry = setInterval(() => {
      if (opened.current || exited.current) { clearInterval(retry); return; }
      tryOpen();
    }, 500);

    const onTheme = () => {
      term.options.theme = xtermThemeFor(loadSettings(), window.matchMedia("(prefers-color-scheme: dark)").matches);
      webgl?.clearTextureAtlas();
    };
    window.addEventListener("app-theme-changed", onTheme);
    const onWinResize = () => scheduleFit();
    window.addEventListener("resize", onWinResize);
    // le drag des séparateurs ne déclenche pas window.resize : observer le conteneur
    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(ref.current);
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(retry);
      ro.disconnect();
      window.removeEventListener(`term-data:${p.termId}`, onData);
      window.removeEventListener(`term-exit:${p.termId}`, onExit);
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("app-theme-changed", onTheme);
      try { webgl?.dispose(); } catch {}
      try { term.dispose(); } catch {}
      xtermRef.current = null;
      mounted.current = false;
    };
  }, []);

  // re-mesurer quand l'onglet redevient visible + focus
  useEffect(() => {
    if (!p.visible) return;
    const focusTimer = setTimeout(() => {
      if (mounted.current && ref.current && ref.current.clientWidth >= 20 && ref.current.clientHeight >= 20) {
        try { fitRef.current?.fit(); } catch {}
        xtermRef.current?.focus();
      }
    }, 30);
    if (!exited.current) tryOpen();
    return () => clearTimeout(focusTimer);
  }, [p.visible]);

  // un terminal masqué (pool de surfaces en display:none) ne tique pas :
  // couper le clignotement du curseur économise le repaint périodique.
  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.cursorBlink = p.visible;
  }, [p.visible]);

  return (
    <div
      ref={ref}
      className="term-host"
      style={{ display: p.visible ? "block" : "none" }}
      onMouseDown={() => setTimeout(() => xtermRef.current?.focus(), 0)}
      onAuxClick={(e) => {
        // Clic molette Linux : collage rapide dans le terminal.
        if (e.button !== 1) return;
        if (typeof navigator === "undefined" || /Mac/i.test(navigator.platform)) return;
        const term = xtermRef.current;
        if (!term) return;
        e.preventDefault();
        void readNativeClipboard().then((text) => { if (text) term.paste(text); }).catch(() => {});
      }}
      onContextMenu={(e) => {
        if (typeof navigator === "undefined" || /Mac/i.test(navigator.platform)) return;
        const term = xtermRef.current;
        if (!term) return;
        e.preventDefault();
        if (term.hasSelection()) {
          const sel = term.getSelection();
          term.clearSelection();
          void writeNativeClipboard(sel).catch(() => {});
        } else {
          void readNativeClipboard().then((text) => { if (text) term.paste(text); }).catch(() => {});
        }
      }}
    />
  );
}
