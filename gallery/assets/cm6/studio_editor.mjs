// studio_editor.mjs — CM6 engine wearing a CM5 façade, sized to exactly the
// API surface latex_studio.html uses (inventoried 2026-07-07). Not a general
// CM5 shim: methods the page doesn't call don't exist here.
import {EditorState, StateEffect, StateField, Compartment, Prec, Annotation, RangeSet} from "@codemirror/state";
import {EditorView, Decoration, keymap, highlightActiveLine, highlightActiveLineGutter,
        lineNumbers, drawSelection, gutter, GutterMarker, WidgetType, ViewPlugin} from "@codemirror/view";
import {defaultKeymap, historyKeymap, history, indentWithTab, selectAll} from "@codemirror/commands";
import {openSearchPanel, searchKeymap, highlightSelectionMatches} from "@codemirror/search";
import {bracketMatching, foldGutter, foldKeymap, StreamLanguage, indentUnit,
        HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
import {python} from "@codemirror/lang-python";
import {markdown} from "@codemirror/lang-markdown";
import {javascript} from "@codemirror/lang-javascript";
import {stex} from "@codemirror/legacy-modes/mode/stex";
import {r} from "@codemirror/legacy-modes/mode/r";
import {julia} from "@codemirror/legacy-modes/mode/julia";
import {shell} from "@codemirror/legacy-modes/mode/shell";
import {yaml} from "@codemirror/legacy-modes/mode/yaml";
import {toml} from "@codemirror/legacy-modes/mode/toml";
import {ghostAiExtension} from "./ghost_ai.mjs";
import {clampPos, countColumn, cm5KeyToCm6, createOperationBatcher} from "./studio_compat.mjs";

export const Pass = Symbol("CodeMirror.Pass");
export { countColumn };

export function languageKindFor(ext) {
  switch (ext === "R" ? "r" : String(ext || "").toLowerCase()) {
    case "py": return "python";
    case "md": return "markdown";
    case "js": return "javascript";
    case "ts": return "typescript";
    case "json": return "json";
    case "tex": case "sty": case "bib": return "stex";
    case "r": return "r";
    case "jl": return "julia";
    case "sh": case "bash": return "shell";
    case "yaml": case "yml": return "yaml";
    case "toml": return "toml";
    default: return "plain";
  }
}

function languageFor(ext) {
  switch (languageKindFor(ext)) {
    case "python": return python();
    case "markdown": return markdown();
    case "javascript": return javascript();
    case "typescript": return javascript({typescript: true});
    case "json": return javascript({json: true});
    case "stex": return StreamLanguage.define(stex);
    case "r": return StreamLanguage.define(r);
    case "julia": return StreamLanguage.define(julia);
    case "shell": return StreamLanguage.define(shell);
    case "yaml": return StreamLanguage.define(yaml);
    case "toml": return StreamLanguage.define(toml);
    default: return [];
  }
}

// Precision Native — quatre thèmes exclusivement sombres, partagés par toutes
// les surfaces CM6. La couleur encode la structure scientifique sans créer un
// arc-en-ciel. `swatches` alimente le petit aperçu du sélecteur.
export const STUDIO_THEMES = [
  {id: "graphite", label: "Graphite", swatches: ["#d6a467", "#86aee8", "#a9c181"]},
  {id: "obsidian", label: "Obsidian", swatches: ["#c792ea", "#82aaff", "#c3e88d"]},
  {id: "midnight", label: "Midnight", swatches: ["#81a1c1", "#88c0d0", "#a3be8c"]},
  {id: "carbon", label: "Carbon", swatches: ["#e58b57", "#d7b26d", "#a8b886"]},
];

const THEME_PALETTES = {
  graphite: {
    bg: "#1e2126", fg: "#d9dee7", gutter: "#606a79", gutterActive: "#aeb8c6",
    accent: "#e7b75e", selection: "#354b66", active: "rgba(134, 174, 232, .055)",
    panel: "#181b20", surface: "#20242a", border: "#363d48",
    comment: "#6f7b8b", keyword: "#d6a467", fn: "#86aee8", type: "#e5bd78",
    prop: "#8fc6c3", string: "#a9c181", number: "#c7a0d8", punct: "#9aa4b2", meta: "#79b8d1",
  },
  obsidian: {
    bg: "#0f1115", fg: "#d5dae3", gutter: "#515a68", gutterActive: "#a9b4c3",
    accent: "#82aaff", selection: "#243958", active: "rgba(130, 170, 255, .065)",
    panel: "#0b0d11", surface: "#171a21", border: "#2b313c",
    comment: "#596573", keyword: "#c792ea", fn: "#82aaff", type: "#ffc777",
    prop: "#89ddff", string: "#c3e88d", number: "#f78c6c", punct: "#939cab", meta: "#89ddff",
  },
  midnight: {
    bg: "#111820", fg: "#d4dde8", gutter: "#536172", gutterActive: "#b1bfce",
    accent: "#88c0d0", selection: "#21415a", active: "rgba(136, 192, 208, .065)",
    panel: "#0c1218", surface: "#17212b", border: "#2c3947",
    comment: "#5e6d7e", keyword: "#81a1c1", fn: "#88c0d0", type: "#ebcb8b",
    prop: "#8fbcbb", string: "#a3be8c", number: "#b48ead", punct: "#8f9baa", meta: "#5e81ac",
  },
  carbon: {
    bg: "#141311", fg: "#e4dfd7", gutter: "#665f56", gutterActive: "#c2b9ad",
    accent: "#e58b57", selection: "#4a3328", active: "rgba(229, 139, 87, .06)",
    panel: "#0f0e0d", surface: "#1d1a17", border: "#3a342e",
    comment: "#716c64", keyword: "#e58b57", fn: "#d7b26d", type: "#e6c789",
    prop: "#8fb7ad", string: "#a8b886", number: "#cc8e7f", punct: "#a09a91", meta: "#a9a39a",
  },
};

function normalizeThemeId(id) {
  return STUDIO_THEMES.some((theme) => theme.id === id) ? id : "graphite";
}

function themeExtensions(id) {
  const p = THEME_PALETTES[normalizeThemeId(id)];
  const editorTheme = EditorView.theme({
    "&": {height: "100%", color: `${p.fg} !important`, backgroundColor: `${p.bg} !important`},
    ".cm-scroller": {
      fontFamily: "var(--code-font, ui-monospace, 'SF Mono', Menlo, monospace)",
      lineHeight: "1.62",
    },
    ".cm-content": {padding: "10px 0 18px", caretColor: p.accent},
    ".cm-line": {padding: "0 14px 0 10px"},
    "&.cm-focused": {outline: "none"},
    "&.cm-focused .cm-cursor": {borderLeftColor: p.accent, borderLeftWidth: "2px"},
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {backgroundColor: p.selection},
    ".cm-activeLine": {backgroundColor: p.active},
    ".cm-gutters": {color: `${p.gutter} !important`, backgroundColor: `${p.bg} !important`, borderRight: `1px solid ${p.border}55 !important`},
    ".cm-lineNumbers .cm-gutterElement": {padding: "0 12px 0 8px"},
    ".cm-activeLineGutter": {color: p.gutterActive, backgroundColor: p.active},
    ".cm-foldPlaceholder": {color: p.gutterActive, backgroundColor: p.surface, border: `1px solid ${p.border}`},
    ".cm-matchingBracket": {color: `${p.accent} !important`, backgroundColor: `${p.accent}20`, outline: `1px solid ${p.accent}55`},
    ".cm-searchMatch": {backgroundColor: `${p.accent}2e`, outline: `1px solid ${p.accent}4d`},
    ".cm-searchMatch.cm-searchMatch-selected": {backgroundColor: p.selection},
    ".cm-panels": {color: p.fg, backgroundColor: p.panel},
    ".cm-tooltip": {color: p.fg, backgroundColor: p.surface, border: `1px solid ${p.border}`},
  }, {dark: true});
  const highlightStyle = HighlightStyle.define([
    {tag: tags.comment, color: p.comment, fontStyle: "italic"},
    {tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: p.keyword},
    {tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: p.fn},
    {tag: [tags.typeName, tags.className, tags.tagName], color: p.type},
    {tag: [tags.propertyName, tags.attributeName], color: p.prop},
    {tag: [tags.string, tags.special(tags.string)], color: p.string},
    {tag: [tags.number, tags.bool, tags.null, tags.atom], color: p.number},
    {tag: [tags.operator, tags.punctuation, tags.bracket], color: p.punct},
    {tag: [tags.meta, tags.macroName], color: p.meta},
    {tag: tags.heading, color: p.fg, fontWeight: "650"},
    {tag: tags.strong, color: p.fg, fontWeight: "700"},
    {tag: tags.emphasis, color: p.fg, fontStyle: "italic"},
    {tag: [tags.link, tags.url], color: p.fn, textDecoration: "underline"},
    {tag: tags.invalid, color: "#f07178", textDecoration: "underline wavy"},
  ]);
  return [editorTheme, syntaxHighlighting(highlightStyle)];
}

const themePickerBase = EditorView.baseTheme({
  ".cm-theme-picker": {position: "absolute", zIndex: "20", top: "8px", right: "10px", fontFamily: "var(--ui-font, -apple-system, sans-serif)"},
  ".cm-theme-trigger": {
    width: "28px", height: "28px", display: "grid", placeItems: "center", padding: "0",
    color: "#8e98a8", background: "rgba(24, 27, 32, .86)", border: "1px solid rgba(142, 152, 168, .2)",
    borderRadius: "7px", cursor: "pointer", opacity: ".28", transition: "opacity 120ms ease-out, border-color 120ms ease-out",
  },
  "&:hover .cm-theme-trigger, &.cm-focused .cm-theme-trigger, .cm-theme-trigger[aria-expanded=true]": {opacity: "1"},
  ".cm-theme-trigger:hover": {color: "#d9dee7", borderColor: "rgba(142, 152, 168, .45)"},
  ".cm-theme-menu": {
    position: "absolute", top: "34px", right: "0", width: "176px", padding: "5px",
    background: "#181b20", border: "1px solid #363d48", borderRadius: "10px",
    boxShadow: "0 12px 36px rgba(0,0,0,.48)", display: "none",
  },
  ".cm-theme-picker.open .cm-theme-menu": {display: "block"},
  ".cm-theme-option": {
    width: "100%", minHeight: "34px", display: "flex", alignItems: "center", gap: "9px",
    padding: "0 9px", color: "#aeb7c4", background: "transparent", border: "0",
    borderRadius: "7px", cursor: "pointer", font: "12px/1 var(--ui-font, -apple-system, sans-serif)", textAlign: "left",
  },
  ".cm-theme-option:hover, .cm-theme-option[aria-checked=true]": {color: "#e2e7ee", background: "#252a31"},
  ".cm-theme-swatches": {display: "flex", width: "39px", height: "14px", overflow: "hidden", borderRadius: "4px", border: "1px solid rgba(255,255,255,.08)"},
  ".cm-theme-swatch": {flex: "1"},
  ".cm-theme-check": {marginLeft: "auto", color: "#86aee8", opacity: "0"},
  ".cm-theme-option[aria-checked=true] .cm-theme-check": {opacity: "1"},
  "@media (prefers-reduced-motion: reduce)": {".cm-theme-trigger": {transition: "none"}},
});

function themePickerExtension(getTheme, setTheme) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.root = document.createElement("div");
      this.root.className = "cm-theme-picker";
      this.trigger = document.createElement("button");
      this.trigger.type = "button";
      this.trigger.className = "cm-theme-trigger";
      this.trigger.setAttribute("aria-label", "Thème de l'éditeur");
      this.trigger.setAttribute("aria-haspopup", "menu");
      this.trigger.setAttribute("aria-expanded", "false");
      this.trigger.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.8"/><circle cx="6" cy="6" r=".8" fill="currentColor"/><circle cx="10" cy="5.7" r=".8" fill="currentColor"/><circle cx="5.7" cy="9.5" r=".8" fill="currentColor"/></svg>';
      this.menu = document.createElement("div");
      this.menu.className = "cm-theme-menu";
      this.menu.setAttribute("role", "menu");
      for (const theme of STUDIO_THEMES) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "cm-theme-option";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-label", theme.label);
        option.innerHTML = `<span class="cm-theme-swatches">${theme.swatches.map((color) => `<i class="cm-theme-swatch" style="background:${color}"></i>`).join("")}</span><span>${theme.label}</span><span class="cm-theme-check">✓</span>`;
        option.addEventListener("click", () => { setTheme(theme.id); this.close(); });
        this.menu.appendChild(option);
      }
      this.trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        this.root.classList.contains("open") ? this.close() : this.open();
      });
      this.menu.addEventListener("click", (event) => event.stopPropagation());
      this.onDocumentClick = () => this.close();
      this.onKeyDown = (event) => { if (event.key === "Escape") this.close(); };
      document.addEventListener("click", this.onDocumentClick);
      document.addEventListener("keydown", this.onKeyDown);
      this.root.append(this.trigger, this.menu);
      view.dom.appendChild(this.root);
      this.updateActive();
    }
    open() { this.root.classList.add("open"); this.trigger.setAttribute("aria-expanded", "true"); }
    close() { this.root.classList.remove("open"); this.trigger.setAttribute("aria-expanded", "false"); }
    updateActive() {
      const current = getTheme();
      for (const option of this.menu.querySelectorAll(".cm-theme-option")) {
        option.setAttribute("aria-checked", String(option.getAttribute("aria-label").toLowerCase() === current));
      }
    }
    update() { this.updateActive(); }
    destroy() {
      document.removeEventListener("click", this.onDocumentClick);
      document.removeEventListener("keydown", this.onKeyDown);
      this.root.remove();
    }
  });
}

