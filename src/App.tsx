import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  connectSidecar,
  sendPrompt,
  requestCatalog,
  Thread,
  AgentEvent,
  Command,
} from "./lib/ws";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import AtelierPane from "./components/AtelierPane";
import "./App.css";

const PROJECTS_KEY = "atelier-studio.projects";

function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const ws = useRef<WebSocket | null>(null);
  const [mock, setMock] = useState(false);
  const [projects, setProjects] = useState<string[]>(loadProjects);
  const [activeProject, setActiveProject] = useState<string | null>(
    loadProjects()[0] ?? null,
  );
  const [threads, setThreads] = useState<Thread[]>([]);
  // threads locaux (pas encore connus du sidecar) — nouveaux chats vides
  const [draftThreads, setDraftThreads] = useState<Thread[]>([]);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [workingSince, setWorkingSince] = useState<Record<string, number | null>>({});
  const [commands, setCommands] = useState<Command[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [atelierUrls, setAtelierUrls] = useState<Record<string, string>>({});
  const [showAtelier, setShowAtelier] = useState(true);

  const connectedOnce = useRef(false);
  useEffect(() => {
    // React StrictMode monte l'effet 2× en dev → sans ce garde, 2 connexions
    // WS reçoivent chaque broadcast et tout apparaît en double.
    if (connectedOnce.current) return;
    connectedOnce.current = true;
    connectSidecar((msg) => {
      if (msg.type === "threads") setThreads(msg.threads);
      if (msg.type === "event") {
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: [...(prev[msg.threadId] ?? []), msg.event],
        }));
        if (msg.event.kind === "done" || msg.event.kind === "error") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: null }));
        }
      }
      if (msg.type === "commands") setCommands(msg.commands);
      if (msg.type === "files") setFiles(msg.files);
      if (msg.type === "error") console.error("sidecar:", msg.message);
    })
      .then((s) => {
        ws.current = s;
      })
      .catch(() => setMock(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  // catalogue skills + fichiers du projet actif (pour les menus / et @)
  useEffect(() => {
    if (activeProject && ws.current?.readyState === 1) {
      requestCatalog(ws.current, activeProject);
    }
  }, [activeProject, mock]);

  // (ré)ouvre le serveur atelier du projet actif
  useEffect(() => {
    if (!activeProject || atelierUrls[activeProject]) return;
    invoke<string>("start_atelier", { root: activeProject })
      .then((url) => setAtelierUrls((p) => ({ ...p, [activeProject]: url })))
      .catch((e) => console.error("start_atelier:", e));
  }, [activeProject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "a") {
        setShowAtelier((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function addProject() {
    const root = await open({ directory: true });
    if (typeof root !== "string") return;
    setProjects((p) => (p.includes(root) ? p : [...p, root]));
    setActiveProject(root);
  }

  function newThread(projectRoot: string) {
    const id = crypto.randomUUID();
    setDraftThreads((p) => [
      {
        id,
        projectRoot,
        title: "nouveau chat",
        provider: "claude" as const,
        sessionId: null,
        status: "idle" as const,
        updatedAt: new Date().toISOString(),
      },
      ...p,
    ]);
    setActiveProject(projectRoot);
    setActiveId(id);
    setEvents((p) => ({ ...p, [id]: [] }));
  }

  function selectThread(threadId: string, projectRoot: string) {
    setActiveId(threadId);
    setActiveProject(projectRoot);
  }

  function submit(
    prompt: string,
    provider: "claude" | "codex",
    model: string,
    effort: string,
    permissionMode: string,
  ) {
    if (!activeProject) return;
    // pas de thread sélectionné → en créer un à la volée
    let id = activeId;
    if (!id) {
      id = crypto.randomUUID();
      setDraftThreads((p) => [
        {
          id: id as string,
          projectRoot: activeProject,
          title: prompt.slice(0, 40),
          provider,
          sessionId: null,
          status: "idle" as const,
          updatedAt: new Date().toISOString(),
        },
        ...p,
      ]);
      setActiveId(id);
    }
    setEvents((p) => ({
      ...p,
      [id]: [...(p[id] ?? []), { kind: "text", text: `**Toi :** ${prompt}` }],
    }));
    setWorkingSince((p) => ({ ...p, [id as string]: Date.now() }));
    if (mock) {
      setDraftThreads((p) =>
        p.map((t) =>
          t.id === id ? { ...t, title: prompt.slice(0, 40), status: "running" } : t,
        ),
      );
      setTimeout(() => {
        setDraftThreads((p) =>
          p.map((t) => (t.id === id ? { ...t, status: "done" } : t)),
        );
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
      sendPrompt(ws.current, {
        threadId: id,
        projectRoot: activeProject,
        provider,
        prompt,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(permissionMode ? { permissionMode } : {}),
      });
      // le sidecar prend le relais : retirer le brouillon local homonyme
      setDraftThreads((p) => p.filter((t) => t.id !== id));
    }
  }

  const knownIds = new Set(threads.map((t) => t.id));
  const allThreads = [...draftThreads.filter((t) => !knownIds.has(t.id)), ...threads];
  const atelierUrl = activeProject ? atelierUrls[activeProject] : null;

  return (
    <PanelGroup direction="horizontal" className="app">
      <Panel defaultSize={16} minSize={12}>
        <Sidebar
          projects={projects}
          threads={allThreads}
          activeProject={activeProject}
          activeId={activeId}
          onAddProject={addProject}
          onSelectProject={setActiveProject}
          onSelect={selectThread}
          onNew={newThread}
        />
      </Panel>
      <PanelResizeHandle className="handle" />
      <Panel minSize={30}>
        <Chat
          events={activeId ? (events[activeId] ?? []) : []}
          workingSince={activeId ? (workingSince[activeId] ?? null) : null}
          commands={commands}
          files={files}
          disabled={!activeProject}
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
