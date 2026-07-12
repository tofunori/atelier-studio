import { eventPreviewText } from "../transport/gatewayClient.ts";
import type { WireEvent } from "../transport/types.ts";

type Props = {
  threadId: string;
  title?: string;
  events: WireEvent[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
};

export function ThreadView(p: Props) {
  return (
    <div className="screen">
      <button type="button" className="back-btn" onClick={p.onBack}>
        ← Conversations
      </button>
      <h1 className="screen-title">{p.title || p.threadId}</h1>
      {p.loading && <div className="empty">Chargement de l'historique…</div>}
      {p.error && (
        <div role="alert" style={{ color: "var(--status-error)" }}>
          {p.error}
        </div>
      )}
      {!p.loading && p.events.length === 0 && !p.error && (
        <div className="empty">Aucun message</div>
      )}
      <div>
        {p.events.map((ev, i) => {
          const key = ev.meta?.eventId ?? `${ev.kind}-${i}`;
          const isUser = ev.kind === "user";
          return (
            <article
              key={key}
              className={`msg ${isUser ? "msg-user" : ""}`}
              aria-label={`${ev.kind}`}
            >
              <div className="msg-kind">{ev.kind}</div>
              <div className="msg-body">{eventPreviewText(ev)}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
