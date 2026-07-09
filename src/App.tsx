import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { open } from "@tauri-apps/plugin-dialog";
import {
  sendPrompt,
  requestCatalog,
  Thread,
  AgentEvent,
  Command,
} from "./lib/ws";
import { useSidecarConnection, type SidecarStatus } from "./hooks/useSidecarConnection";
import { useAtelierServer } from "./hooks/useAtelierServer";
import { useWorkspaceEvents } from "./hooks/useWorkspaceEvents";
import WorkspaceShell from "./components/shell/WorkspaceShell";
import Sidebar from "./components/Sidebar";
import Rail, { ProjMeta, HighlightEntry } from "./components/Rail";
import TopBar from "./components/TopBar";
import type { Surface } from "./components/surfaces";
import Chat from "./components/Chat";
import Banner from "./components/Banner";
import AtelierPane from "./components/AtelierPane";
import SettingsPage from "./components/Settings";
import CommandPalette from "./components/CommandPalette";
import QuickAsk from "./components/QuickAsk";
import UsagePopover, { worstOf } from "./components/UsagePopover";
import { init as initNotify, notifyRunDone, notifyReview } from "./lib/notify";
import { CloseIcon, DownloadIcon, HighlighterIcon, SidebarIcon } from "./components/icons";
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

// handoff inter-provider : sérialise la conversation visible pour que le
// nouveau provider reprenne avec le contexte — façon Synara. Le fil est
// injecté EN ENTIER (les modèles ont 200k+ tokens de contexte) ; seul un
// garde-fou très haut borne les fils pathologiques. La sentinelle de
// fermeture doit rester identique à HANDOFF_END de sidecar/handoff.mjs
// (stripHandoff la retire au replay de l'historique — jamais affichée).
const HANDOFF_END = "\n=== fin du fil transmis — message réel ci-dessous ===\n\n";
function buildHandoff(events: AgentEvent[], fromProvider: string): string {
  const lines: string[] = [];
  for (const e of events) {
    if (e.kind === "user") lines.push(`Utilisateur : ${e.text}`);
    else if (e.kind === "text") lines.push(`Agent (${fromProvider}) : ${e.text}`);
  }
  let transcript = lines.join("\n\n");
  const MAX = 400_000; // ~100k tokens : garde-fou, pas une troncature de confort
  if (transcript.length > MAX) transcript = "[…début tronqué…]\n" + transcript.slice(-MAX);
  return (
    "Tu reprends une conversation commencée avec un autre agent. " +
    "Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n" +
    "---\n" + transcript + HANDOFF_END
  );
}

function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// nom court d'un projet à partir de son chemin absolu — même convention que
// projInitial/rail-flyout (Rail.tsx) : dernier segment du chemin
function projectDisplayName(root: string): string {
  return root.split("/").filter(Boolean).pop() ?? "";
}

const MARKS_MIGRATED_KEY = "atelier-studio.marksMigrated";
const MARKS_PREFIX = "atelier-studio.marks.";

// migration one-shot (lot 2) : les marks locaux posés avant la fiche durable
// (localStorage, rendu in-chat §3) deviennent des fiches sidecar. Les clés
// locales restent intactes — le rendu in-chat en dépend toujours — seul un
// flag localStorage borne la migration à une fois par machine.
function migrateLocalMarks(threadList: Thread[], send: (msg: unknown) => void) {
  if (localStorage.getItem(MARKS_MIGRATED_KEY)) return;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(MARKS_PREFIX)) continue;
    const threadId = key.slice(MARKS_PREFIX.length);
    let marks: { text?: string; kind?: string }[] = [];
    try {
      marks = JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(marks)) continue;
    const th = threadList.find((t) => t.id === threadId);
    for (const m of marks) {
      if (!m?.text?.trim() || (m.kind !== "hl" && m.kind !== "ul")) continue;
      send({
        type: "addHighlight",
        highlight: {
          text: m.text,
          context: "", // contexte introuvable pour les marks migrés (spec §1)
          kind: m.kind,
          projectRoot: th?.projectRoot ?? "",
          projectName: th?.projectRoot ? projectDisplayName(th.projectRoot) : "",
          threadId,
          threadTitle: th?.title ?? "",
          provider: th?.provider ?? "",
        },
      });
    }
  }
  localStorage.setItem(MARKS_MIGRATED_KEY, "1");
}

