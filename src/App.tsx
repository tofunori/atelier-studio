import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { connectSidecar, sendPrompt, Thread, AgentEvent } from "./lib/ws";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import AtelierPane from "./components/AtelierPane";
import "./App.css";

// Tant que le sidecar n'existe pas (plomberie en cours), l'UI tourne en mode
// mock : threads factices + réponse simulée, pour valider le look & feel.
const MOCK_THREADS: Thread[] = [
  {
    id: "mock-1",
    projectRoot: "",
    title: "alo",
    provider: "claude",
    sessionId: null,
    status: "running",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    projectRoot: "",
    title: "alo",
    provider: "codex",
    sessionId: null,
    status: "done",
    updatedAt: new Date().toISOString(),
  },
];

export default function App() {
  const ws = useRef<WebSocket | null>(null);
  const [mock, setMock] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [atelierUrl, setAtelierUrl] = useState<string | null>(null);
  const [showAtelier, setShowAtelier] = useState(true);

  useEffect(() => {
    connectSidecar((msg) => {
      if (msg.type === "threads") setThreads(msg.threads);
      if (msg.type === "event")
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: [...(prev[msg.threadId] ?? []), msg.event],
        }));
      if (msg.type === "error") console.error("sidecar:", msg.message);
    })
      .then((s) => {
        ws.current = s;
      })
      .catch(() => {
        setMock(true);
        setThreads(MOCK_THREADS);
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "a") {
        setShowAtelier((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openProject() {
    const root = await open({ directory: true });
    if (typeof root !== "string") return;
    setProjectRoot(root);
    try {
      setAtelierUrl(await invoke<string>("start_atelier", { root }));
    } catch (e) {
      console.error("start_atelier:", e);
    }
  }

  function newThread() {
    if (!projectRoot) return;
    const id = crypto.randomUUID();
    setActiveId(id);
    setEvents((p) => ({ ...p, [id]: [] }));
  }

  function submit(prompt: string, provider: "claude" | "codex") {
    if (!projectRoot || !activeId) return;
    setEvents((p) => ({
      ...p,
      [activeId]: [...(p[activeId] ?? []), { kind: "text", text: `**Toi :** ${prompt}` }],
    }));
    if (mock) {
      const id = activeId;
      setTimeout(() => {
        setEvents((p) => ({
          ...p,
          [id]: [
            ...(p[id] ?? []),
            { kind: "tool", name: "Bash (simulé)" },
            {
              kind: "text",
              text: `*(mode mock — ${provider} sera branché à la fin de la plomberie)*\n\nVoici à quoi ressemblera une réponse **markdown** de l'agent.`,
            },
            { kind: "done", ok: true, result: "" },
          ],
        }));
      }, 800);
      return;
    }
    if (ws.current) {
      sendPrompt(ws.current, { threadId: activeId, projectRoot, provider, prompt });
    }
  }

  const visibleThreads = threads.filter(
    (t) => mock || !projectRoot || t.projectRoot === projectRoot,
  );
  const shownThreads =
    activeId && !threads.some((t) => t.id === activeId)
      ? [
          {
            id: activeId,
            projectRoot: projectRoot ?? "",
            title: "nouveau thread",
            provider: "claude" as const,
            sessionId: null,
            status: "idle" as const,
            updatedAt: new Date().toISOString(),
          },
          ...visibleThreads,
        ]
      : visibleThreads;

  return (
    <PanelGroup direction="horizontal" className="app">
      <Panel defaultSize={16} minSize={12}>
        <Sidebar
          threads={shownThreads}
          projectRoot={projectRoot}
          activeId={activeId}
          onOpenProject={openProject}
          onSelect={setActiveId}
          onNew={newThread}
        />
      </Panel>
      <PanelResizeHandle className="handle" />
      <Panel minSize={30}>
        <Chat
          events={activeId ? (events[activeId] ?? []) : []}
          disabled={!projectRoot || !activeId}
          onSubmit={submit}
        />
      </Panel>
      {showAtelier && atelierUrl && (
        <>
          <PanelResizeHandle className="handle" />
          <Panel defaultSize={38} minSize={20}>
            <AtelierPane url={atelierUrl} />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
