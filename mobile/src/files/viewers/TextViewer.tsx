import { useMemo, useState } from "react";

type Props = {
  text: string;
  name: string;
  showLineNumbers?: boolean;
};

export function TextViewer(p: Props) {
  const [q, setQ] = useState("");
  const [showLines, setShowLines] = useState(p.showLineNumbers ?? true);

  const lines = useMemo(() => p.text.replace(/\r\n/g, "\n").split("\n"), [p.text]);
  const matchCount = useMemo(() => {
    if (!q) return 0;
    const lower = q.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(lower)).length;
  }, [lines, q]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="viewer-text">
      <div className="viewer-toolbar">
        <input
          className="viewer-search"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Rechercher dans le fichier"
        />
        <button type="button" className="btn btn-ghost" onClick={() => setShowLines((v) => !v)}>
          {showLines ? "N°" : "—"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
          Copier
        </button>
        {q && <span className="viewer-meta">{matchCount} lignes</span>}
      </div>
      <pre className="viewer-text-body">
        {lines.map((line, i) => {
          const hit = q && line.toLowerCase().includes(q.toLowerCase());
          return (
            <div key={i} className={hit ? "line-hit" : undefined}>
              {showLines && <span className="line-no">{i + 1}</span>}
              <span className="line-txt">{line || " "}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
