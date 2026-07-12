import type { ThreadSummary } from "../transport/types.ts";

type Props = {
  threads: ThreadSummary[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onRefresh: () => void;
};

export function ThreadList(p: Props) {
  return (
    <div className="screen">
      <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="screen-title" style={{ margin: 0 }}>
          Chats
        </h1>
        <button type="button" className="btn btn-ghost" onClick={p.onRefresh} disabled={p.loading}>
          Actualiser
        </button>
      </div>
      {p.error && (
        <div role="alert" style={{ color: "var(--status-error)", marginBottom: 12 }}>
          {p.error}
        </div>
      )}
      {p.loading && p.threads.length === 0 && <div className="empty">Chargement…</div>}
      {!p.loading && p.threads.length === 0 && !p.error && (
        <div className="empty">Aucune conversation</div>
      )}
      <ul className="list">
        {p.threads.map((t) => (
          <li key={t.id}>
            <button type="button" className="list-item" onClick={() => p.onOpen(t.id)}>
              <span className="list-item-title">{t.title || t.id}</span>
              <span className="list-item-meta">
                {t.provider} · seq {t.lastSequence} · {t.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
