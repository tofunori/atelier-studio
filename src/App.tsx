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
import { setWs } from "./lib/wsBus";
import Chat from "./components/Chat";
import Banner from "./components/Banner";
import AtelierPane from "./components/AtelierPane";
import SettingsPage from "./components/Settings";
import { CloseIcon } from "./components/icons";
import { loadSettings, saveSettings, Settings } from "./lib/settings";
import { THEME_PRESETS, presetById } from "./lib/themes";
import {
  atelierTargetOrigin,
  isTrustedAtelierMessage,
  withAtelierNonce,
  type AtelierOutboundMessage,
} from "./lib/ipc";
import "./App.css";

const PROJECTS_KEY = "atelier-studio.projects";

export type Attachment = { name: string; lines: string | null; text: string; imageUrl?: string; path?: string };

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

// handoff inter-provider : sérialise la conversation visible (bornée) pour
// que le nouveau provider reprenne avec le contexte — façon Synara.
function buildHandoff(events: AgentEvent[], fromProvider: string): string {
  const lines: string[] = [];
  for (const e of events) {
    if (e.kind === "user") lines.push(`Utilisateur : ${e.text}`);
    else if (e.kind === "text") lines.push(`Agent (${fromProvider}) : ${e.text}`);
  }
  let transcript = lines.join("\n\n");
  const MAX = 12000;
  if (transcript.length > MAX) transcript = "[…début tronqué…]\n" + transcript.slice(-MAX);
  return (
    "Tu reprends une conversation commencée avec un autre agent. " +
    "Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n" +
    "---\n" + transcript + "\n---\n\n"
  );
}

