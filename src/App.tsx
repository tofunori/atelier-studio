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

export type Attachment = { name: string; lines: string | null; text: string };

// « /chemin/avec espaces/CLAUDE.md (p.L11-224) : « … » » → {name: CLAUDE.md, lines: 11-224}
function parseAttachment(text: string): Attachment {
  const first = text.split("\n")[0].trim();
  // format viewer : <chemin> (p.LX-Y|p.N) : « … »   — chemin peut contenir des espaces
  let m = /^(.+?)\s*\((?:p\.)?(L?[\d:.,\-–]+)\)\s*:?/.exec(first);
  if (m) {
    return {
      name: m[1].split("/").pop() || m[1],
      lines: m[2].replace(/^L/, ""),
      text,
    };
  }
  // format annotation image : <chemin.png> …
  if (first.includes("/")) {
    const tok = first.split(/\s+/).find((t) => t.includes("/")) ?? first;
    return { name: tok.split("/").pop() || tok, lines: null, text };
  }
  return { name: first.slice(0, 60) || "citation", lines: null, text };
}

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
  const [wsReady, setWsReady] = useState(false);
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
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [injectText, setInjectText] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [atelierReload, setAtelierReload] = useState(0);
  const lastInjected = useRef<string | null>(null);
  const [atelierTabs, setAtelierTabs] = useState<{ id: string; url: string; title: string }[]>([]);
  const [chatFontSize, setChatFontSize] = useState<number>(() =>
    Number(localStorage.getItem("atelier-studio.chatFontSize") ?? 15),
  );
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem("atelier-studio.chatFontSize", String(chatFontSize));
    document.documentElement.style.setProperty("--chat-fs", `${chatFontSize}px`);
  }, [chatFontSize]);
  const [activeTab, setActiveTab] = useState<string>("gallery");
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
          // l'agent a peut-être régénéré des figures → recharger atelier
          if (msg.event.kind === "done") setAtelierReload((n) => n + 1);
        }
      }
      if (msg.type === "history") {
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: prev[msg.threadId]?.length ? prev[msg.threadId] : msg.events,
        }));
      }
      if (msg.type === "annotation" && msg.text !== lastInjected.current) setAnnotation(msg.text);
      if (msg.type === "commands") setCommands(msg.commands);
      if (msg.type === "files") setFiles(msg.files);
      if (msg.type === "error") console.error("sidecar:", msg.message);
    })
      .then((s) => {
        ws.current = s;
        setWsReady(true);
      })
      .catch(() => setMock(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  // catalogue skills + fichiers du projet actif (pour les menus / et @)
  useEffect(() => {
    if (activeProject && wsReady && ws.current?.readyState === 1) {
      requestCatalog(ws.current, activeProject);
    }
  }, [activeProject, wsReady]);

  // (ré)ouvre le serveur atelier du projet actif
  useEffect(() => {
    if (!activeProject || atelierUrls[activeProject]) return;
    invoke<string>("start_atelier", { root: activeProject })
      .then((url) => setAtelierUrls((p) => ({ ...p, [activeProject]: url })))
      .catch((e) => console.error("start_atelier:", e));
  }, [activeProject]);

  // "Add to chat" direct depuis atelier (iframe → postMessage)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "atelier-open-tab" && typeof e.data.url === "string") {
        const origin = (e.origin && e.origin !== "null") ? e.origin : "";
        const abs = e.data.url.startsWith("http") ? e.data.url : origin + e.data.url;
        setAtelierTabs((tabs) => {
          const existing = tabs.find((t) => t.url === abs);
          if (existing) {
            setActiveTab(existing.id);
            return tabs;
          }
          const id = crypto.randomUUID();
          setActiveTab(id);
          return [...tabs, { id, url: abs, title: e.data.title ?? "fichier" }];
        });
      }
      if (e.data?.type === "atelier-add-to-chat" && typeof e.data.text === "string") {
        lastInjected.current = e.data.text;
        setAttachment(parseAttachment(e.data.text));
        setAnnotation(null); // pas de bannière en double
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
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
    // conversation pas encore en mémoire → recharger l'historique de la session
    if (!events[threadId]?.length && ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({ type: "getHistory", threadId }));
    }
  }

  function submit(
    prompt: string,
    provider: "claude" | "codex",
    model: string,
    effort: string,
    permissionMode: string,
  ) {
    if (!activeProject) return;
    // pièce jointe (annotation/sélection atelier) : préfixée au prompt envoyé
    const fullPrompt = attachment ? `${attachment.text}\n\n${prompt}`.trim() : prompt;
    const shownPrompt = attachment
      ? `📎 *${attachment.name}${attachment.lines ? ` (lines ${attachment.lines})` : ""}*\n\n${prompt}`
      : prompt;
    setAttachment(null);
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
      [id]: [...(p[id] ?? []), { kind: "text", text: `**Toi :** ${shownPrompt}` }],
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
        prompt: fullPrompt,
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
          onDelete={(threadId) => {
            setDraftThreads((p) => p.filter((t) => t.id !== threadId));
            setEvents((p) => {
              const { [threadId]: _, ...rest } = p;
              return rest;
            });
            if (activeId === threadId) setActiveId(null);
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "deleteThread", threadId }));
            }
          }}
          onRename={(threadId, title) => {
            setDraftThreads((p) =>
              p.map((t) => (t.id === threadId ? { ...t, title } : t)),
            );
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "renameThread", threadId, title }));
            }
          }}
          onSettings={() => setShowSettings((v) => !v)}
        />
      </Panel>
      <PanelResizeHandle className="handle" />
      <Panel minSize={30}>
        {showSettings && (
          <div className="settings-pop">
            <div className="settings-row">
              <span>Taille du texte du chat</span>
              <input
                type="range"
                min={12}
                max={19}
                step={0.5}
                value={chatFontSize}
                onChange={(e) => setChatFontSize(Number(e.target.value))}
              />
              <span className="settings-val">{chatFontSize}px</span>
            </div>
            <button className="ghost" onClick={() => setShowSettings(false)}>
              Fermer
            </button>
          </div>
        )}
        {annotation && (
          <div className="annot-banner">
            <span className="annot-text">✏️ {annotation.split("\n")[0].slice(0, 90)}</span>
            <button
              onClick={() => {
                setAttachment(parseAttachment(annotation));
                setAnnotation(null);
              }}
            >
              Envoyer à l'agent
            </button>
            <button className="ghost" onClick={() => setAnnotation(null)}>
              ✕
            </button>
          </div>
        )}
        <Chat
          events={activeId ? (events[activeId] ?? []) : []}
          workingSince={activeId ? (workingSince[activeId] ?? null) : null}
          commands={commands}
          files={files}
          injectText={injectText}
          onInjected={() => setInjectText(null)}
          attachment={attachment}
          onClearAttachment={() => setAttachment(null)}
          onQuote={(text) =>
            setAttachment({
              name: `« ${text.slice(0, 50)}${text.length > 50 ? "…" : ""} »`,
              lines: null,
              text: `Citation de la conversation :\n> ${text.split("\n").join("\n> ")}`,
            })
          }
          disabled={!activeProject}
          onSubmit={submit}
        />
      </Panel>
      {showAtelier && atelierUrl && (
        <>
          <PanelResizeHandle className="handle" />
          <Panel defaultSize={38} minSize={20}>
            <AtelierPane
              url={atelierUrl}
              tabs={atelierTabs}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onCloseTab={(id) => {
                setAtelierTabs((tabs) => tabs.filter((t) => t.id !== id));
                setActiveTab((cur) => (cur === id ? "gallery" : cur));
              }}
              reloadKey={atelierReload}
              onHardReload={() => {
                if (!activeProject) return;
                // relance start_atelier : redémarre le serveur s'il est mort
                invoke<string>("start_atelier", { root: activeProject })
                  .then((url) => {
                    setAtelierUrls((p) => ({ ...p, [activeProject]: url }));
                    setAtelierReload((n) => n + 1);
                  })
                  .catch((e) => console.error("start_atelier:", e));
              }}
            />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
