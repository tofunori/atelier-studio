// Explorer (plan 021) — arbre de fichiers du patron ARIA `tree`.
// Avant : 100 % souris (aucun role, aucun tabIndex, aucun onKeyDown). Le
// modèle retenu est celui de l'APG : UNE seule tabulation entre dans l'arbre
// (roving tabindex), puis les flèches déplacent le focus. La liste des nœuds
// VISIBLES (`visibleRows`) est la source de vérité de la navigation ; le rendu
// récursif et cette liste partagent `sortNodes`, donc ordre visuel = ordre de
// tabulation/flèches.
import { Fragment, useMemo, useRef, useState } from "react";
import { SearchField } from "./ui/SearchField";
import { RowButton } from "./ui";
import { t } from "../lib/i18n";
import "../styles/explorer.css";
import { FileGlyph } from "./fileGlyphs";
import { ChevronIcon } from "./icons";

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

function FileIcon({ name }: { name: string }) {
  return <FileGlyph className="exp-ico" name={name} size={14} />;
}

function FolderIcon() {
  return <FileGlyph className="exp-ico" kind="folder" size={14} />;
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
  /** Fichier affiché dans le volet actif : sa rangée porte le repère de
   *  sélection (SHELL-27). */
  openPath?: string | null;
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
      "aria-current": !row.isDir && row.path === p.openPath ? ("page" as const) : undefined,
      "data-open": !row.isDir && row.path === p.openPath ? "true" : undefined,
      tabIndex: row.path === current ? 0 : -1,
      style: { paddingLeft: row.depth * 12 + 8 },
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
            <span className="exp-chev" aria-hidden="true"><ChevronIcon size={12} open={open} /></span>
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
      <SearchField
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
          ? rows.map((row) => {
              // en recherche : le NOM d'abord (jamais rogné par un long
              // chemin), le dossier en méta ; le nom accessible reste le chemin
              const cut = row.path.lastIndexOf("/");
              const name = cut >= 0 ? row.path.slice(cut + 1) : row.path;
              const dir = cut >= 0 ? row.path.slice(0, cut) : "";
              return (
                <RowButton key={row.path} className="exp-row exp-file" title={row.path} aria-label={row.path} {...rowProps(row)}>
                  <FileIcon name={name} />
                  <span className="exp-name">{name}</span>
                  {dir && <span className="exp-dir">{dir}</span>}
                </RowButton>
              );
            })
          : roots.map((c, i) => renderNode(c, 0, null, i + 1, roots.length))}
        {matches && matches.length === 0 && (
          <p className="exp-empty" role="status">{t("atelier.explorer-no-match")}</p>
        )}
      </div>
    </div>
  );
}
