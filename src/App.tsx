import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  sendPrompt,
  requestCatalog,
  requestFileCatalog,
  getClientInstanceId,
  Thread,
  AgentEvent,
  Command,
} from "./lib/ws";
import { materializeHarnessHistory, mergeHarnessHistory, reduceHarnessEvent } from "./lib/harnessEvents";
import { rebuildReplayQuotePastes } from "./lib/replayQuotes";
import { buildForkThreadPayload } from "./lib/forkThread";
import { useSidecarConnection, type SidecarStatus } from "./hooks/useSidecarConnection";
import { useAtelierServer } from "./hooks/useAtelierServer";
import { artefactKind, deriveResearchHomeModel } from "./lib/researchHome";
import { focusComposer, type ResearchHomeBundle } from "./components/ResearchHome";
import { ContextInspector, type InspectedFile } from "./components/ContextInspector";
import { useWorkspaceEvents } from "./hooks/useWorkspaceEvents";
import WorkspaceShell from "./components/shell/WorkspaceShell";
import Sidebar from "./components/Sidebar";
import Rail, { ProjMeta, HighlightEntry } from "./components/Rail";
import TopBar from "./components/TopBar";
import type { Surface } from "./components/surfaces";
import Chat from "./components/Chat";
import { agentsFromActions, isAgentActivityAction, type AgentDisplay } from "./components/chat/AgentActivity";
import Banner from "./components/Banner";
import AtelierPane from "./components/AtelierPane";
import { LazyBoundary, lazyWithRetry } from "./components/LazyBoundary";
const SettingsPage = lazyWithRetry(() => import("./components/Settings"));
const CommandPalette = lazyWithRetry(() => import("./components/CommandPalette"));
const AutomationsPanel = lazyWithRetry(() => import("./components/Automations"));
const QuickAsk = lazyWithRetry(() => import("./components/QuickAsk"));
const PluginPanel = lazyWithRetry(() => import("./components/PluginPanel"));
import { LazyDialog } from "./components/ui/LazyDialog";
import { Button } from "./components/ui/Button";
import { IconButton } from "./components/ui/IconButton";
import { showError, showInfo, showSuccess } from "./components/ui/toast";
import { RowButton } from "./components/ui";
import UsagePopover, { worstOf } from "./components/UsagePopover";
import { pluginSkillsForPrompt, type PluginCatalogEntry } from "./lib/plugins";
import { catalogSkillForPrompt, skillAttachInstruction } from "./lib/skills";
import { init as initNotify, notifyRunDone, notifyReview } from "./lib/notify";
import { CloseIcon, DownloadIcon, HighlighterIcon, ProviderIcon, SidebarIcon } from "./components/icons";
import { loadSettings, saveSettings, Settings, ProviderId, DEFAULT_SETTINGS } from "./lib/settings";
import { ProviderInfo } from "./lib/providers";
import { THEME_PRESETS, presetById } from "./lib/themes";
import { setLanguage, t } from "./lib/i18n";
import { kbSourcesSnapshot, requestKbSources } from "./lib/kbSources";
import { openFileRef } from "./components/chat/md";
import { openPath } from "@tauri-apps/plugin-opener";
import { buildItems } from "./lib/palette";
import type { Automation } from "./lib/automations";
import { setDockBadge } from "./lib/dockBadge";
import {
  atelierTargetOrigin,
  isTrustedAtelierMessage,
  withAtelierNonce,
  type AtelierGalleryResultMessage,
  type AtelierOutboundMessage,
} from "./lib/ipc";
import {
  createGalleryCommandBridge,
  type GalleryCommandBridge,
  type GalleryCommandBridgeError,
  type GalleryCommandRequest,
} from "./lib/galleryCommandBridge";
import { parseNativeSlashCommand } from "./lib/slashCommands";
import {
  composerDraftKey,
  useChatDraftStore,
  type DraftAttachment,
  type QueuedTurn,
} from "./lib/chatDraftStore";
import { localImagePathsForAttachments } from "./lib/chatAttachments";
import {
  appSnapPreviewUrl,
  appSnapContextText,
  onAppSnapCaptured,
  onAppSnapError,
  setAppSnapEnabled,
  type AppSnapCapture,
} from "./lib/appSnap";
// tokens → shadcn/Typeset → primitives → App.css : les alias sémantiques et les classes ui-*
// doivent être définis avant les règles historiques (cascade à égalité de
// spécificité — App.css garde le dernier mot pendant la migration).
import "./styles/tokens.css";
import "./styles/shadcn.css";
import "./styles/typeset.css";
import "./styles/primitives.css";
import "./App.css";

const PROJECTS_KEY = "atelier-studio.projects";

export type Attachment = DraftAttachment;
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
    `<zotero-reference citekey="${citekey}" zotero-key="${item.key}"${item.pdfKey ? ` pdf-key="${item.pdfKey}"` : ""}${item.pdfFile ? ` pdf-file="${item.pdfFile.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"` : ""}>`,
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

function playAppSnapSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(760, now);
    oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
    oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
  } catch {
    // Le son est un feedback facultatif; la capture reste utilisable sans lui.
  }
}

function checkpointAfterUser(events: AgentEvent[], index: number) {
  const userMeta = events[index]?.meta;
  const turnId = userMeta && "turnId" in userMeta ? userMeta.turnId : undefined;
  const done = events.slice(index + 1).find((event): event is Extract<AgentEvent, { kind: "done" }> => {
    if (event.kind !== "done" || !event.checkpoint) return false;
    const meta = event.meta;
    return !turnId || Boolean(meta && "turnId" in meta && meta.turnId === turnId);
  });
  return done?.checkpoint ? { turnId, snapshotSha: done.checkpoint.snapshotSha } : { turnId };
}

function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// nom court d'un projet à partir de son chemin absolu — même convention que
// projInitial (Rail.tsx) : dernier segment du chemin
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
  const preset = presetById(settings.themePreset);
  const base = { ...preset.vars };
  if (settings.accentColor) base["--accent"] = settings.accentColor;
  if (settings.bgColor) base["--bg"] = settings.bgColor;
  if (settings.fgColor) base["--fg"] = settings.fgColor;
  return {
    ...base,
    "--surface-app": base["--bg"],
    "--surface-panel": base["--bg-side"],
    "--surface-header": base["--bg-side"],
    "--surface-raised": base["--bg-card"],
    "--surface-inset": base["--bg-ctl"],
    "--text-primary": base["--fg"],
    "--text-secondary": base["--fg2"],
    "--text-tertiary": base["--muted"],
    "--text-disabled": base["--muted2"],
    "--border-subtle": base["--border"],
    "--border-interactive": base["--border2"],
    "--radius-control": "4px",
    "--control-height": settings.density === "compact" ? "26px" : "28px",
    "--surface-header-height": settings.density === "compact" ? "38px" : "42px",
    "--motion-fast": "120ms",
    "--motion-standard": "160ms",
    "--ui-font": settings.uiFont ? `'${settings.uiFont}', ${CANON_UI_FONT}` : CANON_UI_FONT,
    "--code-font": settings.codeFont ? `'${settings.codeFont}', ${CANON_CODE_FONT}` : CANON_CODE_FONT,
  };
}

