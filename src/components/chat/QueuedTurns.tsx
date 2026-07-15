import type { QueuedTurn } from "../../lib/chatDraftStore";
import { t } from "../../lib/i18n";

function QueueIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.7" />
      <path d="M8 4.8v3.5l2.3 1.4" />
    </svg>
  );
}
export function QueuedTurns({ turns, onSteer, onEdit, onRemove }: {
  turns: QueuedTurn[];
  onSteer: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!turns.length) return null;
  return (
    <section className="queued-turns" aria-label={t("queue.section-label")}>
      <div className="queued-turns-head">
        <QueueIcon />
        <span>{t("queue.heading", { count: String(turns.length) })}</span>
      </div>
      {turns.map((turn) => (
        <div className="queued-turn" data-testid="queued-follow-up-row" key={turn.id}>
          <div className="queued-turn-copy">
            <span className="queued-turn-prompt">{turn.prompt}</span>
            {turn.attachments.length ? (
              <span className="queued-turn-context">
                {t("queue.context-count", { count: String(turn.attachments.length) })}
              </span>
            ) : null}
          </div>
          <div className="queued-turn-actions">
            <button type="button" className="queued-turn-steer" title={t("action.send-now")} onClick={() => onSteer(turn.id)}>
              {t("queue.send-now")}
            </button>
            <button type="button" onClick={() => onEdit(turn.id)} aria-label={t("queue.edit")} title={t("queue.edit")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11.8l-.4 2 2-.4 7.7-7.7-1.6-1.6z"/><path d="M9.8 5l1.6 1.6"/></svg>
            </button>
            <button type="button" onClick={() => onRemove(turn.id)} aria-label={t("queue.delete")} title={t("queue.delete")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 4.5h9M6 2.8h4M5 4.5l.5 8h5l.5-8"/></svg>
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
