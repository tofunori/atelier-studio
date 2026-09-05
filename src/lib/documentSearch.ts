/** DOM ranges across inline elements; the rendered text remains owned by React. */
function normalized(raw: string): {text: string; map: number[]} {
  const map: number[] = []; let text = "";
  for (let i = 0; i < raw.length; i++) {
    for (const c of raw[i].normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()) {
      const ch = /[\p{L}\p{N}]/u.test(c) ? c : " ";
      if (ch === " " && (!text || text.endsWith(" "))) continue;
      text += ch; map.push(i);
    }
  }
  return {text: text.trimEnd(), map};
}
export function findDocumentRanges(root: HTMLElement, query: string, limit = 1000): Range[] {
  const needle = normalized(query).text;
  if (!needle) return [];
  const nodes: Array<{node: Text; start: number; end: number}> = [];
  let raw = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let previousBlock: Element | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    if (node.parentElement?.closest(".katex-mathml,script,style")) continue;
    const block = node.parentElement?.closest("p,li,h1,h2,h3,h4,h5,h6,td,th,pre") || null;
    if (previousBlock && block !== previousBlock) raw += "\n";
    nodes.push({node, start: raw.length, end: raw.length + node.length});
    raw += node.data; previousBlock = block;
  }
  const haystack = normalized(raw), result: Range[] = [];
  for (let pos = haystack.text.indexOf(needle); pos >= 0 && result.length < limit; pos = haystack.text.indexOf(needle, pos + needle.length)) {
    const start = haystack.map[pos], end = haystack.map[pos + needle.length - 1] + 1;
    const first = nodes.find(n => n.end > start), last = nodes.find(n => n.end >= end);
    if (!first || !last) continue;
    const range = document.createRange(); range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
    result.push(range);
  }
  return result;
}
export function clearDocumentHighlights(root: HTMLElement, name: string) {
  (globalThis.CSS as any)?.highlights?.delete(name);
  for (const element of [root, ...root.querySelectorAll(`[data-${name}]`)]) {
    if (!element.hasAttribute(`data-${name}`)) continue;
    element.classList.remove(name); element.removeAttribute(`data-${name}`);
  }
}
export function highlightDocumentRanges(root: HTMLElement, name: string, ranges: Range[]) {
  const registry = (globalThis.CSS as any)?.highlights;
  const HighlightClass = (window as any).Highlight;
  if (registry && HighlightClass) { registry.set(name, new HighlightClass(...ranges)); return; }
  // Older engines highlight enclosing inline elements. Do not split or
  // reparent Text nodes: React must retain ownership when content changes.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (ranges.some(range => range.intersectsNode(node))) {
      const element = node.parentElement;
      element?.classList.add(name); element?.setAttribute(`data-${name}`, "");
    }
  }
}
