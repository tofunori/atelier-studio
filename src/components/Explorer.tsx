// Explorer (plan 021) — arbre de fichiers du patron ARIA `tree`.
// Avant : 100 % souris (aucun role, aucun tabIndex, aucun onKeyDown). Le
// modèle retenu est celui de l'APG : UNE seule tabulation entre dans l'arbre
// (roving tabindex), puis les flèches déplacent le focus. La liste des nœuds
// VISIBLES (`visibleRows`) est la source de vérité de la navigation ; le rendu
// récursif et cette liste partagent `sortNodes`, donc ordre visuel = ordre de
// tabulation/flèches.
import { Fragment, useMemo, useRef, useState } from "react";
import { Input } from "./shadcn/input";
import { RowButton } from "./ui";
import { t } from "../lib/i18n";
import "../styles/explorer.css";

type Node = { name: string; path: string; children?: Map<string, Node> };

/** Un nœud visible de l'arbre, tel qu'il est atteignable au clavier.
 * `pos`/`size` décrivent la FRATRIE du nœud (pas la liste visible globale) :
 * dans un arbre aplati, c'est la seule façon d'annoncer « 3 sur 7 ». */
type Row = {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
  open: boolean;
  parent: string | null;
  pos: number;
  size: number;
};

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
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="3" width="14" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.2" />
        <path d="M3.5 10V6.5l1.7 2 1.7-2V10M11 6.5V10m0 0l-1.4-1.5M11 10l1.4-1.5"
          fill="none" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (["png", "jpg", "jpeg", "svg", "gif", "webp", "pdf"].includes(ext))
    return (
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke={color} strokeWidth="1.2" />
        <circle cx="5.5" cy="6.5" r="1.2" fill={color} />
        <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke={color} strokeWidth="1.1" />
      </svg>
    );
  if (["json", "yml", "yaml", "toml"].includes(ext))
    return (
      <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 2.5c-1.5 0-2 1-2 2v2c0 1-.6 1.5-1.5 1.5C3.4 8 4 8.5 4 9.5v2c0 1 .5 2 2 2M10 2.5c1.5 0 2 1 2 2v2c0 1 .6 1.5 1.5 1.5-.9 0-1.5.5-1.5 1.5v2c0 1-.5 2-2 2"
          fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  // code / texte générique
  return (
    <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" fill="none" stroke={color}
        strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="exp-ico" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z"
        fill="none" stroke="#7a828f" strokeWidth="1.2" />
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

function childrenOf(n: Node): Node[] {
  return sortNodes([...(n.children?.values() ?? [])]);
}

/** Nœuds visibles, dans l'ordre d'affichage — base de la navigation clavier. */
function visibleRows(root: Node, expanded: Set<string>): Row[] {
  const out: Row[] = [];
  const walk = (nodes: Node[], depth: number, parent: string | null) => {
    nodes.forEach((n, i) => {
      const isDir = !!n.children;
      const open = isDir && expanded.has(n.path);
      out.push({ path: n.path, name: n.name, depth, isDir, open, parent, pos: i + 1, size: nodes.length });
      if (open) walk(childrenOf(n), depth + 1, n.path);
    });
  };
  walk(childrenOf(root), 0, null);
  return out;
}

export default function Explorer(p: {
  files: string[];
  onOpen: (rel: string) => void;
  /** Le dépôt dépasse le plafond du catalogue : l'arbre est incomplet. */
  truncated?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // nœud porteur du focus clavier (roving tabindex)
  const [active, setActive] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(p.files), [p.files]);
  const roots = useMemo(() => childrenOf(tree), [tree]);

  const matches = useMemo(
    () =>
      query.trim()
        ? p.files.filter((f) => f.toLowerCase().includes(query.toLowerCase())).slice(0, 200)
        : null,
    [query, p.files],
  );

  // en recherche, l'arbre se réduit à une liste plate de fichiers : même
  // contrat clavier, un seul niveau.
  const rows = useMemo<Row[]>(
    () =>
      matches
        ? matches.map((f, i) => ({
            path: f, name: f, depth: 0, isDir: false, open: false, parent: null,
            pos: i + 1, size: matches.length,
          }))
        : visibleRows(tree, expanded),
    [matches, tree, expanded],
  );

  // roving tabindex : exactement un nœud tabbable — le nœud courant tant qu'il
  // reste visible, sinon le premier de la liste.
  const current = (active && rows.some((r) => r.path === active) ? active : rows[0]?.path) ?? null;

  const refs = useRef(new Map<string, HTMLButtonElement>());
  const typed = useRef({ q: "", at: 0 });

  function toggle(path: string) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  function focusRow(path: string) {
    setActive(path);
    refs.current.get(path)?.focus();
  }

  function activate(row: Row) {
    if (row.isDir) toggle(row.path);
    else p.onOpen(row.path);
  }

  /** Saisie rapide : les premières lettres amènent au nœud visible suivant. */
  function typeahead(key: string, index: number): boolean {
    if (key.length !== 1 || key === " ") return false;
    const now = Date.now();
    typed.current.q = now - typed.current.at > 900 ? key : typed.current.q + key;
    typed.current.at = now;
    const q = typed.current.q.toLowerCase();
    // une même lettre répétée = parcours des nœuds qui commencent par elle
    const same = [...q].every((c) => c === q[0]);
    const needle = same ? q[0] : q;
    const from = same ? index + 1 : index;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[(from + i + rows.length) % rows.length];
      if (r.name.toLowerCase().startsWith(needle)) {
        focusRow(r.path);
        return true;
      }
    }
    return false;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const index = rows.findIndex((r) => r.path === current);
    if (index < 0) return;
    const row = rows[index];
    const go = (i: number) => {
      const target = rows[Math.min(Math.max(i, 0), rows.length - 1)];
      if (target) focusRow(target.path);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(index + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        go(index - 1);
        return;
      case "Home":
        e.preventDefault();
        go(0);
        return;
      case "End":
        e.preventDefault();
        go(rows.length - 1);
        return;
      case "ArrowRight":
        if (!row.isDir) return;
        e.preventDefault();
        if (row.open) go(index + 1); // déjà déplié : descendre au premier enfant
        else toggle(row.path);
        return;
      case "ArrowLeft":
        if (row.isDir && row.open) {
          e.preventDefault();
          toggle(row.path);
        } else if (row.parent) {
          e.preventDefault();
          focusRow(row.parent);
        }
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(row);
        return;
      default:
        if (typeahead(e.key, index)) e.preventDefault();
    }
  }

  function rowProps(row: Row) {
    return {
      ref: (el: HTMLButtonElement | null) => {
        if (el) refs.current.set(row.path, el);
        else refs.current.delete(row.path);
      },
      role: "treeitem",
      "aria-level": row.depth + 1,
      "aria-posinset": row.pos,
      "aria-setsize": row.size,
      "aria-selected": row.path === current,
      "aria-expanded": row.isDir ? row.open : undefined,
      tabIndex: row.path === current ? 0 : -1,
      style: { paddingLeft: row.depth * 14 + 8 },
      onFocus: () => setActive(row.path),
      onClick: () => activate(row),
    } as const;
  }

  // ARBRE APLATI (assumé jusqu'au bout) : tous les treeitem sont enfants
  // directs de role="tree", sans role="group" intermédiaire. Un groupe ne peut
  // pas être l'ENFANT DOM de son treeitem ici — la rangée est un RowButton
  // (contrat design) et un bouton ne contient pas d'interactifs ; un groupe
  // frère, lui, n'est rattaché à aucun parent et n'apprendrait rien à personne.
  // La hiérarchie est donc portée entièrement par aria-level + aria-posinset/
  // aria-setsize (fratrie) + aria-expanded.
  function renderNode(n: Node, depth: number, parent: string | null, pos: number, size: number): React.ReactNode {
    const isDir = !!n.children;
    const open = isDir && expanded.has(n.path);
    const row: Row = { path: n.path, name: n.name, depth, isDir, open, parent, pos, size };
    const item = (
      <RowButton className={isDir ? "exp-row" : "exp-row exp-file"} title={isDir ? undefined : n.path} {...rowProps(row)}>
        {isDir ? (
          <>
            <span className="exp-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
            <FolderIcon />
          </>
        ) : (
          <FileIcon name={n.name} />
        )}
        <span className="exp-name">{n.name}</span>
      </RowButton>
    );
    if (!isDir) return <Fragment key={n.path}>{item}</Fragment>;
    const kids = open ? childrenOf(n) : [];
    return (
      <Fragment key={n.path}>
        {item}
        {kids.map((c, i) => renderNode(c, depth + 1, n.path, i + 1, kids.length))}
      </Fragment>
    );
  }

  return (
    <div className="explorer">
      <Input
        className="exp-search"
        placeholder={t("home.search-file")}
        aria-label={t("home.search-file")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* Une troncature muette fait passer un fichier absent pour un fichier
          inexistant — vécu le 2026-09-02 sur un dépôt de 24 414 fichiers, où
          l'arbre en cachait les deux tiers sans le dire. */}
      {p.truncated && (
        <p className="exp-tronque" role="status">{t("atelier.explorer-truncated")}</p>
      )}
      <div className="exp-tree" role="tree" aria-label={t("atelier.file-explorer")} onKeyDown={onKeyDown}>
        {matches
          ? rows.map((row) => (
              <RowButton key={row.path} className="exp-row exp-file" title={row.path} {...rowProps(row)}>
                <FileIcon name={row.name} />
                <span className="exp-name">{row.name}</span>
              </RowButton>
            ))
          : roots.map((c, i) => renderNode(c, 0, null, i + 1, roots.length))}
      </div>
    </div>
  );
}