// date relative sobre pour le pied des fiches Surlignés (mêmes clés i18n que
// le "il y a …" des threads dans Sidebar.tsx — dupliqué ici pour rester dans
// le scope App.tsx sans créer de dépendance croisée nouvelle)
function hlRelativeDate(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("time.just-now");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("time.minutes-ago", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("time.hours-ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return `${days} j`;
  return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

// export .md groupé par projet puis chat (spec §6) — passage en citation,
// contexte en italique s'il a été photographié
function buildHighlightsMarkdown(list: HighlightEntry[]): string {
  const byProject = new Map<string, Map<string, HighlightEntry[]>>();
  for (const h of list) {
    const projKey = h.projectName || h.projectRoot || t("highlights.no-project");
    const chatKey = h.threadTitle || h.threadId || "";
    if (!byProject.has(projKey)) byProject.set(projKey, new Map());
    const chats = byProject.get(projKey)!;
    if (!chats.has(chatKey)) chats.set(chatKey, []);
    chats.get(chatKey)!.push(h);
  }
  const lines: string[] = [];
  for (const [proj, chats] of byProject) {
    lines.push(`## ${proj}`, "");
    for (const [chatTitle, items] of chats) {
      const date = items[0]?.createdAt ? new Date(items[0].createdAt).toLocaleDateString() : "";
      lines.push(`### ${chatTitle || "—"}${date ? ` — ${date}` : ""}`, "");
      for (const h of items) {
        lines.push(`> ${h.text.split("\n").join("\n> ")}`);
        if (h.context) lines.push("", `*${h.context}*`);
        lines.push("");
      }
    }
  }
  return lines.join("\n").trim() + "\n";
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

// panneau de la vue « Surlignés » (lot 2) : carnet de cartes autonomes — cf.
// docs/superpowers/specs/2026-07-08-surlignes-lot2.md §4. Chaque fiche est
// déjà une photographie complète (texte, contexte, projet, chat, provider,
// date) : ce panneau ne fait QUE filtrer/trier/afficher, jamais de lookup
// live dans un chat pour reconstituer une donnée manquante.
function HighlightsPanel(p: {
  highlights: HighlightEntry[];
  threads: Thread[];
  projMeta: Record<string, ProjMeta>;
  filterProject: string | null;
  onSetFilterProject: (root: string | null) => void;
  onRemove: (id: string) => void;
  onOpenChat: (threadId: string, projectRoot: string) => void;
  onExport: () => void;
  onCompact: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; projectRoot: string; projectName: string; count: number }>();
    for (const h of p.highlights) {
      const key = h.projectRoot || h.projectName || "";
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, projectRoot: h.projectRoot, projectName: h.projectName, count: 1 });
    }
    return [...map.values()];
  }, [p.highlights]);
  const filtered = p.filterProject != null
    ? p.highlights.filter((h) => (h.projectRoot || h.projectName || "") === p.filterProject)
    : p.highlights;

  return (
    <div className="sidebar hl-panel">
      <div className="side-top" data-tauri-drag-region>
        <span className="flex" />
        <button className="mini compact-btn" title={t("action.collapse-sidebar")} onClick={p.onCompact}>
          <SidebarIcon size={17} />
        </button>
      </div>
      <div className="hl-head">
        <span className="hl-head-title">{t("view.highlights")}</span>
        <span className="hl-count">{p.highlights.length}</span>
        <button type="button" className="mini hl-export-btn" title={t("highlights.export")}
          disabled={!p.highlights.length} onClick={p.onExport}>
          <DownloadIcon size={15} />
        </button>
      </div>
      {!!groups.length && (
        <div className="hl-chips">
          <button type="button" className={`chip ${p.filterProject == null ? "on" : ""}`}
            onClick={() => p.onSetFilterProject(null)}>
            {t("highlights.all-count", { n: p.highlights.length })}
          </button>
          {groups.map((g) => (
            <button key={g.key} type="button" className={`chip ${p.filterProject === g.key ? "on" : ""}`}
              onClick={() => p.onSetFilterProject(p.filterProject === g.key ? null : g.key)}>
              <span className="hl-dot" style={{ background: p.projMeta[g.projectRoot]?.color || "var(--muted2)" }} />
              {g.projectName || t("highlights.no-project")} · {g.count}
            </button>
          ))}
        </div>
      )}
      {filtered.length ? (
        <div className="hl-list side-scroll">
          {filtered.map((h) => {
            const open = openId === h.id;
            const threadAlive = !!h.threadId && p.threads.some((th) => th.id === h.threadId);
            return (
              <div key={h.id} className={`hl-card ${h.kind} ${open ? "open" : ""}`}
                onClick={() => setOpenId(open ? null : h.id)}>
                <div className="hl-text">{h.text}</div>
                {open && h.context && <div className="hl-context">{h.context}</div>}
                {open && threadAlive && (
                  <button type="button" className="hl-open-chat"
                    onClick={(e) => { e.stopPropagation(); p.onOpenChat(h.threadId, h.projectRoot); }}>
                    {t("highlights.open-chat")}
                  </button>
                )}
                <div className="hl-foot">
                  <span className="hl-dot" style={{ background: p.projMeta[h.projectRoot]?.color || "var(--muted2)" }} />
                  <span className="hl-proj">{h.projectName || t("highlights.no-project")}</span>
                  <span className="hl-time">{hlRelativeDate(h.createdAt)}</span>
                  <button type="button" className="hl-remove" title={t("highlights.remove")}
                    onClick={(e) => { e.stopPropagation(); p.onRemove(h.id); }}>
                    <CloseIcon size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="view-placeholder">
          <HighlighterIcon size={22} />
          <p>{t("highlights.empty")}</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const atelierNonceRef = useRef(crypto.randomUUID());
  const atelierNonce = atelierNonceRef.current;
  // Connexion sidecar extraite dans useSidecarConnection (slice 2.1) —
  // comportement identique : bootstrap getSettings/listHighlights à la
  // première connexion, bannière sur coupure/échec, retry géré par le hook.
  // handleMessage est déclaré plus bas (function hissée, corps inchangé).
  const onSidecarStatus = (status: SidecarStatus, sock: WebSocket | null) => {
    if (status === "connected" || status === "reconnected") {
      setAppBanner((b) => b?.text === t("app.sidecar-disconnected") ? null : b);
      if (status === "connected" && sock) {
        sock.send(JSON.stringify({ type: "getSettings" }));
        sock.send(JSON.stringify({ type: "listHighlights" }));
      }
    } else {
      setAppBanner({ text: t("app.sidecar-disconnected") });
    }
  };
  const { wsRef: ws, wsReady, mock } = useSidecarConnection(handleMessage, onSidecarStatus);
  const [projects, setProjects] = useState<string[]>(loadProjects);
  const [activeProject, setActiveProject] = useState<string | null>(
    loadProjects()[0] ?? null,
  );
  const [threads, setThreads] = useState<Thread[]>([]);
  const threadsRef = useRef<Thread[]>([]);
  const allThreadsRef = useRef<Thread[]>([]);
  // threads locaux (pas encore connus du sidecar) — nouveaux chats vides
  const [draftThreads, setDraftThreads] = useState<Thread[]>([]);
  // fiches « Surlignés » (lot 2) : source de vérité = sidecar (highlights.json),
  // synchronisée par broadcast — jamais recalculée depuis les chats en mémoire
  const [highlights, setHighlights] = useState<HighlightEntry[]>([]);
  const [hlFilterProject, setHlFilterProject] = useState<string | null>(null);
  const marksMigratedRef = useRef(false);
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
        ws.current.send(JSON.stringify({
          type: "saveSettings",
          settings: { ...settings, projMeta: projMetaRef.current, projects: projectsRef.current },
        }));
      }
    }, 600);
    return () => clearTimeout(mirror);
  }, [settings]);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [qaMode, setQaMode] = useState<"closed" | "open" | "min">("closed");
  const qaModeRef = useRef<"closed" | "open" | "min">("closed");
  qaModeRef.current = qaMode;
  const [usageOpen, setUsageOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
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
  // vue active du panneau latéral (barre d'activité) — persistée dans settings
  const activeView = settings.activeView;
  const setActiveView = (v: Settings["activeView"]) =>
    setSettings((s) => (s.activeView === v ? s : { ...s, activeView: v }));
  // un projet est le contexte des chats — le sélectionner ramène sur la vue
  // chats si on est ailleurs, SAUF en vue Surlignés : là il filtre les fiches
  // de ce projet (re-cliquer le même projet revient à « Tous », spec §4)
  const selectProject = (root: string) => {
    setActiveProject(root);
    if (activeView === "highlights") {
      setHlFilterProject((cur) => (cur === root ? null : root));
      return;
    }
    setActiveView("chats");
  };
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
  const projMetaRef = useRef(projMeta);
  projMetaRef.current = projMeta;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  // le localStorage WebKit s'écrit paresseusement et se perd si l'app est tuée :
  // icônes/lettres/ordre des projets partent aussi dans le miroir disque settings.json
  useEffect(() => {
    const id = setTimeout(() => {
      if (ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({
          type: "saveSettings",
          settings: { ...settingsRef.current, projMeta, projects },
        }));
      }
    }, 600);
    return () => clearTimeout(id);
  }, [projMeta, projects]);

  const [activeTab, setActiveTab] = useState<string>("gallery");
  const [activeId, setActiveId] = useState<string | null>(null);
  activeIdRef.current = activeId;
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  // Serveur atelier extrait dans useAtelierServer (slice 2.2) — démarrage par
  // projet, sonde 15 s, relance dure ; restauration des onglets épinglés et
  // bannières restent ici (domaines App).
  const {
    atelierUrl,
    reloadKey: atelierReload,
    hardReload: hardReloadAtelier,
    bumpReload: bumpAtelierReload,
  } = useAtelierServer(activeProject, {
    atelierNonce,
    galleryConfig: () => ({
      galleryDir: settingsRef.current.galleryPath,
      galleryExts: (activeProjectRef.current
        ? settingsRef.current.galleryExtsByProject?.[activeProjectRef.current] ?? ""
        : "") || settingsRef.current.galleryExts || "",
    }),
    onRecovered: () => setAppBanner((b) => b?.text.startsWith("start_atelier:") ? null : b),
    onError: (message) => setAppBanner({
      text: `start_atelier: ${message}`,
      actionLabel: t("app.start-settings"),
      onAction: () => setShowSettings(true),
      closable: true,
    }),
    onReady: (project) => {
      // restaurer les onglets épinglés de ce projet
      try {
        const store = JSON.parse(localStorage.getItem("atelier-studio.pinnedTabs") ?? "{}");
        const pinned: { url: string; title: string; color?: string }[] = store[project] ?? [];
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
    },
  });
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
  // miroir de la surface active de AtelierPane (côté App, pour l'icône active
  // du rail) — AtelierPane ne change sa surface qu'en réaction à l'event
  // switch-surface, lui-même TOUJOURS dispatché par switchToSurface ci-dessous :
  // les deux restent donc synchronisés sans toucher à la logique de AtelierPane.
  const [activeSurface, setActiveSurface] = useState<Surface>("atelier");
  function switchToSurface(surface: Surface) {
    setLayout((l) => (l === "chat" ? "split" : l));
    setActiveSurface(surface);
    window.dispatchEvent(new CustomEvent("switch-surface", { detail: { surface } }));
  }
  // bouton IDE du rail : revient direct à la vue éditeur/PDF (dernier fichier
  // ouvert) sans passer par la Galerie ; sans fichier ouvert, montre l'écran
  // d'accueil IDE (onglet sentinelle "ide" : fichiers récents + explorateur).
  function goToIde() {
    switchToSurface("atelier");
    const fileTabs = atelierTabsRef.current.filter((tb) => tb.kind !== "term");
    if (fileTabs.length) {
      // garder l'onglet fichier actif s'il y en a un, sinon le dernier ouvert
      const keep = fileTabs.find((tb) => tb.id === activeTab) ?? fileTabs[fileTabs.length - 1];
      setActiveTab(keep.id);
    } else {
      setActiveTab("ide");
      setShowExplorer(true);
    }
  }
  // explorateur de fichiers : togglé depuis la TopBar (l'état vit ici pour que
  // le bouton reflète son état actif). Fermé par défaut à chaque démarrage —
  // pas de persistance : il ne se rouvre plus tout seul, on l'ouvre au besoin.
  const [showExplorer, setShowExplorer] = useState(false);

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

  // Dispatcher des messages sidecar — corps inchangé (slice 2.1), branché via
  // useSidecarConnection. Function hissée : le hook est appelé plus haut.
  function handleMessage(msg: any) {
      if (msg.type === "settingsFile") {
        const hasLocal = localStorage.getItem("atelier-studio.settings") !== null;
        const { projMeta: diskMeta, projects: diskProjects, ...diskSettings } = msg.settings ?? {};
        if (msg.settings && !hasLocal) {
          // webview vierge (mise à jour, reset WebKit) : le fichier disque fait foi
          setSettings({ ...DEFAULT_SETTINGS, ...diskSettings });
        } else if (ws.current?.readyState === 1) {
          // sinon pousser l'état courant vers le fichier pour l'amorcer
          ws.current.send(JSON.stringify({
            type: "saveSettings",
            settings: { ...settingsRef.current, projMeta: projMetaRef.current, projects: projectsRef.current },
          }));
        }
        // icônes/lettres/ordre : le disque fait foi — le localStorage WebKit peut
        // avoir perdu les dernières écritures si l'app a été tuée
        if (diskMeta && typeof diskMeta === "object") {
          setProjMeta((cur) => ({ ...cur, ...diskMeta }));
        }
        if (Array.isArray(diskProjects) && diskProjects.length) {
          // union : le disque fait foi pour l'existence (le localStorage WebKit
          // peut avoir perdu un projet récent si l'app a été tuée), puis on
          // ajoute les créations locales pas encore synchronisées au disque.
          setProjects((cur) => [
            ...diskProjects,
            ...cur.filter((r) => !diskProjects.includes(r)),
          ]);
        }
      }
      if (msg.type === "threads") {
        const prevThreads = threadsRef.current;
        setThreads(msg.threads);
        threadsRef.current = msg.threads;
        // thread déplacé vers un autre projet (moveThread) : s'il est actif, le
        // suivre — le chat "voyage" avec l'utilisateur (spec déplacer-chat-projet)
        const activeId = activeIdRef.current;
        if (activeId) {
          const before = prevThreads.find((th: Thread) => th.id === activeId);
          const after = msg.threads.find((th: Thread) => th.id === activeId);
          if (before && after && after.projectRoot !== before.projectRoot) {
            setActiveProject(after.projectRoot || null);
          }
        }
        // migration one-shot des marks localStorage → fiches durables (lot 2,
        // §1) : dès que la liste des threads est connue (métadonnées dispo),
        // bornée par marksMigratedRef (cette session) + flag localStorage (à vie)
        if (!marksMigratedRef.current) {
          marksMigratedRef.current = true;
          migrateLocalMarks(msg.threads ?? [], (m) => {
            if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m));
          });
        }
      }
      if (msg.type === "highlights") {
        setHighlights(Array.isArray(msg.highlights) ? msg.highlights : []);
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
          // au plus UNE bulle streaming par tour, retrouvée où qu'elle soit dans la
          // liste (les events outils/thinking de Codex/Grok s'intercalent entre les
          // deltas et le bloc final → une recherche "dernier élément seulement"
          // laissait une bulle orpheline au caret éternel + texte dupliqué)
          let sIdx = -1;
          for (let k = list.length - 1; k >= 0; k--) {
            if (list[k].kind === "streaming") { sIdx = k; break; }
          }
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
            if (sIdx >= 0) {
              list[sIdx] = { ...list[sIdx], text: (list[sIdx] as any).text + ev.text } as any;
            } else {
              list.push({ kind: "streaming", text: ev.text, ts: Date.now() } as any);
            }
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "stream_set") {
            if (sIdx >= 0) {
              list[sIdx] = { ...list[sIdx], text: ev.text } as any;
            } else {
              list.push({ kind: "streaming", text: ev.text, ts: Date.now() } as any);
            }
            return { ...prev, [msg.threadId]: list };
          }
          if (ev.kind === "text") {
            // le bloc final remplace SA bulle streaming, même si des events outils
            // se sont intercalés depuis les derniers deltas
            if (sIdx >= 0) list[sIdx] = { ...ev, ts: Date.now() };
            else list.push({ ...ev, ts: Date.now() });
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
          // fin de tour : une bulle streaming jamais finalisée (interruption, provider
          // sans bloc final) devient un texte définitif — ou disparaît si vide
          if ((ev.kind === "done" || ev.kind === "error") && sIdx >= 0) {
            const txt = String((list[sIdx] as any).text ?? "");
            if (txt.trim()) list[sIdx] = { kind: "text", text: txt, ts: (list[sIdx] as any).ts } as any;
            else list.splice(sIdx, 1);
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
          if (msg.event.kind === "done" && settingsRef.current.autoRefreshAtelier) bumpAtelierReload();
          // l'agent a peut-être créé des fichiers → rafraîchir le catalogue (résolution des chips)
          if (msg.event.kind === "done" && activeProjectRef.current && ws.current?.readyState === 1) {
            requestCatalog(ws.current, activeProjectRef.current);
          }
        }
      }
      if (msg.type === "history") {
        // assainir : des bulles "streaming" orphelines persistées avant le fix bec2c27
        // ressusciteraient leur curseur clignotant — les figer en texte (ou les retirer)
        const sanitized = (msg.events as AgentEvent[]).flatMap((ev: any) =>
          ev.kind !== "streaming" ? [ev]
          : String(ev.text ?? "").trim() ? [{ ...ev, kind: "text" }] : []);
        setEvents((prev) => ({
          ...prev,
          [msg.threadId]: prev[msg.threadId]?.length ? prev[msg.threadId] : sanitized,
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
      if (msg.type === "gitUndoLastTurnError") {
        window.dispatchEvent(new CustomEvent("git-undo-error", { detail: msg }));
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
  }

  useEffect(() => {
    const onZoteroItems = (e: Event) => {
      const detail = (e as CustomEvent).detail as { items?: ZoteroPaletteItem[] };
      setZoteroItems(detail.items ?? []);
    };
    window.addEventListener("zotero-items", onZoteroItems);
    return () => window.removeEventListener("zotero-items", onZoteroItems);
  }, []);

  // Famille d'événements « palette / revue / quick-ask » (slice 2.3) : les
  // handlers gardent leurs closures sur l'état d'App ; useWorkspaceEvents ne
  // gère que subscription + cleanup (testé).
  {
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
    const onRequestReview = (e: Event) => {
      const threadId = (e as CustomEvent).detail?.threadId;
      if (threadId && ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: "requestReview", threadId, autoReview: settingsRef.current.autoReview }));
      }
    };
    const onQaToggle = () => {
      const mode = qaModeRef.current;
      if (mode === "open") { setQaMode("min"); return; }
      if (mode === "min") { setQaMode("open"); return; }
      setQaDraft("");
      setQaContext("");
      setQaMode("open");
    };
    const onOpenPalette = () => setPaletteOpen(true);
    const onUsageToggle = () => setUsageOpen((v) => !v);
    useWorkspaceEvents({
      "atelier-add-to-chat-citation": onCitation,
      "quick-ask-open": onQaOpen,
      "autoreview-toggle": onAutoReviewToggle,
      "permission-answer": onPermAnswer,
      "correct-issues": onCorrectIssues,
      "request-review": onRequestReview,
      "open-palette": onOpenPalette,
      "quick-ask-toggle": onQaToggle,
      "usage-toggle": onUsageToggle,
    });
  }

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  // catalogue skills + fichiers du projet actif (pour les menus / et @)
  useEffect(() => {
    if (activeProject && wsReady && ws.current?.readyState === 1) {
      requestCatalog(ws.current, activeProject);
    }
  }, [activeProject, wsReady]);


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
    // chemin absolu venant du chat : ne garder que ceux sous le projet actif
    if (rel.startsWith("/")) {
      const root = activeProject.endsWith("/") ? activeProject : activeProject + "/";
      if (!rel.startsWith(root)) return;
      rel = rel.slice(root.length);
    }
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
    // dédoublonner DANS l'updater : atelierTabsRef n'est synchronisé qu'après le
    // commit React — deux clics rapprochés créaient deux onglets identiques
    const newId = crypto.randomUUID();
    setAtelierTabs((tabs) => {
      const existing = tabs.find((t) => t.url.replace(/&line=[^&]*/, "") === baseUrl);
      if (existing) {
        // même fichier déjà ouvert : re-cibler la ligne demandée si besoin
        setActiveTab(existing.id);
        return existing.url !== url ? tabs.map((t) => (t.id === existing.id ? { ...t, url } : t)) : tabs;
      }
      setActiveTab(newId);
      return [...tabs, { id: newId, url, title: name }];
    });
    // l'onglet vit dans la surface Atelier : y basculer si on est ailleurs
    switchToSurface("atelier");
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
      switchSurface: switchToSurface,
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
        switchToSurface("biblio");
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

  // Slots du WorkspaceShell (slice 3) — contenus et props inchangés, seule la
  // composition est déléguée au shell.
  // feux NATIFS (titleBarStyle Overlay + trafficLightPosition, cf.
  // tauri.conf.json) repositionnés dans la TopBar — plus de feux custom
  const topBarNode = (
    <TopBar
      projects={projects}
      projMeta={projMeta}
      activeProject={activeProject}
      onSelectProject={selectProject}
      onAddProject={addProject}
      layout={layout}
      onSetLayout={setLayout}
      onOpenPalette={() => setPaletteOpen(true)}
      onQuickAsk={() => window.dispatchEvent(new CustomEvent("quick-ask-toggle"))}
      activeSurface={activeSurface}
      showAtelier={showAtelier}
      onGalleryReload={hardReloadAtelier}
      showExplorer={showExplorer}
      onToggleExplorer={() => {
        // toggle seul : ne change PAS la surface active (sinon fermer
        // l'explorateur depuis browser/terminal te ramènerait à la galerie).
        // On sort juste du layout « chat » pour que l'atelier soit visible.
        setLayout((l) => (l === "chat" ? "split" : l));
        setShowExplorer((v) => !v);
      }}
      onOpenGit={() => switchToSurface("git")}
    />
  );
  const railNode = (
        <Rail
          projects={projects}
          activeProject={activeProject}
          meta={projMeta}
          running={runningProjects}
          threads={allThreads}
          activeId={activeId}
          unread={unread}
          activeView={activeView}
          highlights={highlights}
          layout={layout}
          activeSurface={activeSurface}
          onSelectSurface={switchToSurface}
          onSelectGallery={() => { switchToSurface("atelier"); setActiveTab("gallery"); }}
          onSelectIde={goToIde}
          ideActive={showAtelier && activeSurface === "atelier" && activeTab !== "gallery" && (activeTab === "ide" || atelierTabs.some((tb) => tb.id === activeTab && tb.kind !== "term"))}
          showExplorer={showExplorer}
          onToggleExplorer={() => { setShowExplorer((v) => !v); switchToSurface("atelier"); }}
          onSelectView={setActiveView}
          onSelectThread={(id) => { const th = allThreads.find((t) => t.id === id); if (th) selectThread(id, th.projectRoot); }}
          onSelectProject={selectProject}
          onAddProject={addProject}
          onNew={(root) => (root ? newThread(root) : activeProject ? newThread(activeProject) : newChat())}
          compact={compact}
          onExpand={() => setCompact((c) => !c)}
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
  );
  const viewPanelNode = compact ? null : activeView !== "chats" ? (
          <HighlightsPanel
            highlights={highlights}
            threads={allThreads}
            projMeta={projMeta}
            filterProject={hlFilterProject}
            onSetFilterProject={setHlFilterProject}
            onRemove={(id) => {
              setHighlights((list) => list.filter((h) => h.id !== id));
              if (ws.current?.readyState === 1) {
                ws.current.send(JSON.stringify({ type: "removeHighlight", id }));
              }
            }}
            onOpenChat={(threadId, projectRoot) => {
              setActiveView("chats");
              selectThread(threadId, projectRoot);
            }}
            onExport={async () => {
              const md = buildHighlightsMarkdown(highlights);
              try {
                await navigator.clipboard.writeText(md);
                setAppBanner({ text: t("highlights.export-copied"), closable: true });
                setTimeout(() => {
                  setAppBanner((b) => (b?.text === t("highlights.export-copied") ? null : b));
                }, 3500);
              } catch {}
            }}
            onCompact={() => setCompact(true)}
          />
  ) : (
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
          onSelectProject={selectProject}
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
  );
  const overlaysNode = (
    <>
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
    </>
  );

  return (
    <WorkspaceShell topBar={topBarNode} rail={railNode} viewPanel={viewPanelNode} overlays={overlaysNode}
      dragging={dragging} onDraggingChange={setDragging}>
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
          projectRoot={activeProject}
          threadTitle={activeId ? (allThreads.find((th) => th.id === activeId)?.title ?? "") : ""}
          threadProvider={activeId ? (allThreads.find((th) => th.id === activeId)?.provider ?? "") : ""}
          highlights={highlights}
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
              showExplorer={showExplorer}
              recentFiles={recentFiles.filter((f) => files.includes(f)).slice(0, 8)}
              onOpenExplorer={() => setShowExplorer(true)}
            />
          </Panel>
        </>
      )}
    </PanelGroup>
    </WorkspaceShell>
  );
}