function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const atelierNonceRef = useRef(crypto.randomUUID());
  const atelierNonce = atelierNonceRef.current;
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
  const [appBanner, setAppBanner] = useState<{
    text: string;
    actionLabel?: string;
    onAction?: () => void;
    closable?: boolean;
  } | null>(null);
  const lastInjected = useRef<string | null>(null);
  const pendingPaste = useRef<string | null>(null); // dataURL en attente de sauvegarde
  const pendingResend = useRef<{ threadId: string; prompt: string } | null>(null);
  const [atelierTabs, setAtelierTabs] = useState<
    { id: string; url: string; title: string; color?: string; pinned?: boolean; kind?: "term"; cwd?: string }[]
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
    const preset = THEME_PRESETS.find((t) => t.id === settings.themePreset);
    const theme = preset
      ? (preset.dark ? "dark" : "light")
      : settings.theme === "system" ? (sysDark ? "dark" : "light") : settings.theme;
    root.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("app-theme-changed", { detail: settings.themePreset }));
    // propager aux iframes atelier (galerie, viewers)
    setTimeout(() => {
      document.querySelectorAll("iframe.atelier").forEach((f) => {
        const iframe = f as HTMLIFrameElement;
        const targetOrigin = atelierTargetOrigin(iframe.src);
        if (!targetOrigin) return;
        const message: AtelierOutboundMessage = {
          type: "atelier-theme",
          nonce: atelierNonce,
          vars: presetById(settings.themePreset).vars,
        };
        iframe.contentWindow?.postMessage(message, targetOrigin);
      });
    }, 50);
    // preset : pose toutes les variables ; "atelier" = valeurs de la feuille
    for (const k of ["--bg","--bg-side","--bg-pop","--bg-card","--bg-ctl","--border","--border2","--fg","--fg2","--muted","--muted2","--accent"]) {
      if (preset && preset.id !== "atelier") r.setProperty(k, preset.vars[k]);
      else r.removeProperty(k);
    }
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
  const [goals, setGoals] = useState<Record<string, string>>({}); // threadId -> condition
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
  // largeur FIXE de la sidebar (px) : hors PanelGroup pour ne pas gonfler
  // quand le panneau atelier passe en pleine largeur
  const [sideW, setSideW] = useState(() => {
    const v = Number(localStorage.getItem("atelier-studio.sideW"));
    return v >= 180 && v <= 420 ? v : 250;
  });
  useEffect(() => { localStorage.setItem("atelier-studio.sideW", String(sideW)); }, [sideW]);
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
  const [layout, setLayout] = useState<"split" | "chat" | "atelier">("split");
  const showAtelier = layout !== "chat";

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
        if (msg.event.kind === "started") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: p[msg.threadId] ?? Date.now() }));
          return;
        }
        setEvents((prev) => {
          const list = [...(prev[msg.threadId] ?? [])];
          const ev = msg.event;
          const last = list[list.length - 1];
          // texte en cours de frappe : accumuler (delta) ou remplacer (stream_set),
          // puis le message final "text" remplace la bulle streaming
          if (ev.kind === "delta") {
            if (last?.kind === "streaming") {
              list[list.length - 1] = { ...last, text: (last as any).text + ev.text };
            } else {
              list.push({ kind: "streaming", text: ev.text, ts: Date.now() } as any);
            }
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "stream_set") {
            if (last?.kind === "streaming") {
              list[list.length - 1] = { ...last, text: ev.text };
            } else {
              list.push({ kind: "streaming", text: ev.text, ts: Date.now() } as any);
            }
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "text" && last?.kind === "streaming") {
            list[list.length - 1] = { ...ev, ts: Date.now() };
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "tool_update") {
            const idx = list.findIndex((item) => item.kind === "tool_update" && item.id === ev.id);
            const next = { ...ev, ts: Date.now() } as AgentEvent;
            if (idx >= 0) list[idx] = next;
            else list.push(next);
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "todos") {
            let idx = -1;
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].kind === "todos") {
                idx = i;
                break;
              }
            }
            const next = { ...ev, ts: Date.now() } as AgentEvent;
            if (idx >= 0) list[idx] = next;
            else list.push(next);
            return { ...prev, [msg.threadId]: list };
          }
          // fin de tour : une bulle streaming orpheline devient un texte définitif
          if ((ev.kind === "done" || ev.kind === "error") && last?.kind === "streaming") {
            list[list.length - 1] = { kind: "text", text: (last as any).text, ts: Date.now() } as any;
          }
          return { ...prev, [msg.threadId]: [...list, { ...ev, ts: Date.now() }] };
        });
        if (msg.event.kind === "done" && typeof msg.event.result === "string" &&
            /goal (atteint|achieved|accompli|complete)/i.test(msg.event.result)) {
          setGoals((g) => { const { [msg.threadId]: _, ...rest } = g; return rest; });
        }
        if (msg.event.kind === "done" && msg.event.usage) {
          setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
        }
        if (msg.event.kind === "done" && msg.event.ok === false &&
            /login|auth|credentials/i.test(msg.event.result ?? "")) {
          setAppBanner({
            text: "Lance `codex login` (ou `claude login`) dans le Terminal",
            closable: true,
          });
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
            path: msg.path,
          }),
        );
        pendingPaste.current = null;
      }
      if (msg.type === "frameChecked") {
        window.dispatchEvent(new CustomEvent("frame-checked", { detail: msg }));
      }
      if (msg.type === "localServers") {
        window.dispatchEvent(new CustomEvent("local-servers", { detail: msg.servers }));
      }
      if (msg.type === "termData") {
        window.dispatchEvent(new CustomEvent(`term-data:${msg.termId}`, { detail: msg.data }));
      }
      if (msg.type === "termExit") {
        window.dispatchEvent(new CustomEvent(`term-exit:${msg.termId}`));
      }
      if (msg.type === "gitStatus") {
        window.dispatchEvent(new CustomEvent("git-status", { detail: msg }));
      }
      if (msg.type === "gitDiff") {
        window.dispatchEvent(new CustomEvent("git-diff", { detail: msg }));
      }
      if (msg.type === "commitMsg") {
        window.dispatchEvent(new CustomEvent("commit-msg", { detail: msg }));
      }
      if (msg.type === "ledger") {
        window.dispatchEvent(new CustomEvent("ledger", { detail: msg }));
      }
      if (msg.type === "zoteroItems") {
        window.dispatchEvent(new CustomEvent("zotero-items", { detail: msg }));
      }
      if (msg.type === "zoteroCollections") {
        window.dispatchEvent(new CustomEvent("zotero-collections", { detail: msg }));
      }
      if (msg.type === "zoteroFav") {
        window.dispatchEvent(new CustomEvent("zotero-fav", { detail: msg }));
      }
      if (msg.type === "gitChanged" || msg.type === "gitStageDone" || msg.type === "gitUnstageDone" ||
          msg.type === "gitRevertFileDone" || msg.type === "gitCommitDone" || msg.type === "gitUndoLastTurnDone") {
        window.dispatchEvent(new CustomEvent("git-changed", { detail: msg }));
      }
      if (msg.type === "exported") {
        setEvents((p) => ({
          ...p,
          [msg.threadId]: [...(p[msg.threadId] ?? []),
            { kind: "text", text: `Conversation exportée : \`${msg.path}\` (+ .json)`, ts: Date.now() }],
        }));
      }
      if (msg.type === "zoteroChanged") {
        window.dispatchEvent(new CustomEvent("zotero-changed"));
      }
      if (msg.type === "sessions") {
        window.dispatchEvent(new CustomEvent("sessions-list", { detail: msg.sessions }));
      }
      if (msg.type === "commands") setCommands(msg.commands);
      if (msg.type === "files") setFiles(msg.files);
      if (msg.type === "error") console.error("sidecar:", msg.message);
    }, (next) => {
      ws.current = next;
      setWs(next);
      setAppBanner((b) => b?.text === "Sidecar déconnecté, reconnexion…" ? null : b);
      setWsReady(true);
    }, () => {
      setWsReady(false);
      setAppBanner({ text: "Sidecar déconnecté, reconnexion…" });
    })
      .then((s) => {
        ws.current = s;
        setWs(s);
        setWsReady(true);
      })
      .catch(() => {
        setMock(true);
        setAppBanner({ text: "Sidecar déconnecté, reconnexion…" });
      });
  }, []);

  useEffect(() => {
    const onCitation = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string;
        key: string;
        citeKey?: string;
        title?: string;
      };
      const label = detail.citeKey ? `@${detail.citeKey}` : `@${detail.key}`;
      setAttachments((l) =>
        addAttachment(l, {
          name: label,
          lines: null,
          text: detail.text,
        }),
      );
    };
    window.addEventListener("atelier-add-to-chat-citation", onCitation);
    return () => window.removeEventListener("atelier-add-to-chat-citation", onCitation);
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
        const nonceUrl = withAtelierNonce(url, atelierNonce);
        setAppBanner((b) => b?.text.startsWith("start_atelier:") ? null : b);
        setAtelierUrls((p) => ({ ...p, [activeProject]: nonceUrl }));
        // restaurer les onglets épinglés de ce projet
        try {
          const store = JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");
          const pinned: { url: string; title: string; color?: string }[] = store[activeProject] ?? [];
          if (pinned.length) {
            setAtelierTabs((tabs) => {
              const have = new Set(tabs.map((t) => t.url));
              const news = pinned
                .filter((pt) => !have.has(pt.url))
                .map((pt) => ({ id: crypto.randomUUID(), ...pt, url: withAtelierNonce(pt.url, atelierNonce), pinned: true }));
              return [...tabs, ...news];
            });
          }
        } catch {}
      })
      .catch((e) => {
        console.error("start_atelier:", e);
        setAppBanner({
          text: `start_atelier: ${String(e)}`,
          actionLabel: "Réglages",
          onAction: () => setShowSettings(true),
          closable: true,
        });
      });
  }, [activeProject]);

  // "Add to chat" depuis le Browser (presse-papier + URL de la page)
  useEffect(() => {
    const onBrowserAdd = (e: Event) => {
      const { text, url } = (e as CustomEvent).detail as { text: string; url: string };
      let name = "extrait web";
      try { name = url ? new URL(url).hostname : name; } catch {}
      setAttachments((l) =>
        addAttachment(l, {
          name,
          lines: null,
          text: `Extrait copié depuis ${url || "une page web"} :\n> ${text.split("\n").join("\n> ")}`,
        }),
      );
    };
    window.addEventListener("browser-add-to-chat", onBrowserAdd);
    return () => window.removeEventListener("browser-add-to-chat", onBrowserAdd);
  }, []);

  // "Add to chat" direct depuis atelier (iframe → postMessage)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!isTrustedAtelierMessage(e, atelierNonce)) {
        if (import.meta.env.DEV) console.warn("Message atelier ignoré", e.origin, e.data);
        return;
      }
      const data = e.data;
      if (data.type === "atelier-theme-request" && e.source) {
        const message: AtelierOutboundMessage = {
          type: "atelier-theme",
          nonce: atelierNonce,
          vars: presetById(settingsRef.current.themePreset).vars,
        };
        (e.source as Window).postMessage(message, e.origin);
      }
      if (data.type === "atelier-open-tab") {
        const abs = withAtelierNonce(data.url.startsWith("http") ? data.url : e.origin + data.url, atelierNonce);
        // pas de setState imbriqué (StrictMode double-exécute les updaters) :
        // on lit l'état courant via la ref pour décider, puis on commit les deux.
        const existing = atelierTabsRef.current.find((t) => t.url === abs);
        if (existing) {
          setActiveTab(existing.id);
        } else {
          const id = crypto.randomUUID();
          setAtelierTabs((tabs) => [...tabs, { id, url: abs, title: data.title ?? "fichier" }]);
          setActiveTab(id);
        }
      }
      if (data.type === "atelier-add-to-chat") {
        lastInjected.current = data.text;
        setAttachments((l) => addAttachment(l, parseAttachment(data.text)));
        setAnnotation(null); // pas de bannière en double
      }
      if (data.type === "browser-add-to-chat") {
        let name = "extrait web";
        try { name = data.url ? new URL(data.url).hostname : name; } catch {}
        setAttachments((l) =>
          addAttachment(l, {
            name,
            lines: null,
            text: `Extrait copié depuis ${data.url || "une page web"} :\n> ${data.text.split("\n").join("\n> ")}`,
          }),
        );
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // ouvrir un fichier du projet dans un onglet atelier (explorer, liens fichier:ligne du chat)
  function openFileTab(rel: string, line?: string | null) {
    if (!atelierUrl || !activeProject) return;
    const origin = new URL(atelierUrl).origin;
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    const name = rel.split("/").pop() ?? rel;
    const lineQ = line ? `&line=${encodeURIComponent(line)}` : "";
    let url: string;
    if (ext === "pdf") {
      url = `${origin}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(rel)}`;
    } else if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
      url = `${origin}/${rel}`;
    } else if (ext === "md") {
      url = `${origin}/.fig_thumbs/md_studio.html?path=${encodeURIComponent(`${activeProject}/${rel}`)}`;
    } else {
      url = `${origin}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${activeProject}/${rel}`)}${lineQ}`;
    }
    url = withAtelierNonce(url, atelierNonce);
    const baseUrl = url.replace(/&line=[^&]*/, "");
    const existing = atelierTabsRef.current.find((t) => t.url.replace(/&line=[^&]*/, "") === baseUrl);
    if (existing) {
      // même fichier déjà ouvert : re-cibler la ligne demandée si besoin
      if (existing.url !== url) {
        setAtelierTabs((tabs) => tabs.map((t) => (t.id === existing.id ? { ...t, url } : t)));
      }
      setActiveTab(existing.id);
    } else {
      const id = crypto.randomUUID();
      setAtelierTabs((tabs) => [...tabs, { id, url, title: name }]);
      setActiveTab(id);
    }
    setLayout((l) => (l === "chat" ? "split" : l));
  }
  const openFileTabRef = useRef(openFileTab);
  openFileTabRef.current = openFileTab;
  const filesRef = useRef(files);
  filesRef.current = files;

  // clic sur une réf "fichier.tex:31" dans une réponse du chat
  useEffect(() => {
    const onOpen = (e: Event) => {
      const { rel, line } = (e as CustomEvent).detail as { rel: string; line: string | null };
      // résoudre un nom nu ("main.tex") contre l'arborescence du projet
      let target = rel.replace(/^\.\//, "");
      const list = filesRef.current;
      if (!list.includes(target)) {
        const hit = list.find((f) => f === target || f.endsWith("/" + target));
        if (hit) target = hit;
      }
      openFileTabRef.current(target, line);
    };
    window.addEventListener("chat-open-file", onOpen);
    return () => window.removeEventListener("chat-open-file", onOpen);
  }, []);

  useEffect(() => {
    const onOpenThread = (e: Event) => {
      const { threadId } = (e as CustomEvent).detail as { threadId: string };
      const thread = allThreadsRef.current.find((t) => t.id === threadId);
      if (!thread) return;
      selectThread(thread.id, thread.projectRoot);
      setLayout((l) => (l === "atelier" ? "split" : l));
    };
    window.addEventListener("open-thread", onOpenThread);
    return () => window.removeEventListener("open-thread", onOpenThread);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "a") {
        setLayout((l) => (l === "chat" ? "split" : "chat"));
      }
      if (e.metaKey && !e.shiftKey && e.key === "1") setLayout("chat");
      if (e.metaKey && !e.shiftKey && e.key === "2") setLayout("atelier");
      if (e.metaKey && !e.shiftKey && e.key === "0") setLayout("split");
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
    // /goal : suivre l'état pour la pilule ◎ Goal (la commande part normalement à Claude)
    if (activeId && /^\/goal(\s|$)/.test(prompt.trim())) {
      const arg = prompt.trim().replace(/^\/goal\s*/, "");
      if (["clear", "stop", "off", "reset", "none", "cancel"].includes(arg.toLowerCase()) ) {
        setGoals((g) => { const { [activeId]: _, ...rest } = g; return rest; });
      } else if (arg) {
        setGoals((g) => ({ ...g, [activeId]: arg }));
      }
    }
    if (activeId && prompt.trim() === "/clear") {
      setGoals((g) => { const { [activeId]: _, ...rest } = g; return rest; });
    }
    // /export : archive locale (pas d'appel agent)
    if (prompt.trim() === "/export" && activeId) {
      if (ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({
          type: "exportThread",
          threadId: activeId,
          events: (events[activeId] ?? []).filter((ev) => ev.kind === "user" || ev.kind === "text"),
        }));
      }
      return;
    }
    // handoff : le thread a un historique sous un AUTRE provider → réinjecter le fil
    const priorEvents = activeId ? (events[activeId] ?? []) : [];
    const isSwitch =
      activeThread && activeThread.sessionId && activeThread.provider !== provider &&
      priorEvents.length > 0;
    const handoff = isSwitch ? buildHandoff(priorEvents, activeThread!.provider) : "";
    // pièce jointe (annotation/sélection atelier) : préfixée au prompt envoyé
    const fullPrompt =
      handoff +
      (attachments.length
        ? `${attachments.map((a) => a.text).join("\n\n")}\n\n${prompt}`.trim()
        : prompt);
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
    const imagePaths = attachments.map((a) => a.path).filter(Boolean) as string[];
    const codexInputs = provider === "codex" && imagePaths.length
      ? [
          { type: "text" as const, text: fullPrompt },
          ...imagePaths.map((path) => ({ type: "local_image" as const, path })),
        ]
      : undefined;
    const additionalDirectories = settingsRef.current.additionalDirectories
      .split(/\r?\n|,/)
      .map((dir) => dir.trim())
      .filter(Boolean);
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
        ...(codexInputs ? { inputs: codexInputs } : {}),
        ...(imagePaths.length ? { attachments: imagePaths.map((path) => ({ path })) } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(permissionMode ? { permissionMode } : {}),
        ...(provider === "codex" && settingsRef.current.webSearch ? { webSearch: true } : {}),
        ...(provider === "codex" && additionalDirectories.length ? { additionalDirectories } : {}),
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
      {!compact && (
      <div className="side-fixed" style={{ width: sideW }}>
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
          onImportSession={(provider, sessionId, title) => {
            const newId = crypto.randomUUID();
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({
                type: "importSession",
                newThreadId: newId,
                provider,
                sessionId,
                title,
                projectRoot: provider === "claude" ? (activeProject ?? "") : (activeProject ?? ""),
              }));
              // charger l'historique (Claude) une fois le thread créé
              setTimeout(() => {
                setActiveId(newId);
                activeIdRef.current = newId;
                ws.current?.send(JSON.stringify({ type: "getHistory", threadId: newId }));
              }, 250);
            }
          }}
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
      </div>
      )}
      {!compact && (
        <div
          className="handle side-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = sideW;
            setDragging(true);
            const move = (ev: MouseEvent) => {
              setSideW(Math.min(420, Math.max(180, startW + ev.clientX - startX)));
            };
            const up = () => {
              setDragging(false);
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      )}
    <PanelGroup direction="horizontal" className="app">
      <Panel id="chat" order={2} minSize={layout === "atelier" ? 0 : 30}
        style={{ display: layout === "atelier" ? "none" : undefined }}>
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
              <CloseIcon />
            </button>
          </div>
        )}
        {appBanner && (
          <Banner
            text={appBanner.text}
            actionLabel={appBanner.actionLabel}
            onAction={appBanner.onAction}
            onClose={appBanner.closable ? () => setAppBanner(null) : undefined}
          />
        )}
        <Chat
          threadId={activeId}
          events={activeId ? (events[activeId] ?? []) : []}
          workingSince={activeId ? (workingSince[activeId] ?? null) : null}
          usage={activeId ? (usageByThread[activeId] ?? null) : null}
          goal={activeId ? (goals[activeId] ?? null) : null}
          onClearGoal={() => {
            if (!activeId) return;
            setGoals((g) => { const { [activeId]: _, ...rest } = g; return rest; });
          }}
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
          onFork={(index) => {
            if (!activeId) return;
            const src = allThreadsRef.current.find((t) => t.id === activeId);
            if (!src || src.provider !== "claude") return;
            const newId = crypto.randomUUID();
            // copie locale de l'historique jusqu'au point de fork
            setEvents((p) => ({ ...p, [newId]: (p[activeId] ?? []).slice(0, index + 1) }));
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({
                type: "forkThread",
                newThreadId: newId,
                fromThreadId: activeId,
              }));
            }
            setActiveId(newId);
            activeIdRef.current = newId;
          }}
          onNewChat={newChat}
          onOpenProject={addProject}
          layout={layout}
          onToggleExpand={() => setLayout((l) => (l === "chat" ? "split" : "chat"))}
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
      {showAtelier && activeProject && (
        <>
          <PanelResizeHandle className="handle" onDragging={setDragging} />
          <Panel id="atelier" order={3} defaultSize={38} minSize={20}>
            <AtelierPane
              url={atelierUrl ?? ""}
              layout={layout}
              onToggleExpand={() => setLayout((l) => (l === "atelier" ? "split" : "atelier"))}
              projectRoot={activeProject ?? ""}
              activeThreadId={activeId}
              files={files}
              onReorderTabs={(ids) => {
                setAtelierTabs((tabs) => {
                  const byId = new Map(tabs.map((t) => [t.id, t]));
                  const next = ids.map((id) => byId.get(id)!).filter(Boolean);
                  savePinned(next);
                  return next;
                });
              }}
              ws={ws.current}
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
              onOpenFile={(rel) => openFileTab(rel)}
              tabs={atelierTabs}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onCloseTab={(id) => {
                const t = atelierTabsRef.current.find((x) => x.id === id);
                if (t?.kind === "term" && ws.current?.readyState === 1) {
                  ws.current.send(JSON.stringify({ type: "termClose", termId: id }));
                }
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
                    const nonceUrl = withAtelierNonce(url, atelierNonce);
                    setAppBanner((b) => b?.text.startsWith("start_atelier:") ? null : b);
                    setAtelierUrls((p) => ({ ...p, [activeProject]: nonceUrl }));
                    setAtelierReload((n) => n + 1);
                  })
                  .catch((e) => {
                    console.error("start_atelier:", e);
                    setAppBanner({
                      text: `start_atelier: ${String(e)}`,
                      actionLabel: "Réglages",
                      onAction: () => setShowSettings(true),
                      closable: true,
                    });
                  });
              }}
            />
          </Panel>
        </>
      )}
    </PanelGroup>
    </div>
  );
}
