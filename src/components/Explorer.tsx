import { useMemo, useState } from "react";

type Node = { name: string; path: string; children?: Map<string, Node> };

function buildTree(files: string[]): Node {
  const root: Node = { name: "", path: "", children: new Map() };
  for (const f of files) {
    let cur = root;
    const parts = f.split("/");
    parts.forEach((part, i) => {
      if (!cur.children) cur.children = new Map();
      const path = parts.slice(0, i + 1).join("/");
      if (!cur.children.has(part)) {
        cur.children.set(part, {
          name: part,
          path,
          ...(i < parts.length - 1 ? { children: new Map() } : {}),
        });
      }
      cur = cur.children.get(part)!;
      if (i < parts.length - 1 && !cur.children) cur.children = new Map();
    });
  }
  return root;
}

function sortNodes(nodes: Node[]): Node[] {
  return nodes.sort((a, b) => {
    const da = a.children ? 0 : 1;
    const db = b.children ? 0 : 1;
    return da !== db ? da - db : a.name.localeCompare(b.name);
  });
}

export default function Explorer(p: {
  files: string[];
  onOpen: (rel: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(p.files), [p.files]);

  const matches = useMemo(
    () =>
      query.trim()
        ? p.files.filter((f) => f.toLowerCase().includes(query.toLowerCase())).slice(0, 200)
        : null,
    [query, p.files],
  );

  function toggle(path: string) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  function renderNode(n: Node, depth: number): React.ReactNode {
    if (n.children) {
      const open = expanded.has(n.path);
      return (
        <div key={n.path}>
          <div className="exp-row" style={{ paddingLeft: depth * 14 + 8 }} onClick={() => toggle(n.path)}>
            <span className="exp-chev">{open ? "▾" : "▸"}</span>
            <span className="exp-name">{n.name}</span>
          </div>
          {open &&
            sortNodes([...n.children.values()]).map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    return (
      <div
        key={n.path}
        className="exp-row exp-file"
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => p.onOpen(n.path)}
        title={n.path}
      >
        <span className="exp-name">{n.name}</span>
      </div>
    );
  }

  return (
    <div className="explorer">
      <input
        className="exp-search"
        placeholder="Rechercher un fichier…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="exp-tree">
        {matches
          ? matches.map((f) => (
              <div key={f} className="exp-row exp-file" onClick={() => p.onOpen(f)} title={f}>
                <span className="exp-name">{f}</span>
              </div>
            ))
          : tree.children &&
            sortNodes([...tree.children.values()]).map((c) => renderNode(c, 0))}
      </div>
    </div>
  );
}
