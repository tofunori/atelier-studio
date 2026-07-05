import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { wsSend, wsReady } from "../lib/wsBus";

export default function Terminal(p: {
  termId: string;
  cwd: string;
  ws: WebSocket | null;
  visible: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const opened = useRef(false);
  function tryOpen() {
    const term = xtermRef.current;
    if (opened.current || !term || !wsReady()) return;
    opened.current = true;
    wsSend({ type: "termOpen", termId: p.termId, cwd: p.cwd, cols: term.cols, rows: term.rows });
  }

  useEffect(() => {
    if (!ref.current || xtermRef.current) return;
    const term = new XTerm({
      fontSize: 13,
      fontFamily: "'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', Menlo, Monaco, monospace",
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      macOptionIsMeta: true,
      allowProposedApi: true,
      theme: {
        background: "#1a1d22",
        foreground: "#e8eaed",
        cursor: "#e8823a",
        selectionBackground: "rgba(91,157,255,0.35)",
        black: "#1a1d22", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
        blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#dcdfe4",
        brightBlack: "#5a616d", brightRed: "#ff7a85", brightGreen: "#a9d47f",
        brightYellow: "#f0ca79", brightBlue: "#74bdf7", brightMagenta: "#d894e8",
        brightCyan: "#6cd0dd", brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri)));
    term.open(ref.current);
    try { term.loadAddon(new WebglAddon()); } catch {} // fallback canvas si WebGL indispo
    fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    term.onData((data) => wsSend({ type: "termInput", termId: p.termId, data }));
    term.onResize(({ cols, rows }) => wsSend({ type: "termResize", termId: p.termId, cols, rows }));

    // flux de données routé par App via CustomEvent
    const onData = (e: Event) => term.write((e as CustomEvent).detail);
    const onExit = () => term.write("\r\n\x1b[90m[processus terminé]\x1b[0m\r\n");
    window.addEventListener(`term-data:${p.termId}`, onData);
    window.addEventListener(`term-exit:${p.termId}`, onExit);

    // ouvrir le PTY (avec retry si le WS n'est pas encore prêt)
    tryOpen();
    const retry = setInterval(() => {
      if (opened.current) { clearInterval(retry); return; }
      tryOpen();
    }, 500);

    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);
    // le drag des séparateurs ne déclenche pas window.resize : observer le conteneur
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(ref.current);
    return () => {
      clearInterval(retry);
      ro.disconnect();
      window.removeEventListener(`term-data:${p.termId}`, onData);
      window.removeEventListener(`term-exit:${p.termId}`, onExit);
      window.removeEventListener("resize", onWinResize);
    };
  }, []);

  // re-mesurer quand l'onglet redevient visible + focus
  useEffect(() => {
    if (p.visible) {
      setTimeout(() => {
        fitRef.current?.fit();
        xtermRef.current?.focus();
      }, 30);
      tryOpen();
    }
  }, [p.visible]);

  return (
    <div
      ref={ref}
      className="term-host"
      style={{ display: p.visible ? "block" : "none" }}
      onClick={() => xtermRef.current?.focus()}
    />
  );
}
