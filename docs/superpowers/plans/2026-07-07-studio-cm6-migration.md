# Atelier Studio — CM5 → CM6 Migration Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the main Atelier editor (`gallery/assets/latex_studio.html` — the real `main.tex` / `edit-cmux` editor) on CodeMirror 6 behind an engine toggle, with the AI ghost autocomplete (warm Claude backend) available in the real writing flow.

**Architecture:** A **CM5-façade adapter** (`studio_editor.mjs`) implements the ~28 CM5 methods the page actually calls (inventoried 2026-07-07) on top of a CM6 `EditorView`. The 1,947-line page keeps its logic (compile, SyncTeX, texc annotations, outline, read mode…) — those features call the façade and need no rewrite. The ghost+AI logic shipped today in the CM6 prototype is extracted into a reusable extension consumed by both the prototype and the new engine. An `engine` toggle (`?engine=cm6` / `localStorage.studioEngine`) selects CM5 (default, unchanged) or CM6 at load; flipping the default is Phase C, after Phase B parity validation.

**Tech Stack:** CodeMirror 6 (`codemirror`, `@codemirror/lang-python`, `@codemirror/lang-markdown`, `@codemirror/lang-javascript`, `@codemirror/legacy-modes` for stex/r/julia/shell), esbuild (IIFE bundle), node:test, Playwright (smoke), Tauri (deploy).

## Phasing (scope check)

- **Phase A (THIS plan):** ghost extension extraction, façade module, bundle, engine toggle, smoke tests, deploy. Deliverable: `?engine=cm6` gives a usable multi-language editor with AI ghost in real files; CM5 remains the default.
- **Phase B (separate plan, written when A ships):** feature-by-feature parity validation under `engine=cm6` (compile+log, PDF+SyncTeX both directions, texc annotations, outline, sel-pill, read mode, rewrap Alt-Q, diff tag, python lint gutter) with fixes; each item is exercised through the façade so most should already work.
- **Phase C (separate plan):** flip default engine to cm6, soak, remove CM5 assets (~16 script/link tags) and dead branches.

## Global Constraints