function themeMessage(settings: Settings, nonce: string): AtelierOutboundMessage {
  return {
    type: "atelier-theme",
    version: 2,
    colorScheme: presetById(settings.themePreset).dark ? "dark" : "light",
    nonce,
    vars: themeVars(settings),
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
        <IconButton className="mini compact-btn" label={t("action.collapse-sidebar")} title={t("action.collapse-sidebar")} onClick={p.onCompact}>
          <SidebarIcon size={17} />
        </IconButton>
      </div>
      <div className="hl-head">
        <span className="hl-head-title">{t("view.highlights")}</span>
        <span className="hl-count">{p.highlights.length}</span>
        <IconButton className="mini hl-export-btn" label={t("highlights.export")} title={t("highlights.export")}
          disabled={!p.highlights.length} onClick={p.onExport}>
          <DownloadIcon size={15} />
        </IconButton>
      </div>
      {!!groups.length && (
        <div className="hl-chips">
          <RowButton className={`chip ${p.filterProject == null ? "on" : ""}`}
            onClick={() => p.onSetFilterProject(null)}>
            {t("highlights.all-count", { n: p.highlights.length })}
          </RowButton>
          {groups.map((g) => (
            <RowButton key={g.key} className={`chip ${p.filterProject === g.key ? "on" : ""}`}
              onClick={() => p.onSetFilterProject(p.filterProject === g.key ? null : g.key)}>
              <span className="hl-dot" style={{ background: p.projMeta[g.projectRoot]?.color || "var(--muted2)" }} />
              {g.projectName || t("highlights.no-project")} · {g.count}
            </RowButton>
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
                  <Button variant="ghost" className="hl-open-chat"
                    onClick={(e) => { e.stopPropagation(); p.onOpenChat(h.threadId, h.projectRoot); }}>
                    {t("highlights.open-chat")}
                  </Button>
                )}
                <div className="hl-foot">
                  <span className="hl-dot" style={{ background: p.projMeta[h.projectRoot]?.color || "var(--muted2)" }} />
                  <span className="hl-proj">{h.projectName || t("highlights.no-project")}</span>
                  <span className="hl-time">{hlRelativeDate(h.createdAt)}</span>
                  <IconButton size="s" className="hl-remove" label={t("highlights.remove")} title={t("highlights.remove")}
                    onClick={(e) => { e.stopPropagation(); p.onRemove(h.id); }}>
                    <CloseIcon size={11} />
                  </IconButton>
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
  const atelierNonceRef = useRef<string | null>(null);
  if (atelierNonceRef.current === null) atelierNonceRef.current = crypto.randomUUID();
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
      if (sock) sock.send(JSON.stringify({ type: "listAutomations" }));
    } else {
      setAppBanner({ text: t("app.sidecar-disconnected") });
    }
  };
  const { wsRef: ws, wsReady, mock } = useSidecarConnection(handleMessage, onSidecarStatus);
  // distingue le démarrage à froid (connecting) d'une connexion perdue
  // (disconnected) pour le Research Home — plan 017 § Chargement
  const sidecarEverConnected = useRef(false);
  const [projects, setProjects] = useState<string[]>(loadProjects);
  const [activeProject, setActiveProject] = useState<string | null>(
    () => loadProjects()[0] ?? null,
  );
  const [threads, setThreads] = useState<Thread[]>([]);
  const threadsRef = useRef<Thread[]>([]);
  const allThreadsRef = useRef<Thread[]>([]);
  // threads locaux (pas encore connus du sidecar) — nouveaux chats vides
  const [draftThreads, setDraftThreads] = useState<Thread[]>([]);
  // fiches « Surlignés » (lot 2) : source de vérité = sidecar (highlights.json),
  // synchronisée par broadcast — jamais recalculée depuis les chats en mémoire
  const [highlights, setHighlights] = useState<HighlightEntry[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const heartbeatThreadIds = useMemo(
    () => new Set(
      automations.flatMap((automation) =>
        automation.kind === "heartbeat"
          && automation.status === "ACTIVE"
          && automation.targetThreadId
          ? [automation.targetThreadId]
          : [],
      ),
    ),
    [automations],
  );
  const [hlFilterProject, setHlFilterProject] = useState<string | null>(null);
  const marksMigratedRef = useRef(false);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const eventsRef = useRef<Record<string, AgentEvent[]>>({});
  eventsRef.current = events;
  const [workingSince, setWorkingSince] = useState<Record<string, number | null>>({});
  const workingSinceRef = useRef<Record<string, number | null>>({});
  workingSinceRef.current = workingSince;
  // tokens de sortie du tour en cours (heartbeat provider) — ticker Working
  const [liveTokens, setLiveTokens] = useState<Record<string, number | null>>({});
  const [usageByThread, setUsageByThread] = useState<
    Record<string, { context: number; output: number; cost: number | null; turns: number | null; window?: number | null }>
  >({});
  const [commands, setCommands] = useState<Command[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [injectText, setInjectText] = useState<string | null>(null);
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
  const pendingResend = useRef<{
    threadId: string;
    prompt: string;
    snapshot: AgentEvent[];
    clientMessageId: string;
    ts: number;
    index: number;
  } | null>(null);
  const pendingRevert = useRef<{
    threadId: string;
    snapshot: AgentEvent[];
    index: number;
  } | null>(null);
  const [atelierTabs, setAtelierTabs] = useState<
    { id: string; url: string; title: string; color?: string; pinned?: boolean; kind?: "term"; cwd?: string; projectRoot?: string }[]
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
  const [newChatRequest, setNewChatRequest] = useState<{ projectRoot: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
  const [zoteroItems, setZoteroItems] = useState<ZoteroPaletteItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("atelier-studio.recentFiles") ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("atelier-studio.recentFiles", JSON.stringify(recentFiles));
  }, [recentFiles]);
  const [, setLanguageRev] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState("general");
  const openSettings = (section = "general") => {
    setSettingsInitialSection(section);
    setShowSettings(true);
  };
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
    const pushThemeToAtelierFrames = () => {
      document.querySelectorAll("iframe.atelier").forEach((f) => {
        const iframe = f as HTMLIFrameElement;
        const targetOrigin = atelierTargetOrigin(iframe.src);
        if (!targetOrigin) return;
        const message = themeMessage(settings, atelierNonce);
        iframe.contentWindow?.postMessage(message, targetOrigin);
      });
    };
    const broadcastTheme = setTimeout(pushThemeToAtelierFrames, 50);
    // ré-essaimage périodique : le message de thème porte le nonce IPC — une
    // page dont WKWebView a purgé le sessionStorage (clics « Add to chat »
    // muets jusqu'au reload) le réadopte et redevient fonctionnelle seule
    const reseedNonce = setInterval(pushThemeToAtelierFrames, 30_000);
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
    return () => {
      clearTimeout(broadcastTheme);
      clearInterval(reseedNonce);
      clearTimeout(mirror);
    };
  }, [settings]);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [qaMode, setQaMode] = useState<"closed" | "open" | "min">("closed");
  const qaModeRef = useRef<"closed" | "open" | "min">("closed");
  qaModeRef.current = qaMode;
  const [usageOpen, setUsageOpen] = useState(false);
  const usageOpenRef = useRef(false);
  usageOpenRef.current = usageOpen;
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [plugins, setPlugins] = useState<PluginCatalogEntry[]>([]);
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
    // Le projet est aussi le point d'entrée de son accueil. Sans remettre le
    // thread actif à null, cet accueil n'était accessible qu'après une relance.
    setActiveId(null);
    activeIdRef.current = null;
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
  const [layout, setLayout] = useState<"split" | "chat" | "atelier">("split");
  const [openedAgent, setOpenedAgent] = useState<AgentDisplay | null>(null);
  const previousAtelierTab = useRef("gallery");
  const [activeId, setActiveId] = useState<string | null>(null);
  activeIdRef.current = activeId;
  // Les mises à jour Codex arrivent sur le fil parent. Garder l'id de l'agent
  // ouvert, mais dériver son état actuel depuis ce fil afin que le panneau droit
  // évolue sans devoir être refermé puis rouvert.
  const activeAgent = useMemo(() => {
    if (!openedAgent || !activeId) return null;
    const refreshed = agentsFromActions((events[activeId] ?? []).filter(isAgentActivityAction));
    return refreshed.find((agent) => agent.threadId === openedAgent.threadId) ?? openedAgent;
  }, [activeId, events, openedAgent]);
  const activeAgentEvents = useMemo(
    () => activeAgent ? (events[activeAgent.threadId] ?? []) : [],
    [activeAgent, events],
  );
  const openAgentInAtelier = (agent: AgentDisplay) => {
    const nextId = `agent:${agent.threadId}`;
    setOpenedAgent(agent);
    setActiveTab((current) => {
      if (!current.startsWith("agent:")) previousAtelierTab.current = current;
      return nextId;
    });
    switchToSurface("atelier");
  };
  const closeAgentInAtelier = () => {
    const closingId = openedAgent ? `agent:${openedAgent.threadId}` : null;
    setOpenedAgent(null);
    setActiveTab((current) => current === closingId ? previousAtelierTab.current : current);
  };
  // Le flux d'activité parent indique qu'un sous-agent existe mais ne contient
  // pas son transcript. Celui-ci vit dans le rollout enfant Codex : on le
  // charge à l'ouverture, puis on le rafraîchit doucement tant qu'il travaille.
  useEffect(() => {
    const agentThreadId = activeAgent?.threadId;
    const agentWorking = activeAgent?.status === "working";
    if (!activeId || !agentThreadId || !wsReady) return;
    const request = () => {
      if (ws.current?.readyState !== WebSocket.OPEN) return;
      ws.current.send(JSON.stringify({
        type: "getAgentHistory",
        parentThreadId: activeId,
        agentThreadId,
      }));
    };
    request();
    if (!agentWorking) return;
    const timer = window.setInterval(request, 2500);
    return () => window.clearInterval(timer);
  }, [activeAgent?.status, activeAgent?.threadId, activeId, wsReady]);
  useEffect(() => {
    setOpenedAgent(null);
    setActiveTab((current) => current.startsWith("agent:") ? previousAtelierTab.current : current);
  }, [activeId]);
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const activeComposerKey = composerDraftKey(activeId, activeProject);
  const {
    draft: activeComposerDraft,
    drafts: composerDrafts,
    setPrompt: setComposerPrompt,
    setAttachments,
    setFollowUpMode,
    updateDraft: updateComposerDraft,
    enqueueTurn,
    removeQueuedTurn,
    reorderQueuedTurn,
    restoreQueuedTurn,
  } = useChatDraftStore(activeComposerKey);
  const attachments = activeComposerDraft.attachments;
  const appSnapPreviewUrlsRef = useRef(new Set<string>());
  const hydratingAppSnapsRef = useRef(new Set<string>());

  useEffect(() => () => {
    for (const url of appSnapPreviewUrlsRef.current) URL.revokeObjectURL(url);
    appSnapPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const needsPreview = (attachment: Attachment) =>
      attachment.kind === "appsnap" && Boolean(attachment.path) &&
      !attachment.imageUrl?.startsWith("blob:") && !attachment.imageUrl?.startsWith("data:");

    for (const [key, draft] of Object.entries(composerDrafts)) {
      const paths = new Set<string>();
      for (const attachment of draft.attachments) {
        if (needsPreview(attachment) && attachment.path) paths.add(attachment.path);
      }
      for (const turn of draft.queuedTurns) {
        for (const attachment of turn.attachments) {
          if (needsPreview(attachment) && attachment.path) paths.add(attachment.path);
        }
      }

      for (const path of paths) {
        const hydrationKey = `${key}\u0000${path}`;
        if (hydratingAppSnapsRef.current.has(hydrationKey)) continue;
        hydratingAppSnapsRef.current.add(hydrationKey);
        void appSnapPreviewUrl(path).then((imageUrl) => {
          appSnapPreviewUrlsRef.current.add(imageUrl);
          updateComposerDraft(key, (current) => {
            let changed = false;
            const hydrate = (attachment: Attachment) => {
              if (attachment.kind !== "appsnap" || attachment.path !== path || !needsPreview(attachment)) {
                return attachment;
              }
              changed = true;
              return { ...attachment, imageUrl };
            };
            const nextAttachments = current.attachments.map(hydrate);
            const nextQueuedTurns = current.queuedTurns.map((turn) => {
              const next = turn.attachments.map(hydrate);
              return next.some((attachment, index) => attachment !== turn.attachments[index])
                ? { ...turn, attachments: next }
                : turn;
            });
            return changed
              ? { ...current, attachments: nextAttachments, queuedTurns: nextQueuedTurns }
              : current;
          });
        }).catch((error) => {
          console.warn("[appsnap] Could not restore capture preview", error);
        }).finally(() => {
          hydratingAppSnapsRef.current.delete(hydrationKey);
        });
      }
    }
  }, [composerDrafts, updateComposerDraft]);

  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    const handledCaptures = new Set<string>();

    const register = async () => {
      const capturedStop = await onAppSnapCaptured((capture: AppSnapCapture) => {
        if (disposed || handledCaptures.has(capture.id)) return;
        handledCaptures.add(capture.id);
        void appSnapPreviewUrl(capture.path).then((imageUrl) => {
          if (disposed) {
            URL.revokeObjectURL(imageUrl);
            return;
          }
          appSnapPreviewUrlsRef.current.add(imageUrl);
          const projectRoot = activeProjectRef.current ?? "";
          let threadId = activeIdRef.current;
          if (!threadId) {
            threadId = crypto.randomUUID();
            const freshThread: Thread = {
              id: threadId,
              projectRoot,
              title: t("app.new-chat-title"),
              provider: settingsRef.current.defaultProvider,
              sessionId: null,
              status: "idle",
              updatedAt: new Date().toISOString(),
            };
            setDraftThreads((current) => [freshThread, ...current]);
            setActiveId(threadId);
            activeIdRef.current = threadId;
            setEvents((current) => ({ ...current, [threadId as string]: current[threadId as string] ?? [] }));
          }

          const appName = capture.sourceAppName || t("appsnap.source-unknown");
          const windowTitle = capture.sourceWindowTitle?.trim() || t("appsnap.window-untitled");
          const attachment: Attachment = {
            name: capture.name,
            lines: null,
            kind: "appsnap",
            path: capture.path,
            imageUrl,
            text: appSnapContextText(capture, appName, windowTitle),
            preview: {
              title: t("appsnap.preview-title"),
              rows: [
                { label: t("appsnap.preview-app"), value: appName },
                { label: t("appsnap.preview-window"), value: windowTitle },
                {
                  label: t("appsnap.preview-interface"),
                  value: capture.accessibilitySnapshot
                    ? `${t("appsnap.preview-interface-count", { count: capture.accessibilityElementCount ?? 0 })}${capture.accessibilitySnapshotTruncated ? t("appsnap.preview-truncated") : ""}`
                    : t("appsnap.preview-interface-unavailable"),
                },
                { label: t("appsnap.preview-file"), value: capture.path },
              ],
            },
          };
          updateComposerDraft(composerDraftKey(threadId, projectRoot), (draft) => ({
            ...draft,
            attachments: addAttachment(draft.attachments, attachment),
          }));
          setShowSettings(false);
          setSettings((current) => current.activeView === "chats" ? current : { ...current, activeView: "chats" });
          setLayout((current) => current === "atelier" ? "split" : current);
          if (settingsRef.current.appSnapPlaySound) playAppSnapSound();
          requestAnimationFrame(focusComposer);
          void showSuccess(t("appsnap.capture-added", { app: appName }));
        }).catch((error) => {
          handledCaptures.delete(capture.id);
          if (!disposed) void showError(t("appsnap.capture-failed", { error: String(error) }));
        });
      });
      if (disposed) capturedStop();
      else stops.push(capturedStop);

      const errorStop = await onAppSnapError((error) => {
        if (!disposed) void showError(t("appsnap.capture-failed", { error: error.message }));
      });
      if (disposed) errorStop();
      else stops.push(errorStop);
    };
    void register().catch((error) => {
      if (!disposed) void showError(t("appsnap.action-failed", { error: String(error) }));
    });
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, [updateComposerDraft]);

  useEffect(() => {
    void setAppSnapEnabled(settings.enableAppSnap).catch((error) => {
      if (settings.enableAppSnap) void showError(t("appsnap.action-failed", { error: String(error) }));
    });
  }, [settings.enableAppSnap]);

  // Serveur atelier extrait dans useAtelierServer (slice 2.2) — démarrage par
  // projet, sonde 15 s, relance dure ; restauration des onglets épinglés et
  // bannières restent ici (domaines App).
  const {
    atelierUrl,
    reloadKey: atelierReload,
    hardReload: hardReloadAtelier,
  } = useAtelierServer(activeProject, {
    atelierNonce,
    galleryVisible: layout !== "chat" && activeTab === "gallery",
    coreReady: wsReady,
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
      onAction: () => openSettings("providers"),
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
              .map((pt) => ({ id: crypto.randomUUID(), ...pt, projectRoot: project, url: withAtelierNonce(pt.url, atelierNonce), pinned: true }));
            return [...tabs, ...news];
          });
        }
      } catch {}
    },
  });
  // « Modifiés récemment » : envoyé par le catalogue natif avec les mtimes des
  // fichiers Git suivis/non ignorés. Repli sur les derniers fichiers ouverts
  // uniquement avec un ancien backend qui ne connaît pas encore recentFiles.
  const [diskRecents, setDiskRecents] = useState<string[]>([]);
  // jeton d'accès éditeur hors projet : posé par le serveur galerie au boot
  // (~/.atelier-studio/gallery_token), lu via Rust. Absent (vieux serveur) →
  // l'ouverture hors projet est simplement indisponible.
  const galleryTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!atelierUrl || galleryTokenRef.current) return;
    invoke<string>("gallery_token")
      .then((tok) => { galleryTokenRef.current = tok; })
      .catch(() => {});
  }, [atelierUrl]);

  // Les URLs d'éditeur sont servies par un serveur galerie propre à chaque
  // projet (et donc à un port distinct). Un onglet conservé après un changement
  // de projet chargerait le bon chemin sur le mauvais serveur et finirait en
  // 404. Fermer ces onglets morts; les onglets épinglés restent persistés dans
  // leur store par projet et seront restaurés au retour.
  useEffect(() => {
    if (!activeProject || !atelierUrl) return;
    let origin = "";
    try { origin = new URL(atelierUrl).origin; } catch { return; }
    const tabs = atelierTabsRef.current;
    const next = tabs.filter((tab) => {
      if (tab.kind === "term") return !tab.cwd || tab.cwd === activeProject;
      if (tab.projectRoot) return tab.projectRoot === activeProject;
      try { return new URL(tab.url).origin === origin; } catch { return false; }
    });
    if (next.length === tabs.length) return;
    const kept = new Set(next.map((tab) => tab.id));
    setActiveTab((current) => kept.has(current) || current === "ide" ? current : "gallery");
    setAtelierTabs(next);
  }, [activeProject, atelierUrl]);

  // à l'ouverture d'un chat Codex avec session : recharge le goal actif (s'il existe)
  const goalFetched = useRef<Set<string>>(new Set());
  // goal en attente : /goal (ou Goal…) tapé AVANT que la session Codex existe
  // (chat neuf) — l'objectif part comme premier message, et le goal est posé
  // automatiquement au premier threads-update qui apporte le sessionId
  const pendingGoal = useRef<{ threadId: string | null; objective: string } | null>(null);
  useEffect(() => {
    if (!activeId || goalFetched.current.has(activeId)) return;
    const t = threads.find((th) => th.id === activeId);
    if (t?.provider !== "codex" || !t.sessionId) return;
    if (ws.current?.readyState === 1) {
      goalFetched.current.add(activeId);
      ws.current.send(JSON.stringify({ type: "goalGet", threadId: activeId }));
    }
  }, [activeId, threads]);
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
  useEffect(() => {
    const openPassage = () => switchToSurface("biblio");
    window.addEventListener("chat-open-zotero-passage", openPassage);
    return () => window.removeEventListener("chat-open-zotero-passage", openPassage);
  }, []);

  // Citations kb cliquées (plan 052) : ouvrir la source À L'ENDROIT cité
  // quand on le connaît — reader Zotero à la page, browser (web / YouTube à
  // t=), éditeur pour fichiers/dossiers — sinon la surface Connaissances.
  useEffect(() => {
    const onCiteOpen = (e: Event) => {
      const { id, loc } = (e as CustomEvent).detail as { id?: string | null; loc?: string | null };
      if (!id) return;
      const source = kbSourcesSnapshot().find((s) => s.id === id);
      if (!source) {
        requestKbSources({ force: true });
        switchToSurface("connaissances");
        return;
      }
      const meta = (source.meta ?? {}) as Record<string, unknown>;
      if (source.kind === "zotero" && typeof meta.zoteroKey === "string"
        && typeof meta.pdfKey === "string" && typeof meta.pdfFile === "string") {
        const page = Number(/^p\.(\d+)/.exec(loc ?? "")?.[1] ?? 1);
        window.dispatchEvent(new CustomEvent("chat-open-zotero-passage", {
          detail: { key: meta.zoteroKey, pdfKey: meta.pdfKey, pdfFile: meta.pdfFile, page, quote: "" },
        }));
        return;
      }
      if ((source.kind === "web" || source.kind === "youtube") && source.origin) {
        let url = source.origin;
        if (source.kind === "youtube") {
          const mmss = /^(\d+):(\d{2})/.exec(loc ?? "");
          const seconds = mmss ? Number(mmss[1]) * 60 + Number(mmss[2]) : 0;
          if (seconds) url = `${url}${url.includes("?") ? "&" : "?"}t=${seconds}s`;
        }
        switchToSurface("browser");
        // la surface peut monter à l'instant : laisser son listener s'installer
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("browser-open-url", { detail: { url } }));
        }, 250);
        return;
      }
      // fichier local : dans le projet actif → viewer/éditeur atelier ;
      // hors projet → ouverture système (Preview, éditeur par défaut…)
      const openLocal = (absolute: string) => {
        const root = activeProjectRef.current;
        if (root && absolute.startsWith(`${root}/`)) openFileRef(absolute.slice(root.length + 1));
        else void openPath(absolute);
      };
      if (source.kind === "pdf" && source.origin) {
        // panneau de droite : viewer PDF de la galerie en onglet atelier,
        // servi par /kb-pdf/<id> (registre), avec saut à la page citée
        let galleryOrigin: string | null = null;
        try { galleryOrigin = atelierUrlRef.current ? new URL(atelierUrlRef.current).origin : null; } catch {}
        if (galleryOrigin) {
          const page = /^p\.(\d+)/.exec(loc ?? "")?.[1];
          const params = new URLSearchParams();
          // le viewer charge toujours "/" + file — le rel DOIT être la route
          // (le flux Zotero fonctionne par la même coïncidence assumée)
          params.set("file", `kb-pdf/${source.id}`);
          if (page) params.set("page", page);
          const tabId = crypto.randomUUID();
          setAtelierTabs((tabs) => [...tabs, {
            id: tabId,
            url: withAtelierNonce(`${galleryOrigin}/.fig_thumbs/pdf_viewer.html?${params.toString()}`, atelierNonce),
            title: source.title,
            projectRoot: activeProjectRef.current ?? undefined,
          }]);
          setActiveTab(tabId);
          switchToSurface("atelier");
          return;
        }
        openLocal(source.origin);
        return;
      }
      if (source.kind === "file" && source.origin) { openLocal(source.origin); return; }
      if (source.kind === "folder" && source.origin && loc) { openLocal(`${source.origin}/${loc}`); return; }
      switchToSurface("connaissances");
    };
    window.addEventListener("kb-cite-open", onCiteOpen);
    return () => window.removeEventListener("kb-cite-open", onCiteOpen);
  }, []);
  const galleryBridgeRef = useRef<GalleryCommandBridge | null>(null);
  useEffect(() => {
    if (!activeProject) return;
    const bridge = createGalleryCommandBridge({
      nonce: atelierNonce,
      // Une figure fraîchement générée peut exiger un rescan de l'index avant
      // son ouverture. Le serveur borne déjà ce rescan; laisser au bridge le
      // temps de recevoir le résultat final plutôt que d'expirer à 5 s.
      timeoutMs: 30_000,
      getCurrentProjectRoot: () => activeProject,
      getGalleryFrame: () =>
        document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"][data-atelier-ready="true"]'),
      onValidated: () => {
        switchToSurface("atelier");
        setActiveTab("gallery");
      },
      onEmpty: () => { void showInfo(t("atelier.gallery-no-match")); },
    });
    galleryBridgeRef.current = bridge;

    const onCommand = (event: Event) => {
      const request = (event as CustomEvent<GalleryCommandRequest>).detail;
      void bridge.send(request).catch((caught: GalleryCommandBridgeError) => {
        if (["project-changed", "gallery-bridge-disposed"].includes(caught.code)) return;
        void showInfo(t("atelier.gallery-command-error"));
      });
    };
    const onResult = (event: Event) => {
      bridge.acceptResult((event as CustomEvent<AtelierGalleryResultMessage>).detail);
    };
    window.addEventListener("atelier-gallery-command", onCommand);
    window.addEventListener("atelier-gallery-result", onResult);
    return () => {
      window.removeEventListener("atelier-gallery-command", onCommand);
      window.removeEventListener("atelier-gallery-result", onResult);
      bridge.reset("project-changed");
      if (galleryBridgeRef.current === bridge) galleryBridgeRef.current = null;
    };
  }, [activeProject, atelierNonce]);
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

  function attachContextToChat(
    text: string,
    file?: { path?: string; name?: string; previewUrl?: string },
  ) {
    const parsed = parseAttachment(text);
    const attachment: Attachment = file?.path
      ? {
          ...parsed,
          name: file.name || file.path.split("/").pop() || parsed.name,
          path: file.path,
          kind: "file",
          imageUrl: file.previewUrl,
        }
      : parsed;
    const threadId = ensureThreadForContext(attachment.name || t("app.context-chat-title"));
    lastInjected.current = text;
    updateComposerDraft(composerDraftKey(threadId, activeProjectRef.current), (draft) => ({
      ...draft,
      attachments: addAttachment(draft.attachments, attachment),
    }));
    setAnnotation(null);
    setLayout((l) => (l === "atelier" ? "split" : l));
  }

  // Dispatcher des messages sidecar — corps inchangé (slice 2.1), branché via
  // useSidecarConnection. Function hissée : le hook est appelé plus haut.
  function handleMessage(msg: any) {
      if (msg.type === "automations") {
        setAutomations(Array.isArray(msg.automations) ? msg.automations : []);
      }
      if (msg.type === "settingsFile") {
        const hasLocal = localStorage.getItem("atelier-studio.settings") !== null;
        const { projMeta: diskMeta, projects: diskProjects, ...diskSettings } = msg.settings ?? {};
        if (msg.settings && !hasLocal) {
          // webview vierge (mise à jour, reset WebKit) : le fichier disque fait foi
          // sauf pour une migration locale qui n'existait pas encore dans ce
          // fichier (favoris historiques de l'ancien picker de modèles).
          setSettings((current) => ({
            ...DEFAULT_SETTINGS,
            ...diskSettings,
            favoriteModels: diskSettings.favoriteModels && typeof diskSettings.favoriteModels === "object"
              ? diskSettings.favoriteModels
              : current.favoriteModels,
            activeView: "chats",
          }));
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
        // goal en attente : la session Codex vient d'apparaître → le poser
        const pg = pendingGoal.current;
        if (pg?.threadId) {
          const th = msg.threads.find((t: Thread) => t.id === pg.threadId);
          if (th?.sessionId && th.provider === "codex" && ws.current?.readyState === 1) {
            pendingGoal.current = null;
            ws.current.send(JSON.stringify({ type: "goalSet", threadId: pg.threadId, objective: pg.objective }));
          }
        }
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
      if (msg.type === "galleryCommand" && msg.command) {
        window.dispatchEvent(new CustomEvent("atelier-gallery-command", { detail: msg.command }));
      }
      if (msg.type === "event") {
        if (msg.event.kind === "started") {
          setWorkingSince((p) => ({ ...p, [msg.threadId]: p[msg.threadId] ?? Date.now() }));
          return;
        }
        if (msg.event.kind === "heartbeat") {
          // signal de vie : maintient l'indicateur "Working" ; tokens = sortie
          // cumulée du tour quand le provider la fournit (ticker Working)
          setWorkingSince((p) => ({ ...p, [msg.threadId]: p[msg.threadId] ?? Date.now() }));
          const tokens = msg.event.tokens;
          if (typeof tokens === "number") {
            setLiveTokens((p) => ({ ...p, [msg.threadId]: tokens }));
          }
          return;
        }
        if (msg.event.kind === "usage") {
          if (msg.event.usage) setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
          return;
        }
        // toute la logique de réduction (bulle streaming, dédup ack/reconnexion,
        // identités (turnId, itemId)…) vit dans lib/harnessEvents : le MÊME code
        // rejoue les historiques (plan 025, step 8) — seuls les side-effects
        // (workingSince, usage, notifications…) restent ici
        setEvents((prev) => {
          const cur = prev[msg.threadId] ?? [];
          const next = reduceHarnessEvent(cur, msg.event);
          return next === cur ? prev : { ...prev, [msg.threadId]: next };
        });
        if (msg.event.kind === "done" && msg.event.usage) {
          setUsageByThread((p) => ({ ...p, [msg.threadId]: msg.event.usage }));
        }
        if (msg.event.kind === "done" || msg.event.kind === "error") {
          // le ticker du tour ne survit pas au tour
          setLiveTokens((p) => (p[msg.threadId] == null ? p : { ...p, [msg.threadId]: null }));
        }
        // tour AUTONOME (goal poursuivi par le serveur, aucun submit local) :
        // le spinner démarre sur le started du provider — sans écraser un
        // workingSince déjà posé par submit
        if (msg.event.kind === "started") {
          setWorkingSince((p) => p[msg.threadId] != null ? p : { ...p, [msg.threadId]: Date.now() });
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
          // Gallery surveille sa propre révision et remplace ses données en
          // place. Ne jamais remonter son iframe ici : cela efface le scroll,
          // les filtres et produit un faux « reload de l'app » à chaque done.
          // l'agent a peut-être créé des fichiers → rafraîchir le catalogue (résolution des chips)
          if (msg.event.kind === "done" && activeProjectRef.current && ws.current?.readyState === 1) {
            requestCatalog(ws.current, activeProjectRef.current);
          }
        }
      }
      if (msg.type === "history") {
        // replay = live : l'historique est rejoué à travers le MÊME reducer que
        // les événements live ; sur un fil déjà peuplé, seuls les événements
        // identifiés (meta.eventId) manquants fusionnent, par sequence, sans
        // jamais écraser la session vivante (history legacy sans meta : no-op)
        setEvents((prev) => {
          const cur = prev[msg.threadId] ?? [];
          // citations rejouées depuis une session native : re-découpées en
          // pastilles (même bulle qu'en direct) avant la fusion
          const replayed = rebuildReplayQuotePastes((msg.events ?? []) as AgentEvent[]);
          const next = mergeHarnessHistory(cur, replayed);
          return next === cur ? prev : { ...prev, [msg.threadId]: next };
        });
        // replay de l'usage (plan 025) : l'anneau se vidait au reload — le
        // dernier done journalisé porte l'usage du turn, on le restaure si le
        // fil n'a pas déjà un usage vivant plus récent
        const histEvents = (msg.events ?? []) as AgentEvent[];
        const lastDone = [...histEvents].reverse().find(
          (e): e is Extract<AgentEvent, { kind: "done" }> => e.kind === "done" && !!e.usage,
        );
        if (lastDone?.usage) {
          const u = lastDone.usage;
          setUsageByThread((p) => (p[msg.threadId] ? p : { ...p, [msg.threadId]: u }));
        }
      }
      if (msg.type === "agentHistory" && typeof msg.agentThreadId === "string") {
        const next = materializeHarnessHistory((msg.events ?? []) as AgentEvent[]);
        setEvents((prev) => {
          const current = prev[msg.agentThreadId] ?? [];
          // Les rollouts natifs ne portent pas tous la meta durable des events
          // harnais. Une substitution contrôlée est donc nécessaire pour que
          // les nouveaux fragments réellement produits deviennent visibles.
          return JSON.stringify(current) === JSON.stringify(next)
            ? prev
            : { ...prev, [msg.agentThreadId]: next };
        });
      }
      if (msg.type === "annotation" && msg.text !== lastInjected.current) setAnnotation(msg.text);
      if (msg.type === "reverted") {
        if (msg.scope === "files") return;
        const plain = pendingRevert.current;
        if (plain && plain.threadId === msg.threadId) {
          pendingRevert.current = null;
          setEvents((current) => ({
            ...current,
            [plain.threadId]: plain.snapshot.slice(0, plain.index),
          }));
        }
        const pr = pendingResend.current;
        if (pr && pr.threadId === msg.threadId) {
          pendingResend.current = null;
          setEvents((p) => ({
            ...p,
            [pr.threadId]: [...pr.snapshot.slice(0, pr.index), {
              kind: "user",
              text: pr.prompt,
              ts: pr.ts,
              meta: { provisional: true, messageId: pr.clientMessageId },
            }],
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
              clientMessageId: pr.clientMessageId,
              displayEvent: { kind: "user", text: pr.prompt, ts: pr.ts },
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
      if (msg.type === "kbAdded" || msg.type === "kbError") {
        // base de connaissances (plan 049) : retour d'épinglage relayé aux
        // surfaces intéressées (bouton browser, picker du composer)
        window.dispatchEvent(new CustomEvent("kb-source-added", {
          detail: msg.type === "kbAdded"
            ? { ok: true, source: msg.source, refreshed: msg.refreshed, warning: msg.warning }
            : { ok: false, message: msg.message },
        }));
      }
      if (msg.type === "kbSources") {
        window.dispatchEvent(new CustomEvent("kb-sources", { detail: msg }));
      }
      if (msg.type === "kbPromoted") {
        window.dispatchEvent(new CustomEvent("kb-source-promoted", { detail: { id: msg.id } }));
      }
      if (msg.type === "kbPagePreview" || msg.type === "kbPageWritten") {
        // page directe gbrain (plan 050 P4) : dialogue de la surface
        window.dispatchEvent(new CustomEvent(
          msg.type === "kbPagePreview" ? "kb-page-preview" : "kb-page-written",
          { detail: msg },
        ));
      }
      if (msg.type === "gbrainResults") {
        // recherche du corpus NAS (plan 050 P3) — consommée par la surface
        // Connaissances ; l'échec voyage dans detail.error, en place
        window.dispatchEvent(new CustomEvent("kb-gbrain-results", {
          detail: { query: msg.query, results: msg.results ?? [], error: msg.error ?? null },
        }));
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
                p.id === "claude" ? "npm install -g @anthropic-ai/claude-code"
                : p.id === "kimi" ? "npm install -g @moonshot-ai/kimi-code"
                : "npm install -g @openai/codex");
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
      if (msg.type === "plugins") setPlugins(Array.isArray(msg.plugins) ? msg.plugins : []);
      if (msg.type === "files" && msg.projectRoot === activeProjectRef.current) {
        setFiles(Array.isArray(msg.files) ? msg.files : []);
        setDiskRecents(Array.isArray(msg.recentFiles) ? msg.recentFiles : []);
      }
      if (["narvalStatus", "narvalSnapshot", "narvalDirectory", "narvalJobDetail", "narvalText"].includes(msg.type)) {
        window.dispatchEvent(new CustomEvent("narval-message", { detail: msg }));
      }
      if (msg.type === "error") {
        console.error("sidecar:", msg.message);
        const pr = pendingResend.current;
        if (pr && pr.threadId === msg.threadId) {
          // Le rewind a échoué : restaurer le fil original, mais ne jamais
          // envoyer le texte corrigé comme un nouveau message (cela créait le
          // doublon que l'action « Modifier et renvoyer » promet précisément
          // d'éviter). On remet plutôt le brouillon dans le composer.
          pendingResend.current = null;
          setEvents((p) => ({ ...p, [pr.threadId]: pr.snapshot }));
          if (activeIdRef.current === pr.threadId) setInjectText(pr.prompt);
          setAppBanner({ text: String(msg.message ?? "Modification impossible"), closable: true });
        }
        const revert = pendingRevert.current;
        if (revert && revert.threadId === msg.threadId) {
          pendingRevert.current = null;
          setAppBanner({ text: String(msg.message ?? "Retour impossible"), closable: true });
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
    const onInteractionAnswer = (e: Event) => {
      // réponse à un événement interaction (plan 025, step 5) : la réponse —
      // y compris toute valeur secrète — part UNIQUEMENT dans ce message WS ;
      // l'event local est marqué answered de façon optimiste (sans copier la
      // réponse), le sidecar ré-émettra l'état final autoritaire
      const { threadId, requestId, response } = (e as CustomEvent).detail ?? {};
      ws.current?.send(JSON.stringify({
        type: "interactionResponse",
        threadId,
        requestId,
        clientInstanceId: getClientInstanceId(),
        response,
      }));
      if (response?.cancelTurn && threadId) {
        ws.current?.send(JSON.stringify({ type: "interrupt", threadId }));
      }
      setEvents((p) => ({
        ...p,
        [threadId]: (p[threadId] ?? []).map((ev: any) =>
          ev.kind === "interaction" && ev.requestId === requestId && ev.state === "pending"
            ? { ...ev, state: "answered" } : ev),
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
      "interaction-answer": onInteractionAnswer,
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

  // Revenir à l'accueil relit les mtimes immédiatement, puis les garde frais
  // tant que cette page reste visible (fichiers modifiés hors Atelier inclus).
  // Au montage/changement de projet, l'effet requestCatalog ci-dessus fait déjà
  // la première lecture : éviter ici un doublon coûteux sur les gros dépôts.
  const previousRecentActiveId = useRef<string | null>(null);
  useEffect(() => {
    const returnedHome = previousRecentActiveId.current !== null && activeId === null;
    previousRecentActiveId.current = activeId;
    if (activeId || !activeProject || !wsReady || ws.current?.readyState !== 1) return;
    if (returnedHome) requestFileCatalog(ws.current, activeProject);
    const timer = window.setInterval(() => {
      if (ws.current?.readyState === 1) requestFileCatalog(ws.current, activeProject);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [activeId, activeProject, wsReady]);


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
        const message = themeMessage(settingsRef.current, atelierNonce);
        (e.source as Window).postMessage(message, e.origin);
      }
      if (data.type === "atelier-open-tab" || data.type === "atelier-open-pdf") {
        let openUrl: string;
        if (data.type === "atelier-open-pdf") {
          // « PDF ↗ » du studio LaTeX : viewer PDF complet (annotations) relié
          // en synctex quand le PDF est dans le projet ; hors projet, le statique
          // reste sandboxé → repli sur le studio en mode=pdf (jeton via ?path=)
          const root = activeProjectRef.current;
          const rootSlash = root ? (root.endsWith("/") ? root : root + "/") : null;
          const pdfAbs = typeof data.pdf === "string" ? data.pdf : "";
          const texAbs = typeof data.tex === "string" ? data.tex : "";
          openUrl = rootSlash && pdfAbs.startsWith(rootSlash)
            ? `/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(pdfAbs.slice(rootSlash.length))}&tex=${encodeURIComponent(texAbs)}&texpdf=${encodeURIComponent(pdfAbs)}`
            : `/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(texAbs)}&mode=pdf${galleryTokenRef.current ? `&token=${encodeURIComponent(galleryTokenRef.current)}` : ""}`;
        } else {
          openUrl = data.url;
        }
        const abs = withAtelierNonce(openUrl.startsWith("http") ? openUrl : e.origin + openUrl, atelierNonce);
        // pas de setState imbriqué (StrictMode double-exécute les updaters) :
        // on lit l'état courant via la ref pour décider, puis on commit les deux.
        const existing = atelierTabsRef.current.find((t) => t.url === abs);
        if (existing) {
          setActiveTab(existing.id);
        } else {
          const id = crypto.randomUUID();
          setAtelierTabs((tabs) => [...tabs, {
            id,
            url: abs,
            title: data.title ?? "fichier",
            projectRoot: activeProjectRef.current ?? undefined,
          }]);
          setActiveTab(id);
        }
      }
      if (data.type === "atelier-add-to-chat") {
        attachContextToChat(data.text, data);
        if (data.requestId && e.source) {
          (e.source as Window).postMessage({
            type: "atelier-add-to-chat-ack",
            nonce: atelierNonce,
            requestId: data.requestId,
            ok: true,
          }, e.origin);
        }
      }
      if (data.type === "atelier-gallery-result") {
        const galleryFrame = document.querySelector<HTMLIFrameElement>('iframe[data-atelier-role="gallery"]');
        if (e.source !== galleryFrame?.contentWindow) return;
        window.dispatchEvent(new CustomEvent("atelier-gallery-result", { detail: data }));
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
    setRecentFiles((current) =>
      [clean, ...current.filter((item) => item !== clean)].slice(0, 24));
  }

  type OpenFileTabOptions = { diff?: boolean; baseSha?: string | null };

  function openFileTab(rel: string, line?: string | null, options: OpenFileTabOptions = {}) {
    if (!atelierUrl || !activeProject) return;
    // chemin absolu (ou ~/) venant du chat : sous le projet actif → relatif ;
    // sinon éditeur intégré via jeton (accès serveur borné à ~/Documents,
    // ~/Desktop — voir editorPath côté galerie)
    let outside: string | null = null;
    if (rel.startsWith("/") || rel.startsWith("~/")) {
      const root = activeProject.endsWith("/") ? activeProject : activeProject + "/";
      if (rel.startsWith(root)) rel = rel.slice(root.length);
      else if (galleryTokenRef.current) outside = rel;
      else return;
    }
    if (!outside) rememberFile(rel);
    const origin = new URL(atelierUrl).origin;
    const ext = (outside ?? rel).split(".").pop()?.toLowerCase() ?? "";
    const name = (outside ?? rel).split("/").pop() ?? rel;
    const lineQ = line ? `&line=${encodeURIComponent(line)}` : "";
    const diffQ = options.diff ? "&diff=1" : "";
    const baseSha = options.baseSha && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(options.baseSha)
      ? options.baseSha
      : null;
    const baseQ = baseSha ? `&base=${encodeURIComponent(baseSha)}` : "";
    let url: string;
    if (outside) {
      // binaires hors projet : le statique du serveur reste sandboxé projet —
      // seuls les fichiers texte s'ouvrent dans l'éditeur intégré
      if (["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return;
      const tokenQ = `&token=${encodeURIComponent(galleryTokenRef.current ?? "")}`;
      url = ext === "md" && !options.diff
        ? `${origin}/.fig_thumbs/md_studio.html?path=${encodeURIComponent(outside)}${tokenQ}`
        : `${origin}/.fig_thumbs/${ext === "md" ? "code_editor" : "latex_studio"}.html?path=${encodeURIComponent(outside)}${lineQ}${diffQ}${baseQ}${tokenQ}`;
    } else if (ext === "pdf") {
      url = `${origin}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(rel)}`;
    } else if (ext === "svg") {
      url = `${origin}/.fig_thumbs/svg_viewer.html?file=${encodeURIComponent(rel)}`;
    } else if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      url = `${origin}/${rel}`;
    } else if (["html", "htm"].includes(ext) && !line && !options.diff) {
      // pages web : rendu direct (comme les ouvertures depuis la galerie) ;
      // une ligne ciblée ou un diff demandé garde l'éditeur de code
      url = `${origin}/${rel}`;
    } else if (ext === "md" && !options.diff) {
      url = `${origin}/.fig_thumbs/md_studio.html?path=${encodeURIComponent(`${activeProject}/${rel}`)}`;
    } else {
      const editor = ext === "md" ? "code_editor" : "latex_studio";
      url = `${origin}/.fig_thumbs/${editor}.html?path=${encodeURIComponent(`${activeProject}/${rel}`)}${lineQ}${diffQ}${baseQ}`;
    }
    url = withAtelierNonce(url, atelierNonce);
    const tabIdentity = (raw: string) => {
      const parsed = new URL(raw);
      for (const key of ["line", "diff", "base"]) parsed.searchParams.delete(key);
      return parsed.toString();
    };
    const baseUrl = tabIdentity(url);
    // dédoublonner DANS l'updater : atelierTabsRef n'est synchronisé qu'après le
    // commit React — deux clics rapprochés créaient deux onglets identiques
    const newId = crypto.randomUUID();
    setAtelierTabs((tabs) => {
      const existing = tabs.find((t) => tabIdentity(t.url) === baseUrl);
      if (existing) {
        // même fichier déjà ouvert : re-cibler la ligne demandée si besoin
        setActiveTab(existing.id);
        return existing.url !== url ? tabs.map((t) => (t.id === existing.id ? { ...t, url } : t)) : tabs;
      }
      setActiveTab(newId);
      return [...tabs, { id: newId, url, title: name, projectRoot: activeProject }];
    });
    // l'onglet vit dans la surface Atelier : y basculer si on est ailleurs
    switchToSurface("atelier");
  }
  const openFileTabRef = useRef(openFileTab);
  openFileTabRef.current = openFileTab;
  const filesRef = useRef(files);
  filesRef.current = files;

  const atelierUrlRef = useRef(atelierUrl);
  atelierUrlRef.current = atelierUrl;

  // clic sur une réf "fichier.tex:31" dans une réponse du chat
  useEffect(() => {
    const openResolvedRef = (target: string, line: string | null, options: OpenFileTabOptions) => {
      const projectRoot = activeProjectRef.current;
      let galleryRel = target.replace(/^\.\//, "");
      if (projectRoot && galleryRel.startsWith(projectRoot + "/")) {
        galleryRel = galleryRel.slice(projectRoot.length + 1);
      }
      const ext = galleryRel.split(".").pop()?.toLowerCase() ?? "";
      if (
        projectRoot &&
        !galleryRel.startsWith("/") &&
        !galleryRel.startsWith("~/") &&
        ["png", "pdf"].includes(ext)
      ) {
        window.dispatchEvent(new CustomEvent("atelier-gallery-command", {
          detail: {
            action: "open",
            mode: "viewer",
            projectRoot,
            requestId: crypto.randomUUID(),
            rels: [galleryRel],
          } satisfies GalleryCommandRequest,
        }));
        return;
      }
      openFileTabRef.current(target, line, options);
    };
    const onOpen = (e: Event) => {
      const { rel, line, diff, baseSha } = (e as CustomEvent).detail as {
        rel: string;
        line: string | null;
        diff?: boolean;
        baseSha?: string | null;
      };
      const options = { diff: diff === true, baseSha: baseSha ?? null };
      // résoudre un nom nu ("main.tex") contre l'arborescence du projet
      let target = rel.replace(/^\.\//, "");
      const list = filesRef.current;
      if (!list.includes(target) && !target.startsWith("/") && !target.startsWith("~/")) {
        const hit = list.find((f) => f === target || f.endsWith("/" + target));
        if (hit) {
          target = hit;
        } else if (atelierUrlRef.current) {
          // absent de l'index git (fichier gitignoré : données, figures…) —
          // demander au serveur galerie de le retrouver sur disque avant
          // d'abandonner sur un chemin deviné
          const name = target.split("/").pop() ?? target;
          fetch(`${new URL(atelierUrlRef.current).origin}/findfile?name=${encodeURIComponent(name)}`)
            .then((r) => r.json())
            .then((j) => {
              // préférer le hit qui porte aussi les répertoires de la réf
              // ("data/x/plot.csv") à un simple homonyme ailleurs
              const hits: string[] = Array.isArray(j?.hits) ? j.hits : [];
              const best = hits.find((h) => h === target || h.endsWith("/" + target)) ?? hits[0];
              openResolvedRef(best ?? target, line, options);
            })
            .catch(() => openResolvedRef(target, line, options));
          return;
        }
      }
      openResolvedRef(target, line, options);
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
      // valeurs LIVE via refs : les useState capturés par cet effet à deps:[]
      // gardaient leur valeur de montage — Échap fermait la palette ET
      // interrompait le tour en même temps (bug de closure, plan 021 §8)
      const typing = (() => {
        const el = document.activeElement;
        return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
      })();
      const terminalFocused = !!(document.activeElement as HTMLElement | null)?.closest?.(".term-host");
      // xterm owns all keyboard input while focused. In particular, Cmd+K,
      // Cmd+1…9 and Cmd+0 must remain terminal shortcuts instead of opening
      // Atelier's palette or switching the global layout.
      if (terminalFocused) return;
      if (e.key === "Escape" && qaModeRef.current !== "open" && !paletteOpenRef.current && !usageOpenRef.current && !typing) {
        // l'inspecteur ouvert intercepte Escape en phase de CAPTURE
        // (ContextInspector) : ce handler ne voit alors jamais l'événement.
        // `typing` : Échap dans un champ (recherche Explorer/Git/Biblio…) ne
        // doit jamais interrompre le tour — le composer gère son propre Échap.
        const id = activeIdRef.current;
        if (id && workingSinceRef.current[id] != null && ws.current?.readyState === 1) {
          ws.current.send(JSON.stringify({ type: "interrupt", threadId: id }));
          return;
        }
      }
      if (e.metaKey && e.altKey && e.code === "KeyK") {
        e.preventDefault();
        // toggle : minimisé → rouvre la conversation ; ouvert → minimise ; fermé → neuf
        const m = qaModeRef.current;
        if (m === "open") setQaMode("min");
        else if (m === "min") setQaMode("open");
        else { setQaDraft(""); setQaContext(""); setQaMode("open"); }
        return;
      }
      if (e.metaKey && !e.shiftKey && ["KeyK", "KeyP"].includes(e.code)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") setPaletteOpen(false);
      if (e.metaKey && e.shiftKey && e.code === "KeyA") {
        setLayout((l) => (l === "chat" ? "split" : "chat"));
      }
      if (e.metaKey && !e.shiftKey && e.code === "Digit1") setLayout("chat");
      if (e.metaKey && !e.shiftKey && e.code === "Digit2") setLayout("atelier");
      if (e.metaKey && !e.shiftKey && e.code === "Digit0") setLayout("split");
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
    setNewChatRequest({ projectRoot: "" });
  }

  function createChat(projectRoot: string, provider: string) {
    const id = crypto.randomUUID();
    // sélection KB faite avant toute conversation : adoptée par le fil créé
    const kbInit = consumePendingKb({ id, provider, projectRoot, title: t("app.new-chat-title") });
    setDraftThreads((p) => [
      {
        id,
        projectRoot,
        title: t("app.new-chat-title"),
        provider,
        sessionId: null,
        status: "idle" as const,
        updatedAt: new Date().toISOString(),
        ...kbInit,
      },
      ...p,
    ]);
    setActiveId(id);
    activeIdRef.current = id;
    setEvents((p) => ({ ...p, [id]: [] }));
    if (projectRoot) setActiveProject(projectRoot);
    setNewChatRequest(null);
  }

  function newThread(projectRoot: string) {
    setNewChatRequest({ projectRoot });
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
    const displayPrompt = prompt;
    let optimisticGoal: AgentEvent | null = null;
    const activeThread = allThreadsRef.current.find((t) => t.id === activeId);
    const threadRoot = activeThread ? activeThread.projectRoot : (activeProject ?? "");
    const selectedCapabilities = providerList.find((entry) => entry.id === provider)?.capabilities;
    const supportsPlugins = selectedCapabilities?.plugins ?? provider === "codex";
    const nativeCommand = parseNativeSlashCommand(prompt);
    if (nativeCommand?.name === "resume") {
      window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "codex" } }));
      return;
    }
    if (nativeCommand?.name === "usage") {
      setUsageOpen(true);
      return;
    }
    if (nativeCommand?.name === "plugins") {
      if (!supportsPlugins) {
        void showInfo(`${provider} ne fournit pas de plugins dans ce chat.`);
        return;
      }
      setPluginsOpen(true);
      if (ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: "listPlugins", projectRoot: threadRoot }));
      }
      return;
    }
    if (nativeCommand?.name === "diff") {
      switchToSurface("git");
      return;
    }
    if (nativeCommand?.name === "status") {
      const currentUsage = activeId ? usageByThread[activeId] : null;
      const context = currentUsage?.context != null
        ? ` · contexte ${Math.round(currentUsage.context / 1000)}k`
        : "";
      void showInfo(
        `${activeThread?.provider ?? provider} · ${model || "modèle par défaut"} · ${effort || "effort auto"} · ${permissionMode}${context}`,
      );
      return;
    }
    if (!activeId && !activeProject) return;
    // Comme Synara, une relance explicitement mise en file reste dans le
    // composer tant qu'elle n'est pas réellement exécutée. Elle conserve son
    // contexte et ses paramètres, reste modifiable/supprimable et ne crée pas
    // encore de bulle dans la timeline.
    if (mode === "queue" && activeId && workingSinceRef.current[activeId] != null) {
      const additionalDirectories = settingsRef.current.additionalDirectories
        .split(/\r?\n|,/)
        .map((dir) => dir.trim())
        .filter(Boolean);
      enqueueTurn(composerDraftKey(activeId, activeProject), {
        id: crypto.randomUUID(),
        prompt: displayPrompt,
        provider,
        model,
        effort,
        permissionMode,
        attachments: [...attachments],
        webSearch: provider === "codex" && settingsRef.current.webSearch,
        additionalDirectories,
        pluginSkills: provider === "codex"
          ? pluginSkillsForPrompt(displayPrompt, plugins).map(({ name, path }) => ({ name, path }))
          : [],
        autoReview: { ...settingsRef.current.autoReview },
        createdAt: Date.now(),
      });
      setAttachments([]);
      return;
    }
    // /clear reste natif Codex ; /compact suit la capability du provider
    // (Codex app-server ou Grok ACP).
    const codexActive = activeId && (activeThread?.provider ?? provider) === "codex";
    const compactSupported = selectedCapabilities?.compact ?? Boolean(codexActive);
    const nativeClear = prompt.trim() === "/clear" && codexActive;
    const nativeCompact = prompt.trim() === "/compact" && Boolean(activeId) && compactSupported;
    if ((nativeClear || nativeCompact) && ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({
        type: nativeClear ? "codexClear" : "codexCompact",
        threadId: activeId,
      }));
      return;
    }
    const reviewSupported = selectedCapabilities?.review ?? Boolean(codexActive);
    if (nativeCommand?.name === "review" && codexActive && reviewSupported && activeId && ws.current?.readyState === 1) {
      window.dispatchEvent(new CustomEvent("review-result", {
        detail: { type: "reviewResult", threadId: activeId, status: "running" },
      }));
      ws.current.send(JSON.stringify({
        type: "requestReview",
        threadId: activeId,
        autoReview: settingsRef.current.autoReview,
      }));
      return;
    }
    // /goal sur un thread CODEX : goal natif app-server (set/clear/status),
    // pas un message texte (codex exec n'interprète pas /goal). Côté Claude,
    // /goal passe tel quel : la CLI a son goal natif (v2.1.139+).
    const goalMatch = /^\/goal(?:\s+([\s\S]*))?$/.exec(prompt.trim());
    if (goalMatch && provider === "codex") {
      const arg = (goalMatch[1] ?? "").trim();
      const isClear = ["clear", "stop", "off", "reset", "none", "cancel"].includes(arg.toLowerCase());
      // Une session d'un autre provider ne peut pas recevoir thread/goal/set.
      // Si l'utilisateur vient de passer Claude → Codex, on amorce d'abord la
      // session Codex puis pendingGoal pose l'objectif au threads-update.
      const hasCodexSession = Boolean(activeThread?.provider === "codex" && activeThread.sessionId);
      if (activeId && hasCodexSession) {
        if (ws.current?.readyState === 1) {
          const msg =
            !arg ? { type: "goalGet", threadId: activeId, explicit: true } :
            isClear
              ? { type: "goalClear", threadId: activeId }
              : { type: "goalSet", threadId: activeId, objective: arg };
          ws.current.send(JSON.stringify(msg));
          // trace visible dans le fil : la commande tapée, comme un message
          setEvents((p) => ({
            ...p,
            [activeId]: [
              ...(p[activeId] ?? []),
              { kind: "user", text: prompt.trim(), ts: Date.now() } as AgentEvent,
              ...(arg && !isClear ? [{
                kind: "goal" as const,
                goal: { objective: arg, status: "active" as const, tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 },
                ts: Date.now(),
              }] : []),
            ],
          }));
        }
        return;
      }
      // Pas de session Codex à interroger/nettoyer : ne surtout pas router la
      // commande vers la session Claude encore attachée au fil.
      if (!arg || isClear) return;
      if (arg && !isClear) {
        // pas encore de session Codex (chat neuf) : l'objectif part comme
        // premier message — le goal sera posé par pendingGoal dès que la
        // session existe (threads-update avec sessionId)
        pendingGoal.current = { threadId: activeId, objective: arg };
        optimisticGoal = {
          kind: "goal",
          goal: { objective: arg, status: "active", tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 },
          ts: Date.now(),
        };
        prompt = arg;
      }
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
    // Synara : un provider est immuable dès que le fil possède un historique.
    // Le changement crée une destination distincte; le backend copie le journal
    // et injecte le contexte dans la même transaction que le premier send.
    const priorEvents = activeId ? (events[activeId] ?? []) : [];
    let id = activeId;
    let handoffFromThreadId: string | undefined;
    if (
      id && activeThread && activeThread.provider !== provider &&
      (Boolean(activeThread.sessionId) || priorEvents.length > 0)
    ) {
      const sourceThreadId = id;
      handoffFromThreadId = sourceThreadId;
      id = crypto.randomUUID();
      const targetId = id;
      setDraftThreads((current) => [{
        id: targetId,
        projectRoot: activeThread.projectRoot ?? threadRoot,
        title: `↪ ${activeThread.title || displayPrompt.slice(0, 40)}`,
        provider,
        sessionId: null,
        status: "idle",
        updatedAt: new Date().toISOString(),
        handoff: {
          sourceThreadId,
          sourceProvider: activeThread.provider,
          targetProvider: provider,
        },
      }, ...current]);
      setActiveId(targetId);
      activeIdRef.current = targetId;
      if (pendingGoal.current) pendingGoal.current.threadId = targetId;
    }
    // pièce jointe (annotation/sélection atelier) : préfixée au prompt envoyé
    const fullPrompt =
      (attachments.length
        ? `${attachments.map((a) => a.text).join("\n\n")}\n\n${prompt}`.trim()
        : prompt);
    // identité du message : générée ici, dédupliquée à l'ack sidecar (plan 025)
    const clientMessageId = crypto.randomUUID();
    const userEvent = {
      kind: "user" as const,
      text: displayPrompt,
      ts: Date.now(),
      meta: { provisional: true as const, messageId: clientMessageId },
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
      // méta KB fidèle à l'envoi (plan 049) : sources attachées à CE moment,
      // titres depuis le cache kbSources (repli sur l'id si pas encore chargé)
      ...(() => {
        // premier message d'un chat neuf : la sélection encore « en attente »
        // compte aussi (elle sera transférée au fil créé dans ce même envoi)
        const kbIds = Array.isArray(activeThread?.kbSourceIds) && activeThread.kbSourceIds.length
          ? activeThread.kbSourceIds
          : (!activeIdRef.current ? pendingKbRef.current.kbSourceIds : []);
        if (!kbIds.length) return {};
        const known = kbSourcesSnapshot();
        return {
          kb: {
            count: kbIds.length,
            titles: kbIds.slice(0, 6).map((id) =>
              id === "gbrain" ? t("kb.gbrain-title") : known.find((s) => s.id === id)?.title ?? id,
            ),
          },
        };
      })(),
    };
    const imagePaths = localImagePathsForAttachments(attachments, threadRoot);
    const pluginSkills = supportsPlugins ? pluginSkillsForPrompt(displayPrompt, plugins) : [];
    // skillsAttach (kimi) : /nom du catalogue ⇒ SKILL.md joint + consigne
    const catalogSkill = selectedCapabilities?.skillsAttach === true
      ? catalogSkillForPrompt(displayPrompt, commands)
      : null;
    // inputs structurés selon la capability (plan 046) — plus réservé à Codex ;
    // skillsAttach implique le support des inputs structurés
    const supportsStructuredInputs =
      (selectedCapabilities?.imageInput ?? provider === "codex") ||
      selectedCapabilities?.skillsAttach === true;
    const codexInputs = supportsStructuredInputs && (imagePaths.length || pluginSkills.length || catalogSkill)
      ? [
          {
            type: "text" as const,
            text: catalogSkill ? `${fullPrompt}\n\n${skillAttachInstruction(catalogSkill)}` : fullPrompt,
          },
          ...imagePaths.map((path) => ({ type: "local_image" as const, path })),
          ...pluginSkills.map((skill) => ({ type: "skill" as const, name: skill.name, path: skill.path })),
          ...(catalogSkill
            ? [{ type: "skill" as const, name: catalogSkill.name, path: catalogSkill.path }]
            : []),
        ]
      : undefined;
    const additionalDirectories = settingsRef.current.additionalDirectories
      .split(/\r?\n|,/)
      .map((dir) => dir.trim())
      .filter(Boolean);
    setAttachments([]);
    // pas de thread sélectionné → en créer un à la volée
    if (!id) {
      id = crypto.randomUUID();
      // sélection KB « en attente » (accueil/boot) adoptée par ce fil
      const kbInit = consumePendingKb({
        id, provider, projectRoot: activeProject ?? "", title: displayPrompt.slice(0, 40),
      });
      setDraftThreads((p) => [
        {
          id: id as string,
          projectRoot: activeProject ?? "",
          title: displayPrompt.slice(0, 40),
          provider,
          sessionId: null,
          status: "idle" as const,
          updatedAt: new Date().toISOString(),
          ...kbInit,
        },
        ...p,
      ]);
      setActiveId(id);
      activeIdRef.current = id;
      // /goal tapé sans thread : le goal en attente adopte le thread créé
      if (pendingGoal.current && !pendingGoal.current.threadId) pendingGoal.current.threadId = id;
    }
    setEvents((p) => ({
      ...p,
      [id]: [
        ...(handoffFromThreadId ? (p[handoffFromThreadId] ?? priorEvents) : (p[id] ?? [])),
        userEvent,
        ...(optimisticGoal ? [optimisticGoal] : []),
      ],
    }));
    setWorkingSince((p) => ({ ...p, [id as string]: Date.now() }));
    if (mock) {
      setDraftThreads((p) =>
        p.map((t) =>
          t.id === id ? { ...t, title: displayPrompt.slice(0, 40), status: "running" } : t,
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
      // bulle user archivable : texte tapé + attachments structurés (chemins,
      // lignes) — jamais le handoff, les textes injectés ni une data URL
      const displayEvent = {
        kind: "user" as const,
        text: displayPrompt,
        ts: userEvent.ts,
        ...("label" in userEvent && userEvent.label ? { label: userEvent.label as string } : {}),
        ...(attachments.some((a) => a.kind === "paste")
          ? {
              pastes: attachments
                .filter((a) => a.kind === "paste")
                .map((a) => ({ name: a.name, lines: a.text.split("\n").length })),
            }
          : {}),
        ...(imagePaths.length ? { imagePaths } : {}),
      };
      sendPrompt(ws.current, {
        autoReview: settingsRef.current.autoReview,
        threadId: id,
        projectRoot: threadRoot,
        provider,
        prompt: fullPrompt,
        clientMessageId,
        displayEvent,
        ...(codexInputs ? { inputs: codexInputs } : {}),
        ...(imagePaths.length ? { attachments: imagePaths.map((path) => ({ path })) } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(permissionMode ? { permissionMode } : {}),
        ...(provider === "codex" && settingsRef.current.webSearch ? { webSearch: true } : {}),
        ...(provider === "codex" && additionalDirectories.length ? { additionalDirectories } : {}),
        mode,
        ...(handoffFromThreadId ? { handoffFromThreadId } : {}),
      });
      // le sidecar prend le relais : retirer le brouillon local homonyme
      setDraftThreads((p) => p.filter((t) => t.id !== id));
    }
  }

  /** Envoie un snapshot déjà placé dans la file, sans dépendre du chat actif.
   * Le tour possède sa bulle et son messageId seulement à cet instant. */
  function dispatchQueuedTurn(threadId: string, queued: QueuedTurn, mode: "steer" | "queue"): boolean {
    if (ws.current?.readyState !== 1) return false;
    const thread = allThreadsRef.current.find((entry) => entry.id === threadId);
    if (!thread) return false;
    const queuedAttachments = queued.attachments;
    const priorEvents = eventsRef.current[threadId] ?? [];
    let targetThreadId = threadId;
    let handoffFromThreadId: string | undefined;
    if (thread.provider !== queued.provider && (Boolean(thread.sessionId) || priorEvents.length > 0)) {
      handoffFromThreadId = threadId;
      targetThreadId = crypto.randomUUID();
      const targetId = targetThreadId;
      setDraftThreads((current) => [{
        id: targetId,
        projectRoot: thread.projectRoot ?? "",
        title: `↪ ${thread.title || queued.prompt.slice(0, 40)}`,
        provider: queued.provider,
        sessionId: null,
        status: "idle",
        updatedAt: new Date().toISOString(),
        handoff: {
          sourceThreadId: threadId,
          sourceProvider: thread.provider,
          targetProvider: queued.provider,
        },
      }, ...current]);
      setActiveId(targetId);
      activeIdRef.current = targetId;
    }
    const fullPrompt = queuedAttachments.length
      ? `${queuedAttachments.map((attachment) => attachment.text).join("\n\n")}\n\n${queued.prompt}`.trim()
      : queued.prompt;
    const clientMessageId = crypto.randomUUID();
    const imagePaths = localImagePathsForAttachments(queuedAttachments, thread.projectRoot ?? "");
    const pluginSkills = queued.pluginSkills;
    const queuedCapabilities = providerList.find((entry) => entry.id === queued.provider)?.capabilities;
    const queuedSupportsInputs =
      (queuedCapabilities?.imageInput ?? queued.provider === "codex") ||
      queuedCapabilities?.skillsAttach === true;
    // skillsAttach recalculé au flush (le catalogue est stable, pas besoin de
    // le persister dans la file comme pluginSkills)
    const catalogSkill = queuedCapabilities?.skillsAttach === true
      ? catalogSkillForPrompt(queued.prompt, commands)
      : null;
    const codexInputs = queuedSupportsInputs && (imagePaths.length || pluginSkills.length || catalogSkill)
      ? [
          {
            type: "text" as const,
            text: catalogSkill ? `${fullPrompt}\n\n${skillAttachInstruction(catalogSkill)}` : fullPrompt,
          },
          ...imagePaths.map((path) => ({ type: "local_image" as const, path })),
          ...pluginSkills.map((skill) => ({ type: "skill" as const, name: skill.name, path: skill.path })),
          ...(catalogSkill
            ? [{ type: "skill" as const, name: catalogSkill.name, path: catalogSkill.path }]
            : []),
        ]
      : undefined;
    const userEvent: AgentEvent = {
      kind: "user",
      text: queued.prompt,
      ts: Date.now(),
      meta: { provisional: true, messageId: clientMessageId },
      ...(queuedAttachments.some((attachment) => attachment.imageUrl)
        ? { imageUrl: queuedAttachments.find((attachment) => attachment.imageUrl)!.imageUrl }
        : {}),
      ...(queuedAttachments.some((attachment) => !attachment.imageUrl && attachment.kind !== "paste")
        ? {
            label: queuedAttachments
              .filter((attachment) => !attachment.imageUrl && attachment.kind !== "paste")
              .map((attachment) => `${attachment.name}${attachment.lines ? ` (lines ${attachment.lines})` : ""}`)
              .join(" · "),
          }
        : {}),
      ...(queuedAttachments.some((attachment) => attachment.kind === "paste")
        ? {
            pastes: queuedAttachments
              .filter((attachment) => attachment.kind === "paste")
              .map((attachment) => ({ name: attachment.name, text: attachment.text })),
          }
        : {}),
    };
    setEvents((current) => ({
      ...current,
      [targetThreadId]: [
        ...(handoffFromThreadId ? (current[handoffFromThreadId] ?? priorEvents) : (current[targetThreadId] ?? [])),
        userEvent,
      ],
    }));
    setWorkingSince((current) => ({
      ...current,
      [targetThreadId]: current[targetThreadId] ?? Date.now(),
    }));
    sendPrompt(ws.current, {
      ...(queued.autoReview ? { autoReview: queued.autoReview } : {}),
      threadId: targetThreadId,
      projectRoot: thread.projectRoot ?? "",
      provider: queued.provider,
      prompt: fullPrompt,
      clientMessageId,
      displayEvent: {
        kind: "user",
        text: queued.prompt,
        ts: userEvent.ts,
        ...(imagePaths.length ? { imagePaths } : {}),
        ...(queuedAttachments.some((attachment) => attachment.kind === "paste")
          ? {
              pastes: queuedAttachments
                .filter((attachment) => attachment.kind === "paste")
                .map((attachment) => ({ name: attachment.name, lines: attachment.text.split("\n").length })),
            }
          : {}),
      },
      ...(codexInputs ? { inputs: codexInputs } : {}),
      ...(imagePaths.length ? { attachments: imagePaths.map((path) => ({ path })) } : {}),
      ...(queued.model ? { model: queued.model } : {}),
      ...(queued.effort ? { effort: queued.effort } : {}),
      ...(queued.permissionMode ? { permissionMode: queued.permissionMode } : {}),
      ...(queued.provider === "codex" && queued.webSearch ? { webSearch: true } : {}),
      ...(queued.provider === "codex" && queued.additionalDirectories.length
        ? { additionalDirectories: queued.additionalDirectories }
        : {}),
      mode,
      ...(handoffFromThreadId ? { handoffFromThreadId } : {}),
    });
    return true;
  }

  const allThreads = useMemo(() => {
    const knownIds = new Set(threads.map((t) => t.id));
    return [...draftThreads.filter((t) => !knownIds.has(t.id)), ...threads];
  }, [draftThreads, threads]);
  allThreadsRef.current = allThreads;
  // Attache KB de la conversation active (plan 049/050) — partagé entre le
  // picker du composer et la surface Connaissances. Optimiste sur threads ET
  // brouillons ; upsert COMPLET (un patch minimal sur un brouillon inconnu du
  // backend ferait normaliser provider→claude et perdrait le projet).
  // Sans conversation active (boot, accueil) : la sélection vit « en
  // attente » et se transfère au fil dès sa création.
  const [pendingKb, setPendingKb] = useState<{ kbSourceIds: string[]; kbFullContent: string[] }>(
    { kbSourceIds: [], kbFullContent: [] },
  );
  const pendingKbRef = useRef(pendingKb);
  pendingKbRef.current = pendingKb;
  function consumePendingKb(thread: { id: string; provider: string; projectRoot: string; title: string }) {
    const pending = pendingKbRef.current;
    if (!pending.kbSourceIds.length && !pending.kbFullContent.length) return {};
    setPendingKb({ kbSourceIds: [], kbFullContent: [] });
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify({ type: "upsertThread", thread: { ...thread, ...pending } }));
    }
    return pending;
  }
  function handleKbChange(next: { kbSourceIds: string[]; kbFullContent: string[] }) {
    const id = activeIdRef.current;
    if (!id) {
      setPendingKb(next);
      return;
    }
    setThreads((current) => current.map((th) => (th.id === id ? { ...th, ...next } : th)));
    setDraftThreads((current) => current.map((th) => (th.id === id ? { ...th, ...next } : th)));
    if (ws.current?.readyState === 1) {
      const th = allThreadsRef.current.find((x) => x.id === id);
      ws.current.send(JSON.stringify({
        type: "upsertThread",
        thread: {
          id,
          ...(th ? { provider: th.provider, projectRoot: th.projectRoot, title: th.title } : {}),
          ...next,
        },
      }));
    }
  }
  const drainingQueuedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!wsReady) return;
    for (const [key, draft] of Object.entries(composerDrafts)) {
      if (!key.startsWith("thread:") || !draft.queuedTurns.length) continue;
      const threadId = key.slice("thread:".length);
      const thread = allThreads.find((entry) => entry.id === threadId);
      if (!thread || thread.status === "running" || workingSince[threadId] != null || drainingQueuedRef.current.has(threadId)) continue;
      drainingQueuedRef.current.add(threadId);
      const first = draft.queuedTurns[0];
      const sent = dispatchQueuedTurn(threadId, first, "queue");
      if (sent) removeQueuedTurn(key, first.id);
      drainingQueuedRef.current.delete(threadId);
    }
  }, [allThreads, composerDrafts, removeQueuedTurn, workingSince, wsReady]);
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

  // ContextInspector (plan 018, étapes 4–5) : sélection explicite depuis le
  // menu d'onglet Atelier ; le transfert au chat suit le contrat pending →
  // added (accusé) → idle, et la suppression du chip ne touche jamais la source.
  const [inspected, setInspected] = useState<InspectedFile | null>(null);
  const [inspectorAdd, setInspectorAdd] = useState<"idle" | "pending" | "added">("idle");
  const inspectorAddTimer = useRef<number | null>(null);
  // l'inspecteur ne survit ni au layout chat (panneau démonté) ni à un
  // changement de projet (l'item pointerait l'ancien projet) — panel 018
  useEffect(() => {
    if (!inspected) return;
    if (layout === "chat" || !activeProject || inspected.projectRoot !== activeProject) {
      setInspected(null);
    }
  }, [layout, activeProject, inspected]);
  useEffect(() => () => {
    if (inspectorAddTimer.current != null) window.clearTimeout(inspectorAddTimer.current);
  }, []);
  function openInspector(rel: string) {
    if (!activeProject) return;
    const segs = rel.split("/");
    setInspectorAdd("idle");
    setInspected({
      rel,
      name: segs[segs.length - 1] || rel,
      dir: segs.slice(0, -1).join("/"),
      kind: artefactKind(rel),
      projectRoot: activeProject,
      projectName: displayProjectName,
    });
  }
  function closeInspector() {
    setInspected(null);
    // retour focus à l'élément source : l'onglet actif de la barre Atelier
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".atelier-bar .atab.on")?.focus());
  }
  function addInspectedToChat(item: InspectedFile) {
    if (inspectorAdd !== "idle") return; // pending/added : pas de double ajout
    setInspectorAdd("pending");
    setAttachments((l) => addAttachment(l, {
      name: item.name,
      lines: null,
      kind: "file",
      text: `Fichier du projet ajouté au contexte : ${item.projectRoot}/${item.rel}`,
    }));
    setInspectorAdd("added");
    if (inspectorAddTimer.current != null) window.clearTimeout(inspectorAddTimer.current);
    inspectorAddTimer.current = window.setTimeout(() => setInspectorAdd("idle"), 1800);
  }

  // Research Home (plan 017) : modèle dérivé pur + vrais workflows, calculés
  // uniquement quand aucun thread n'est actif (la timeline monte l'accueil à
  // la place de l'ancienne empty-card ; le composer reste en dessous).
  const projLabelRaw = activeProject ? projMeta[activeProject]?.label : null;
  // nom d'affichage du projet partagé par le Research Home et les en-têtes
  // locaux (plan 018) : label projMeta sinon dernier segment du chemin
  const displayProjectName = projLabelRaw && !projLabelRaw.startsWith("icon:")
    ? projLabelRaw
    : (activeProject?.split("/").filter(Boolean).pop() ?? null);
  // « connecting » = démarrage à froid (jamais connecté) → état de chargement ;
  // « disconnected » = connexion perdue → vraie condition À traiter
  if (wsReady) sidecarEverConnected.current = true;
  const homeBundle: ResearchHomeBundle | null = activeId ? null : {
    model: deriveResearchHomeModel({
      activeProject,
      projectName: projLabelRaw && !projLabelRaw.startsWith("icon:") ? projLabelRaw : null,
      threads: allThreads,
      events,
      workingSince,
      usageByThread,
      recentFiles: diskRecents.length
        ? diskRecents
        : recentFiles.filter((file) => files.includes(file)),
      // Le catalogue @ reste plafonné à 5 000 chemins ; un fichier récent du
      // même projet peut donc être hors de cette fenêtre alphabétique.
      files: diskRecents.length ? [...new Set([...files, ...diskRecents])] : files,
      sidecar: wsReady ? "ready" : sidecarEverConnected.current ? "disconnected" : "connecting",
      atelierError: appBanner?.text.startsWith("start_atelier:")
        ? appBanner.text.slice("start_atelier:".length).trim()
        : null,
      now: Date.now(),
    }),
    actions: {
      // garde double-clic : le premier clic fixe activeIdRef en synchrone
      onNewChat: () => {
        if (activeIdRef.current) return;
        if (activeProject) newThread(activeProject);
        else newChat();
      },
      onOpenProject: addProject,
      onResume: (id, root) => {
        selectThread(id, root);
        // convention 014 : après Reprendre, le focus va au composer
        focusComposer();
      },
      onOpenArtefact: (rel) => openFileTab(rel),
      onOpenGallery: () => { switchToSurface("atelier"); setActiveTab("gallery"); },
      onOpenPalette: () => setPaletteOpen(true),
      onResumeSession: () =>
        window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } })),
    },
  };

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
      openSettings: () => openSettings(),
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
        <LazyBoundary fallback={<div className="settings-page" />}>
          <SettingsPage
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
            ws={ws.current}
            projects={projects}
            initialSection={settingsInitialSection}
          />
        </LazyBoundary>
        {paletteOpen && (
          <LazyBoundary fallback={null}>
            <CommandPalette open items={paletteItems} onClose={() => setPaletteOpen(false)} />
          </LazyBoundary>
        )}
      <UsagePopover open={usageOpen} onClose={() => setUsageOpen(false)} />
      {pluginsOpen && <div className="plugin-overlay" onClick={() => setPluginsOpen(false)}>
        <LazyBoundary fallback={null}>
          <PluginPanel plugins={plugins} onClose={() => setPluginsOpen(false)} />
        </LazyBoundary>
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
      showExplorer={showExplorer}
      onToggleExplorer={() => {
        // toggle seul : ne change PAS la surface active (sinon fermer
        // l'explorateur depuis browser/terminal te ramènerait à la galerie).
        // On sort juste du layout « chat » pour que l'atelier soit visible.
        setLayout((l) => (l === "chat" ? "split" : l));
        setShowExplorer((v) => !v);
      }}
      onOpenGit={() => switchToSurface("git")}
      onOpenBrowser={() => switchToSurface("browser")}
      onOpenTerminal={() => switchToSurface("terminal")}
    />
  );
  const railNode = (
        <Rail
          projects={projects}
          activeProject={activeProject}
          meta={projMeta}
          running={runningProjects}
          activeView={activeView}
          layout={layout}
          activeSurface={activeSurface}
          onSelectSurface={switchToSurface}
          onSelectGallery={() => { switchToSurface("atelier"); setActiveTab("gallery"); }}
          onSelectIde={goToIde}
          ideActive={showAtelier && activeSurface === "atelier" && activeTab !== "gallery" && (activeTab === "ide" || atelierTabs.some((tb) => tb.id === activeTab && tb.kind !== "term"))}
          moreOpen={settings.railMoreOpen}
          onToggleMore={() => setSettings((s) => ({ ...s, railMoreOpen: !s.railMoreOpen }))}
          onNewChat={newChat}
          showExplorer={showExplorer}
          onToggleExplorer={() => { setShowExplorer((v) => !v); switchToSurface("atelier"); }}
          onSelectView={setActiveView}
          onSelectProject={selectProject}
          onAddProject={addProject}
          compact={compact}
          onExpand={() => setCompact((c) => !c)}
          onSettings={() => {
            if (showSettings) setShowSettings(false);
            else openSettings();
          }}
          onSetMeta={(root, m) => setProjMeta((p) => ({ ...p, [root]: m }))}
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
  const viewPanelNode = compact ? null : activeView === "highlights" ? (
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
                showSuccess(t("highlights.export-copied"));
              } catch {}
            }}
            onCompact={() => setCompact(true)}
          />
  ) : activeView === "automations" ? (
      <LazyBoundary fallback={<div className="sidebar" />}>
        <AutomationsPanel
          ws={ws.current}
          threads={allThreads}
          favorites={favorites}
          projects={projects}
          preferredThreadId={activeId}
          preferredProjectRoot={activeProject}
          onCompact={() => setCompact(true)}
          onOpenThread={(thread) => {
            setActiveView("chats");
            selectThread(thread.id, thread.projectRoot);
            setLayout((current) => current === "atelier" ? "split" : current);
          }}
        />
      </LazyBoundary>
  ) : (
        <Sidebar
          projects={projects}
          threads={allThreads}
          unread={unread}
          heartbeatThreadIds={heartbeatThreadIds}
          favorites={favorites}
          onToggleFavorite={(id) =>
            setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
          }
          threadOrder={settings.threadOrder}
          activeProject={activeProject}
          activeId={activeId}
          onSelect={selectThread}
          onNew={newThread}
          onNewChat={newChat}
          onImportSession={(provider, sessionId, title, sessionRoot) => {
            const newId = crypto.randomUUID();
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({
                type: "importSession",
                newThreadId: newId,
                provider,
                sessionId,
                title,
                projectRoot: sessionRoot || activeProject || "",
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
          projMeta={projMeta}
          onSetMeta={(root, m) => setProjMeta((prev) => ({ ...prev, [root]: m }))}
        />
  );
  const overlaysNode = (
    <>
      {paletteOpen && (
        <LazyBoundary fallback={null}>
          <CommandPalette open items={paletteItems} onClose={() => setPaletteOpen(false)} />
        </LazyBoundary>
      )}
      {qaMode !== "closed" && (
        <LazyBoundary fallback={null}>
          <QuickAsk
            open={qaMode === "open"}
            minimized={qaMode === "min"}
            draft={qaDraft}
            context={qaContext}
            providers={providerList}
            customModels={settings.customModels}
            defaultModels={settings.defaultModel}
            defaultEfforts={settings.defaultEffort}
            modelEfforts={settings.modelEfforts}
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
        </LazyBoundary>
      )}
      <UsagePopover open={usageOpen} onClose={() => setUsageOpen(false)} />
      {pluginsOpen && <div className="plugin-overlay" onClick={() => setPluginsOpen(false)}>
        <LazyBoundary fallback={null}>
          <PluginPanel plugins={plugins} onClose={() => setPluginsOpen(false)} />
        </LazyBoundary>
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
            <Button
              variant="secondary"
              onClick={() => {
                attachContextToChat(annotation);
              }}
            >
              {t("action.send-agent")}
            </Button>
            <IconButton className="ghost" label={t("action.close")} onClick={() => setAnnotation(null)}>
              <CloseIcon />
            </IconButton>
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
          home={homeBundle}
          events={activeId ? (events[activeId] ?? []) : []}
          workingSince={activeId ? (workingSince[activeId] ?? null) : null}
          liveTokens={activeId ? (liveTokens[activeId] ?? null) : null}
          usage={activeId ? (usageByThread[activeId] ?? null) : null}
          commands={commands}
          files={files}
          recentFiles={(diskRecents.length ? diskRecents : recentFiles.filter((file) => files.includes(file))).slice(0, 12)}
          zoteroItems={zoteroItems}
          plugins={plugins}
          projectRoot={activeProject}
          projectName={displayProjectName}
          threadTitle={activeId ? (allThreads.find((th) => th.id === activeId)?.title ?? "") : ""}
          threadProvider={activeId ? (allThreads.find((th) => th.id === activeId)?.provider ?? "") : ""}
          kbSourceIds={activeId ? (allThreads.find((th) => th.id === activeId)?.kbSourceIds ?? []) : pendingKb.kbSourceIds}
          kbFullContent={activeId ? (allThreads.find((th) => th.id === activeId)?.kbFullContent ?? []) : pendingKb.kbFullContent}
          onKbChange={handleKbChange}
          highlights={highlights}
          defaults={settings as any}
          providers={providerList}
          onFavoriteModelsChange={(favoriteModels) =>
            setSettings((current) => ({ ...current, favoriteModels }))}
          onOpenModelSettings={() => openSettings("providers")}
          injectText={injectText}
          onInjected={() => setInjectText(null)}
          draftText={activeComposerDraft.prompt}
          onDraftTextChange={setComposerPrompt}
          followUpMode={activeComposerDraft.followUpMode}
          onFollowUpModeChange={setFollowUpMode}
          queuedTurns={activeComposerDraft.queuedTurns}
          onSteerQueued={(queuedId) => {
            if (!activeId) return;
            const queued = activeComposerDraft.queuedTurns.find((turn) => turn.id === queuedId);
            if (!queued) return;
            if (dispatchQueuedTurn(activeId, queued, "steer")) {
              removeQueuedTurn(activeComposerKey, queuedId);
            }
          }}
          onEditQueued={(queuedId) => {
            const queued = activeComposerDraft.queuedTurns.find((turn) => turn.id === queuedId);
            if (!queued) return;
            restoreQueuedTurn(activeComposerKey, queuedId);
            requestAnimationFrame(focusComposer);
          }}
          onRemoveQueued={(queuedId) => removeQueuedTurn(activeComposerKey, queuedId)}
          onReorderQueued={(draggedId, targetId) => reorderQueuedTurn(activeComposerKey, draggedId, targetId)}
          attachments={attachments}
          onRemoveAttachment={(i) => setAttachments((l) => l.filter((_, j) => j !== i))}
          onRevert={(index, text, edit) => {
            if (!activeId) return;
            const id = activeId;
            const snapshot = eventsRef.current[id] ?? [];
            const eventId = (snapshot[index]?.meta as any)?.eventId;
            const checkpoint = checkpointAfterUser(snapshot, index);
            if (ws.current?.readyState === 1) {
              pendingRevert.current = { threadId: id, snapshot, index };
              ws.current.send(JSON.stringify({
                type: "revert", scope: "thread", threadId: id, text, eventId, ...checkpoint,
              }));
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
            const eventId = (snapshot[index]?.meta as any)?.eventId;
            const checkpoint = checkpointAfterUser(snapshot, index);
            pendingResend.current = {
              threadId: id,
              prompt: newText,
              snapshot,
              clientMessageId: crypto.randomUUID(),
              ts: Date.now(),
              index,
            };
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify({
                type: "revert", scope: "thread", threadId: id, text: oldText, eventId, ...checkpoint,
              }));
            }
          }}
          onFork={(index) => {
            if (!activeId) return;
            const src = allThreadsRef.current.find((t) => t.id === activeId);
            if (!src) return;
            const newId = crypto.randomUUID();
            const { forkEvents, payload } = buildForkThreadPayload(
              activeId,
              newId,
              index,
              eventsRef.current[activeId] ?? [],
            );
            // copie locale de l'historique jusqu'au point de fork
            setEvents((p) => ({ ...p, [newId]: forkEvents }));
            if (ws.current?.readyState === 1) {
              ws.current.send(JSON.stringify(payload));
            }
            setActiveId(newId);
            activeIdRef.current = newId;
          }}
          onNewChat={newChat}
          onOpenProject={addProject}
          onOpenAgent={activeProject ? openAgentInAtelier : undefined}
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
          onGoal={(action, objective, status) => {
            if (!activeId || ws.current?.readyState !== 1) return;
            const th = allThreadsRef.current.find((t) => t.id === activeId);
            if (!th?.sessionId) {
              // pas encore de session : mémoriser (posé au premier message)
              // ou oublier — goalSet/goalClear échoueraient côté sidecar
              pendingGoal.current =
                action === "set" && objective ? { threadId: activeId, objective } : null;
              return;
            }
            if (action === "clear") pendingGoal.current = null;
            // le router sidecar relaie déjà `status` à thread/goal/set (Codex
            // app-server) — pause = status:"paused", reprise = "active"
            ws.current.send(JSON.stringify(
              action === "set"
                ? { type: "goalSet", threadId: activeId, objective, ...(status ? { status } : {}) }
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
            <div className="atelier-host">
            <AtelierPane
              url={atelierUrl ?? ""}
              layout={layout}
              onToggleExpand={() => setLayout((l) => (l === "atelier" ? "split" : "atelier"))}
              projectRoot={activeProject ?? ""}
              activeThreadId={activeId}
              kbBinding={{
                attached: activeId
                  ? (allThreads.find((th) => th.id === activeId)?.kbSourceIds ?? [])
                  : pendingKb.kbSourceIds,
                fullContent: activeId
                  ? (allThreads.find((th) => th.id === activeId)?.kbFullContent ?? [])
                  : pendingKb.kbFullContent,
                onChange: handleKbChange,
              }}
              kbThreadTitle={activeId ? (allThreads.find((th) => th.id === activeId)?.title ?? "") : ""}
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
              projectName={null /* le crumb TopBar porte déjà le projet — pas de duplication */}
              onGalleryReload={hardReloadAtelier}
              onInspectFile={openInspector}
              agent={activeAgent}
              agentEvents={activeAgentEvents}
              onCloseAgent={closeAgentInAtelier}
            />
            {inspected && (
              <>
                {/* scrim du mode tiroir (visible <900px de conteneur via CSS) */}
                <div className="ci-scrim" onClick={closeInspector} aria-hidden="true" />
                <ContextInspector
                item={inspected}
                onClose={closeInspector}
                onOpen={(rel) => openFileTab(rel)}
                onAddToChat={addInspectedToChat}
                addState={inspectorAdd}
              />
              </>
            )}
            </div>
          </Panel>
        </>
      )}
    </PanelGroup>
      {newChatRequest && (
        <LazyDialog
          open
          onOpenChange={(open) => {
            if (!open) setNewChatRequest(null);
          }}
          title={t("app.new-chat-title")}
          description={t("app.choose-provider")}
          closeLabel={t("action.close")}
          className="provider-new-dialog"
        >
            <div className="provider-new-grid">
              {["claude", "codex", "grok", "kimi", "opencode"].map((provider) => {
                const info = providerList.find((item) => item.id === provider);
                const available = info?.ok !== false;
                return (
                  <RowButton key={provider} className="provider-new-card" disabled={!available}
                    onClick={() => createChat(newChatRequest.projectRoot, provider)}>
                    <ProviderIcon provider={provider} size={18} />
                    <span>{info?.label ?? provider[0].toUpperCase() + provider.slice(1)}</span>
                    <small>{available ? t("app.independent-chat") : t("app.provider-unavailable")}</small>
                  </RowButton>
                );
              })}
            </div>
        </LazyDialog>
      )}
    </WorkspaceShell>
  );
}
