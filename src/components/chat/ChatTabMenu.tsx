// Clic droit d'un onglet de chat (variante S2 du 2026-11-09). Chargé à part
// (import dynamique depuis ProjectChatTabs) : le menu contextuel shadcn et ses
// sous-menus restent hors du budget d'entrée.
import type { ComponentProps, ReactNode } from "react";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel,
  ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from "../shadcn/context-menu";
import { t } from "../../lib/i18n";
import type { TranscriptView } from "../../lib/settings";
import type { ChatTabActions, ChatTabControls, ProjectChatTab } from "./ProjectChatTabs";

const VIEWS: TranscriptView[] = ["normal", "reflexion", "detaille", "resume"];

export function ChatTabMenu(p: {
  chat: ProjectChatTab;
  pinned: boolean;
  /** onglets visibles, pour « fermer les autres » */
  visible: ProjectChatTab[];
  controls?: ChatTabControls;
  actions?: ChatTabActions;
  /** démarre le renommage sur place */
  onStartRename: () => void;
  shell: ComponentProps<"span">;
  children: ReactNode;
}) {
  const { chat, controls, actions } = p;
  const rename = actions?.onRename;
  const linked = actions?.linkedFor?.(chat.id) ?? [];
  const own = rename || actions?.onTranscriptViewChange || linked.length > 0;
  return <ContextMenu>
    <ContextMenuTrigger render={<span {...p.shell} />}>{p.children}</ContextMenuTrigger>
    {/* pas de retour du focus sur l'onglet : il volerait le champ de renommage */}
    <ContextMenuContent finalFocus={false}>
      {own && <ContextMenuGroup>
        {rename && <ContextMenuItem onClick={() => { window.setTimeout(p.onStartRename, 0); }}>{t("action.rename")}</ContextMenuItem>}
        {actions?.onTranscriptViewChange && <ContextMenuSub>
          <ContextMenuSubTrigger>{t("chat.transcript-view")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup value={actions.transcriptView ?? "normal"}
              onValueChange={(view) => actions.onTranscriptViewChange?.(view as TranscriptView)}>
              {VIEWS.map(view => <ContextMenuRadioItem key={view} value={view}>{t(`chat.transcript-view.${view}`)}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>}
        {linked.length > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger>{t("linkedConversation.title")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {(["parent", "child"] as const).map(direction => {
              const agents = linked.filter(agent => agent.direction === direction);
              return agents.length > 0 && <ContextMenuGroup key={direction}>
                <ContextMenuLabel>{t(direction === "parent" ? "linkedConversation.createdFrom" : "linkedConversation.continuesTo")}</ContextMenuLabel>
                {agents.map(agent => <ContextMenuItem key={agent.id} onClick={() => actions?.onOpenLinked?.(agent.id)}>
                  {agent.provider} · {agent.title}
                </ContextMenuItem>)}
              </ContextMenuGroup>;
            })}
            {actions?.onUnlinkLinked && <>
              <ContextMenuSeparator />
              {/* délier garde les deux chats ; seul le lien disparaît */}
              {linked.map(agent => <ContextMenuItem key={`unlink-${agent.id}`} variant="destructive"
                onClick={() => actions.onUnlinkLinked?.(agent.id)}>
                {t("linkedConversation.unlinkNamed", { provider: agent.provider })}
              </ContextMenuItem>)}
            </>}
          </ContextMenuSubContent>
        </ContextMenuSub>}
      </ContextMenuGroup>}
      {own && controls && <ContextMenuSeparator />}
      {controls && <ContextMenuGroup>
        <ContextMenuItem onClick={() => controls.onTogglePin(chat.id)}>{t(p.pinned ? "chat.unpin-tab" : "chat.pin-tab")}</ContextMenuItem>
        <ContextMenuItem disabled={p.pinned} onClick={() => controls.onClose([chat.id])}>{t("action.close-tab")}</ContextMenuItem>
        <ContextMenuItem onClick={() => controls.onClose(p.visible.filter(other => other.id !== chat.id).map(other => other.id))}>{t("chat.close-other-tabs")}</ContextMenuItem>
        <ContextMenuItem onClick={() => controls.onClose(p.visible.map(other => other.id))}>{t("chat.close-unpinned-tabs")}</ContextMenuItem>
      </ContextMenuGroup>}
    </ContextMenuContent>
  </ContextMenu>;
}
