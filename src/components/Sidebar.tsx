import { Thread } from "../lib/ws";

export default function Sidebar(p: {
  projects: string[];
  threads: Thread[];
  activeProject: string | null;
  activeId: string | null;
  onAddProject: () => void;
  onSelectProject: (root: string) => void;
  onSelect: (threadId: string, projectRoot: string) => void;
  onNew: (projectRoot: string) => void;
}) {
  return (
    <div className="sidebar">
      <div className="section">Projets</div>
      {p.projects.map((root) => {
        const name = root.split("/").pop();
        const threads = p.threads.filter((t) => t.projectRoot === root);
        const active = root === p.activeProject;
        return (
          <div key={root} className="project">
            <div
              className={`project-name ${active ? "active" : ""}`}
              onClick={() => p.onSelectProject(root)}
            >
              📁 {name}
              {active && (
                <button
                  className="mini"
                  title="Nouveau chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onNew(root);
                  }}
                >
                  +
                </button>
              )}
            </div>
            <ul>
              {threads.map((t) => (
                <li
                  key={t.id}
                  className={t.id === p.activeId ? "active" : ""}
                  onClick={() => p.onSelect(t.id, root)}
                >
                  <span className={`dot ${t.provider}`} />
                  <span className="title">{t.title}</span>
                  {t.status === "running" && <span className="spinner">⟳</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <button onClick={p.onAddProject}>+ Ajouter un projet…</button>
    </div>
  );
}
