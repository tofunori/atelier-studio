// Panneau Projets = Research Navigator du projet actif (plan 024, option A
// approuvée). Le panneau ne répond qu'à une question : « dans ce projet, quel
// travail reprendre et quelles conversations ouvrir ? ». Le changement de
// projet reste GLOBAL (rail / top bar) — le nom local n'est pas un sélecteur.
// Sans projet actif, le même panneau devient « Chats sans projet ».
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirm as tauriConfirm, message as tauriMessage } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { Thread } from "../lib/ws";
import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
const tr = t; // alias historique (t masqué par des variables locales dans les .map)
import { LazyDropdownMenuItem } from "./ui/LazyDropdownMenu";
import { Button, RowButton } from "./ui";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarProvider,
} from "./shadcn/sidebar";
import {
  CONVERSATIONS_VISIBLE,
  deriveProjectNavigatorModel,
  recencyBucketAt,
  type RecencyBucket,
} from "./sidebar/projectNavigatorModel";
import { ProjectHeader } from "./sidebar/ProjectHeader";
import { ThreadRow } from "./sidebar/ThreadRow";
import { PROJ_ICONS, ProjIcon } from "./sidebar/projectIcons";
import { ProjectStyleMenu } from "./sidebar/ProjectStyleMenu";
import { Popover, PopoverContent } from "./shadcn/popover";
import { conversationFamilies, linkedConversations } from "../lib/threadLinks";

// ré-exports publics — Rail et TopBar importent depuis ./Sidebar
export { PROJ_ICONS, ProjIcon };

type ThreadMenu = {
  threadId: string;
  /** A thread can be rendered in both the continuity tree and chronology. */
  source: string;
  mode: "main" | "move";
};

/** Envoie moveThread si le chat n'est pas en cours (refus serveur sinon,
 *  mais mieux vaut éviter l'aller-retour) ; ferme le menu appelant. */
export function moveThreadTo(thread: Thread | undefined, projectRoot: string, close: () => void) {
  if (!thread) { close(); return; }
  if (thread.status === "running") {
    tauriMessage(t("thread.move-running"), { kind: "warning" }).catch(() => {});
    close();
    return;
  }
  wsSend({ type: "moveThread", threadId: thread.id, projectRoot });
  close();
}

export type RecencyRow =
  | { kind: "section"; bucket: RecencyBucket }
  | { kind: "thread"; thread: Thread };

// titre lisible : un titre qui est un chemin absolu devient "…/nom-de-fichier"
function niceTitle(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const title = raw || "Sans titre";
  const m = /^(\/[\w~. -]+(?:\/[\w~. -]+)+)([\s\S]*)$/.exec(title);
  if (!m) return title;
  const base = m[1].split("/").filter(Boolean).pop() ?? m[1];
  const rest = m[2].trim();
  return rest ? `${base} — ${rest.slice(0, 40)}` : base;
}

function threadRoot(th: Thread): string {
  return typeof (th as any).projectRoot === "string" ? (th as any).projectRoot : "";
}

export function rawThreadTitle(th: Thread): string {
  const raw = (th as any).title;
  return typeof raw === "string" && raw.trim() ? raw : "Sans titre";
}

export function threadTitle(th: Thread): string {
  return niceTitle(rawThreadTitle(th));
}

export function recencyLabelKey(bucket: RecencyBucket) {
  switch (bucket) {
    case "today": return "sidebar.recency.today";
    case "yesterday": return "sidebar.recency.yesterday";
    case "last7": return "sidebar.recency.last7";
    case "older": return "sidebar.recency.older";
  }
}

/** Rangées groupées par bucket de récence — consommé par le flyout du Rail. */
export function withRecencySections(threads: Thread[]): RecencyRow[] {
  const rows: RecencyRow[] = [];
  const now = Date.now();
  let current: RecencyBucket | null = null;
  for (const thread of threads) {
    const bucket = recencyBucketAt(thread, now);
    if (bucket !== current) {
      rows.push({ kind: "section", bucket });
      current = bucket;
    }
    rows.push({ kind: "thread", thread });
  }
  return rows;
}

