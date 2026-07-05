import { useEffect, useRef, useState } from "react";

function useRefBool() {
  return useRef(false);
}
import Terminal from "./Terminal";
import { wsSend } from "../lib/wsBus";

type Term = { id: string; n: number };

export default function TerminalSurface(p: {
  ws: WebSocket | null;
  cwd: string;
  visible: boolean;
}) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"single" | "cols" | "rows">("single");

  function addTerm(): Term {
    const n = terms.length ? Math.max(...terms.map((t) => t.n)) + 1 : 1;
    const t = { id: crypto.randomUUID(), n };
    setTerms((l) => [...l, t]);
    setActiveId(t.id);
    return t;
  }

  // premier affichage : créer Terminal 1 (garde anti-double StrictMode)
  const booted = useRefBool();
  useEffect(() => {
    if (p.visible && !booted.current) {
      booted.current = true;
      addTerm();
    }
  }, [p.visible]);

  function closeActive() {
    if (!activeId) return;
    wsSend({ type: "termClose", termId: activeId });
    setTerms((l) => {
      const next = l.filter((t) => t.id !== activeId);
      setActiveId(next.length ? next[next.length - 1].id : null);
      if (next.length < 2) setLayout("single");
      return next;
    });
  }

  function split(dir: "cols" | "rows") {
    if (terms.length < 2) addTerm();
    setLayout(dir);
  }

  return (
    <div className="term-surface" style={{ display: p.visible ? "flex" : "none" }}>
      <div className="term-bar">
        {terms.map((t) => (
          <button
            key={t.id}
            className={`atab ${activeId === t.id ? "on" : ""}`}
            onClick={() => setActiveId(t.id)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M4.5 6l2.2 2-2.2 2M8.5 10.5h3"/></svg>
            Terminal {t.n}
          </button>
        ))}
        <button className="ghost" title="Nouveau terminal" onClick={() => addTerm()}>+</button>
        <span className="flex" />
        <button className={`ghost ${layout === "cols" ? "on" : ""}`} title="Split vertical" onClick={() => split("cols")}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M8 3v10"/></svg>
        </button>
        <button className={`ghost ${layout === "rows" ? "on" : ""}`} title="Split horizontal" onClick={() => split("rows")}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M2 8h12"/></svg>
        </button>
        <button className="ghost" title="Fermer le terminal actif" onClick={closeActive}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2.5 4h11M6 4V2.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V4M4 4l.7 9c0 .6.5 1 1 1h4.6c.5 0 1-.4 1-1L12 4M6.5 7v4M9.5 7v4"/></svg>
        </button>
      </div>
      <div className={`term-grid ${layout}`}>
        {terms.map((t) => (
          <div
            key={t.id}
            className={`term-cell ${activeId === t.id ? "focus" : ""}`}
            style={{ display: layout === "single" && activeId !== t.id ? "none" : "block" }}
            onClick={() => setActiveId(t.id)}
          >
            <Terminal termId={t.id} cwd={p.cwd} ws={p.ws} visible={p.visible && (layout !== "single" || activeId === t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
