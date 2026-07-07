// studio_editor.mjs — CM6 engine wearing a CM5 façade, sized to exactly the
// API surface latex_studio.html uses (inventoried 2026-07-07). Not a general
// CM5 shim: methods the page doesn't call don't exist here.
import {EditorState, StateEffect, StateField, Compartment, Prec} from "@codemirror/state";
import {EditorView, Decoration, keymap, highlightActiveLine, highlightActiveLineGutter,
        lineNumbers, drawSelection} from "@codemirror/view";
import {defaultKeymap, historyKeymap, history, indentWithTab} from "@codemirror/commands";
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
import {ghostAiExtension} from "./ghost_ai.mjs";
import {clampPos, countColumn, cm5KeyToCm6} from "./studio_compat.mjs";

export const Pass = Symbol("CodeMirror.Pass");
export { countColumn };

function languageFor(ext) {
  switch (ext) {
    case "py": return python();
    case "md": return markdown();
    case "js": return javascript();
    case "tex": return StreamLanguage.define(stex);
    case "r": return StreamLanguage.define(r);
    case "jl": return StreamLanguage.define(julia);
    case "sh": return StreamLanguage.define(shell);
    default: return [];
  }
}

// ---- markText / addLineClass as managed decorations ------------------------
const addMark = StateEffect.define();     // {id, from, to, spec}
const clearMark = StateEffect.define();   // id
const addLineCls = StateEffect.define();  // {line, cls}  (0-based)
const clearLineCls = StateEffect.define();// {line, cls}
const marksField = StateField.define({
  create: () => ({decos: Decoration.none, specs: new Map()}),
  update(value, tr) {
    let decos = value.decos.map(tr.changes);
    const specs = value.specs;
    for (const e of tr.effects) {
      if (e.is(addMark)) {
        const {id, from, to, spec} = e.value;
        const deco = Decoration.mark(spec);
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
  const handlers = {change: [], blur: [], cursorActivity: []};
  let markId = 0;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.value || "",
      extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), closeBrackets(), foldGutter(), highlightSelectionMatches({minSelectionLength: 3}),
        indentUnit.of("  "),
        languageFor(opts.ext),
        marksField, lineClsField,
        wrapComp.of(opts.wrap === false ? [] : EditorView.lineWrapping),
        keymapComp.of([]),
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
            const origin = u.transactions.some((t) => t.isUserEvent("input.complete")) ? "+ghost" : "+input";
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

  const facade = {
    view,
    hasNativeGhost: opts.ext === "tex",
    Pass,
    // --- content ---
    getValue: () => doc().toString(),
    setValue: (text) => view.dispatch({changes: {from: 0, to: doc().length, insert: text}}),
    getLine: (n) => (n >= 0 && n < doc().lines ? doc().line(n + 1).text : ""),
    lineCount: () => doc().lines,
    replaceRange: (text, from, to) =>
      view.dispatch({changes: {from: toOffset(from), to: to == null ? toOffset(from) : toOffset(to), insert: text}}),
    // --- cursor/selection ---
    getCursor: () => toPos(view.state.selection.main.head),
    setCursor: (pos) => view.dispatch({selection: {anchor: toOffset(pos)}}),
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
      return {clear: () => view.dispatch({effects: clearMark.of(id)})};
    },
    addLineClass: (line, where, cls) => {
      if (where === "background") view.dispatch({effects: addLineCls.of({line, cls})});
    },
    removeLineClass: (line, where, cls) => {
      if (where === "background") view.dispatch({effects: clearLineCls.of({line, cls})});
    },
    clearGutter: () => {},                    // py lint gutter — Phase B
    // --- options ---
    setOption: (name, v) => {
      if (name === "lineWrapping") view.dispatch({effects: wrapComp.reconfigure(v ? EditorView.lineWrapping : [])});
    },
    getOption: (name) => (name === "tabSize" ? view.state.tabSize : undefined),
    // --- keymaps/commands/events ---
    addKeyMap: (map) => {
      const bindings = Object.entries(map).map(([k, fn]) => ({
        key: cm5KeyToCm6(k),
        run: () => fn() !== Pass,             // CM5: return Pass to fall through
      }));
      const cur = keymapComp.get(view.state) || [];
      view.dispatch({effects: keymapComp.reconfigure([cur, Prec.high(keymap.of(bindings))])});
    },
    execCommand: (name) => { if (name === "findPersistent" || name === "find") openSearchPanel(view); },
    on: (event, fn) => { (handlers[event] || (handlers[event] = [])).push(fn); },
  };
  return facade;
}
