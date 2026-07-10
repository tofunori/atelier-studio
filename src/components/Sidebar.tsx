// Panneau Projets = Research Navigator du projet actif (plan 024, option A
// approuvée). Le panneau ne répond qu'à une question : « dans ce projet, quel
// travail reprendre et quelles conversations ouvrir ? ». Le changement de
// projet reste GLOBAL (rail / top bar) — le nom local n'est pas un sélecteur.
// Sans projet actif, le même panneau devient « Chats sans projet ».
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { confirm as tauriConfirm, message as tauriMessage } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { Thread } from "../lib/ws";
import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
const tr = t; // alias historique (t masqué par des variables locales dans les .map)
import { Menu, MenuItem, MenuSeparator } from "./ui";
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

// ré-exports publics — Rail et TopBar importent depuis ./Sidebar
export { PROJ_ICONS, ProjIcon };

type ThreadMenu = { threadId: string; mode: "main" | "move" };

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
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  threadOrder: "recent" | "manual";
  activeProject: string | null;
  activeId: string | null;
  onSelect: (threadId: string, projectRoot: string) => void;
  onNew: (projectRoot: string) => void;
  onNewChat: () => void;
  onImportSession: (provider: "claude" | "codex", sessionId: string, title: string) => void;
  onDelete: (threadId: string) => void;
  onRemoveProject: (root: string) => void;
  onRename: (threadId: string, title: string) => void;
  projMeta: Record<string, { color?: string; label?: string }>;
  onSetMeta: (root: string, meta: { color?: string; label?: string }) => void;
}) {
  // -- état local ------------------------------------------------------------
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // « afficher plus », global
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selAnchor = useRef<string | null>(null);
  const [menu, setMenu] = useState<ThreadMenu | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const [projMenu, setProjMenu] = useState<{ root: string; x: number; y: number } | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeProv, setResumeProv] = useState<"claude" | "codex">("claude");
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number }[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    setResumeOpen(true);
    wsSend({ type: "listSessions", provider: prov, projectRoot: p.activeProject ?? "" });
  }

  // popovers non gérés par <Menu> : clic extérieur + Échap
  useEffect(() => {
    if (!projMenu && !resumeOpen) return;
    const close = () => setProjMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setProjMenu(null);
      setResumeOpen(false);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [projMenu, resumeOpen]);

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
  function openThreadMenu(threadId: string, anchor: HTMLElement) {
    menuAnchorRef.current = anchor;
    setMenu({ threadId, mode: "main" });
  }

  const menuThread = menu ? p.threads.find((x) => x.id === menu.threadId) : undefined;
  const menuOtherProjects = menuThread
    ? p.projects.filter((root) => root !== threadRoot(menuThread))
    : [];

  function copyResumeCommand(th: Thread | undefined) {
    if (!th?.sessionId) return;
    const cmd =
      th.provider === "codex"
        ? `codex resume ${th.sessionId}`
        : `cd ${JSON.stringify(th.projectRoot || "~")} && claude --resume ${th.sessionId}`;
    navigator.clipboard.writeText(cmd);
  }

  // -- rendu d'une ligne --------------------------------------------------------
  function renderRow(th: Thread, kind: "continue" | "pinned" | "conversation") {
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
          openThreadMenu(th.id, e.currentTarget as HTMLElement);
        }}
        onToggleFavorite={() => p.onToggleFavorite(th.id)}
        onOpenMenu={(anchor) => openThreadMenu(th.id, anchor)}
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
    !model.continueThread &&
    model.pinnedThreads.length === 0 &&
    model.conversationSections.length === 0;

  const shownConversations = model.conversationSections.reduce((n, s) => n + s.threads.length, 0);
  const resultsEmpty = model.searching && shownConversations === 0;

  return (
    <div className="sidebar pnav">
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

      {/* key = contexte : remount + fondu 140 ms au changement de projet */}
      <div className="side-scroll pnav-scroll" key={p.activeProject ?? "@sans-projet"}>
        {contextEmpty && (
          <p className="pnav-empty">
            {t(model.mode === "project" ? "sidebar.empty-project" : "sidebar.empty-unscoped")}
          </p>
        )}

        {model.continueThread && (
          <section className="pnav-group">
            <h3 className="pnav-sec">{t("sidebar.continue")}</h3>
            <ul className="pnav-list">{renderRow(model.continueThread, "continue")}</ul>
          </section>
        )}

        {model.pinnedThreads.length > 0 && (
          <section className="pnav-group">
            <h3 className="pnav-sec">{t("sidebar.pinned")}</h3>
            <ul className="pnav-list">{model.pinnedThreads.map((th) => renderRow(th, "pinned"))}</ul>
          </section>
        )}

        {(model.conversationSections.length > 0 || model.searching) && !resultsEmpty && (
          <section className="pnav-group">
            <h3 className="pnav-sec">
              {t(model.searching ? "sidebar.results" : "sidebar.conversations")}
            </h3>
            <ul className="pnav-list">
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
            </ul>
            {model.hiddenCount > 0 && (
              <button type="button" className="pnav-more" onClick={() => setExpanded(true)}>
                {t("sidebar.older-count", { count: model.hiddenCount })}
              </button>
            )}
            {expanded && !model.searching && shownConversations > CONVERSATIONS_VISIBLE && (
              <button type="button" className="pnav-more" onClick={() => setExpanded(false)}>
                {t("sidebar.show-less")}
              </button>
            )}
          </section>
        )}

        {resultsEmpty && <p className="pnav-empty">{t("sidebar.no-results", { q: query })}</p>}
      </div>

      {/* menu de conversation : renommer / favori / copier resume / déplacer / supprimer */}
      <Menu
        open={!!menu}
        onClose={() => setMenu(null)}
        anchorRef={menuAnchorRef}
        label={t("thread.more-actions")}
        placement="bottom-start"
        className="pnav-thread-menu"
      >
        {menu?.mode === "move" ? (
          <>
            <button
              type="button"
              role="menuitem"
              className="ui-menu-item pnav-menu-back"
              autoFocus
              onClick={() => setMenu(menu ? { ...menu, mode: "main" } : null)}
            >
              ‹ {t("thread.move")}
            </button>
            {menuOtherProjects.map((root) => (
              <MenuItem key={root} onSelect={() => moveThreadTo(menuThread, root, () => setMenu(null))}>
                {root.split("/").pop()}
              </MenuItem>
            ))}
          </>
        ) : (
          <>
            <MenuItem onSelect={() => { if (menuThread) startRename(menuThread); }}>
              {t("action.rename")}
            </MenuItem>
            <MenuItem onSelect={() => { if (menu) p.onToggleFavorite(menu.threadId); }}>
              {menu && p.favorites.includes(menu.threadId)
                ? t("action.remove-favorite")
                : t("action.add-favorite")}
            </MenuItem>
            <MenuItem onSelect={() => copyResumeCommand(menuThread)}>
              {t("action.copy-resume")}
            </MenuItem>
            {menuOtherProjects.length > 0 && (
              <button
                type="button"
                role="menuitem"
                className="ui-menu-item"
                onClick={() => setMenu(menu ? { ...menu, mode: "move" } : null)}
              >
                {t("thread.move")}
              </button>
            )}
            <MenuSeparator />
            <MenuItem
              className="danger"
              onSelect={() => { if (menu) void deleteSelected(menu.threadId); }}
            >
              {menu && selected.size > 1 && selected.has(menu.threadId)
                ? tr("sidebar.delete-many", { count: selected.size })
                : t("action.delete")}
            </MenuItem>
          </>
        )}
      </Menu>

      {resumeOpen && (
        <div className="rail-menu resume-pop" onClick={(e) => e.stopPropagation()}>
          <div className="rail-menu-title">{t("sidebar.resume-title")}</div>
          <div className="seg">
            {(["claude", "codex"] as const).map((pv) => (
              <button key={pv} className={resumeProv === pv ? "on" : ""} onClick={() => openResume(pv)}>
                {pv === "claude" ? "Claude" : "Codex"}
              </button>
            ))}
          </div>
          <div className="resume-list">
            {sessions === null && <div className="bh-empty">{t("sidebar.loading")}</div>}
            {sessions?.length === 0 && <div className="bh-empty">{t("sidebar.no-session")}</div>}
            {sessions?.map((s) => (
              <div key={s.id} className="resume-item"
                onClick={() => {
                  p.onImportSession(resumeProv, s.id, s.title);
                  setResumeOpen(false);
                }}>
                <span className="resume-title">{s.title}</span>
                <span className="resume-date">
                  {new Date(s.mtime).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}{" "}
                  {new Date(s.mtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
          <button className="set-btn" onClick={() => setResumeOpen(false)}>{t("sidebar.close")}</button>
        </div>
      )}

      {projMenu && (
        <ProjectStyleMenu
          key={projMenu.root}
          root={projMenu.root}
          meta={p.projMeta[projMenu.root]}
          onSetMeta={p.onSetMeta}
          onClose={() => setProjMenu(null)}
          style={{ left: projMenu.x, top: projMenu.y, position: "fixed" }}
        />
      )}
    </div>
  );
}
