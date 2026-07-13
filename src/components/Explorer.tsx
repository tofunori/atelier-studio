import { useMemo, useState } from "react";
import { Input } from "./shadcn/input";

type Node = { name: string; path: string; children?: Map<string, Node> };

const ICON_COLORS: Record<string, string> = {
  py: "#5b9dd0", r: "#4a7fb5", jl: "#9a6fb0", md: "#5b9dff", tex: "#3fa66f",
  json: "#c9a54a", html: "#e07b4f", css: "#7a8fd0", js: "#d0c05a", ts: "#5b9dd0",
  pdf: "#d06a6a", png: "#b07fd0", jpg: "#b07fd0", jpeg: "#b07fd0", svg: "#b07fd0",
  sh: "#8fae5a", yml: "#c9a54a", yaml: "#c9a54a", toml: "#c9a54a", csv: "#6fae8f",
  lock: "#8a919e", txt: "#8a919e", rs: "#d0855a",
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const color = ICON_COLORS[ext] ?? "#7a828f";
  if (ext === "md")
    return (
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16">
        <rect x="1" y="3" width="14" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.2" />
        <path d="M3.5 10V6.5l1.7 2 1.7-2V10M11 6.5V10m0 0l-1.4-1.5M11 10l1.4-1.5"
          fill="none" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (["png", "jpg", "jpeg", "svg", "gif", "webp", "pdf"].includes(ext))
    return (
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke={color} strokeWidth="1.2" />
        <circle cx="5.5" cy="6.5" r="1.2" fill={color} />
        <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke={color} strokeWidth="1.1" />
      </svg>
    );
  if (["json", "yml", "yaml", "toml"].includes(ext))
    return (
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16">
        <path d="M6 2.5c-1.5 0-2 1-2 2v2c0 1-.6 1.5-1.5 1.5C3.4 8 4 8.5 4 9.5v2c0 1 .5 2 2 2M10 2.5c1.5 0 2 1 2 2v2c0 1 .6 1.5 1.5 1.5-.9 0-1.5.5-1.5 1.5v2c0 1-.5 2-2 2"
          fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  // code / texte générique
  return (
    <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16">
      <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" fill="none" stroke={color}
        strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
            <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16">
              <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z"
                fill="none" stroke="#7a828f" strokeWidth="1.2" />
            </svg>
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
        <FileIcon name={n.name} />
        <span className="exp-name">{n.name}</span>
      </div>
    );
  }

  return (
    <div className="explorer">
      <Input
        className="exp-search"
        placeholder="Rechercher un fichier…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="exp-tree">
        {matches
          ? matches.map((f) => (
              <div key={f} className="exp-row exp-file" onClick={() => p.onOpen(f)} title={f}>
                <FileIcon name={f} />
                <span className="exp-name">{f}</span>
              </div>
            ))
          : tree.children &&
            sortNodes([...tree.children.values()]).map((c) => renderNode(c, 0))}
      </div>
    </div>
  );
}
