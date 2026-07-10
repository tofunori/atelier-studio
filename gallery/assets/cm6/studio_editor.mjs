// studio_editor.mjs — CM6 engine wearing a CM5 façade, sized to exactly the
// API surface latex_studio.html uses (inventoried 2026-07-07). Not a general
// CM5 shim: methods the page doesn't call don't exist here.
import {EditorState, StateEffect, StateField, Compartment, Prec, Annotation, RangeSet} from "@codemirror/state";
import {EditorView, Decoration, keymap, highlightActiveLine, highlightActiveLineGutter,
        lineNumbers, drawSelection, gutter, GutterMarker, WidgetType, ViewPlugin} from "@codemirror/view";
import {defaultKeymap, historyKeymap, history, indentWithTab, selectAll} from "@codemirror/commands";
import {openSearchPanel, searchKeymap, highlightSelectionMatches} from "@codemirror/search";
import {bracketMatching, foldGutter, foldKeymap, StreamLanguage, indentUnit} from "@codemirror/language";
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

function languageFor(ext) {
  switch (ext === "R" ? "r" : String(ext || "").toLowerCase()) {
    case "py": return python();
    case "md": return markdown();
    case "js": case "ts": return javascript({typescript: ext === "ts"});
    case "json": return javascript({json: true});
    case "tex": case "sty": case "bib": return StreamLanguage.define(stex);
    case "r": return StreamLanguage.define(r);
    case "jl": return StreamLanguage.define(julia);
    case "sh": case "bash": return StreamLanguage.define(shell);
    case "yaml": case "yml": return StreamLanguage.define(yaml);
    case "toml": return StreamLanguage.define(toml);
    default: return [];
  }
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
  const handlers = {change: [], blur: [], cursorActivity: [], gutterClick: []};
  let markId = 0;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.value || "",
      extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), closeBrackets(), foldGutter(), highlightSelectionMatches({minSelectionLength: 3}),
        indentUnit.of(opts.ext === "py" ? "    " : "  "),
        languageFor(opts.ext),
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
        EditorView.theme({"&": {height: "100%"}, ".cm-content": {caretColor: "var(--accent, #e8823a)"}}),
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
      : name === "readOnly" ? view.state.readOnly : undefined,
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
  };
  if (opts.readOnly) facade.setOption("readOnly", true);
  return facade;
}
