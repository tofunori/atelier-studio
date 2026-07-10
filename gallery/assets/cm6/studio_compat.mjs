// Pure CM5-compat helpers for the CM6 studio engine. No CodeMirror imports —
// unit-testable with plain node.

export function clampPos(pos, lineCount, lineLength) {
  const line = Math.max(0, Math.min(pos.line | 0, lineCount - 1));
  const ch = Math.max(0, Math.min(pos.ch | 0, lineLength(line)));
  return { line, ch };
}

// CM5 CodeMirror.countColumn: column reached at `end` (or at the first
// non-whitespace char when end == null), expanding tabs to tabSize.
export function countColumn(text, end, tabSize) {
  if (end == null) {
    end = text.search(/[^\s ]/);
    if (end === -1) end = text.length;
  }
  let n = 0;
  for (let i = 0; i < end; i += 1) {
    if (text.charAt(i) === "\t") n += tabSize - (n % tabSize);
    else n += 1;
  }
  return n;
}

export function cm5KeyToCm6(name) {
  return name.split("-").map((part, i, all) => {
    if (part === "Esc") return "Escape";
    // last segment: single letters are lowercased (CM6 convention)
    if (i === all.length - 1 && /^[A-Z]$/.test(part)) return part.toLowerCase();
    return part;
  }).join("-");
}

export function posFromIndex(text, index) {
  const offset = Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : 0, text.length));
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) || []).length;
  const lastBreak = before.lastIndexOf("\n");
  return {line, ch: offset - lastBreak - 1};
}

export function indexFromPos(text, pos) {
  const lines = text.split("\n");
  const p = clampPos(pos, lines.length, (line) => lines[line].length);
  let offset = 0;
  for (let line = 0; line < p.line; line += 1) offset += lines[line].length + 1;
  return offset + p.ch;
}
