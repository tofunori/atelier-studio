import { useEffect, useMemo, useRef, useState } from "react";
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
import CommandPalette from "./components/CommandPalette";
import QuickAsk from "./components/QuickAsk";
import UsagePopover, { worstOf } from "./components/UsagePopover";
import { init as initNotify, notifyRunDone, notifyReview } from "./lib/notify";
import { CloseIcon } from "./components/icons";
import { loadSettings, saveSettings, Settings, ProviderId, DEFAULT_SETTINGS } from "./lib/settings";
import { ProviderInfo } from "./lib/providers";
import { THEME_PRESETS, presetById } from "./lib/themes";
import { setLanguage, t } from "./lib/i18n";
import { buildItems } from "./lib/palette";
import { setDockBadge } from "./lib/dockBadge";
import {
  atelierTargetOrigin,
  isTrustedAtelierMessage,
  withAtelierNonce,
  type AtelierOutboundMessage,
} from "./lib/ipc";
import "./App.css";

const PROJECTS_KEY = "atelier-studio.projects";

export type Attachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  path?: string;
  kind?: "file" | "folder" | "zotero" | "quote" | "paste";
  preview?: { title: string; rows: { label: string; value: string }[] };
};
type ZoteroPaletteItem = {
  key: string;
  title: string;
  creators?: string;
  year?: string;
  citeKey?: string;
  publication?: string;
  doi?: string;
  abstract?: string;
  hasPdf?: boolean;
  pdfKey?: string | null;
  pdfFile?: string | null;
};

/** Bloc structuré envoyé à l'agent pour une référence Zotero citée (@citekey). */
function buildZoteroReferenceText(
  item: ZoteroPaletteItem,
  extra?: { pdfPath?: string | null; digest?: string | null; digestPath?: string | null },
): string {
  const citekey = item.citeKey || item.key;
  const head = [
    `<zotero-reference citekey="${citekey}" zotero-key="${item.key}">`,
    `titre : ${item.title}`,
    item.creators ? `auteurs : ${item.creators}` : null,
    item.year ? `année : ${item.year}` : null,
    item.publication ? `publication : ${item.publication}` : null,
    item.doi ? `doi : ${item.doi}` : null,
    extra?.pdfPath ? `pdf : ${extra.pdfPath}` : item.pdfFile ? `pdf-zotero : ${item.pdfFile}` : null,
    item.abstract ? `abstract : ${item.abstract}` : null,
    `</zotero-reference>`,
  ].filter(Boolean).join("\n");
  if (extra?.digest) {
    return `${head}\n<digest citekey="${citekey}" source="${extra.digestPath ?? ""}">\n${extra.digest}\n</digest>`;
  }
  if (extra?.digestPath) {
    return `${head}\n<digest citekey="${citekey}" state="absent">Aucun digest en cache pour ce papier. Si son contenu compte pour la tâche : lis le PDF, rédige un digest en markdown français (sections « Résumé vulgarisé » — 2-3 phrases accessibles, « Méthode » — données/approche/période, « Résultats clés » — avec les chiffres, « Limites »), sauvegarde-le tel quel dans ${extra.digestPath} (crée le dossier au besoin), puis appuie-toi dessus.</digest>`;
  }
  return head;
}

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

// piles de police canoniques (mêmes valeurs que src/App.css et les :root des iframes)
const CANON_UI_FONT = "-apple-system, 'SF Pro Text', 'Inter Variable', sans-serif";
const CANON_CODE_FONT = "ui-monospace, 'SF Mono', Menlo, monospace";

