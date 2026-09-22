import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuGroup, ContextMenuItem } from "../shadcn/context-menu";
import { Button, IconButton } from "../ui";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import { t } from "../../lib/i18n";
import "../../styles/document-tabs.css";

export type ProjectChatTab = { id: string; title: string };

export type ChatTabControls = {
  openChats: ProjectChatTab[];
  pinnedIds: string[];
  onClose: (ids: string[]) => void;
  onTogglePin: (id: string) => void;
};

/** Navigation only: App owns thread selection, history and per-thread drafts. */
export function ProjectChatTabs(p: {
  chats: ProjectChatTab[];
  activeId: string | null;
  controls?: ChatTabControls;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const visible = p.controls?.openChats ?? p.chats;
  const [open, setOpen] = useState(false);
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

  return <span className="project-chat-tabs" role="group" aria-label={t("chat.project-chats")}>
    <span className="project-chat-tabs-list" ref={list}>
      {visible.map((chat, index) => {
        const pinned = p.controls?.pinnedIds.includes(chat.id) ?? false;
        return <ContextMenu key={chat.id}>
        <ContextMenuTrigger render={<span className={`project-chat-tab-wrap document-tab-shell${pinned ? " is-pinned" : ""}`} data-active={chat.id === p.activeId} />}>
        <Button
        key={chat.id}
        variant="ghost"
        className="project-chat-tab"
        aria-current={chat.id === p.activeId ? "page" : undefined}
        aria-label={chat.title || t("app.new-chat-title")}
        onClick={() => p.onSelect(chat.id)}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % visible.length
            : event.key === "ArrowLeft" ? (index - 1 + visible.length) % visible.length
            : event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          list.current?.querySelectorAll<HTMLButtonElement>(".project-chat-tab")[next]?.focus();
        }}
      >{pinned && <svg className="project-chat-pin tw:size-[10px]" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><g transform="rotate(35 8 8)"><path d="M5 2.5h6v1.2l-1 .6v3l1.5 1.5v1H8.6v3.4L8 14l-.6-.8V9.8H4.5v-1L6 7.3v-3l-1-.6z" /></g></svg>}<span className="project-chat-tab-label">{chat.title || t("app.new-chat-title")}</span></Button>
      {p.controls && !pinned && <IconButton size="s" className="project-chat-tab-close document-tab-close"
        label={`${t("action.close-tab")} — ${chat.title || t("app.new-chat-title")}`}
        onClick={() => p.controls!.onClose([chat.id])}><X size={12} aria-hidden="true" /></IconButton>}
      </ContextMenuTrigger>
      {p.controls && <ContextMenuContent><ContextMenuGroup>
        <ContextMenuItem onClick={() => p.controls!.onTogglePin(chat.id)}>{t(pinned ? "chat.unpin-tab" : "chat.pin-tab")}</ContextMenuItem>
        <ContextMenuItem disabled={pinned} onClick={() => p.controls!.onClose([chat.id])}>{t("action.close-tab")}</ContextMenuItem>
        <ContextMenuItem onClick={() => p.controls!.onClose(visible.filter(other => other.id !== chat.id).map(other => other.id))}>{t("chat.close-other-tabs")}</ContextMenuItem>
        <ContextMenuItem onClick={() => p.controls!.onClose(visible.map(other => other.id))}>{t("chat.close-unpinned-tabs")}</ContextMenuItem>
      </ContextMenuGroup></ContextMenuContent>}
      </ContextMenu>;
      })}
    </span>
    <IconButton label={t("action.new-project-chat")} onClick={p.onNew}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8 2v12M2 8h12" /></svg>
    </IconButton>
    <LazyDropdownMenu
      open={open} onOpenChange={setOpen} triggerRef={anchor}
      align="end" label={t("chat.project-chats")} header={t("chat.project-chats")}
      trigger={<IconButton label={t("chat.all-project-chats")} aria-haspopup="menu" aria-expanded={open}>
        <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
      </IconButton>}
      items={[
        ...(p.controls ? [{key:"close-unpinned",label:t("chat.close-unpinned-tabs"),onSelect:() => p.controls!.onClose(visible.map(chat => chat.id))}] : []),
        ...p.chats.map((chat) => ({ key: chat.id,
        label: `${chat.id === p.activeId ? "✓ " : ""}${chat.title || t("app.new-chat-title")}`,
        onSelect: () => p.onSelect(chat.id),
      }))]}
    />
  </span>;
}
