import { useState } from "react";
import {
  CornerUpRightIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import type { FollowUpMode, QueuedTurn } from "../../lib/chatDraftStore";
import { t } from "../../lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shadcn/dropdown-menu";

export function QueuedTurns({
  turns,
  onSteer,
  onEdit,
  onRemove,
  onReorder,
  followUpMode,
  onFollowUpModeChange,
}: {
  turns: QueuedTurn[];
  onSteer: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  followUpMode: FollowUpMode;
  onFollowUpModeChange?: (mode: FollowUpMode) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (!turns.length) return null;

  return (
    <section className="queued-turns" aria-label={t("queue.section-label")}>
      {turns.map((turn) => (
        <div
          className={`queued-turn ${overId === turn.id && draggedId !== turn.id ? "is-drag-over" : ""}`}
          data-testid="queued-follow-up-row"
          key={turn.id}
          onDragOver={(event) => {
            if (!draggedId || draggedId === turn.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setOverId(turn.id);
          }}
          onDragLeave={() => setOverId((current) => current === turn.id ? null : current)}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedId && draggedId !== turn.id) onReorder(draggedId, turn.id);
            setDraggedId(null);
            setOverId(null);
          }}
        >
          <button
            type="button"
            className="queued-turn-drag"
            draggable
            aria-label={t("queue.drag")}
            title={t("queue.drag")}
            onDragStart={(event) => {
              setDraggedId(turn.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", turn.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setOverId(null);
            }}
          >
            <GripVerticalIcon aria-hidden="true" />
          </button>
          <div className="queued-turn-copy">
            <span className="queued-turn-prompt">{turn.prompt}</span>
            {turn.attachments.length ? (
              <span className="queued-turn-context">
                {t("queue.context-count", { count: String(turn.attachments.length) })}
              </span>
            ) : null}
          </div>
          <div className="queued-turn-actions">
            <button
              type="button"
              className="queued-turn-steer"
              title={t("action.send-now")}
              onClick={() => onSteer(turn.id)}
            >
              <CornerUpRightIcon aria-hidden="true" />
              <span>{t("queue.send-now")}</span>
            </button>
            <button
              type="button"
              className="queued-turn-icon"
              onClick={() => onRemove(turn.id)}
              aria-label={t("queue.delete")}
              title={t("queue.delete")}
            >
              <Trash2Icon aria-hidden="true" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <button type="button" className="queued-turn-icon" aria-label={t("queue.more")} title={t("queue.more")}>
                    <MoreHorizontalIcon aria-hidden="true" />
                  </button>
                )}
              />
              <DropdownMenuContent side="top" align="end" sideOffset={6} className="queued-turn-menu tw:w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onEdit(turn.id)}>
                    <PencilIcon aria-hidden="true" />
                    <span>{t("queue.edit")}</span>
                  </DropdownMenuItem>
                  {onFollowUpModeChange ? (
                    <DropdownMenuItem onClick={() => onFollowUpModeChange(followUpMode === "queue" ? "steer" : "queue")}>
                      <CornerUpRightIcon aria-hidden="true" />
                      <span>{t(followUpMode === "queue" ? "queue.disable" : "queue.enable")}</span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </section>
  );
}
