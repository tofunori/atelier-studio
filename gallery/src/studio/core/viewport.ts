import type {StudioEditor, StudioPosition, StudioRange} from "./editor_contract";

export interface EditorViewportSnapshot {
  anchor: StudioPosition;
  head: StudioPosition;
  left: number;
  top: number;
}

export interface RevealLineRangeOptions {
  fromLine: number;
  toLine?: number;
  contextAfter?: number;
  margin?: number;
  focus?: boolean;
}

function clampLine(editor: StudioEditor, line: number): number {
  return Math.max(0, Math.min(Math.trunc(line) || 0, Math.max(0, editor.lineCount() - 1)));
}

export function captureEditorViewport(editor: StudioEditor): EditorViewportSnapshot {
  const scroll = editor.getScrollInfo();
  return {
    anchor: editor.getCursor("anchor"),
    head: editor.getCursor("head"),
    left: scroll.left,
    top: scroll.top,
  };
}

export function restoreEditorViewport(editor: StudioEditor, snapshot: EditorViewportSnapshot): void {
  editor.operation(() => editor.setSelection(snapshot.anchor, snapshot.head));
  editor.scrollTo(snapshot.left, snapshot.top);
  editor.refresh();
}

export function revealLineRange(editor: StudioEditor, options: RevealLineRangeOptions): StudioRange {
  const fromLine = clampLine(editor, options.fromLine);
  const toLine = clampLine(editor, options.toLine ?? fromLine);
  const scrollLine = clampLine(editor, Math.max(fromLine, toLine) + (options.contextAfter ?? 0));
  const from = {line: Math.min(fromLine, toLine), ch: 0};
  const to = {line: scrollLine, ch: 0};
  editor.setCursor({line: fromLine, ch: 0});
  editor.scrollIntoView({from, to}, options.margin ?? 120);
  if (options.focus) editor.focus();
  return {from, to};
}
