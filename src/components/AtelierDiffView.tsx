import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, lineNumbers } from "@codemirror/view";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { codeHighlight } from "../lib/codeHighlight";

export type AtelierDiffLayout = "unified" | "split";

export type AtelierDiffViewProps = {
  before: string;
  after: string;
  path?: string;
  layout?: AtelierDiffLayout;
  wrap?: boolean;
  compact?: boolean;
  className?: string;
};

const mergeOptions = {
  highlightChanges: true,
  gutter: true,
  collapseUnchanged: { margin: 3, minSize: 8 },
  diffConfig: { scanLimit: 1000, timeout: 250 },
} as const;

function diffTheme(compact: boolean) {
  return EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--fg, #d9dde4)",
      backgroundColor: "var(--bg, #1f2023)",
    },
    ".cm-scroller": {
      fontFamily: "var(--code-font, ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace)",
      fontSize: compact ? "11px" : "12px",
      lineHeight: "1.58",
      overflow: "auto",
    },
    ".cm-content": { padding: compact ? "5px 0 10px" : "8px 0 18px" },
    ".cm-line": { padding: "0 12px 0 8px" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      color: "var(--muted2, #747b86)",
      backgroundColor: "var(--bg, #1f2023)",
      borderRight: "1px solid var(--border, #383c43)",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--fg) 3%, transparent)" },
    "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": { backgroundColor: "rgba(248, 81, 73, .14)" },
    "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": { backgroundColor: "rgba(46, 160, 67, .15)" },
    "&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText": { backgroundColor: "rgba(248, 81, 73, .28)" },
    "&.cm-merge-b .cm-changedText": { backgroundColor: "rgba(46, 160, 67, .3)" },
    ".cm-collapsedLines": { color: "var(--muted2)", borderColor: "var(--border)" },
  }, { dark: true });
}

function extensions(wrap: boolean, compact: boolean, path?: string, original?: string) {
  const result = [
    lineNumbers(),
    drawSelection(),
    diffTheme(compact),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    codeHighlight(path),
  ];
  if (wrap) result.push(EditorView.lineWrapping);
  if (original !== undefined) result.push(unifiedMergeView({
    original,
    ...mergeOptions,
    syntaxHighlightDeletions: true,
    allowInlineDiffs: true,
    mergeControls: false,
  }));
  return result;
}

export default function AtelierDiffView({
  before,
  after,
  path,
  layout = "unified",
  wrap = true,
  compact = false,
  className = "",
}: AtelierDiffViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let instance: EditorView | MergeView;
    if (layout === "split") {
      instance = new MergeView({
        parent: host,
        a: { doc: before, extensions: extensions(wrap, compact, path) },
        b: { doc: after, extensions: extensions(wrap, compact, path) },
        ...mergeOptions,
      });
    } else {
      instance = new EditorView({
        parent: host,
        state: EditorState.create({ doc: after, extensions: extensions(wrap, compact, path, before) }),
      });
    }
    return () => instance.destroy();
  }, [after, before, compact, layout, path, wrap]);

  return (
    <div
      ref={hostRef}
      className={`atelier-diff-view${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      data-layout={layout}
      aria-label={path ? `Diff ${path}` : "Diff"}
    />
  );
}
