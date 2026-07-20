"use strict";
(() => {
  // src/studio/core/editor_factory.ts
  var ENGINES = /* @__PURE__ */ new Set(["cm5", "cm6"]);
  var CM5_MODES = {
    tex: "stex",
    sty: "stex",
    bib: "stex",
    py: "python",
    md: "markdown",
    r: "r",
    jl: "julia",
    sh: "shell",
    bash: "shell",
    js: "javascript",
    ts: "javascript",
    json: { name: "javascript", json: true },
    yaml: null,
    yml: null,
    toml: null
  };
  function normalizedExt(ext) {
    return ext === "R" ? "r" : String(ext || "").replace(/^\./, "").toLowerCase();
  }
  function resolveEngine(search, storage, defaultEngine) {
    let query = null;
    try {
      query = new URLSearchParams(search || "").get("engine");
    } catch {
    }
    if (ENGINES.has(query)) return query;
    let saved = null;
    try {
      saved = storage?.getItem("studioEngine") || null;
    } catch {
    }
    if (ENGINES.has(saved)) return saved;
    return ENGINES.has(defaultEngine) ? defaultEngine : "cm6";
  }
  function createEditor(options) {
    let engine = resolveEngine(location.search, window.localStorage, options.defaultEngine);
    if (engine === "cm6" && typeof window.AtelierStudioCM6?.createStudioEditor !== "function") {
      if (typeof window.CodeMirror !== "function") throw new Error("Atelier editor: neither CM6 nor CM5 is available");
      console.warn("[Atelier editor] CM6 unavailable; falling back to CM5");
      engine = "cm5";
    }
    window.__ENGINE = engine;
    document.documentElement.dataset.editorEngine = engine;
    console.info("[Atelier editor] active engine:", engine);
    if (engine === "cm6") {
      return window.AtelierStudioCM6.createStudioEditor(options.parent, {
        value: options.value || "",
        ext: normalizedExt(options.ext),
        wrap: options.wrap !== false,
        readOnly: Boolean(options.readOnly),
        aiEnabled: options.aiEnabled,
        onGhostState: options.onGhostState
      });
    }
    const codeMirror = window.CodeMirror;
    if (typeof codeMirror !== "function") throw new Error("Atelier editor: CM5 fallback unavailable");
    const ext = normalizedExt(options.ext);
    const cm5Options = Object.assign({
      value: options.value || "",
      mode: CM5_MODES[ext] || null,
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: options.wrap !== false,
      readOnly: Boolean(options.readOnly),
      viewportMargin: 50,
      styleSelectedText: true
    }, options.cm5Options || {});
    const editor = codeMirror(options.parent, cm5Options);
    editor.Pass = codeMirror.Pass;
    editor.hasNativeGhost = false;
    editor.hasNativeSelectionHighlight = false;
    const replaceValue = editor.setValue.bind(editor);
    editor.setValue = (text) => {
      const anchor = editor.getCursor("anchor");
      const head = editor.getCursor("head");
      const scroll = editor.getScrollInfo();
      const replace = () => {
        replaceValue(text);
        editor.setSelection(anchor, head);
      };
      if (typeof editor.operation === "function") editor.operation(replace);
      else replace();
      editor.scrollTo(scroll.left, scroll.top);
    };
    editor.getViewportAnchor = () => {
      const info = editor.getScrollInfo();
      return { line: editor.lineAtHeight(info.top + info.clientHeight / 2, "local"), ch: 0 };
    };
    const legacyOn = editor.on.bind(editor);
    editor.onInput = (callback) => legacyOn("inputRead", callback);
    legacyOn(
      "renderLine",
      (...args) => {
        const cm = args[0];
        const line = args[1];
        const element = args[2];
        const countColumn = codeMirror.countColumn || ((text) => (/^\s*/.exec(text) || [""])[0].length);
        const tabSize = Number(cm.getOption("tabSize") || 4);
        const offset = countColumn(line.text, null, tabSize) * cm.defaultCharWidth();
        element.style.textIndent = `-${offset}px`;
        element.style.paddingLeft = `${4 + offset}px`;
      }
    );
    editor.refresh();
    return editor;
  }
  window.AtelierEditorFactory = { resolveEngine, createEditor };
})();