// ---- markText / addLineClass as managed decorations ------------------------
const addMark = StateEffect.define();     // {id, from, to, spec}
const clearMark = StateEffect.define();   // id
const addLineCls = StateEffect.define();  // {line, cls}  (0-based)
const clearLineCls = StateEffect.define();// {line, cls}
const setValueAnno = Annotation.define();
class NodeWidget extends WidgetType {
  constructor(node) { super(); this.node = node; }
  eq(other) { return other.node === this.node; }
  toDOM() { return this.node; }
  ignoreEvent() { return false; }
}
const marksField = StateField.define({
  create: () => ({decos: Decoration.none, specs: new Map()}),
  update(value, tr) {
    let decos = value.decos.map(tr.changes);
    const specs = new Map(value.specs);
    for (const e of tr.effects) {
      if (e.is(addMark)) {
        const {id, from, to, spec, widget} = e.value;
        const deco = widget
          ? Decoration.widget({widget: new NodeWidget(widget), side: spec.insertLeft ? -1 : 1})
          : Decoration.mark(spec);
        specs.set(id, deco);
        decos = decos.update({add: [deco.range(from, to)]});
      } else if (e.is(clearMark)) {
        const deco = specs.get(e.value);
        specs.delete(e.value);
        if (deco) decos = decos.update({filter: (f, t, d) => d !== deco});
      }
    }
    return {decos, specs};
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
});

const updateGutters = StateEffect.define();
class NodeGutterMarker extends GutterMarker {
  constructor(name, node) { super(); this.name = name; this.node = node; }
  eq(other) { return other.name === this.name && other.node === this.node; }
  // CM6 owns gutter DOM lifecycle. Clone the CM5-compatible cell so removing
  // a RangeSet never tries to recycle an externally-owned node.
  toDOM() { return this.node.cloneNode(true); }
}
const gutterField = StateField.define({
  create: () => ({entries: new Map(), ranges: RangeSet.empty}),
  update(value, tr) {
    const gutterEffects = tr.effects.filter((effect) => effect.is(updateGutters));
    if (!tr.docChanged && gutterEffects.length === 0) return value;
    const entries = new Map();
    for (const [key, entry] of value.entries) {
      const pos = tr.changes.mapPos(entry.pos);
      entries.set(key, {...entry, pos});
    }
    for (const effect of gutterEffects) {
      for (const update of effect.value) {
        if (update.kind === "set") {
          const entry = update.entry;
          entries.set(`${entry.name}:${entry.line}`, entry);
        } else if (update.kind === "clear") {
          for (const [key, entry] of entries) if (entry.name === update.name) entries.delete(key);
        }
      }
    }
    const ranges = [...entries.values()]
      .sort((a, b) => a.pos - b.pos)
      .map((entry) => new NodeGutterMarker(entry.name, entry.node).range(entry.pos));
    return {entries, ranges: RangeSet.of(ranges, true)};
  },
});

function hangingIndentDecorations(view) {
  const ranges = [];
  for (const {from, to} of view.visibleRanges) {
    let line = view.state.doc.lineAt(from);
    while (line.from <= to) {
      const columns = countColumn(line.text, null, view.state.tabSize);
      if (columns) {
        const offset = columns * view.defaultCharacterWidth;
        ranges.push(Decoration.line({attributes: {
          style: `text-indent:-${offset}px;padding-left:${4 + offset}px`,
        }}).range(line.from));
      }
      if (line.to >= to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }
  return Decoration.set(ranges, true);
}
const hangingIndent = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = hangingIndentDecorations(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.decorations = hangingIndentDecorations(update.view);
    }
  }
}, {decorations: (value) => value.decorations});
const lineClsField = StateField.define({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addLineCls)) {
        const lineNo = e.value.line + 1;
        if (lineNo >= 1 && lineNo <= tr.state.doc.lines) {
          const l = tr.state.doc.line(lineNo);
          decos = decos.update({add: [Decoration.line({class: e.value.cls}).range(l.from)]});
        }
      } else if (e.is(clearLineCls)) {
        const lineNo = e.value.line + 1;
        if (lineNo >= 1 && lineNo <= tr.state.doc.lines) {
          const from = tr.state.doc.line(lineNo).from;
          const cls = e.value.cls;
          decos = decos.update({filter: (f, t, d) => !(f === from && d.spec.class === cls)});
        }
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v),
});