export default function Sidebar(p: {
  projects: string[];
  threads: Thread[];
  unread: Set<string>;
  heartbeatThreadIds?: Set<string>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  threadOrder: "recent" | "manual";
  activeProject: string | null;
  activeId: string | null;
  onSelect: (threadId: string, projectRoot: string) => void;
  onNew: (projectRoot: string) => void;
  onNewChat: () => void;
  onImportSession: (provider: "claude" | "codex", sessionId: string, title: string, projectRoot?: string) => void;
  onDelete: (threadId: string) => void;
  onRemoveProject: (root: string) => void;
  onRename: (threadId: string, title: string) => void;
  projMeta: Record<string, { color?: string; label?: string }>;
  onSetMeta: (root: string, meta: { color?: string; label?: string }) => void;
  linkProviders?: { id: string; label: string }[];
  onContinueWith?: (thread: Thread, provider: string) => void;
  onUnlinkConversation?: (childThreadId: string) => void;
}) {
  // -- état local ------------------------------------------------------------
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // « afficher plus », global
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selAnchor = useRef<string | null>(null);
  const [menu, setMenu] = useState<ThreadMenu | null>(null);
  const [projMenu, setProjMenu] = useState<{ root: string; x: number; y: number } | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeProv, setResumeProv] = useState<"claude" | "codex">("claude");
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number; projectRoot?: string }[] | null>(null);
  const [resumeQuery, setResumeQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const model = useMemo(
    () =>
      deriveProjectNavigatorModel({
        activeProject: p.activeProject,
        activeId: p.activeId,
        threads: p.threads,
        favorites: p.favorites,
        threadOrder: p.threadOrder,
        query,
        expanded,
      }),
    [p.activeProject, p.activeId, p.threads, p.favorites, p.threadOrder, query, expanded],
  );

  const familyByThread = useMemo(() => {
    const root = p.activeProject ?? "";
    return conversationFamilies(
      p.threads.filter((thread) => threadRoot(thread) === root),
    );
  }, [p.activeProject, p.threads]);

  const handleFamilyPreviewChange = useCallback((familyId: string, previewed: boolean) => {
    setPreviewFamilyId((current) => previewed ? familyId : current === familyId ? null : current);
  }, []);

  // changement de contexte : reset recherche + multi-sélection, menus fermés ;
  // « expanded » reste global (décision plan 024, étape 7)
  useEffect(() => {
    setQuery("");
    setSearchOpen(false);
    setSelected(new Set());
    selAnchor.current = null;
    setMenu(null);
    setProjMenu(null);
    setEditingId(null);
    setPreviewFamilyId(null);
  }, [p.activeProject]);

  // -- reprise de session (contrat conservé : événements globaux) ------------
  useEffect(() => {
    const onSessions = (e: Event) => setSessions((e as CustomEvent).detail);
    window.addEventListener("sessions-list", onSessions);
    return () => window.removeEventListener("sessions-list", onSessions);
  }, []);

  useEffect(() => {
    const onOpenResume = (e: Event) => {
      const provider = (e as CustomEvent).detail?.provider === "codex" ? "codex" : "claude";
      openResume(provider);
    };
    window.addEventListener("atelier-open-resume", onOpenResume);
    return () => window.removeEventListener("atelier-open-resume", onOpenResume);
  }, [p.activeProject]);

  function openResume(prov: "claude" | "codex") {
    setResumeProv(prov);
    setSessions(null);
    setResumeQuery("");
    setResumeOpen(true);
    wsSend({ type: "listSessions", provider: prov, projectRoot: p.activeProject ?? "" });
  }

  // plus aucun overlay géré à la main ici : ProjectStyleMenu et resume-pop
  // sont des Popover Base UI (dismiss, Escape et retour focus inclus)

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  // -- renommage ---------------------------------------------------------------
  function commitRename() {
    if (editingId && editText.trim()) p.onRename(editingId, editText.trim());
    setEditingId(null);
  }

  function startRename(th: Thread) {
    setEditText(rawThreadTitle(th));
    setEditingId(th.id);
  }

  // -- sélection multiple (Shift/Cmd, Échap, Suppr) — ordre du modèle ----------
  function handleThreadClick(e: React.MouseEvent, th: Thread) {
    if (e.shiftKey) {
      e.preventDefault();
      const ids = model.visibleThreadIds;
      const anchor = selAnchor.current && ids.includes(selAnchor.current) ? selAnchor.current : th.id;
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(th.id);
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      setSelected((prev) => new Set([...prev, ...range]));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      selAnchor.current = th.id;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(th.id)) next.delete(th.id);
        else next.add(th.id);
        return next;
      });
      return;
    }
    selAnchor.current = th.id;
    if (selected.size) setSelected(new Set());
    p.onSelect(th.id, threadRoot(th));
  }

  async function deleteSelected(fallbackId: string) {
    const ids = selected.size ? [...selected] : [fallbackId];
    if (ids.length > 1) {
      const ok = await tauriConfirm(tr("sidebar.delete-many-confirm", { count: ids.length }), { kind: "warning" }).catch(() => true);
      if (!ok) return;
    }
    for (const id of ids) p.onDelete(id);
    setSelected(new Set());
    selAnchor.current = null;
  }

  useEffect(() => {
    if (!selected.size) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (e.key === "Escape") setSelected(new Set());
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void deleteSelected([...selected][0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // -- menu de conversation (bouton ⋯, clic droit) -----------------------------
  function openThreadMenu(threadId: string, source: string) {
    setMenu({ threadId, source, mode: "main" });
  }

  function threadMenuItems(thread: Thread, source: string): LazyDropdownMenuItem[] {
    const isOpen = menu?.threadId === thread.id && menu.source === source;
    if (isOpen && menu?.mode === "move") {
      return [
        {
          key: "back",
          label: <>‹ {t("thread.move")}</>,
          keepOpen: true,
          onSelect: () => setMenu({ threadId: thread.id, source, mode: "main" }),
        },
        ...p.projects
          .filter((root) => root !== threadRoot(thread))
          .map((root) => ({
            key: `move-${root}`,
            label: root.split("/").pop() ?? root,
            onSelect: () => moveThreadTo(thread, root, () => setMenu(null)),
          })),
      ];
    }
    const related = linkedConversations(p.threads, thread.id);
    const continueProviders = (p.linkProviders ?? []).filter(
      (provider) => provider.id !== thread.provider,
    );
    const unlinkItems: LazyDropdownMenuItem[] = related.map((relation) => ({
      key: `linked-unlink-${relation.childThreadId}`,
      label: related.length === 1
        ? t("linkedConversation.unlinkFrom", { title: threadTitle(relation.thread) })
        : `${relation.thread.provider === "opencode" ? "OpenCode" : relation.thread.provider.charAt(0).toUpperCase() + relation.thread.provider.slice(1)} · ${threadTitle(relation.thread)}`,
      onSelect: () => {
        p.onUnlinkConversation?.(relation.childThreadId);
        setMenu(null);
      },
    }));

    return [
      {
        key: "rename",
        label: t("action.rename"),
        onSelect: () => {
          startRename(thread);
          setMenu(null);
        },
      },
      {
        key: "favorite",
        label: p.favorites.includes(thread.id)
          ? t("action.remove-favorite")
          : t("action.add-favorite"),
        onSelect: () => {
          p.onToggleFavorite(thread.id);
          setMenu(null);
        },
      },
      {
        key: "copy-resume",
        label: t("action.copy-resume"),
        onSelect: () => {
          copyResumeCommand(thread);
          setMenu(null);
        },
      },
      ...(p.onContinueWith && continueProviders.length
        ? [{
            key: "linked-continue",
            label: t("linkedConversation.continueWith"),
            disabled: thread.status === "running" || !thread.projectRoot,
            children: continueProviders.map((provider) => ({
              key: `linked-continue-${provider.id}`,
              label: provider.label,
              onSelect: () => {
                p.onContinueWith?.(thread, provider.id);
                setMenu(null);
              },
            })),
          }]
        : []),
      ...(p.onUnlinkConversation && unlinkItems.length === 1
        ? unlinkItems
        : p.onUnlinkConversation && unlinkItems.length > 1
          ? [{
              key: "linked-unlink",
              label: t("linkedConversation.unlinkFromMany"),
              children: unlinkItems,
            }]
          : []),
      ...(p.projects.some((root) => root !== threadRoot(thread))
        ? [{
            key: "move",
            label: t("thread.move"),
            keepOpen: true,
            onSelect: () => setMenu({ threadId: thread.id, source, mode: "move" }),
          }]
        : []),
      {
        key: "delete",
        label: selected.size > 1 && selected.has(thread.id)
          ? tr("sidebar.delete-many", { count: selected.size })
          : t("action.delete"),
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          void deleteSelected(thread.id);
          setMenu(null);
        },
      },
    ];
  }

  function copyResumeCommand(th: Thread | undefined) {
    if (!th?.sessionId) return;
    const cmd =
      th.provider === "codex"
        ? `codex resume ${th.sessionId}`
        : `cd ${JSON.stringify(th.projectRoot || "~")} && claude --resume ${th.sessionId}`;
    navigator.clipboard.writeText(cmd);
  }

  // -- rendu d'une ligne --------------------------------------------------------
  function renderRow(
    th: Thread,
    kind: "pinned" | "conversation",
  ) {
    const relatedCount = linkedConversations(p.threads, th.id).length;
    const rowSource = `${kind}:${th.id}`;
    const family = familyByThread.get(th.id);
    return (
      <ThreadRow
        key={th.id}
        thread={th}
        kind={kind}
        title={threadTitle(th)}
        rawTitle={rawThreadTitle(th)}
        active={th.id === p.activeId}
        selected={selected.has(th.id)}
        unread={p.unread.has(th.id)}
        heartbeat={p.heartbeatThreadIds?.has(th.id) ?? false}
        linkedConversationCount={relatedCount}
        family={family}
        familyPreviewed={family?.id === previewFamilyId}
        onOpenFamilyThread={(thread) => p.onSelect(thread.id, threadRoot(thread))}
        onUnlinkFamilyThread={p.onUnlinkConversation}
        onFamilyPreviewChange={handleFamilyPreviewChange}
        favorite={p.favorites.includes(th.id)}
        editing={editingId === th.id}
        editText={editText}
        editRef={editRef}
        onEditChange={setEditText}
        onEditCommit={commitRename}
        onEditCancel={() => setEditingId(null)}
        onRowClick={(e) => handleThreadClick(e, th)}
        onRowDoubleClick={() => startRename(th)}
        onRowContextMenu={(e) => {
          e.preventDefault();
          openThreadMenu(th.id, rowSource);
        }}
        onToggleFavorite={() => p.onToggleFavorite(th.id)}
        onOpenMenu={() => openThreadMenu(th.id, rowSource)}
        menuOpen={menu?.threadId === th.id && menu.source === rowSource}
        onMenuOpenChange={(open) => {
          if (open) openThreadMenu(th.id, rowSource);
          else setMenu(null);
        }}
        menuItems={threadMenuItems(th, rowSource)}
      />
    );
  }

  const meta = p.activeProject ? p.projMeta[p.activeProject] : undefined;
  const headerName =
    model.mode === "unscoped"
      ? t("sidebar.no-project-title")
      : meta?.label && !meta.label.startsWith("icon:")
        ? meta.label
        : model.identity?.name ?? "";

  const contextEmpty =
    !model.searching &&
    model.pinnedThreads.length === 0 &&
    model.conversationSections.length === 0;

  const shownConversations = model.conversationSections.reduce((n, s) => n + s.threads.length, 0);
  const resultsEmpty = model.searching && shownConversations === 0;

  return (
    <SidebarProvider className="tw:w-full tw:min-h-0">
      <ShadcnSidebar collapsible="none" className="sidebar pnav">
        <SidebarHeader className="tw:gap-0 tw:p-0">
          <ProjectHeader
            mode={model.mode}
            name={headerName}
            root={model.identity?.root ?? null}
            meta={meta}
            searchOpen={searchOpen}
            query={query}
            onQueryChange={setQuery}
            onToggleSearch={setSearchOpen}
            onNew={() => (model.mode === "project" ? p.onNew(p.activeProject!) : p.onNewChat())}
            onOpenResume={openResume}
            onRevealFinder={() => {
              const root = p.activeProject;
              if (root) revealItemInDir(root).catch(() => openUrl("file://" + root).catch(() => {}));
            }}
            onCustomize={(at) => {
              if (p.activeProject) setProjMenu({ root: p.activeProject, x: at.x, y: at.y });
            }}
            onRemoveProject={() => {
              if (p.activeProject) p.onRemoveProject(p.activeProject);
            }}
          />
        </SidebarHeader>

        <SidebarContent className="tw:min-h-0 tw:overflow-hidden tw:p-0">
          {/* key = contexte : remount + fondu 140 ms au changement de projet */}
          <div className="side-scroll pnav-scroll" key={p.activeProject ?? "@sans-projet"}>
        {contextEmpty && (
          <p className="pnav-empty">
            {t(model.mode === "project" ? "sidebar.empty-project" : "sidebar.empty-unscoped")}
          </p>
        )}

            {model.pinnedThreads.length > 0 && (
              <SidebarGroup className="pnav-group tw:p-0">
                <SidebarGroupLabel as="h3" className="pnav-sec tw:h-auto tw:rounded-none tw:p-0">
                  {t("sidebar.pinned")}
                </SidebarGroupLabel>
                <SidebarGroupContent className="tw:p-0">
                  <SidebarMenu className="pnav-list tw:p-0">
                    {model.pinnedThreads.map((th) => renderRow(th, "pinned"))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {(model.conversationSections.length > 0 || model.searching) && !resultsEmpty && (
              <SidebarGroup className="pnav-group tw:p-0">
                <SidebarGroupLabel as="h3" className="pnav-sec tw:h-auto tw:rounded-none tw:p-0">
                  {t(model.searching ? "sidebar.results" : "sidebar.conversations")}
                </SidebarGroupLabel>
                <SidebarGroupContent className="tw:p-0">
                  <SidebarMenu className="pnav-list tw:p-0">
                    {model.conversationSections.map((sec) => (
                      <Fragment key={sec.key}>
                        {sec.bucket && (
                          <li className="thread-recency-label" role="presentation">
                            {tr(recencyLabelKey(sec.bucket))}
                          </li>
                        )}
                        {sec.threads.map((th) => renderRow(th, "conversation"))}
                      </Fragment>
                    ))}
                  </SidebarMenu>
                  {model.hiddenCount > 0 && (
                    <Button variant="ghost" className="pnav-more" onClick={() => setExpanded(true)}>
                      {t("sidebar.older-count", { count: model.hiddenCount })}
                    </Button>
                  )}
                  {expanded && !model.searching && shownConversations > CONVERSATIONS_VISIBLE && (
                    <Button variant="ghost" className="pnav-more" onClick={() => setExpanded(false)}>
                      {t("sidebar.show-less")}
                    </Button>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {resultsEmpty && <p className="pnav-empty">{t("sidebar.no-results", { q: query })}</p>}
          </div>
        </SidebarContent>

        <Popover open={resumeOpen} onOpenChange={(next) => { if (!next) setResumeOpen(false); }}>
          <PopoverContent
            plain
            className="rail-menu resume-pop"
            anchor={() => ({
              getBoundingClientRect: () => ({
                x: 240,
                y: 120,
                left: 240,
                top: 120,
                right: 240,
                bottom: 120,
                width: 0,
                height: 0,
              }),
            })}
            side="right"
            align="start"
            sideOffset={0}
          >
            <div className="rail-menu-title">{t("sidebar.resume-title")}</div>
            <div className="seg">
              {(["claude", "codex"] as const).map((pv) => (
                <RowButton key={pv} className={resumeProv === pv ? "on" : ""} onClick={() => openResume(pv)}>
                  {pv === "claude" ? "Claude" : "Codex"}
                </RowButton>
              ))}
            </div>
            <input
              className="resume-search"
              type="search"
              value={resumeQuery}
              onChange={(event) => setResumeQuery(event.target.value)}
              placeholder={`${t("sidebar.search")}…`}
              aria-label={t("sidebar.search")}
            />
            <div className="resume-list">
              {sessions === null && <div className="bh-empty">{t("sidebar.loading")}</div>}
              {sessions?.length === 0 && <div className="bh-empty">{t("sidebar.no-session")}</div>}
              {sessions?.filter((s) => {
                const needle = resumeQuery.trim().toLocaleLowerCase();
                return !needle || `${s.title} ${s.projectRoot ?? ""}`.toLocaleLowerCase().includes(needle);
              }).map((s) => (
                <div key={s.id} className="resume-item"
                  onClick={() => {
                    p.onImportSession(resumeProv, s.id, s.title, s.projectRoot);
                    setResumeOpen(false);
                  }}>
                  <span className="resume-title">{s.title}</span>
                  {s.projectRoot && <span className="resume-project">{s.projectRoot.split("/").filter(Boolean).slice(-1)[0]}</span>}
                  <span className="resume-date">
                    {new Date(s.mtime).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(s.mtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="set-btn" onClick={() => setResumeOpen(false)}>{t("sidebar.close")}</Button>
          </PopoverContent>
        </Popover>

      {projMenu && (
        <ProjectStyleMenu
          key={projMenu.root}
          root={projMenu.root}
          meta={p.projMeta[projMenu.root]}
          onSetMeta={p.onSetMeta}
          onClose={() => setProjMenu(null)}
          anchor={{ x: projMenu.x, y: projMenu.y }}
        />
      )}
      </ShadcnSidebar>
    </SidebarProvider>
  );
}
