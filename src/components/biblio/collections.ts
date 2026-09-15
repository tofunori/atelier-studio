import type { ZoteroCollection } from "./types";

/** A collection together with its nested descendants. */
export type CollectionTreeNode = {
  collection: ZoteroCollection;
  /** IDs are stringified so number and string payloads address the same node. */
  id: string;
  children: CollectionTreeNode[];
};

/** A tree row, useful when a consumer needs indentation without recursion. */
export type FlattenedCollection = CollectionTreeNode & { depth: number };

/**
 * Build a Zotero collection tree from the flat wire representation.
 *
 * Missing parents are kept as roots (the collection is still useful), and
 * malformed parent cycles are cut at the first edge that would close a cycle.
 * IDs are compared as strings because SQLite/WebSocket payloads can alternate
 * between numeric and string representations. Input order is preserved.
 */
export function buildCollectionTree(collections: readonly ZoteroCollection[]): CollectionTreeNode[] {
  const nodes = new Map<string, CollectionTreeNode>();
  for (const collection of collections) {
    const id = String(collection.id);
    // Duplicate IDs (including 7 and "7") describe one Zotero collection;
    // retain the first wire row rather than rendering duplicate branches.
    if (!nodes.has(id)) nodes.set(id, { collection, id, children: [] });
  }

  const roots: CollectionTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.collection.parent == null ? null : String(node.collection.parent);
    const parent = parentId == null ? null : nodes.get(parentId);
    if (!parent || parent.id === node.id || closesCycle(node.id, parentId, nodes)) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }
  return roots;
}

/** Flatten a tree in display order, carrying each row's nesting depth. */
export function flattenCollectionTree(roots: readonly CollectionTreeNode[]): FlattenedCollection[] {
  const out: FlattenedCollection[] = [];
  const visited = new Set<string>();
  const visit = (node: CollectionTreeNode, depth: number) => {
    // Also guard callers passing a hand-built cyclic tree (the builder above
    // already cuts malformed wire cycles).
    if (visited.has(node.id)) return;
    visited.add(node.id);
    out.push({ ...node, depth });
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}

function closesCycle(nodeId: string, parentId: string | null, nodes: Map<string, CollectionTreeNode>): boolean {
  const seen = new Set<string>([nodeId]);
  let current = parentId;
  while (current != null) {
    if (seen.has(current)) return true;
    seen.add(current);
    const parent = nodes.get(current);
    if (!parent || parent.collection.parent == null) return false;
    current = String(parent.collection.parent);
  }
  return false;
}
