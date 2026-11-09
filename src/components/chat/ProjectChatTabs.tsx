import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button, IconButton } from "../ui";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import { t } from "../../lib/i18n";
import { moveDocumentTabFocus } from "../../lib/surfaceKeyboard";
import type { TranscriptView } from "../../lib/settings";
import type { LinkedAgentSummary } from "../../lib/threadLinks";
import "../../styles/document-tabs.css";

export type ProjectChatTab = { id: string; title: string; status?: string };

export type ChatTabControls = {
  openChats: ProjectChatTab[];
  pinnedIds: string[];
  onClose: (ids: string[]) => void;
  onTogglePin: (id: string) => void;
};

/** Ce qui concerne UN chat vit au clic droit de son onglet (barre du haut,
 *  variante S2 du 2026-11-09) : renommer, vue de la transcription,
 *  continuité. Absent = rangées absentes. */
export type ChatTabActions = {
  onRename?: (id: string, title: string) => void;
  transcriptView?: TranscriptView;
  onTranscriptViewChange?: (view: TranscriptView) => void;
  linkedFor?: (id: string) => LinkedAgentSummary[];
  onOpenLinked?: (id: string) => void;
  onUnlinkLinked?: (id: string) => void;
};

// Le clic droit vit dans son propre chunk (budget d'entrée) : même schéma que
// LazyDropdownMenu, composant résolu gardé au niveau du module. Tant qu'il
// n'est pas arrivé (quelques ms au démarrage), l'onglet s'affiche sans menu.
let LoadedTabMenu: typeof import("./ChatTabMenu").ChatTabMenu | null = null;
const chatTabMenuModule = import("./ChatTabMenu").then((module) => {
  LoadedTabMenu = module.ChatTabMenu;
  return true;
  // chunk introuvable : les onglets restent utilisables, sans clic droit
}).catch(() => false);

/** Navigation only: App owns thread selection, history and per-thread drafts.
 *  Les onglets partent de la gauche ; UN seul bouton ⌄ reste au bord droit,
 *  quel que soit le nombre d'onglets (demande Thierry 2026-11-09 : le + et
 *  le ⌄ ne suivent plus le dernier onglet). Son menu : Nouveau chat, puis la
 *  liste des chats du projet. */
export function ProjectChatTabs(p: {
  chats: ProjectChatTab[];
  activeId: string | null;
  unread?: ReadonlySet<string>;
  controls?: ChatTabControls;
  actions?: ChatTabActions;
  /** posé juste avant le ⌄ (actions vivantes du chat : sous-agents) */
  beforeMenu?: ReactNode;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const visible = p.controls?.openChats ?? p.chats;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [menuReady, setMenuReady] = useState(LoadedTabMenu != null);
  useEffect(() => { if (!menuReady) void chatTabMenuModule.then(setMenuReady); }, [menuReady]);
  const list = useRef<HTMLSpanElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const reveal = () => list.current?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    reveal();
    if (typeof ResizeObserver === "undefined" || !list.current) return;
    const observer = new ResizeObserver(reveal);
    observer.observe(list.current);
    return () => observer.disconnect();
  }, [p.activeId, visible]);

  const rename = p.actions?.onRename;
  const commit = (id: string, value: string, previous: string) => {
    setEditing(null);
    const title = value.trim();
    if (rename && title && title !== previous) rename(id, title);
  };

  return <span className="project-chat-tabs" role="group" aria-label={t("chat.project-chats")}>
    <span className="project-chat-tabs-list" ref={list} onKeyDown={event => moveDocumentTabFocus(event, ".project-chat-tab")}>
      {visible.map((chat) => {
        const title = chat.title || t("app.new-chat-title");
        const isUnread = p.unread?.has(chat.id) && chat.id !== p.activeId && chat.status !== "running";
        const unreadLabel = `${t("chat.turn-done")} · ${t("sidebar.unread")}`;
        const pinned = p.controls?.pinnedIds.includes(chat.id) ?? false;
        const shell = { className: `project-chat-tab-wrap document-tab-shell${pinned ? " is-pinned" : ""}`,
          "data-active": chat.id === p.activeId, "data-tab-id": chat.id } as ComponentProps<"span">;
        const content = <>
        {editing === chat.id ? (
          <input className="project-chat-tab-input" defaultValue={title} aria-label={t("action.rename")} autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(chat.id, event.currentTarget.value, title);
              else if (event.key === "Escape") setEditing(null);
            }}
            onBlur={(event) => commit(chat.id, event.currentTarget.value, title)} />
        ) : <Button
        variant="ghost"
        className="project-chat-tab"
        aria-current={chat.id === p.activeId ? "page" : undefined}
        aria-label={`${title}${isUnread ? ` — ${unreadLabel}` : ""}`}
        title={isUnread ? unreadLabel : undefined}
        onClick={() => p.onSelect(chat.id)}
        // double-clic = renommer sur place, comme un onglet de document
        onDoubleClick={rename ? () => setEditing(chat.id) : undefined}
      >{pinned && <svg className="project-chat-pin tw:size-[10px]" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><g transform="rotate(35 8 8)"><path d="M5 2.5h6v1.2l-1 .6v3l1.5 1.5v1H8.6v3.4L8 14l-.6-.8V9.8H4.5v-1L6 7.3v-3l-1-.6z" /></g></svg>}<span className="project-chat-tab-label">{title}</span>{isUnread && <span className="project-chat-tab-unread" aria-hidden="true" />}</Button>}
      {p.controls && !pinned && editing !== chat.id && <IconButton size="s" className="project-chat-tab-close document-tab-close"
        label={`${t("action.close-tab")} — ${title}`}
        onClick={() => p.controls!.onClose([chat.id])}><X size={12} aria-hidden="true" /></IconButton>}
        </>;
        return LoadedTabMenu && menuReady && (p.controls || p.actions)
          ? <LoadedTabMenu key={chat.id} chat={chat} pinned={pinned} visible={visible} controls={p.controls} actions={p.actions}
              onStartRename={() => setEditing(chat.id)} shell={shell}>{content}</LoadedTabMenu>
          : <span key={chat.id} {...shell}>{content}</span>;
      })}
    </span>
    <span className="project-chat-tabs-spring" data-tauri-drag-region />
    {p.beforeMenu}
    <LazyDropdownMenu
      open={open} onOpenChange={setOpen} triggerRef={anchor}
      align="end" label={t("chat.all-project-chats")}
      trigger={<IconButton className="project-chat-menu" label={t("chat.all-project-chats")} aria-haspopup="menu" aria-expanded={open}>
        <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
      </IconButton>}
      groups={[
        { key: "new", items: [{ key: "new", keepOpen: false, onSelect: p.onNew,
          label: <><svg className="project-chat-menu-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>{t("action.new-project-chat")}</> }] },
        { key: "chats", separatorBefore: true, label: t("chat.project-chats"), items: p.chats.map((chat) => ({ key: chat.id,
          label: chat.title || t("app.new-chat-title"),
          checked: chat.id === p.activeId, keepOpen: false,
          onSelect: () => p.onSelect(chat.id),
        })) },
        ...(p.controls ? [{ key: "close", separatorBefore: true, items: [{ key: "close-unpinned", label: t("chat.close-unpinned-tabs"),
          onSelect: () => p.controls!.onClose(visible.map(chat => chat.id)) }] }] : []),
      ]}
    />
  </span>;
}
