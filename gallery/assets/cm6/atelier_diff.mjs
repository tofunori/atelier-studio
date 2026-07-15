import {EditorState, Text} from "@codemirror/state";
import {EditorView, lineNumbers, drawSelection, highlightActiveLine} from "@codemirror/view";
import {defaultKeymap} from "@codemirror/commands";
import {keymap} from "@codemirror/view";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {
  Chunk,
  MergeView,
  getChunks,
  goToNextChunk,
  goToPreviousChunk,
  unifiedMergeView,
} from "@codemirror/merge";
import {languageExtensionFor} from "./studio_editor.mjs";

const DIFF_CONFIG = {scanLimit: 1000, timeout: 250};
const COLLAPSE_UNCHANGED = {margin: 3, minSize: 8};
const ATELIER_HIGHLIGHT_STYLE = HighlightStyle.define([
  {tag: tags.comment, color: "#707985", fontStyle: "italic"},
  {tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: "#e07a5f"},
  {tag: [tags.function(tags.variableName), tags.definition(tags.variableName), tags.labelName], color: "#61afef"},
  {tag: [tags.typeName, tags.className, tags.tagName], color: "#c678dd"},
  {tag: [tags.propertyName, tags.attributeName], color: "#e6c07b"},
  {tag: [tags.variableName, tags.namespace], color: "#d8d3c8"},
  {tag: tags.string, color: "#86c991"},
  {tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#d19a66"},
  {tag: [tags.operator, tags.punctuation, tags.bracket], color: "#abb2bf"},
]);

function fileText(file) {
  return typeof file?.contents === "string" ? file.contents : "";
}

function extensionFor(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1);
}

function textDocument(value) {
  return Text.of(String(value).split("\n"));
}

function changedLineCount(doc, from, to) {
  if (to <= from) return 0;
  const start = Math.min(from, doc.length);
  const end = Math.min(Math.max(start, to - 1), doc.length);
  return doc.lineAt(end).number - doc.lineAt(start).number + 1;
}

function statsFor(before, after) {
  const a = textDocument(before);
  const b = textDocument(after);
  return Chunk.build(a, b, DIFF_CONFIG).reduce((stats, chunk) => {
    stats.deletions += changedLineCount(a, chunk.fromA, chunk.toA);
    stats.additions += changedLineCount(b, chunk.fromB, chunk.toB);
    return stats;
  }, {additions: 0, deletions: 0});
}

function reviewTheme(themeType) {
  const light = themeType === "light";
  const colors = light ? {
    bg: "var(--surface-app, #ffffff)", fg: "var(--text-primary, #24272d)",
    gutter: "var(--text-tertiary, #737982)", border: "var(--border-subtle, #d8dce2)",
    selected: "rgba(56, 132, 255, .18)", active: "rgba(0, 0, 0, .025)",
    add: "rgba(47, 129, 72, .13)", del: "rgba(207, 34, 46, .12)",
    addStrong: "rgba(47, 129, 72, .28)", delStrong: "rgba(207, 34, 46, .26)",
  } : {
    bg: "var(--surface-inset, #1f2023)", fg: "var(--text-primary, #d9dde4)",
    gutter: "var(--text-tertiary, #747b86)", border: "var(--border-subtle, #383c43)",
    selected: "rgba(91, 157, 255, .28)", active: "rgba(255, 255, 255, .025)",
    add: "rgba(46, 160, 67, .15)", del: "rgba(248, 81, 73, .14)",
    addStrong: "rgba(46, 160, 67, .3)", delStrong: "rgba(248, 81, 73, .28)",
  };
  return EditorView.theme({
    "&": {height: "100%", color: colors.fg, backgroundColor: colors.bg},
    ".cm-scroller": {
      fontFamily: "var(--code-font, ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace)",
      fontSize: "12px", lineHeight: "1.58", overflow: "auto",
    },
    ".cm-content": {padding: "8px 0 18px"},
    ".cm-line": {padding: "0 14px 0 8px"},
    "&.cm-focused": {outline: "none"},
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {backgroundColor: colors.selected},
    ".cm-activeLine": {backgroundColor: colors.active},
    ".cm-gutters": {color: colors.gutter, backgroundColor: colors.bg, borderRight: `1px solid ${colors.border}`},
    ".cm-activeLineGutter": {backgroundColor: colors.active},
    "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {backgroundColor: colors.del},
    "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": {backgroundColor: colors.add},
    "&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText": {backgroundColor: colors.delStrong},
    "&.cm-merge-b .cm-changedText": {backgroundColor: colors.addStrong},
    ".cm-collapsedLines": {color: colors.gutter, borderColor: colors.border},
    ".cm-chunkButtons button": {
      color: colors.gutter, backgroundColor: "transparent", border: `1px solid ${colors.border}`,
      borderRadius: "5px", fontFamily: "var(--ui-font, -apple-system, sans-serif)",
    },
  }, {dark: !light});
}