// vars de thème poussées aux iframes : couleurs du preset + police effective
// (police custom de l'utilisateur si définie, sinon la pile canonique) — garantit
// une police uniforme dans la galerie et les visionneuses comme dans l'app.
function themeVars(settings: Settings): Record<string, string> {
  return {
    ...presetById(settings.themePreset).vars,
    "--ui-font": settings.uiFont ? `'${settings.uiFont}', ${CANON_UI_FONT}` : CANON_UI_FONT,
    "--code-font": settings.codeFont ? `'${settings.codeFont}', ${CANON_CODE_FONT}` : CANON_CODE_FONT,
  };
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
  const eventsRef = useRef<Record<string, AgentEvent[]>>({});
  eventsRef.current = events;
  const [workingSince, setWorkingSince] = useState<Record<string, number | null>>({});
  const workingSinceRef = useRef<Record<string, number | null>>({});
  workingSinceRef.current = workingSince;
  const [usageByThread, setUsageByThread] = useState<
    Record<string, { context: number; output: number; cost: number | null; turns: number | null; window?: number | null }>
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
  const cliBannerText = useRef<string | null>(null); // bandeau « CLI manquant » actif
  const pendingPaste = useRef<string | null>(null); // dataURL en attente de sauvegarde
  const pendingZoteroDigest = useRef(new Map<string, ZoteroPaletteItem>()); // clé Zotero -> item en attente du digest
  const pendingResend = useRef<{ threadId: string; prompt: string; snapshot: any[] } | null>(null);
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
  const [providerList, setProviderList] = useState<ProviderInfo[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoteroItems, setZoteroItems] = useState<ZoteroPaletteItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("atelier-studio.recentFiles") ?? "[]");
    } catch {
      return [];
    }
  });
  const [, setLanguageRev] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    const onLanguage = () => setLanguageRev((n) => n + 1);
    window.addEventListener("app-language-changed", onLanguage);
    return () => window.removeEventListener("app-language-changed", onLanguage);
  }, []);
  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    setLanguage(settings.language);
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
          vars: themeVars(settings),
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
    // miroir disque via sidecar : les réglages survivent au redémarrage/mise à jour
    const mirror = setTimeout(() => {
      if (ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: "saveSettings", settings }));
      }
    }, 600);
    return () => clearTimeout(mirror);
  }, [settings]);
  const [dragging, setDragging] = useState(false);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [qaMode, setQaMode] = useState<"closed" | "open" | "min">("closed");
  const qaModeRef = useRef<"closed" | "open" | "min">("closed");
  qaModeRef.current = qaMode;
  const [usageOpen, setUsageOpen] = useState(false);
  useEffect(() => { initNotify().catch(() => {}); }, []);
  useEffect(() => {
    setDockBadge(unread.size).catch(() => {});
  }, [unread]);
  // retour de focus sur l'app : le thread affiché est de facto lu
  useEffect(() => {
    const clearActive = () => {
      const id = activeIdRef.current;
      if (!id) return;
      setUnread((u) => {
        if (!u.has(id)) return u;
        const n = new Set(u);
        n.delete(id);
        return n;
      });
    };
    window.addEventListener("focus", clearActive);
    return () => window.removeEventListener("focus", clearActive);
  }, []);
  const [qaDraft, setQaDraft] = useState("");
  const [qaContext, setQaContext] = useState(""); // threadId -> condition
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.favorites") ?? "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("atelier-studio.favorites", JSON.stringify(favorites));
  }, [favorites]);
  const activeIdRef = useRef<string | null>(null);
  // chapitres épinglés par thread : {index, label} (persistés)
  const [pins, setPins] = useState<Record<string, { index: number; label: string; anchor?: string; color?: string; style?: string }[]>>(() => {
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
  activeIdRef.current = activeId;
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const [atelierUrls, setAtelierUrls] = useState<Record<string, string>>({});
  // à l'ouverture d'un chat Codex avec session : recharge le goal actif (s'il existe)
  const goalFetched = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId || goalFetched.current.has(activeId)) return;
    const t = threads.find((th) => th.id === activeId);
    if (t?.provider !== "codex" || !t.sessionId) return;
    if (ws.current?.readyState === 1) {
      goalFetched.current.add(activeId);
      ws.current.send(JSON.stringify({ type: "goalGet", threadId: activeId }));
    }
  }, [activeId, threads]);
  const [layout, setLayout] = useState<"split" | "chat" | "atelier">("split");
  const showAtelier = layout !== "chat";

  function ensureThreadForContext(title: string): string {
    const existing = activeIdRef.current;
    if (existing) return existing;
    const id = crypto.randomUUID();
    const projectRoot = activeProjectRef.current ?? "";
    setDraftThreads((p) => [
      {
        id,
        projectRoot,
        title: title || t("app.context-chat-title"),
        provider: "claude" as const,
        sessionId: null,
        status: "idle" as const,
        updatedAt: new Date().toISOString(),
      },
      ...p,
    ]);
    setActiveId(id);
    activeIdRef.current = id;
    setEvents((p) => ({ ...p, [id]: p[id] ?? [] }));
    return id;
  }

  function attachContextToChat(text: string) {
    const attachment = parseAttachment(text);
    ensureThreadForContext(attachment.name || t("app.context-chat-title"));
    lastInjected.current = text;
    setAttachments((l) => addAttachment(l, attachment));
    setAnnotation(null);
    setLayout((l) => (l === "atelier" ? "split" : l));
  }

  const connectedOnce = useRef(false);
  useEffect(() => {
    // React StrictMode monte l'effet 2× en dev → sans ce garde, 2 connexions
    // WS reçoivent chaque broadcast et tout apparaît en double.
    if (connectedOnce.current) return;
    connectedOnce.current = true;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleConnect = (delay = 0) => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (cancelled) return;
        connectSidecar(handleMessage, (next) => {
          ws.current = next;
          setWs(next);
          setMock(false);
          setAppBanner((b) => b?.text === t("app.sidecar-disconnected") ? null : b);
          setWsReady(true);
        }, () => {
          setWsReady(false);
          setAppBanner({ text: t("app.sidecar-disconnected") });
        })
          .then((s) => {
            ws.current = s;
            setWs(s);
            setMock(false);
            setAppBanner((b) => b?.text === t("app.sidecar-disconnected") ? null : b);
            setWsReady(true);
            s.send(JSON.stringify({ type: "getSettings" }));
          })
          .catch(() => {
            setMock(true);
            setWsReady(false);
            setAppBanner({ text: t("app.sidecar-disconnected") });
            scheduleConnect(3000);
          });
      }, delay);
    };
    const handleMessage = (msg: any) => {
      if (msg.type === "settingsFile") {
        const hasLocal = localStorage.getItem("atelier-studio.settings") !== null;
        if (msg.settings && !hasLocal) {
          // webview vierge (mise à jour, reset WebKit) : le fichier disque fait foi
          setSettings({ ...DEFAULT_SETTINGS, ...msg.settings });
        } else if (ws.current?.readyState === 1) {
          // sinon pousser l'état courant vers le fichier pour l'amorcer
          ws.current.send(JSON.stringify({ type: "saveSettings", settings: settingsRef.current }));
        }
      }
      if (msg.type === "threads") {
        setThreads(msg.threads);
        threadsRef.current = msg.threads;
      }
      if (msg.type === "event") {
        if (msg.event.kind === "started") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: p[msg.threadId] ?? Date.now() }));
          return;
        }
        if (msg.event.kind === "heartbeat") {
          // signal de vie seulement : maintient l'indicateur "Working", rien d'affiché
          setWorkingSince((p) => ({ ...p, [msg.threadId]: p[msg.threadId] ?? Date.now() }));
          return;
        }
        if (msg.event.kind === "usage") {
          if (msg.event.usage) setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
          return;
        }
        setEvents((prev) => {
          const list = [...(prev[msg.threadId] ?? [])];
          const ev = msg.event;
          const last = list[list.length - 1];
          // texte en cours de frappe : accumuler (delta) ou remplacer (stream_set),
          // puis le message final "text" remplace la bulle streaming
          if (ev.kind === "thinking_delta") {
            if (last?.kind === "thinking_live") {
              list[list.length - 1] = { ...last, text: (last as any).text + ev.text };
            } else {
              list.push({ kind: "thinking_live", text: ev.text, ts: Date.now() } as any);
            }
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "thinking") {
            // bloc final : remplace le live s'il existe, sinon s'ajoute
            if (last?.kind === "thinking_live") list[list.length - 1] = { kind: "thinking", text: ev.text, ts: Date.now() } as any;
            else list.push({ kind: "thinking", text: ev.text, ts: Date.now() } as any);
            return { ...prev, [msg.threadId]: list };
          }
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
          if (ev.kind === "activity") {
            const idx = list.findIndex((item) => item.kind === "activity" && item.id === ev.id);
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
        if (msg.event.kind === "done" && msg.event.usage) {
          setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
        }
        if (msg.event.kind === "done" && msg.event.ok === false &&
            /login|auth|credentials/i.test(msg.event.result ?? "")) {
          setAppBanner({
            text: t("app.login-banner"),
            closable: true,
          });
        }
        if (msg.event.kind === "done" || msg.event.kind === "error") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: null }));
          const th = allThreadsRef.current?.find?.((x: any) => x.id === msg.threadId);
          notifyRunDone({
            threadId: msg.threadId,
            title: th?.title ?? "Agent",
            ok: msg.event.kind === "done" && msg.event.ok !== false,
            summary: String(msg.event.result ?? "").slice(0, 120),
          }).catch(() => {});
          if (msg.threadId !== activeIdRef.current || document.hidden || !document.hasFocus()) {
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
        autoReview: settingsRef.current.autoReview,
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
      if (msg.type === "gitCommitError") {
        window.dispatchEvent(new CustomEvent("git-commit-error", { detail: msg }));
      }
      if (msg.type === "commitMsg") {
        window.dispatchEvent(new CustomEvent("commit-msg", { detail: msg }));
      }
      if (msg.type === "imageGenerated") {
        window.dispatchEvent(new CustomEvent("image-generated", { detail: msg }));
      }
      if (msg.type === "ledger") {
        window.dispatchEvent(new CustomEvent("ledger", { detail: msg }));
      }
      if (msg.type === "zoteroItems") {
        setZoteroItems(msg.items ?? []);
        window.dispatchEvent(new CustomEvent("zotero-items", { detail: msg }));
      }
      if (msg.type === "zoteroCollections") {
        window.dispatchEvent(new CustomEvent("zotero-collections", { detail: msg }));
      }
      if (msg.type === "zoteroFav") {
        window.dispatchEvent(new CustomEvent("zotero-fav", { detail: msg }));
      }
      if (msg.type === "zoteroDigest") {
        const item = pendingZoteroDigest.current.get(msg.key);
        if (item) {
          pendingZoteroDigest.current.delete(msg.key);
          const label = item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
          const text = buildZoteroReferenceText(item, {
            pdfPath: msg.pdfPath ?? null, digest: msg.digest ?? null, digestPath: msg.path ?? null,
          });
          setAttachments((l) => l.map((a) =>
            a.kind === "zotero" && a.name === label
              ? {
                  ...a, text,
                  preview: a.preview && {
                    ...a.preview,
                    rows: a.preview.rows.map((r) =>
                      r.label === "Digest"
                        ? { label: "Digest", value: msg.digest ? "en cache" : "à générer par l'agent" }
                        : r),
                  },
                }
              : a));
        }
      }
      if (msg.type === "zoteroAddResult") {
        window.dispatchEvent(new CustomEvent("zotero-add-result", { detail: msg }));
      }
      if (msg.type === "gitChanged" || msg.type === "gitStageDone" || msg.type === "gitUnstageDone" ||
          msg.type === "gitRevertFileDone" || msg.type === "gitCommitDone" || msg.type === "gitUndoLastTurnDone") {
        window.dispatchEvent(new CustomEvent("git-changed", { detail: msg }));
      }
      if (msg.type === "gitSyncDone") {
        window.dispatchEvent(new CustomEvent("git-sync-done", { detail: msg }));
      }
      if (msg.type === "exported") {
        setEvents((p) => ({
          ...p,
          [msg.threadId]: [...(p[msg.threadId] ?? []),
            { kind: "text", text: t("action.exported", { path: msg.path }), ts: Date.now() }],
        }));
      }
      if (msg.type === "usage") {
        window.dispatchEvent(new CustomEvent("usage-data", { detail: msg }));
        const worst = worstOf(msg as any);
        const dot = document.getElementById("usage-dot");
        if (dot) {
          dot.style.background = worst == null ? "transparent"
            : worst >= 85 ? "#e06c75" : worst >= 60 ? "#e0b74a" : "#98c379";
        }
      }
      if (msg.type === "qaPromoteError") {
        window.dispatchEvent(new CustomEvent("qa-promote-error", { detail: msg }));
      }
      if (msg.type === "providerStatus") {
        setProviderList(msg.providers ?? []);
        // lancé depuis le Finder, un CLI peut manquer malgré l'installation ;
        // le sidecar résout PATH+dossiers standards — s'il dit non, c'est réel
        // (les providers API sans clé ne sont pas des CLI manquants)
        const missing = (msg.providers ?? []).filter((p: any) => !p.ok && p.kind !== "api");
        if (missing.length) {
          const labels = missing.map((p: any) => p.label).join(", ");
          cliBannerText.current = t("app.cli-missing", { list: labels });
          setAppBanner({
            text: cliBannerText.current,
            actionLabel: t("app.cli-missing-copy"),
            onAction: () => {
              const cmds = missing.map((p: any) =>
                p.id === "claude" ? "npm install -g @anthropic-ai/claude-code" : "npm install -g @openai/codex");
              navigator.clipboard?.writeText(cmds.join(" && "));
            },
            closable: true,
          });
        } else {
          setAppBanner((b) => b && b.text === cliBannerText.current ? null : b);
          cliBannerText.current = null;
        }
      }
      if (msg.type === "permissionRequest") {
        setEvents((p) => ({
          ...p,
          [msg.threadId]: [...(p[msg.threadId] ?? []), {
            kind: "permission", requestId: msg.requestId, toolName: msg.toolName,
            input: msg.input, answered: null, ts: Date.now(),
          } as any],
        }));
        notifyRunDone({ threadId: msg.threadId, title: "Permission demandée", ok: true, summary: msg.toolName }).catch(() => {});
      }
      if (msg.type === "reviewResult") {
        window.dispatchEvent(new CustomEvent("review-result", { detail: msg }));
        if (msg.status === "done" && msg.verdict === "issues") {
          notifyReview({ threadId: msg.threadId, issues: (msg.issues ?? []).map((i: any) => i.claim) }).catch(() => {});
          if (settingsRef.current.autoReview.autofix && (msg.issues ?? []).length) {
            window.dispatchEvent(new CustomEvent("correct-issues", { detail: { threadId: msg.threadId, issues: msg.issues } }));
          }
        }
      }
      if (msg.type === "qaEvent") {
        window.dispatchEvent(new CustomEvent("qa-event", { detail: msg }));
      }
      if (msg.type === "zoteroChanged") {
        window.dispatchEvent(new CustomEvent("zotero-changed"));
      }
      if (msg.type === "sessions") {
        window.dispatchEvent(new CustomEvent("sessions-list", { detail: msg.sessions }));
      }
      if (msg.type === "commands") setCommands(msg.commands);
      if (msg.type === "files") setFiles(msg.files);
      if (msg.type === "error") {
        console.error("sidecar:", msg.message);
        const pr = pendingResend.current;
        if (pr && pr.threadId === msg.threadId) {
          // le rewind a échoué (Codex, ou message introuvable) : ne PAS perdre le
          // message — restaurer l'historique tronqué puis renvoyer le nouveau texte
          pendingResend.current = null;
          const th = threadsRef.current.find((t) => t.id === pr.threadId);
          setEvents((p) => ({
            ...p,
            [pr.threadId]: [...pr.snapshot, { kind: "user", text: pr.prompt, ts: Date.now() }],
          }));
          setWorkingSince((p) => ({ ...p, [pr.threadId]: Date.now() }));
          if (ws.current?.readyState === 1) {
            sendPrompt(ws.current, {
              autoReview: settingsRef.current.autoReview,
              threadId: pr.threadId,
              projectRoot: th?.projectRoot ?? "",
              provider: th?.provider ?? "claude",
              prompt: pr.prompt,
            });
          }
        }
      }
    };
    scheduleConnect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    const onZoteroItems = (e: Event) => {
      const detail = (e as CustomEvent).detail as { items?: ZoteroPaletteItem[] };
      setZoteroItems(detail.items ?? []);
    };
    window.addEventListener("zotero-items", onZoteroItems);
    return () => window.removeEventListener("zotero-items", onZoteroItems);
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
    const onQaOpen = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      // un Quick Ask vit déjà (ouvert ou minimisé) : y ajouter le contexte
      // au lieu d'écraser la conversation
      if (qaModeRef.current !== "closed" && d.context) {
        window.dispatchEvent(new CustomEvent("qa-add-context", { detail: { text: d.context } }));
        setQaMode("open");
        return;
      }
      setQaDraft((d.draft as string) ?? "");
      setQaContext((d.context as string) ?? "");
      setQaMode("open");
    };
    const onAutoReviewToggle = () => {
      setSettings((s) => ({ ...s, autoReview: { ...s.autoReview, enabled: !s.autoReview.enabled } }));
    };
    window.addEventListener("autoreview-toggle", onAutoReviewToggle);
    const onCorrectIssues = (e: Event) => {
      const { threadId, issues } = (e as CustomEvent).detail ?? {};
      ws.current?.send(JSON.stringify({ type: "clientLog", note: `correct-issues reçu tid=${String(threadId).slice(0,8)} issues=${Array.isArray(issues)?issues.length:"?"}` }));
      if (!threadId || !Array.isArray(issues) || !issues.length) return;
      const th = threadsRef.current.find((t) => t.id === threadId);
      ws.current?.send(JSON.stringify({ type: "clientLog", note: `guards: th=${!!th} wsReady=${ws.current?.readyState}` }));
      if (!th || ws.current?.readyState !== 1) return;
      const lines = issues.map((i: any, k: number) =>
        `${k + 1}. « ${i.claim} » → ${i.problem}${i.fix ? ` (correction : ${i.fix})` : ""}`).join("\n");
      const prompt = `Un vérificateur indépendant a relevé ces problèmes dans ton dernier travail :\n${lines}\n\nCorrige-les CONCRÈTEMENT dans les fichiers concernés (ne te contente pas d'expliquer). Confirme brièvement chaque correction appliquée.`;
      setEvents((p) => ({
        ...p,
        [threadId]: [...(p[threadId] ?? []), { kind: "user", text: "⟳ Correction demandée par le vérificateur", ts: Date.now() }],
      }));
      setWorkingSince((p) => ({ ...p, [threadId]: Date.now() }));
      sendPrompt(ws.current, {
        // re-vérifier TOUJOURS le tour de correction, même si l'auto-review est
        // off ou que le trigger ne matche pas — sinon le spinner tourne à l'infini
        autoReview: { ...settingsRef.current.autoReview, enabled: true, trigger: "always" },
        threadId,
        projectRoot: th.projectRoot ?? "",
        provider: th.provider ?? "claude",
        prompt,
      });
    };
    const onPermAnswer = (e: Event) => {
      const { threadId, requestId, allow } = (e as CustomEvent).detail ?? {};
      ws.current?.send(JSON.stringify({ type: "permissionResponse", requestId, allow }));
      setEvents((p) => ({
        ...p,
        [threadId]: (p[threadId] ?? []).map((ev: any) =>
          ev.kind === "permission" && ev.requestId === requestId ? { ...ev, answered: allow } : ev),
      }));
    };
    window.addEventListener("permission-answer", onPermAnswer);
    window.addEventListener("correct-issues", onCorrectIssues);
    const onRequestReview = (e: Event) => {
      const threadId = (e as CustomEvent).detail?.threadId;
      if (threadId && ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: "requestReview", threadId, autoReview: settingsRef.current.autoReview }));
      }
    };
    window.addEventListener("request-review", onRequestReview);
    const onQaToggle = () => {
      const mode = qaModeRef.current;
      if (mode === "open") { setQaMode("min"); return; }
      if (mode === "min") { setQaMode("open"); return; }
      setQaDraft("");
      setQaContext("");
      setQaMode("open");
    };
    const onOpenPalette = () => setPaletteOpen(true);
    window.addEventListener("open-palette", onOpenPalette);
    window.addEventListener("quick-ask-toggle", onQaToggle);
    const onUsageToggle = () => setUsageOpen((v) => !v);
    window.addEventListener("usage-toggle", onUsageToggle);
    window.addEventListener("quick-ask-open", onQaOpen);
    window.addEventListener("atelier-add-to-chat-citation", onCitation);
    return () => {
      window.removeEventListener("autoreview-toggle", onAutoReviewToggle);
      window.removeEventListener("permission-answer", onPermAnswer);
      window.removeEventListener("correct-issues", onCorrectIssues);
      window.removeEventListener("request-review", onRequestReview);
      window.removeEventListener("open-palette", onOpenPalette);
      window.removeEventListener("quick-ask-toggle", onQaToggle);
      window.removeEventListener("usage-toggle", onUsageToggle);
      window.removeEventListener("quick-ask-open", onQaOpen);
      window.removeEventListener("atelier-add-to-chat-citation", onCitation);
    };
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
    invoke<string>("start_atelier", { root: activeProject, galleryDir: settingsRef.current.galleryPath, galleryExts: (settingsRef.current.galleryExtsByProject?.[activeProject] ?? "") || settingsRef.current.galleryExts || "" })
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
          actionLabel: t("app.start-settings"),
          onAction: () => setShowSettings(true),
          closable: true,
        });
      });
  }, [activeProject]);

  // "Add to chat" depuis le Browser (sélection si possible, sinon page courante)
  useEffect(() => {
    const onBrowserAdd = (e: Event) => {
      const { text, url, mode } = (e as CustomEvent).detail as {
        text: string;
        url?: string;
        mode?: "selection" | "page";
      };
      let name = "extrait web";
      try { name = url ? new URL(url).hostname : name; } catch {}
      const body = mode === "page"
        ? `Source web ajoutée au contexte :\n${text}`
        : `Extrait copié depuis ${url || "une page web"} :\n> ${text.split("\n").join("\n> ")}`;
      setAttachments((l) =>
        addAttachment(l, {
          name,
          lines: null,
          text: body,
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
          vars: themeVars(settingsRef.current),
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
        attachContextToChat(data.text);
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
  function rememberFile(rel: string) {
    const clean = rel.trim();
    if (!clean) return;
    setRecentFiles((current) => {
      const next = [clean, ...current.filter((item) => item !== clean)].slice(0, 24);
      localStorage.setItem("atelier-studio.recentFiles", JSON.stringify(next));
      return next;
    });
  }

  function openFileTab(rel: string, line?: string | null) {
    if (!atelierUrl || !activeProject) return;
    rememberFile(rel);
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
    // l'onglet vit dans la surface Atelier : y basculer si on est ailleurs
    window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface: "atelier" } }));
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
      if (e.key === "Escape" && qaMode !== "open" && !paletteOpen && !usageOpen) {
        const id = activeIdRef.current;
        if (id && workingSinceRef.current[id] != null && ws.current?.readyState === 1) {
          ws.current.send(JSON.stringify({ type: "interrupt", threadId: id }));
          return;
        }
      }
      if (e.metaKey && e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // toggle : minimisé → rouvre la conversation ; ouvert → minimise ; fermé → neuf
        const m = qaModeRef.current;
        if (m === "open") setQaMode("min");
        else if (m === "min") setQaMode("open");
        else { setQaDraft(""); setQaContext(""); setQaMode("open"); }
        return;
      }
      if (e.metaKey && !e.shiftKey && ["k", "p"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") setPaletteOpen(false);
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
        title: t("app.new-chat-title"),
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
        title: t("app.new-chat-title"),
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
    provider: ProviderId,
    model: string,
    effort: string,
    permissionMode: string,
    mode: "steer" | "queue" = "steer",
  ) {
    const activeThread = allThreadsRef.current.find((t) => t.id === activeId);
    const threadRoot = activeThread ? activeThread.projectRoot : (activeProject ?? "");
    if (!activeId && !activeProject) return;
    // /clear et /compact sur un thread CODEX : équivalents natifs app-server
    const codexActive = activeId && (activeThread?.provider ?? provider) === "codex";
    if (codexActive && ["/clear", "/compact"].includes(prompt.trim()) && ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({
        type: prompt.trim() === "/clear" ? "codexClear" : "codexCompact",
        threadId: activeId,
      }));
      return;
    }
    // /goal sur un thread CODEX : goal natif app-server (set/clear/status),
    // pas un message texte (codex exec n'interprète pas /goal). Côté Claude,
    // /goal passe tel quel : la CLI a son goal natif (v2.1.139+).
    const goalMatch = /^\/goal(?:\s+([\s\S]*))?$/.exec(prompt.trim());
    if (goalMatch && codexActive) {
      const arg = (goalMatch[1] ?? "").trim();
      if (ws.current?.readyState === 1) {
        const msg =
          !arg ? { type: "goalGet", threadId: activeId, explicit: true } :
          ["clear", "stop", "off", "reset", "none", "cancel"].includes(arg.toLowerCase())
            ? { type: "goalClear", threadId: activeId }
            : { type: "goalSet", threadId: activeId, objective: arg };
        ws.current.send(JSON.stringify(msg));
        // trace visible dans le fil : la commande tapée, comme un message
        setEvents((p) => ({
          ...p,
          [activeId]: [...(p[activeId] ?? []), { kind: "user", text: prompt.trim(), ts: Date.now() } as any],
        }));
      }
      return;
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
      ...(attachments.some((a) => !a.imageUrl && a.kind !== "paste")
        ? {
            label: attachments
              .filter((a) => !a.imageUrl && a.kind !== "paste")
              .map((a) => `${a.name}${a.lines ? ` (lines ${a.lines})` : ""}`)
              .join(" · "),
          }
        : {}),
      ...(attachments.some((a) => a.kind === "paste")
        ? {
            pastes: attachments
              .filter((a) => a.kind === "paste")
              .map((a) => ({ name: a.name, text: a.text })),
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
      activeIdRef.current = id;
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
            { kind: "tool", name: t("app.mock-tool") },
            {
              kind: "text",
              text: t("app.mock-response", { provider }),
            },
            { kind: "done", ok: true, result: "" },
          ],
        }));
      }, 800);
      return;
    }
    if (ws.current) {
      sendPrompt(ws.current, {
        autoReview: settingsRef.current.autoReview,
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
  useEffect(() => {
    if (!wsReady) return;
    const send = () => ws.current?.readyState === 1 && ws.current.send(JSON.stringify({ type: "getUsage" }));
    send();
    const iv = setInterval(send, 300000);
    return () => clearInterval(iv);
  }, [wsReady]);

  const atelierUrl = activeProject ? atelierUrls[activeProject] : null;

  // le serveur galerie peut mourir (kill, reboot) : sonde 15 s → relance
  useEffect(() => {
    if (!activeProject || !atelierUrl) return;
    let fails = 0;
    const iv = setInterval(async () => {
      try {
        await fetch(atelierUrl, { method: "HEAD", mode: "no-cors", cache: "no-store" });
        fails = 0;
      } catch {
        // 2 échecs consécutifs requis : un redémarrage de serveur (~8s de build)
        // ne doit pas déclencher une relance en boucle
        if (++fails >= 2) {
          fails = 0;
          setAtelierUrls((p) => {
            const { [activeProject]: _, ...rest } = p;
            return rest; // l'effet start_atelier se redéclenche
          });
        }
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [activeProject, atelierUrl]);

  const runningProjects = new Set(
    allThreads.filter((t) => t.status === "running").map((t) => t.projectRoot),
  );

  const paletteItems = useMemo(() => buildItems({
    files,
    threads: allThreads,
    zotero: zoteroItems,
    t,
    actions: {
      newChat: () => activeProject ? newThread(activeProject) : newChat(),
      openResume: () => window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } })),
      switchSurface: (surface) => {
        setLayout((layout) => (layout === "chat" ? "split" : layout));
        window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface } }));
      },
      setLayout,
      openSettings: () => setShowSettings(true),
      retitleAll: () => ws.current?.readyState === 1 && ws.current.send(JSON.stringify({ type: "retitleAll" })),
      nextTheme: () => {
        setSettings((current) => {
          const index = Math.max(0, THEME_PRESETS.findIndex((preset) => preset.id === current.themePreset));
          const next = THEME_PRESETS[(index + 1) % THEME_PRESETS.length];
          return { ...current, themePreset: next.id };
        });
      },
      openFile: (rel) => openFileTab(rel),
      openThread: (threadId, projectRoot) => {
        if (projectRoot !== undefined) selectThread(threadId, projectRoot);
        else {
          setActiveId(threadId);
          activeIdRef.current = threadId;
        }
        setLayout((layout) => (layout === "atelier" ? "split" : layout));
      },
      selectZotero: (key) => {
        setLayout((layout) => (layout === "chat" ? "split" : layout));
        window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface: "biblio" } }));
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("biblio-select", { detail: { key } }));
        }, 0);
      },
    },
  }), [activeProject, allThreads, files, zoteroItems]);

  if (showSettings) {
    return (
      <>
        <SettingsPage
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          ws={ws.current}
          projects={projects}
        />
        <CommandPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
      {usageOpen && <div className="ur-overlay" onClick={() => setUsageOpen(false)}>
        <UsagePopover open={usageOpen} onClose={() => setUsageOpen(false)} />
      </div>}
      </>
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
          threads={allThreads}
          activeId={activeId}
          unread={unread}
          onSelectThread={(id) => { const th = allThreads.find((t) => t.id === id); if (th) selectThread(id, th.projectRoot); }}
          onSelectProject={setActiveProject}
          onAddProject={addProject}
          onNew={(root) => (root ? newThread(root) : activeProject ? newThread(activeProject) : newChat())}
          onExpand={() => setCompact(false)}
          onSettings={() => setShowSettings((v) => !v)}
          onSetMeta={(root, m) => setProjMeta((p) => ({ ...p, [root]: m }))}
          favorites={favorites}
          onToggleFavorite={(id) =>
            setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
          }
          onDeleteThread={(threadId) => {
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
          onRenameThread={(threadId, title) => {
            setDraftThreads((p) =>
              p.map((t) => (t.id === threadId ? { ...t, title } : t)),
            );
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({ type: "renameThread", threadId, title }));
            }
          }}
          onReorder={(from, to) =>
            setProjects((prev) => {
              const list = prev.filter((r) => r !== from);
              const at = list.indexOf(to);
              if (at < 0) return prev;
              list.splice(at + (prev.indexOf(from) < prev.indexOf(to) ? 1 : 0), 0, from);
              return list;
            })
          }
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
          onRemoveProject={(root) => {
            setProjects((prev) => prev.filter((r) => r !== root));
            if (activeProject === root) setActiveProject(null);
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
      <Panel id="chat" order={2} defaultSize={50} minSize={layout === "atelier" ? 0 : 30}
        style={{ display: layout === "atelier" ? "none" : undefined }}>
        {annotation && (
          <div className="annot-banner">
            <span className="annot-text">{annotation.split("\n")[0].slice(0, 90)}</span>
            <button
              onClick={() => {
                attachContextToChat(annotation);
              }}
            >
              {t("action.send-agent")}
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
          commands={commands}
          files={files}
          recentFiles={recentFiles.filter((file) => files.includes(file)).slice(0, 12)}
          zoteroItems={zoteroItems}
          defaults={settings as any}
          providers={providerList}
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
          onStylePin={(index, patch) => {
            if (!activeId) return;
            const id = activeId;
            setPins((p) => ({
              ...p,
              [id]: (p[id] ?? []).map((c) => (c.index === index ? { ...c, ...patch } : c)),
            }));
          }}
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
                  : [...cur, { index, label, anchor: label }].sort((a, b) => a.index - b.index),
              };
            });
          }}
          onEditSend={(index, oldText, newText) => {
            if (!activeId) return;
            const id = activeId;
            const snapshot = eventsRef.current[id] ?? [];
            setEvents((p) => ({ ...p, [id]: (p[id] ?? []).slice(0, index) }));
            pendingResend.current = { threadId: id, prompt: newText, snapshot };
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
          onAttachPath={(path) => {
            const name = path.split("/").pop() ?? path;
            if (!path.startsWith("/")) rememberFile(path);
            setAttachments((l) => addAttachment(l, {
              name,
              lines: null,
              path,
              kind: "file",
              text: `Fichier joint (chemin local, lisible avec Read) : ${path}`,
              preview: {
                title: name,
                rows: [
                  { label: "Type", value: "File" },
                  { label: "Path", value: path },
                ],
              },
            }));
          }}
          onAttachFolder={(folder) => {
            const prefix = folder.endsWith("/") ? folder : `${folder}/`;
            const excluded = /(^|\/)(node_modules|dist|build|target|\.git|\.next|\.vite|coverage)\//;
            const included = files
              .filter((file) => file.startsWith(prefix) && !excluded.test(file))
              .slice(0, 60);
            const omitted = Math.max(0, files.filter((file) => file.startsWith(prefix)).length - included.length);
            const name = prefix.split("/").filter(Boolean).pop() ?? prefix;
            setAttachments((l) => addAttachment(l, {
              name: `${name}/`,
              lines: included.length ? `${included.length} files${omitted ? `, +${omitted}` : ""}` : "empty",
              path: prefix,
              kind: "folder",
              text: [
                `Dossier joint comme contexte : ${prefix}`,
                "Contenu non injecté automatiquement; lis les fichiers précis avec Read si nécessaire.",
                included.length ? `Fichiers indexés${omitted ? ` (premiers ${included.length}, ${omitted} autres omis)` : ""} :` : "Aucun fichier indexé dans ce dossier.",
                ...included.map((file) => `- ${file}`),
              ].join("\n"),
              preview: {
                title: `${name}/`,
                rows: [
                  { label: "Type", value: "Folder context" },
                  { label: "Files", value: `${included.length}${omitted ? ` shown, ${omitted} omitted` : ""}` },
                  { label: "Path", value: prefix },
                ],
              },
            }));
          }}
          onAttachZotero={(key) => {
            const item = zoteroItems.find((entry) => entry.key === key);
            if (!item) return;
            const label = item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
            pendingZoteroDigest.current.set(item.key, item);
            setAttachments((l) => addAttachment(l, {
              name: label,
              lines: item.year || null,
              kind: "zotero",
              text: buildZoteroReferenceText(item),
              preview: {
                title: item.title || label,
                rows: [
                  { label: "Citation", value: label },
                  ...(item.creators ? [{ label: "Authors", value: item.creators }] : []),
                  ...(item.year ? [{ label: "Year", value: item.year }] : []),
                  ...(item.doi ? [{ label: "DOI", value: item.doi }] : []),
                  { label: "Digest", value: "…" },
                ],
              },
            }));
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({
                type: "zoteroDigest", key: item.key, citeKey: item.citeKey ?? "",
                pdfKey: item.pdfKey ?? null, pdfFile: item.pdfFile ?? null,
              }));
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
          onPasteText={(text) =>
            setAttachments((l) =>
              addAttachment(l, {
                name: t("chat.pasted-text"),
                lines: String(text.split("\n").length),
                kind: "paste",
                text,
              }),
            )
          }
          onQuote={(text) =>
            setAttachments((l) =>
              addAttachment(l, {
                name: `« ${text.slice(0, 50)}${text.length > 50 ? "…" : ""} »`,
                lines: null,
                kind: "quote",
                text: `Citation de la conversation :\n> ${text.split("\n").join("\n> ")}`,
              }),
            )
          }
          disabled={!activeProject && !activeId}
          onGoal={(action, objective) => {
            if (!activeId || ws.current?.readyState !== 1) return;
            ws.current.send(JSON.stringify(
              action === "set"
                ? { type: "goalSet", threadId: activeId, objective }
                : { type: "goalClear", threadId: activeId },
            ));
          }}
          onSubmit={submit}
        />
      </Panel>
      {showAtelier && activeProject && (
        <>
          <PanelResizeHandle className="handle" onDragging={setDragging} />
          <Panel id="atelier" order={3} defaultSize={50} minSize={20}>
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
                invoke<string>("start_atelier", { root: activeProject, galleryDir: settingsRef.current.galleryPath, galleryExts: (settingsRef.current.galleryExtsByProject?.[activeProject] ?? "") || settingsRef.current.galleryExts || "" })
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
                      actionLabel: t("app.start-settings"),
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
    <CommandPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
      <QuickAsk
        open={qaMode === "open"}
        minimized={qaMode === "min"}
        draft={qaDraft}
        context={qaContext}
        onMinimize={() => setQaMode("min")}
        onClose={() => setQaMode("closed")}
        onInject={(text) => {
          setAttachments((l) => addAttachment(l, { name: "Quick Ask", lines: null, text }));
        }}
        onPromote={(qaId, title) => {
          const newId = crypto.randomUUID();
          if (ws.current?.readyState === 1) {
            ws.current.send(JSON.stringify({
              type: "qaPromote", qaId, newThreadId: newId, title,
              projectRoot: "",
            }));
            setTimeout(() => {
              setActiveId(newId);
              activeIdRef.current = newId;
              ws.current?.send(JSON.stringify({ type: "getHistory", threadId: newId }));
            }, 250);
          }
        }}
      />
      {usageOpen && <div className="ur-overlay" onClick={() => setUsageOpen(false)}>
        <UsagePopover open={usageOpen} onClose={() => setUsageOpen(false)} />
      </div>}
    </div>
  );
}
