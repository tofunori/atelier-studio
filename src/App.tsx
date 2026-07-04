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
import Rail, { ProjMeta } from "./components/Rail";
import Chat from "./components/Chat";
import AtelierPane from "./components/AtelierPane";
import SettingsPage from "./components/Settings";
import { loadSettings, saveSettings, Settings } from "./lib/settings";
import "./App.css";

const PROJECTS_KEY = "atelier-studio.projects";

export type Attachment = { name: string; lines: string | null; text: string; imageUrl?: string };

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

function addAttachment(list: Attachment[], a: Attachment): Attachment[] {
  return list.some((x) => x.text === a.text) ? list : [...list, a];
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
  const threadsRef = useRef<Thread[]>([]);
  const allThreadsRef = useRef<Thread[]>([]);
  // threads locaux (pas encore connus du sidecar) — nouveaux chats vides
  const [draftThreads, setDraftThreads] = useState<Thread[]>([]);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [workingSince, setWorkingSince] = useState<Record<string, number | null>>({});
  const [usageByThread, setUsageByThread] = useState<
    Record<string, { context: number; output: number; cost: number | null; turns: number | null }>
  >({});
  const [commands, setCommands] = useState<Command[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [injectText, setInjectText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [atelierReload, setAtelierReload] = useState(0);
  const lastInjected = useRef<string | null>(null);
  const pendingPaste = useRef<string | null>(null); // dataURL en attente de sauvegarde
  const pendingResend = useRef<{ threadId: string; prompt: string } | null>(null);
  const [atelierTabs, setAtelierTabs] = useState<
    { id: string; url: string; title: string; color?: string; pinned?: boolean }[]
  >([]);

  // onglets épinglés persistés par projet
  function savePinned(tabs: typeof atelierTabs) {
    if (!activeProject) return;
    const store = JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");
    store[activeProject] = tabs
      .filter((t) => t.pinned)
      .map((t) => ({ url: t.url, title: t.title, color: t.color }));
    localStorage.setItem("atelier-studio.pinnedTabs", JSON.stringify(store));
  }
  const atelierTabsRef = useRef(atelierTabs);
  useEffect(() => {
    atelierTabsRef.current = atelierTabs;
  }, [atelierTabs]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    const root = document.documentElement;
    const r = root.style;
    r.setProperty("--chat-fs", `${settings.chatFontSize}px`);
    r.setProperty("--chat-w", `${settings.chatWidth}px`);
    r.setProperty("--chat-lh", String(settings.chatLineHeight));
    // thème
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = settings.theme === "system" ? (sysDark ? "dark" : "light") : settings.theme;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", settings.density);
    root.style.fontSize = `${settings.baseFontSize}px`;
    root.classList.toggle("no-smoothing", !settings.fontSmoothing);
    const setOrClear = (name: string, val: string) =>
      val ? r.setProperty(name, val) : r.removeProperty(name);
    setOrClear("--accent", settings.accentColor);
    setOrClear("--bg", settings.bgColor);
    setOrClear("--fg", settings.fgColor);
    setOrClear("--ui-font", settings.uiFont ? `'${settings.uiFont}', 'Inter Variable', sans-serif` : "");
    setOrClear("--code-font", settings.codeFont ? `'${settings.codeFont}', ui-monospace, monospace` : "");
  }, [settings]);
  const [dragging, setDragging] = useState(false);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.favorites") ?? "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("atelier-studio.favorites", JSON.stringify(favorites));
  }, [favorites]);
  const activeIdRef = useRef<string | null>(null);
  // chapitres épinglés par thread : {index, label} (persistés)
  const [pins, setPins] = useState<Record<string, { index: number; label: string }[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem("atelier-studio.pins") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem("atelier-studio.pins", JSON.stringify(pins));
  }, [pins]);
  const [compact, setCompact] = useState(() => localStorage.getItem("atelier-studio.compact") === "1");
  const [projMeta, setProjMeta] = useState<Record<string, ProjMeta>>(() => {
    try {
      return JSON.parse(localStorage.getItem("atelier-studio.projMeta") ?? "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("atelier-studio.compact", compact ? "1" : "0");
  }, [compact]);
  useEffect(() => {
    localStorage.setItem("atelier-studio.projMeta", JSON.stringify(projMeta));
  }, [projMeta]);

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
      if (msg.type === "threads") {
        setThreads(msg.threads);
        threadsRef.current = msg.threads;
      }
      if (msg.type === "event") {
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: [...(prev[msg.threadId] ?? []), { ...msg.event, ts: Date.now() }],
        }));
        if (msg.event.kind === "done" && msg.event.usage) {
          setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
        }
        if (msg.event.kind === "done" || msg.event.kind === "error") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: null }));
          if (msg.threadId !== activeIdRef.current) {
            setUnread((u) => new Set(u).add(msg.threadId));
          }
          // l'agent a peut-être régénéré des figures → recharger atelier
          if (msg.event.kind === "done" && settingsRef.current.autoRefreshAtelier) setAtelierReload((n) => n + 1);
        }
      }
      if (msg.type === "history") {
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: prev[msg.threadId]?.length ? prev[msg.threadId] : msg.events,
        }));
      }
      if (msg.type === "annotation" && msg.text !== lastInjected.current) setAnnotation(msg.text);
      if (msg.type === "reverted") {
        const pr = pendingResend.current;
        if (pr && pr.threadId === msg.threadId) {
          pendingResend.current = null;
          setEvents((p) => ({
            ...p,
            [pr.threadId]: [...(p[pr.threadId] ?? []), { kind: "user", text: pr.prompt, ts: Date.now() }],
          }));
          setWorkingSince((p) => ({ ...p, [pr.threadId]: Date.now() }));
          const th = threadsRef.current.find((t) => t.id === pr.threadId);
          if (ws.current?.readyState === 1) {
            sendPrompt(ws.current, {
              threadId: pr.threadId,
              projectRoot: th?.projectRoot ?? "",
              provider: th?.provider ?? "claude",
              prompt: pr.prompt,
            });
          }
        }
      }
      if (msg.type === "imageSaved") {
        const name = msg.path.split("/").pop() ?? "image.png";
        setAttachments((l) =>
          addAttachment(l, {
            name,
            lines: null,
            text: `Image collée par l'utilisateur : ${msg.path}\nLis ce fichier image (outil Read) avant de répondre.`,
            imageUrl: pendingPaste.current ?? undefined,
          }),
        );
        pendingPaste.current = null;
      }
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
    invoke<string>("start_atelier", { root: activeProject, galleryDir: settingsRef.current.galleryPath })
      .then((url) => {
        setAtelierUrls((p) => ({ ...p, [activeProject]: url }));
        // restaurer les onglets épinglés de ce projet
        try {
          const store = JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");
          const pinned: { url: string; title: string; color?: string }[] = store[activeProject] ?? [];
          if (pinned.length) {
            setAtelierTabs((tabs) => {
              const have = new Set(tabs.map((t) => t.url));
              const news = pinned
                .filter((pt) => !have.has(pt.url))
                .map((pt) => ({ id: crypto.randomUUID(), ...pt, pinned: true }));
              return [...tabs, ...news];
            });
          }
        } catch {}
      })
      .catch((e) => console.error("start_atelier:", e));
  }, [activeProject]);

  // "Add to chat" direct depuis atelier (iframe → postMessage)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "atelier-open-tab" && typeof e.data.url === "string") {
        const origin = (e.origin && e.origin !== "null") ? e.origin : "";
        const abs = e.data.url.startsWith("http") ? e.data.url : origin + e.data.url;
        // pas de setState imbriqué (StrictMode double-exécute les updaters) :
        // on lit l'état courant via la ref pour décider, puis on commit les deux.
        const existing = atelierTabsRef.current.find((t) => t.url === abs);
        if (existing) {
          setActiveTab(existing.id);
        } else {
          const id = crypto.randomUUID();
          setAtelierTabs((tabs) => [...tabs, { id, url: abs, title: e.data.title ?? "fichier" }]);
          setActiveTab(id);
        }
      }
      if (e.data?.type === "atelier-add-to-chat" && typeof e.data.text === "string") {
        lastInjected.current = e.data.text;
        setAttachments((l) => addAttachment(l, parseAttachment(e.data.text)));
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

  function newChat() {
    const id = crypto.randomUUID();
    setDraftThreads((p) => [
      {
        id,
        projectRoot: "",
        title: "nouveau chat",
        provider: "claude" as const,
        sessionId: null,
        status: "idle" as const,
        updatedAt: new Date().toISOString(),
      },
      ...p,
    ]);
    setActiveId(id);
    activeIdRef.current = id;
    setEvents((p) => ({ ...p, [id]: [] }));
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
    activeIdRef.current = id;
    setEvents((p) => ({ ...p, [id]: [] }));
  }

  function selectThread(threadId: string, projectRoot: string) {
    setActiveId(threadId);
    activeIdRef.current = threadId;
    if (!projectRoot) {
      setUnread((u) => { const n = new Set(u); n.delete(threadId); return n; });
      if (!events[threadId]?.length && ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: "getHistory", threadId }));
      }
      return;
    }
    setUnread((u) => {
      if (!u.has(threadId)) return u;
      const n = new Set(u);
      n.delete(threadId);
      return n;
    });
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
    mode: "steer" | "queue" = "steer",
  ) {
    const activeThread = allThreadsRef.current.find((t) => t.id === activeId);
    const threadRoot = activeThread ? activeThread.projectRoot : (activeProject ?? "");
    if (!activeId && !activeProject) return;
    // pièce jointe (annotation/sélection atelier) : préfixée au prompt envoyé
    const fullPrompt = attachments.length
      ? `${attachments.map((a) => a.text).join("\n\n")}\n\n${prompt}`.trim()
      : prompt;
    const userEvent = {
      kind: "user" as const,
      text: prompt,
      ts: Date.now(),
      ...(attachments.some((a) => a.imageUrl)
        ? { imageUrl: attachments.find((a) => a.imageUrl)!.imageUrl }
        : {}),
      ...(attachments.some((a) => !a.imageUrl)
        ? {
            label: attachments
              .filter((a) => !a.imageUrl)
              .map((a) => `${a.name}${a.lines ? ` (lines ${a.lines})` : ""}`)
              .join(" · "),
          }
        : {}),
    };
    setAttachments([]);
    // pas de thread sélectionné → en créer un à la volée
    let id = activeId;
    if (!id) {
      id = crypto.randomUUID();
      setDraftThreads((p) => [
        {
          id: id as string,
          projectRoot: activeProject ?? "",
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
      [id]: [...(p[id] ?? []), userEvent],
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
        projectRoot: threadRoot,
        provider,
        prompt: fullPrompt,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(permissionMode ? { permissionMode } : {}),
        mode,
      });
      // le sidecar prend le relais : retirer le brouillon local homonyme
      setDraftThreads((p) => p.filter((t) => t.id !== id));
    }
  }

  const knownIds = new Set(threads.map((t) => t.id));
  const allThreads = [...draftThreads.filter((t) => !knownIds.has(t.id)), ...threads];
  allThreadsRef.current = allThreads;
  const atelierUrl = activeProject ? atelierUrls[activeProject] : null;

  const runningProjects = new Set(
    allThreads.filter((t) => t.status === "running").map((t) => t.projectRoot),
  );

  if (showSettings) {
    return (
      <SettingsPage
        settings={settings}
        onChange={setSettings}
        onClose={() => setShowSettings(false)}
        ws={ws.current}
      />
    );
  }

  return (
    <div className={`app-row ${dragging ? "dragging" : ""}`}>
      {compact && (
        <Rail
          projects={projects}
          activeProject={activeProject}
          meta={projMeta}
          running={runningProjects}
          onSelectProject={setActiveProject}
          onAddProject={addProject}
          onExpand={() => setCompact(false)}
          onSettings={() => setShowSettings((v) => !v)}
          onSetMeta={(root, m) => setProjMeta((p) => ({ ...p, [root]: m }))}
        />
      )}
    <PanelGroup direction="horizontal" className="app">
      {!compact && (<>
      <Panel id="sidebar" order={1} defaultSize={16} minSize={12}>
        <Sidebar
          projects={projects}
          threads={allThreads}
          unread={unread}
          favorites={favorites}
          onToggleFavorite={(id) =>
            setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
          }
          threadOrder={settings.threadOrder}
          activeProject={activeProject}
          activeId={activeId}
          onAddProject={addProject}
          onSelectProject={setActiveProject}
          onSelect={selectThread}
          onNew={newThread}
          onNewChat={newChat}
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
          onCompact={() => setCompact(true)}
          projMeta={projMeta}
          onSetMeta={(root, m) => setProjMeta((prev) => ({ ...prev, [root]: m }))}
        />
      </Panel>
      <PanelResizeHandle className="handle" onDragging={setDragging} />
      </>)}
      <Panel id="chat" order={2} minSize={30}>
        {annotation && (
          <div className="annot-banner">
            <span className="annot-text">{annotation.split("\n")[0].slice(0, 90)}</span>
            <button
              onClick={() => {
                setAttachments((l) => addAttachment(l, parseAttachment(annotation)));
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
          usage={activeId ? (usageByThread[activeId] ?? null) : null}
          commands={commands}
          files={files}
          defaults={settings}
          injectText={injectText}
          onInjected={() => setInjectText(null)}
          attachments={attachments}
          onRemoveAttachment={(i) => setAttachments((l) => l.filter((_, j) => j !== i))}
          onRevert={(index, text, edit) => {
            if (!activeId) return;
            const id = activeId;
            setEvents((p) => ({ ...p, [id]: (p[id] ?? []).slice(0, index) }));
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "revert", threadId: id, text }));
            }
            if (edit) setInjectText(text);
          }}
          pins={activeId ? (pins[activeId] ?? []) : []}
          onTogglePin={(index, label) => {
            if (!activeId) return;
            const id = activeId;
            setPins((p) => {
              const cur = p[id] ?? [];
              const exists = cur.find((c) => c.index === index);
              return {
                ...p,
                [id]: exists
                  ? cur.filter((c) => c.index !== index)
                  : [...cur, { index, label }].sort((a, b) => a.index - b.index),
              };
            });
          }}
          onEditSend={(index, oldText, newText) => {
            if (!activeId) return;
            const id = activeId;
            setEvents((p) => ({ ...p, [id]: (p[id] ?? []).slice(0, index) }));
            pendingResend.current = { threadId: id, prompt: newText };
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "revert", threadId: id, text: oldText }));
            }
          }}
          onStop={() => {
            if (activeId && ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "interrupt", threadId: activeId }));
            }
          }}
          onPasteImage={(dataURL) => {
            if (ws.current?.readyState === 1) {
              pendingPaste.current = dataURL;
              ws.current.send(JSON.stringify({ type: "saveImage", dataURL }));
            }
          }}
          onQuote={(text) =>
            setAttachments((l) =>
              addAttachment(l, {
                name: `« ${text.slice(0, 50)}${text.length > 50 ? "…" : ""} »`,
                lines: null,
                text: `Citation de la conversation :\n> ${text.split("\n").join("\n> ")}`,
              }),
            )
          }
          disabled={!activeProject && !activeId}
          onSubmit={submit}
        />
      </Panel>
      {showAtelier && atelierUrl && (
        <>
          <PanelResizeHandle className="handle" onDragging={setDragging} />
          <Panel id="atelier" order={3} defaultSize={38} minSize={20}>
            <AtelierPane
              url={atelierUrl}
              files={files}
              onReorderTabs={(ids) => {
                setAtelierTabs((tabs) => {
                  const byId = new Map(tabs.map((t) => [t.id, t]));
                  const next = ids.map((id) => byId.get(id)!).filter(Boolean);
                  savePinned(next);
                  return next;
                });
              }}
              onPinTab={(id) => {
                setAtelierTabs((tabs) => {
                  const next = tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
                  savePinned(next);
                  return next;
                });
              }}
              onColorTab={(id, color) => {
                setAtelierTabs((tabs) => {
                  const next = tabs.map((t) => (t.id === id ? { ...t, color } : t));
                  savePinned(next);
                  return next;
                });
              }}
              onOpenFile={(rel) => {
                if (!atelierUrl || !activeProject) return;
                const origin = new URL(atelierUrl).origin;
                const ext = rel.split(".").pop()?.toLowerCase() ?? "";
                const name = rel.split("/").pop() ?? rel;
                let url: string;
                if (ext === "pdf") {
                  url = `${origin}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(rel)}`;
                } else if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
                  url = `${origin}/${rel}`;
                } else if (ext === "md") {
                  url = `${origin}/.fig_thumbs/md_studio.html?path=${encodeURIComponent(
                    `${activeProject}/${rel}`,
                  )}`;
                } else {
                  url = `${origin}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(
                    `${activeProject}/${rel}`,
                  )}`;
                }
                const existing = atelierTabsRef.current.find((t) => t.url === url);
                if (existing) {
                  setActiveTab(existing.id);
                } else {
                  const id = crypto.randomUUID();
                  setAtelierTabs((tabs) => [...tabs, { id, url, title: name }]);
                  setActiveTab(id);
                }
              }}
              tabs={atelierTabs}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onCloseTab={(id) => {
                setAtelierTabs((tabs) => {
                  const next = tabs.filter((t) => t.id !== id);
                  savePinned(next);
                  return next;
                });
                setActiveTab((cur) => (cur === id ? "gallery" : cur));
              }}
              reloadKey={atelierReload}
              onHardReload={() => {
                if (!activeProject) return;
                // relance start_atelier : redémarre le serveur s'il est mort
                invoke<string>("start_atelier", { root: activeProject, galleryDir: settingsRef.current.galleryPath })
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
    </div>
  );
}