function editorExtensions({ext, wrap, themeType, readOnly = true, unified = false}) {
  const extensions = [
    lineNumbers(), drawSelection(), highlightActiveLine(),
    languageExtensionFor(ext),
    syntaxHighlighting(ATELIER_HIGHLIGHT_STYLE),
    reviewTheme(themeType),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    keymap.of(defaultKeymap),
  ];
  if (wrap) extensions.push(EditorView.lineWrapping);
  if (unified) extensions.push(unifiedMergeView({
    original: unified.original,
    highlightChanges: true,
    gutter: true,
    syntaxHighlightDeletions: true,
    allowInlineDiffs: true,
    mergeControls: false,
    collapseUnchanged: COLLAPSE_UNCHANGED,
    diffConfig: DIFF_CONFIG,
  }));
  return extensions;
}

/**
 * Shared Atelier diff renderer.
 *
 * Review mode is intentionally read-only. The future IDE integration can use
 * the same adapter with readOnly=false and explicit accept/reject controls.
 */
export function mount(host, oldFile, newFile, initialOptions = {}) {
  if (!(host instanceof HTMLElement)) throw new TypeError("CodeMirror diff host is required");
  const before = fileText(oldFile);
  const after = fileText(newFile);
  const ext = extensionFor(newFile) || extensionFor(oldFile);
  const stats = statsFor(before, after);
  let options = {
    layout: initialOptions.layout || initialOptions.diffStyle || "unified",
    wrap: (initialOptions.wrap ?? initialOptions.overflow !== "scroll"),
    themeType: initialOptions.themeType === "light" ? "light" : "dark",
    readOnly: initialOptions.readOnly !== false,
  };
  let instance = null;
  let activeView = null;

  function destroyInstance() {
    if (instance) instance.destroy();
    instance = null;
    activeView = null;
    host.replaceChildren();
  }

  function render() {
    destroyInstance();
    host.dataset.diffLayout = options.layout;
    if (options.layout === "split") {
      instance = new MergeView({
        parent: host,
        a: {doc: before, extensions: editorExtensions({ext, wrap: options.wrap, themeType: options.themeType, readOnly: true})},
        b: {doc: after, extensions: editorExtensions({ext, wrap: options.wrap, themeType: options.themeType, readOnly: options.readOnly})},
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: COLLAPSE_UNCHANGED,
        diffConfig: DIFF_CONFIG,
      });
      activeView = instance.b;
    } else {
      instance = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: after,
          extensions: editorExtensions({
            ext, wrap: options.wrap, themeType: options.themeType, readOnly: options.readOnly,
            unified: {original: before},
          }),
        }),
      });
      activeView = instance;
    }
    const chunks = options.layout === "split" ? instance.chunks : getChunks(activeView.state)?.chunks;
    host.dataset.diffChunks = String(chunks?.length || 0);
  }

  render();
  return {
    stats,
    setOptions(nextOptions = {}) {
      options = {
        ...options,
        layout: nextOptions.layout || nextOptions.diffStyle || options.layout,
        wrap: nextOptions.wrap ?? (nextOptions.overflow ? nextOptions.overflow !== "scroll" : options.wrap),
        themeType: nextOptions.themeType === "light" ? "light" : nextOptions.themeType === "dark" ? "dark" : options.themeType,
      };
      render();
    },
    next() { return activeView ? goToNextChunk(activeView) : false; },
    previous() { return activeView ? goToPreviousChunk(activeView) : false; },
    destroy: destroyInstance,
  };
}
