import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

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

  useEffect(() => {
    if (!ref.current || xtermRef.current) return;
    const term = new XTerm({
      fontSize: 13,
      fontFamily: "var(--code-font, ui-monospace, Menlo, monospace)",
      cursorBlink: true,
      theme: {
        background: "#1a1d22",
        foreground: "#e8eaed",
        cursor: "#e8823a",
        selectionBackground: "rgba(91,157,255,0.35)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      p.ws?.readyState === 1 &&
        p.ws.send(JSON.stringify({ type: "termInput", termId: p.termId, data }));
    });
    term.onResize(({ cols, rows }) => {
      p.ws?.readyState === 1 &&
        p.ws.send(JSON.stringify({ type: "termResize", termId: p.termId, cols, rows }));
    });

    // flux de données routé par App via CustomEvent
    const onData = (e: Event) => term.write((e as CustomEvent).detail);
    const onExit = () => term.write("\r\n\x1b[90m[processus terminé]\x1b[0m\r\n");
    window.addEventListener(`term-data:${p.termId}`, onData);
    window.addEventListener(`term-exit:${p.termId}`, onExit);

    // ouvrir le PTY
    if (!opened.current && p.ws?.readyState === 1) {
      opened.current = true;
      p.ws.send(
        JSON.stringify({
          type: "termOpen",
          termId: p.termId,
          cwd: p.cwd,
          cols: term.cols,
          rows: term.rows,
        }),
      );
    }

    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);
    return () => {
      window.removeEventListener(`term-data:${p.termId}`, onData);
      window.removeEventListener(`term-exit:${p.termId}`, onExit);
      window.removeEventListener("resize", onWinResize);
    };
  }, []);

  // re-mesurer quand l'onglet redevient visible
  useEffect(() => {
    if (p.visible) setTimeout(() => fitRef.current?.fit(), 30);
  }, [p.visible]);

  return <div ref={ref} className="term-host" style={{ display: p.visible ? "block" : "none" }} />;
}
