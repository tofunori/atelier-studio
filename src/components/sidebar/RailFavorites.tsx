import { isDiscussionContext } from "../../lib/discussions";
import { useState } from "react";
import type { Thread } from "../../lib/ws";
import { CHAT_SEALS, ChatSeal, chatSealFor, type ChatSealId } from "./ChatSeal";
import { IconButton } from "../ui/IconButton";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";

export type RailFavoritesProps = {
  threads: Thread[];
  activeId: string | null;
  unread?: Set<string>;
  seals?: Record<string, string>;
  onSetSeal?: (id: string, seal: ChatSealId) => void;
  onOpen: (thread: Thread) => void;
  onToggle: (id: string) => void;
  onReorder: (from: string, to: string) => void;
};

export default function RailFavorites(p: RailFavoritesProps) {
  const [drag, setDrag] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const title = (th: Thread) => th.title?.trim() || "Sans titre";
  const project = (th: Thread) => isDiscussionContext(th.projectRoot) ? "Discussion libre" : th.projectRoot.split("/").filter(Boolean).pop() || "Sans projet";
  const isUnread = (th: Thread) => p.unread?.has(th.id) && th.id !== p.activeId && th.status !== "running";
  return <div className="rail-favorites" role="group" aria-label="Chats épinglés">
    {p.threads.map(th => <LazyDropdownMenu key={th.id}
      open={context === th.id} onOpenChange={open => { if (!open) setContext(null); }} side="right"
      items={[
        { key: "open", label: "Ouvrir le chat", onSelect: () => p.onOpen(th) },
        ...(p.onSetSeal ? [{ key: "seal", label: "Changer l’icône", children: CHAT_SEALS.map(seal => ({
          key: seal.id, label: <span className="chat-seal-option"><ChatSeal seal={seal.id} />{seal.label}</span>,
          checked: chatSealFor(th.id, p.seals) === seal.id,
          keepOpen: false,
          onSelect: () => p.onSetSeal?.(th.id, seal.id),
        })) }] : []),
        { key: "unpin", label: "Désépingler", onSelect: () => p.onToggle(th.id) },
        { key: "first", label: "Placer en premier", disabled: p.threads[0]?.id === th.id,
          onSelect: () => p.onReorder(th.id, p.threads[0].id) },
      ]}
      trigger={<IconButton
          className={`rail-favorite ${p.activeId === th.id ? "on" : ""}`}
          label={`${title(th)} — ${project(th)}${isUnread(th) ? " — Réponse terminée · non lue" : ""}`} title={`${title(th)}\n${project(th)}${isUnread(th) ? "\nRéponse terminée · non lue" : ""}`} aria-pressed={p.activeId === th.id}
          draggable onDragStart={e => { setDrag(th.id); e.dataTransfer.setData("text/plain", th.id); }}
          onDragEnd={() => setDrag(null)}
          onDragOver={e => { if (drag && drag !== th.id) e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); if (drag && drag !== th.id) p.onReorder(drag, th.id); setDrag(null); }}
          onClick={e => { e.preventDefault(); p.onOpen(th); }}
          onContextMenu={e => { e.preventDefault(); setContext(th.id); }}
          onKeyDown={e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); p.onOpen(th); return; } if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); setContext(th.id); } }}
        ><ChatSeal seal={chatSealFor(th.id, p.seals)} />{isUnread(th) && <span className="rail-favorite-unread" aria-hidden="true" />}</IconButton>}
    />)}
  </div>;
}
