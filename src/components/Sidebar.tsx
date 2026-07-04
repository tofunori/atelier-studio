import { Thread } from "../lib/ws";

export default function Sidebar(p: {
  threads: Thread[];
  projectRoot: string | null;
  activeId: string | null;
  onOpenProject: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="sidebar">
      <button onClick={p.onOpenProject}>
        {p.projectRoot ? p.projectRoot.split("/").pop() : "Ouvrir un projet…"}
      </button>
      <button onClick={p.onNew} disabled={!p.projectRoot}>
        + Nouveau thread
      </button>
      <ul>
        {p.threads.map((t) => (
          <li
            key={t.id}
            className={t.id === p.activeId ? "active" : ""}
            onClick={() => p.onSelect(t.id)}
          >
            <span className={`dot ${t.provider}`} />
            <span className="title">{t.title}</span>
            {t.status === "running" && <span className="spinner">⟳</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