export function createStudioEditor(parent, opts) {
  const wrapComp = new Compartment();
  const keymapComp = new Compartment();
  const readOnlyComp = new Compartment();
  const editableComp = new Compartment();
  const themeComp = new Compartment();
  const handlers = {change: [], blur: [], cursorActivity: [], gutterClick: []};
  let markId = 0;
  let themeId = normalizeThemeId(localStorage.getItem("atelier.editorTheme"));
  let view;
  const themeChannel = "BroadcastChannel" in window ? new BroadcastChannel("atelier-editor-theme") : null;
  const applyTheme = (nextId, {persist = true, broadcast = true} = {}) => {
    const next = normalizeThemeId(nextId);
    const changed = next !== themeId;
    themeId = next;
    if (persist) localStorage.setItem("atelier.editorTheme", next);
    if (changed && view) view.dispatch({effects: themeComp.reconfigure(themeExtensions(next))});
    if (changed && broadcast) themeChannel?.postMessage({theme: next});
  };
  const onStoredTheme = (event) => {
    if (event.key === "atelier.editorTheme" && event.newValue) applyTheme(event.newValue, {persist: false, broadcast: false});
  };
  window.addEventListener("storage", onStoredTheme);
  if (themeChannel) themeChannel.onmessage = (event) => applyTheme(event.data?.theme, {persist: true, broadcast: false});

  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.value || "",
      extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), closeBrackets(), foldGutter(), highlightSelectionMatches({minSelectionLength: 3}),
        indentUnit.of(opts.ext === "py" ? "    " : "  "),
        languageFor(opts.ext),
        themeComp.of(themeExtensions(themeId)),
        themePickerBase,
        themePickerExtension(() => themeId, (id) => applyTheme(id)),
        marksField, lineClsField, gutterField, hangingIndent,
        gutter({
          class: "CodeMirror-diffgutter",
          markers: (view) => view.state.field(gutterField).ranges,
          domEventHandlers: {
            click: (view, line) => {
              const lineNo = view.state.doc.lineAt(line.from).number - 1;
              handlers.gutterClick.forEach((fn) => fn(facade, lineNo, "dv-git"));
              return handlers.gutterClick.length > 0;
            },
          },
        }),
        wrapComp.of(opts.wrap === false ? [] : EditorView.lineWrapping),
        keymapComp.of([]),
        readOnlyComp.of(EditorState.readOnly.of(false)),
        editableComp.of(EditorView.editable.of(true)),
        opts.ext === "tex"
          ? ghostAiExtension({
              isTex: () => true,
              aiEnabled: opts.aiEnabled || (() => true),
              endpoint: "/latex-suggest",
              onState: opts.onGhostState || (() => {}),
            })
          : [],
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const origin = u.transactions.some((t) => t.annotation(setValueAnno)) ? "setValue" : u.transactions.some((t) => t.isUserEvent("input.complete")) ? "+ghost" : "+input";
            handlers.change.forEach((fn) => fn(facade, {origin}));
          }
          if (u.selectionSet || u.docChanged) handlers.cursorActivity.forEach((fn) => fn(facade));
          if (u.focusChanged && !u.view.hasFocus) handlers.blur.forEach((fn) => fn(facade));
        }),
      ],
    }),
  });

  const doc = () => view.state.doc;
  const toOffset = (pos) => {
    const p = clampPos(pos, doc().lines, (l) => doc().line(l + 1).length);
    return doc().line(p.line + 1).from + p.ch;
  };
  const toPos = (off) => {
    const l = doc().lineAt(Math.max(0, Math.min(off, doc().length)));
    return {line: l.number - 1, ch: off - l.from};
  };
  const operationBatcher = createOperationBatcher((updates) => {
    view.dispatch({effects: updateGutters.of(updates)});
  });

  const facade = {
    hasNativeGhost: opts.ext === "tex",
    Pass,
    // --- content ---
    getValue: () => doc().toString(),
    setValue: (text) => view.dispatch({changes: {from: 0, to: doc().length, insert: text}, annotations: setValueAnno.of(true)}),
    getLine: (n) => (n >= 0 && n < doc().lines ? doc().line(n + 1).text : ""),
    lineCount: () => doc().lines,
    lastLine: () => doc().lines - 1,
    posFromIndex: (index) => toPos(index),
    indexFromPos: (pos) => toOffset(pos),
    getRange: (from, to) => view.state.sliceDoc(toOffset(from), toOffset(to)),
    replaceRange: (text, from, to) =>
      view.dispatch({changes: {from: toOffset(from), to: to == null ? toOffset(from) : toOffset(to), insert: text}}),
    // --- cursor/selection ---
    getCursor: (dir) => {
      const sel = view.state.selection.main;
      const off = dir === "from" ? sel.from : dir === "to" ? sel.to
        : dir === "anchor" ? sel.anchor : sel.head;
      return toPos(off);
    },
    setCursor: (pos) => view.dispatch({selection: {anchor: toOffset(pos)}}),
    setSelection: (anchor, head) => view.dispatch({selection: {anchor: toOffset(anchor), head: toOffset(head || anchor)}}),
    somethingSelected: () => !view.state.selection.main.empty,
    getSelection: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
    // --- view/geometry ---
    focus: () => view.focus(),
    refresh: () => {},                        // CM6 measures automatically
    scrollIntoView: (pos /*, margin */) =>
      view.dispatch({effects: EditorView.scrollIntoView(toOffset(pos), {y: "center"})}),
    charCoords: (pos /*, mode: "window" */) => {
      const r = view.coordsAtPos(toOffset(pos));
      return r ? {left: r.left, top: r.top, bottom: r.bottom} : {left: 0, top: 0, bottom: 0};
    },
    defaultCharWidth: () => view.defaultCharacterWidth,
    getWrapperElement: () => view.dom,
    getGutterElement: () => view.dom.querySelector(".cm-gutters") || view.dom,
    getScrollInfo: () => ({left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop}),
    scrollTo: (left, top) => {
      if (left != null) view.scrollDOM.scrollLeft = left;
      if (top != null) view.scrollDOM.scrollTop = top;
    },
    // --- decorations ---
    markText: (from, to, spec) => {
      const id = ++markId;
      view.dispatch({effects: addMark.of({id, from: toOffset(from), to: toOffset(to), spec: {class: spec.className, attributes: spec.attributes}})});
      let cleared = false;
      return {
        clear: () => {
          if (cleared) return;
          cleared = true;
          view.dispatch({effects: clearMark.of(id)});
        },
        find: () => {
          if (cleared) return undefined;
          const mark = view.state.field(marksField).specs.get(id);
          if (!mark) return undefined;
          let found;
          view.state.field(marksField).decos.between(0, doc().length, (from, to, deco) => {
            if (deco === mark) found = {from: toPos(from), to: toPos(to)};
          });
          return found;
        },
      };
    },
    setBookmark: (pos, spec) => {
      const id = ++markId;
      view.dispatch({effects: addMark.of({id, from: toOffset(pos), to: toOffset(pos), spec,
        widget: spec.widget})});
      let cleared = false;
      return {
        clear: () => {
          if (cleared) return;
          cleared = true;
          view.dispatch({effects: clearMark.of(id)});
        },
        find: () => {
          if (cleared) return undefined;
          const mark = view.state.field(marksField).specs.get(id);
          let found;
          view.state.field(marksField).decos.between(0, doc().length, (from, _to, deco) => {
            if (deco === mark) found = toPos(from);
          });
          return found;
        },
      };
    },
    addLineClass: (line, where, cls) => {
      if (where === "background" || where === "wrap") view.dispatch({effects: addLineCls.of({line, cls})});
    },
    removeLineClass: (line, where, cls) => {
      if (where === "background" || where === "wrap") view.dispatch({effects: clearLineCls.of({line, cls})});
    },
    setGutterMarker: (line, name, node) => {
      if (line < 0 || line >= doc().lines) return;
      operationBatcher.push({kind: "set", entry: {line, name, node, pos: doc().line(line + 1).from}});
    },
    clearGutter: (name) => operationBatcher.push({kind: "clear", name}),
    // --- options ---
    setOption: (name, v) => {
      if (name === "lineWrapping") view.dispatch({effects: wrapComp.reconfigure(v ? EditorView.lineWrapping : [])});
      if (name === "readOnly") view.dispatch({effects: [
        readOnlyComp.reconfigure(EditorState.readOnly.of(Boolean(v))),
        editableComp.reconfigure(EditorView.editable.of(!v)),
      ]});
    },
    getOption: (name) => name === "tabSize" ? view.state.tabSize
      : name === "readOnly" ? view.state.readOnly
      : name === "theme" ? themeId : undefined,
    getThemes: () => STUDIO_THEMES.map((theme) => ({...theme, swatches: [...theme.swatches]})),
    setTheme: (id) => applyTheme(id),
    // --- keymaps/commands/events ---
    addKeyMap: (map) => {
      const bindings = Object.entries(map).map(([k, fn]) => ({
        key: cm5KeyToCm6(k),
        run: () => fn() !== Pass,             // CM5: return Pass to fall through
      }));
      const cur = keymapComp.get(view.state) || [];
      view.dispatch({effects: keymapComp.reconfigure([cur, Prec.high(keymap.of(bindings))])});
    },
    operation: (fn) => operationBatcher.run(fn),
    execCommand: (name) => {
      if (name === "findPersistent" || name === "find") openSearchPanel(view);
      else if (name === "selectAll") selectAll(view);
    },
    onInput: (fn) => handlers.change.push((editor, change) => fn(editor, change)),
    on: (event, fn) => { (handlers[event] || (handlers[event] = [])).push(fn); },
    destroy: () => {
      window.removeEventListener("storage", onStoredTheme);
      themeChannel?.close();
      view.destroy();
    },
  };
  if (opts.readOnly) facade.setOption("readOnly", true);
  return facade;
}
