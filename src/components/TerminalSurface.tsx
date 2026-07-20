import { useEffect, useRef, useState, type ReactNode } from "react";

function useRefBool() {
  return useRef(false);
}
import Terminal from "./Terminal";
import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
import { PlusIcon } from "./icons";
import { SquareTerminal } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { Tab, TabList } from "./ui/Tabs";
import type { TerminalShortcut } from "../lib/terminalShortcuts";

type Term = { id: string; n: number };

export default function TerminalSurface(p: {
  ws: WebSocket | null;
  cwd: string;
  visible: boolean;
  bootstrapCommand?: string | null;
  onBootstrapHandled?: () => void;
  paneControls?: ReactNode;
}) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"single" | "cols" | "rows">("single");
  const readyTerms = useRef(new Set<string>());
  const bootstrapRef = useRef(p.bootstrapCommand);
  const handledRef = useRef(p.onBootstrapHandled);
  useEffect(() => { bootstrapRef.current = p.bootstrapCommand; }, [p.bootstrapCommand]);
  useEffect(() => { handledRef.current = p.onBootstrapHandled; }, [p.onBootstrapHandled]);

  function runBootstrap(termId: string) {
    const command = bootstrapRef.current;
    if (!command || !readyTerms.current.has(termId)) return;
    bootstrapRef.current = null;
    window.setTimeout(() => {
      wsSend({ type: "termInput", termId, data: `${command}\r` });
      handledRef.current?.();
    }, 120);
  }

  useEffect(() => {
    if (p.visible && activeId) runBootstrap(activeId);
  }, [p.visible, p.bootstrapCommand, activeId]);

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

  function closeTerm(termId: string) {
    wsSend({ type: "termClose", termId });
    setTerms((l) => {
      const next = l.filter((t) => t.id !== termId);
      setActiveId(next.length ? next[next.length - 1].id : null);
      if (next.length < 2) setLayout("single");
      return next;
    });
  }

  function closeActive() {
    if (activeId) closeTerm(activeId);
  }

  function split(dir: "cols" | "rows") {
    if (terms.length < 2) addTerm();
    setLayout(dir);
  }

  function runShortcut(termId: string, shortcut: TerminalShortcut) {
    const index = terms.findIndex((term) => term.id === termId);
    switch (shortcut.kind) {
      case "new-tab": addTerm(); break;
      case "close-tab": closeTerm(termId); break;
      case "select-tab": {
        const target = terms[shortcut.index];
        if (target) setActiveId(target.id);
        break;
      }
      case "previous-tab": {
        if (terms.length) setActiveId(terms[(index - 1 + terms.length) % terms.length].id);
        break;
      }
      case "next-tab": {
        if (terms.length) setActiveId(terms[(index + 1) % terms.length].id);
        break;
      }
      case "split-vertical": split("cols"); break;
      case "split-horizontal": split("rows"); break;
    }
  }

  return (
    <div className="term-surface" style={{ display: p.visible ? "flex" : "none" }}>
      <div className="term-bar">
        <TabList className="term-tabs">
          {terms.map((term) => {
            const label = `${t("atelier.terminal")} ${term.n}`;
            return (
              <Tab
                key={term.id}
                active={activeId === term.id}
                label={label}
                icon={<SquareTerminal />}
                onClick={() => setActiveId(term.id)}
              >
                {label}
              </Tab>
            );
          })}
        </TabList>
        <IconButton size="s" className="ghost" label={t("action.new-terminal")} title={t("action.new-terminal")} onClick={() => addTerm()}>
          <PlusIcon />
        </IconButton>
        <span className="flex" />
        <IconButton size="s" className={`ghost ${layout === "cols" ? "on" : ""}`} label={t("terminal.split-vertical")} title={t("terminal.split-vertical")} onClick={() => split("cols")}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M8 3v10"/></svg>
        </IconButton>
        <IconButton size="s" className={`ghost ${layout === "rows" ? "on" : ""}`} label={t("terminal.split-horizontal")} title={t("terminal.split-horizontal")} onClick={() => split("rows")}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M2 8h12"/></svg>
        </IconButton>
        <IconButton size="s" className="ghost" label={t("action.close-active-terminal")} title={t("action.close-active-terminal")} onClick={closeActive}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2.5 4h11M6 4V2.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V4M4 4l.7 9c0 .6.5 1 1 1h4.6c.5 0 1-.4 1-1L12 4M6.5 7v4M9.5 7v4"/></svg>
        </IconButton>
        {p.paneControls && <div className="workspace-pane-controls-slot">{p.paneControls}</div>}
      </div>
      <div className={`term-grid ${layout}`}>
        {terms.map((t) => (
          <div
            key={t.id}
            className={`term-cell ${activeId === t.id ? "focus" : ""}`}
            style={{ display: layout === "single" && activeId !== t.id ? "none" : "block" }}
            onClick={() => setActiveId(t.id)}
          >
            <Terminal
              termId={t.id}
              cwd={p.cwd}
              ws={p.ws}
              visible={p.visible && (layout !== "single" || activeId === t.id)}
              onShortcut={runShortcut}
              onReady={(termId) => {
                readyTerms.current.add(termId);
                runBootstrap(termId);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
