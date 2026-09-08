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
import { IconButton, RowButton } from "../ui";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";

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
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
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
          <RowButton
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
          </RowButton>
          <div className="queued-turn-copy">
            <span className="queued-turn-prompt">{turn.prompt}</span>
            {turn.attachments.length ? (
              <span className="queued-turn-context">
                {t("queue.context-count", { count: String(turn.attachments.length) })}
              </span>
            ) : null}
          </div>
          <div className="queued-turn-actions">
            <RowButton
              className="queued-turn-steer"
              title={t("action.send-now")}
              onClick={() => onSteer(turn.id)}
            >
              <CornerUpRightIcon aria-hidden="true" />
              <span>{t("queue.send-now")}</span>
            </RowButton>
            <IconButton
              className="queued-turn-icon"
              onClick={() => onRemove(turn.id)}
              label={t("queue.delete")}
              title={t("queue.delete")}
            >
              <Trash2Icon aria-hidden="true" />
            </IconButton>
            <LazyDropdownMenu
              open={menuOpen === turn.id}
              onOpenChange={(open) => setMenuOpen(open ? turn.id : null)}
              side="top"
              align="end"
              sideOffset={6}
              className="queued-turn-menu tw:w-48"
              label={t("queue.more")}
              trigger={
                <RowButton className="queued-turn-icon" aria-label={t("queue.more")} title={t("queue.more")}>
                  <MoreHorizontalIcon aria-hidden="true" />
                </RowButton>
              }
              items={[
                {
                  key: "edit",
                  label: (
                    <>
                      <PencilIcon aria-hidden="true" />
                      <span>{t("queue.edit")}</span>
                    </>
                  ),
                  onSelect: () => onEdit(turn.id),
                },
                ...(onFollowUpModeChange
                  ? [
                      {
                        key: "follow-up",
                        label: (
                          <>
                            <CornerUpRightIcon aria-hidden="true" />
                            <span>{t(followUpMode === "queue" ? "queue.disable" : "queue.enable")}</span>
                          </>
                        ),
                        onSelect: () => onFollowUpModeChange(followUpMode === "queue" ? "steer" : "queue"),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