- **NEVER run `pkill -f "stream-json"`, `pkill -f claude`, `pkill -f node`, or any broad pattern kill** — the user's own Claude session matches those. Approved patterns ONLY: `kill %N` / `kill <pid>` for processes you started, `pkill -f "inline LaTeX-prose autocomplete"` (our warm process's unique system-prompt substring), `pkill -f "Atelier.app/Contents"` (the app, deploy task only).
- **Server side is UNTOUCHED in this plan.** `claude_warm.mjs`, `/latex-suggest`, and the endpoint's Max-OAuth handling are done and verified — no task here may modify `gallery/server/`.
- **Default engine stays `cm5` throughout Phase A.** No behavior change for the user unless they opt in via `?engine=cm6` or `localStorage.setItem("studioEngine","cm6")`.
- **CM6 bundle recipe** (the repo's node_modules has NO CodeMirror): temp-dir build exactly as in Task 3; the bundle is a committed artifact.
- **Tauri build exit 1 is expected** iff only `bundle_dmg.sh` fails (`grep -iE "error" log | grep -viE "dmg|bundle_dmg"` empty = success).
- Validation battery (run before deploy): `npx tsc --noEmit` → `npx vite build` → `(cd sidecar && npx vitest run)` 45/45 → `node gallery/server/tests/parity.mjs` → `node --test gallery/server/tests/*.test.mjs` (11+ pass).
- Repo: `/Users/tofunori/Documents/atelier-studio`, branch `main`. Working tree must be clean at start (commit or flag anything pending).

## CM5 API inventory (measured — the façade contract)

From `latex_studio.html` (grep 2026-07-07): `getCursor`(15) `getValue`(10) `refresh`(9) `setCursor`(8) `getLine`(8) `focus`(6) `scrollIntoView`(5) `removeLineClass`(4) `lineCount`(4) `addLineClass`(4) `setValue`(3) `markText`(3) `somethingSelected`(2) `replaceRange`(2) `getWrapperElement`(2) `defaultCharWidth`(2) `charCoords`(2) `addKeyMap`(2) `setOption`(1: lineWrapping) `getOption`(1: tabSize) `scrollTo`(1) `getSelection`(1) `getScrollInfo`(1) `getGutterElement`(1) `execCommand`(1: findPersistent) `clearGutter`(1: py lint, Phase B) + events `on("change"|"blur"|"cursorActivity"|"inputRead")` + statics `CodeMirror.Pass`, `CodeMirror.countColumn`. CM5-only paths NOT ported (natively covered or guarded off under cm6): `setBookmark` ghost (native CM6 ghost instead), manual active-line classes (native `highlightActiveLine`), `styleSelectedText` (native selection layer), scrollbar match annotations (accepted degradation, revisit Phase C).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `gallery/assets/cm6/ghost_ai.mjs` | **create** | Reusable CM6 extension factory: ghostField (auto-advance), local predictor, AI fetch w/ LRU cache + superseded handling, Tab/Escape keymap. Extracted from `latex_cm6_src.js`. |
| `gallery/assets/cm6/latex_cm6_src.js` | modify | Prototype now imports from `ghost_ai.mjs` (thin app shell: DOM, save, load). |
| `gallery/assets/cm6/studio_editor.mjs` | **create** | `createStudioEditor(parent, opts)` → CM5-façade over a CM6 EditorView; language routing by extension. |
| `gallery/assets/cm6/studio_compat.mjs` | **create** | Pure helpers (pos↔offset clamping, countColumn, CM5→CM6 key-name mapping) — node-testable without CodeMirror. |
| `gallery/assets/cm6/studio_cm6.bundle.js` | **generate** | esbuild IIFE bundle exposing `window.AtelierStudioCM6`. |
| `gallery/assets/cm6/latex_cm6.bundle.js` | regenerate | Prototype bundle (source refactored). |
| `gallery/assets/latex_studio.html` | modify | Engine toggle + editor-creation seam + cm6 guards (ghostInstall, active-line block). |
| `gallery/server/tests/studio_compat.test.mjs` | **create** | node:test for the pure helpers. |
| `.superpowers/sdd/smoke_studio_cm6.mjs` | **create** | Playwright smoke (not committed to git — scratch). |

---

### Task 1: Extract the reusable ghost/AI extension (`ghost_ai.mjs`)

**Files:**
- Create: `gallery/assets/cm6/ghost_ai.mjs`
- Modify: `gallery/assets/cm6/latex_cm6_src.js` (imports the extension; deletes the moved code)
- Test: existing `gallery/server/tests/ghost_logic.test.mjs` must keep passing; validation via esbuild parse + prototype rebundle in Task 3.

**Interfaces:**
- Consumes: `advanceGhost`, `LruCache` from `./ghost_logic.mjs` (existing, tested).
- Produces (used by Task 2 and the prototype):
  ```js
  export function ghostAiExtension(config) -> Extension[]   // config below
  export function acceptGhost(view) -> boolean              // Tab handler, exported for reuse
  // config = {
  //   isTex: () => boolean,          // enable prose ghost+AI only for .tex
  //   aiEnabled: () => boolean,      // live toggle
  //   endpoint: string,              // "/latex-suggest"
  //   onState: (label) => void,      // status line callback ("AI...", "AI ready", "local ready", ...)
  // }
  ```
- The extension bundles: the `setGhost` effect + `ghostField` (with transactional auto-advance exactly as shipped today), the local predictor (`ghostFor`: envs/commands/labels/word/next), `aiContext`, `scheduleAiGhost` (350 ms debounce, LRU cache, `superseded` no-op, abort machinery), an `updateListener` (kept-ghost branch), and `Prec.highest(keymap)` for Tab (acceptGhost) / Escape (clear).

**Implementation guidance (this is a refactor — the code already exists and is reviewed):**
Move from `latex_cm6_src.js` into `ghost_ai.mjs`, UNCHANGED in logic: `COMMANDS`, `ENVS`, `WORDS`, `NEXT`, `lineBefore`, `cleanText`, `tokens`, `labels`, `envNames`, `openEnvironment`, `bestWord`, `bestNext`, `ghostFor`, `aiContext`, `cancelAiGhost`, `normalizeAiText`, `aiCache`/`aiCacheKey`, `scheduleAiGhost`, `GhostWidget`, `setGhost`, `ghostValue`, `advancedGhostValue`, `ghostField`, `refreshGhost`, `acceptGhost`. Replace their free-variable references to the app's globals (`aiEnabled`, `view`, `canSave`, `setState`, `dirty`) with the `config` callbacks: `config.aiEnabled()` for `aiEnabled`, `config.onState(...)` for every `setState(...)` (drop the `canSave ? "X" : "demo X"` duality — pass the raw label, the APP decides demo prefixing), `config.isTex()` gating added at the top of `ghostFor` and `aiContext` (return null when false), and the module-level `view` comparisons replaced by comparing against the update's own `view` (the extension closes over nothing global: `scheduleAiGhost(v, ctx)` already receives `v`; change `if (!aiEnabled || !view || view !== v)` to `if (!config.aiEnabled())` plus `v.dom.isConnected` checks).

- [ ] **Step 1:** Create `ghost_ai.mjs` with the moved code and the `ghostAiExtension(config)` factory returning `[ghostField, updateListenerExt, keymapExt]`. Rewrite `latex_cm6_src.js` to `import {ghostAiExtension, acceptGhost} from "./ghost_ai.mjs"` and pass `{isTex: () => true, aiEnabled: () => aiEnabled, endpoint: "/latex-suggest", onState: (s) => setState(canSave ? s : "demo " + s)}`; delete the moved code from the app file; keep its own Mod-s/save keymap and completionSource (LaTeX popup autocomplete stays app-side for now).
- [ ] **Step 2:** Parse-check both: `npx esbuild gallery/assets/cm6/ghost_ai.mjs --outfile=/dev/null && npx esbuild gallery/assets/cm6/latex_cm6_src.js --outfile=/dev/null && echo PARSE_OK`. Expected: `PARSE_OK`.
- [ ] **Step 3:** `node --test gallery/server/tests/ghost_logic.test.mjs` → still `# pass 8`.
- [ ] **Step 4:** Commit: `git add gallery/assets/cm6/ghost_ai.mjs gallery/assets/cm6/latex_cm6_src.js && git commit -m "refactor(cm6): extract reusable ghost/AI extension from prototype"`

---

### Task 2: Pure compat helpers (`studio_compat.mjs`) — TDD

**Files:**
- Create: `gallery/assets/cm6/studio_compat.mjs`
- Test: `gallery/server/tests/studio_compat.test.mjs`

**Interfaces:**
- Produces (consumed by Task 3's façade):
  - `clampPos(pos, lineCount, lineLength) -> {line, ch}` — clamp a CM5 `{line, ch}` to document bounds; `lineLength(line)` is a callback.
  - `countColumn(text, end, tabSize) -> number` — CM5's `CodeMirror.countColumn` semantics (column of first non-whitespace when `end == null`, tabs expand to tabSize).
  - `cm5KeyToCm6(name) -> string` — `"Alt-Q"→"Alt-q"`, `"Esc"→"Escape"`, `"Tab"→"Tab"`, `"Ctrl-F"→"Ctrl-f"`, `"Cmd-S"→"Cmd-s"` (letters lowercased, `Esc` renamed; modifier names pass through).

- [ ] **Step 1: Write the failing tests** — `gallery/server/tests/studio_compat.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { clampPos, countColumn, cm5KeyToCm6 } from "../../assets/cm6/studio_compat.mjs";

test("clampPos: in-bounds position passes through", () => {
  assert.deepEqual(clampPos({line: 1, ch: 3}, 5, () => 10), {line: 1, ch: 3});
});
test("clampPos: line beyond end clamps to last line, ch to its length", () => {
  assert.deepEqual(clampPos({line: 99, ch: 4}, 3, (l) => l === 2 ? 7 : 0), {line: 2, ch: 4});
  assert.deepEqual(clampPos({line: 99, ch: 40}, 3, (l) => l === 2 ? 7 : 0), {line: 2, ch: 7});
});
test("clampPos: negative values clamp to zero", () => {
  assert.deepEqual(clampPos({line: -2, ch: -5}, 3, () => 8), {line: 0, ch: 0});
});
test("countColumn: leading spaces and tabs", () => {
  assert.equal(countColumn("    x", null, 4), 4);
  assert.equal(countColumn("\tx", null, 4), 4);
  assert.equal(countColumn("\t  x", null, 4), 6);
  assert.equal(countColumn("", null, 4), 0);
});
test("cm5KeyToCm6 mappings", () => {
  assert.equal(cm5KeyToCm6("Alt-Q"), "Alt-q");
  assert.equal(cm5KeyToCm6("Esc"), "Escape");
  assert.equal(cm5KeyToCm6("Tab"), "Tab");
  assert.equal(cm5KeyToCm6("Shift-Cmd-F"), "Shift-Cmd-f");
});
```

- [ ] **Step 2:** Run `node --test gallery/server/tests/studio_compat.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement** `gallery/assets/cm6/studio_compat.mjs`:

```js
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
    end = text.search(/[^\s ]/);
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
```

- [ ] **Step 4:** `node --test gallery/server/tests/studio_compat.test.mjs` → `# pass 5`.
- [ ] **Step 5:** Commit: `git add gallery/assets/cm6/studio_compat.mjs gallery/server/tests/studio_compat.test.mjs && git commit -m "feat(cm6): pure CM5-compat helpers with tests"`

---

### Task 3: The façade (`studio_editor.mjs`) + bundle

**Files:**
- Create: `gallery/assets/cm6/studio_editor.mjs`
- Generate: `gallery/assets/cm6/studio_cm6.bundle.js`
- Regenerate: `gallery/assets/cm6/latex_cm6.bundle.js` (picks up Task 1's refactor)

**Interfaces:**
- Consumes: `ghostAiExtension`, `acceptGhost` (Task 1); `clampPos`, `countColumn`, `cm5KeyToCm6` (Task 2).
- Produces (global, used by Task 4): `window.AtelierStudioCM6 = { createStudioEditor, Pass, countColumn }` where `createStudioEditor(parent, {value, ext, wrap, aiEnabled, onGhostState})` returns the façade object implementing the full inventory in "CM5 API inventory" above, plus `facade.hasNativeGhost === true` and `facade.view` (the raw EditorView for Phase B needs).

- [ ] **Step 1: Implement** `gallery/assets/cm6/studio_editor.mjs`:

```js
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
import {ghostAiExtension, acceptGhost} from "./ghost_ai.mjs";
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
```

- [ ] **Step 2: Parse-check:** `npx esbuild gallery/assets/cm6/studio_editor.mjs --outfile=/dev/null && echo PARSE_OK`
- [ ] **Step 3: Build BOTH bundles** (known-good temp-dir recipe, now with the extra language packages):

```bash
rm -rf /tmp/atelier-cm6-build && mkdir -p /tmp/atelier-cm6-build
cp /Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/{latex_cm6_src.js,ghost_ai.mjs,ghost_logic.mjs,studio_editor.mjs,studio_compat.mjs} /tmp/atelier-cm6-build/
cd /tmp/atelier-cm6-build && npm init -y >/dev/null
npm install esbuild codemirror @codemirror/autocomplete @codemirror/state @codemirror/view @codemirror/commands \
  @codemirror/search @codemirror/language @codemirror/lang-python @codemirror/lang-markdown \
  @codemirror/lang-javascript @codemirror/legacy-modes >/dev/null
./node_modules/.bin/esbuild latex_cm6_src.js --bundle --format=iife --global-name=AtelierLatexCM6 \
  --outfile=/Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/latex_cm6.bundle.js --minify
./node_modules/.bin/esbuild studio_editor.mjs --bundle --format=iife --global-name=AtelierStudioCM6 \
  --outfile=/Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/studio_cm6.bundle.js --minify
cd /Users/tofunori/Documents/atelier-studio && rm -rf /tmp/atelier-cm6-build
```
Expected: two bundles, zero errors (studio bundle ~500-700 KB).
- [ ] **Step 4:** Quick prototype regression on a source server (the prototype must still work after Task 1's refactor):
```bash
cd /Users/tofunori/Documents/atelier-studio
FIG_PORT=19604 GALLERY_ROOT="$PWD" node gallery/server/main.mjs >/tmp/t3_smoke.log 2>&1 &
sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:19604/.fig_thumbs/latex_cm6.html"   # expect 200
# browser check happens in Task 5's smoke; here just confirm the bundle loads without 404
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:19604/.fig_thumbs/cm6/studio_cm6.bundle.js"    # expect 200
kill %1
```
- [ ] **Step 5:** Commit: `git add gallery/assets/cm6/studio_editor.mjs gallery/assets/cm6/*.bundle.js && git commit -m "feat(cm6): studio façade engine + bundles"`

---

### Task 4: Engine toggle in `latex_studio.html`

**Files:**
- Modify: `gallery/assets/latex_studio.html`

**Interfaces:**
- Consumes: `window.AtelierStudioCM6.createStudioEditor` (Task 3).
- Produces: `window.cm` is EITHER a CM5 instance (default) OR the façade — everything downstream calls the same methods.

The page has ONE editor-creation site (`load()`, currently `cm = CodeMirror(document.getElementById("left"), {...})`) and three cm5-only blocks to guard. Exact edits:

- [ ] **Step 1: Engine detection + conditional bundle load.** In the `<head>`, after the existing CM5 `<script>` tags, add:
```html
<script>
  window.__ENGINE = (new URLSearchParams(location.search).get("engine")
    || localStorage.getItem("studioEngine") || "cm5");
</script>
<script src="/.fig_thumbs/cm6/studio_cm6.bundle.js"></script>
```
(The cm6 bundle is loaded unconditionally — ~150 KB gz, simpler than dynamic injection; CM5 assets likewise stay. Dead-weight removal is Phase C.)
- [ ] **Step 2: Creation seam.** Replace the `cm = CodeMirror(document.getElementById("left"), {...});` call inside `load()` with:
```js
  if (window.__ENGINE === "cm6") {
    cm = AtelierStudioCM6.createStudioEditor(document.getElementById("left"), {
      value: j.text, ext: __EXT, wrap: localStorage.getItem("studioWrap") !== "off",
      aiEnabled: () => localStorage.getItem("atelier.latex.cm6.ai") !== "0",
      onGhostState: (s) => setState("ok", s),
    });
    window.CodeMirrorPass = cm.Pass;
  } else {
    cm = CodeMirror(document.getElementById("left"), {
      value: j.text, mode: __CM_MODE, theme: "material-darker",
      lineNumbers: true, lineWrapping: true, viewportMargin: 50, styleSelectedText: true,
      matchBrackets: true, autoCloseBrackets: true,
      foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      highlightSelectionMatches: { annotateScrollbar: true, minChars: 3 }
    });
  }
```
(Verify the exact CM5 option object against the current file before replacing — copy it verbatim into the else-branch.)
- [ ] **Step 3: Guard the three CM5-only blocks.**
  1. `ghostInstall()` call site: `if (!cm.hasNativeGhost) ghostInstall();` (the CM6 engine ships its own ghost+AI).
  2. The manual active-line block (`cm.on("cursorActivity", ...)` with `addLineClass/removeLineClass` of `cm-activeline*`): wrap in `if (window.__ENGINE !== "cm6") { ... }` (CM6 has native highlightActiveLine).
  3. `CodeMirror.Pass` returns inside `ghostInstall`'s keymap and `CodeMirror.countColumn` in `rewrapPar`: change `CodeMirror.countColumn(...)` to `(window.__ENGINE === "cm6" ? AtelierStudioCM6.countColumn : CodeMirror.countColumn)(...)`. (`ghostInstall` is cm5-only per guard 1, so its `CodeMirror.Pass` stays.)
- [ ] **Step 4: Grep for leaks** — any remaining direct `CodeMirror.` usage reachable under cm6: `grep -n "CodeMirror\." gallery/assets/latex_studio.html`. Each hit must be inside a cm5-guarded block or engine-dispatched. Fix any leak found.
- [ ] **Step 5:** Commit: `git add gallery/assets/latex_studio.html && git commit -m "feat(studio): CM6 engine behind ?engine=cm6 toggle (default cm5 unchanged)"`

---

### Task 5: Playwright smoke — both engines, three file types

**Files:**
- Create: `.superpowers/sdd/smoke_studio_cm6.mjs` (scratch, not committed)

Playwright is installed in the session scratchpad (`npm root` there); run the script with `node` from that directory, or `npm install playwright` in a temp dir if absent.

- [ ] **Step 1: Write the smoke script.** For `engine` in `[cm5, cm6]` × files `[.tex, .py, .md]` (create temp files under the project's `.fig_thumbs/`), assert via `http://127.0.0.1:19605/.fig_thumbs/latex_studio.html?path=<file>&engine=<engine>`:
  1. editor mounts and shows the file content;
  2. typing inserts at the caret (regression test for today's cursor bug: type into a ghost, assert DOM order `typed-char BEFORE ghost`);
  3. save roundtrip: modify → Cmd+S → `/code` re-fetch returns the new text;
  4. cm6+tex only: AI ghost appears after a pause (real warm-Claude call, allow 15 s) and Tab inserts it;
  5. find panel opens (button `findBtn` → search UI visible in both engines).
- [ ] **Step 2: Run it** against a source server (`FIG_PORT=19605 GALLERY_ROOT="$PWD" node gallery/server/main.mjs`), all assertions green. Cleanup: `kill %1`, `pkill -f "inline LaTeX-prose autocomplete"`, remove temp files.
- [ ] **Step 3:** Fix whatever the smoke surfaces (façade bugs land in `studio_editor.mjs` + rebundle via Task 3 Step 3 recipe). Re-run until green. Commit fixes: `git add -A gallery/assets/cm6/ && git commit -m "fix(cm6): smoke-surfaced façade fixes"`.

---

### Task 6: Validate + deploy

- [ ] **Step 1:** Full battery: `npx tsc --noEmit` && `npx vite build` && `(cd sidecar && npx vitest run)` && `node gallery/server/tests/parity.mjs` && `node --test gallery/server/tests/ghost_logic.test.mjs gallery/server/tests/claude_warm.test.mjs gallery/server/tests/studio_compat.test.mjs`. All green (45 vitest, parity ok, 16 node:test).
- [ ] **Step 2:** `pkill -f "Atelier.app/Contents"`, `npm run tauri build` (exit 1 DMG-only OK), `open .../Atelier.app`, verify `pgrep tauri-app`, embedded `curl http://127.0.0.1:19175/.fig_thumbs/cm6/studio_cm6.bundle.js` → 200.
- [ ] **Step 3:** Live check in the built app: `http://127.0.0.1:19175/.fig_thumbs/latex_studio.html?path=<real .tex>&engine=cm6` via the Task 5 script pointed at 19175 — typing + ghost + save green.
- [ ] **Step 4:** Commit anything pending; hand the user the opt-in instructions (`?engine=cm6` or `localStorage.setItem("studioEngine","cm6")`) and the Phase B parity checklist (compile, PDF, SyncTeX↔, texc, outline, sel-pill, read mode, rewrap, diff, py lint) as the acceptance list they exercise on real work.

---

## Self-Review Notes

- **Spec coverage:** ghost/AI reuse → Task 1; façade contract = full measured inventory → Task 3 (each of the 28 methods appears in the code); multi-language (tex/py/r/md/jl/sh/js) → `languageFor`; toggle+guards → Task 4; regression test for today's cursor bug → Task 5.2; deploy → Task 6. Phase B/C explicitly out of scope with their own checklists.
- **Known accepted degradations (Phase A):** scrollbar match annotations absent under cm6; py lint gutter no-op under cm6 (pane still works — gutter is Phase B); `scrollIntoView` margin argument approximated by `y:"center"`.
- **Risk register:** (1) `addKeyMap` reconfigure-append pattern — only 2 call sites, both at init; (2) `charCoords` used by sel-pill/texc popovers — returns viewport coords like CM5 "window" mode, verified same coordinate space; (3) legacy stex mode highlights less richly than CM5 stex — cosmetic; (4) bundle size — measured at build, noted in report.
- **Type consistency:** façade positions are CM5 `{line, ch}` 0-based everywhere; offsets never leak out of `studio_editor.mjs`; `Pass` symbol exported and used by `addKeyMap` contract.
