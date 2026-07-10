(function () {
  "use strict";
  const ENGINES = new Set(["cm5", "cm6"]);
  const CM5_MODES = {
    tex: "stex", sty: "stex", bib: "stex", py: "python", md: "markdown",
    r: "r", jl: "julia", sh: "shell", bash: "shell", js: "javascript",
    ts: "javascript", json: {name: "javascript", json: true},
    yaml: null, yml: null, toml: null,
  };

  function normalizedExt(ext) {
    return ext === "R" ? "r" : String(ext || "").replace(/^\./, "").toLowerCase();
  }

  function resolveEngine(search, storage, defaultEngine) {
    let query = null;
    try { query = new URLSearchParams(search || "").get("engine"); } catch (_) {}
    if (ENGINES.has(query)) return query;
    let saved = null;
    try { saved = storage && storage.getItem("studioEngine"); } catch (_) {}
    if (ENGINES.has(saved)) return saved;
    return ENGINES.has(defaultEngine) ? defaultEngine : "cm6";
  }

  function createEditor(options) {
    let engine = resolveEngine(location.search, window.localStorage, options.defaultEngine);
    if (engine === "cm6" && (!window.AtelierStudioCM6 || typeof window.AtelierStudioCM6.createStudioEditor !== "function")) {
      if (typeof window.CodeMirror !== "function") throw new Error("Atelier editor: neither CM6 nor CM5 is available");
      console.warn("[Atelier editor] CM6 unavailable; falling back to CM5");
      engine = "cm5";
    }
    window.__ENGINE = engine;
    document.documentElement.dataset.editorEngine = engine;
    console.info("[Atelier editor] active engine:", engine);
    if (engine === "cm6") {
      return window.AtelierStudioCM6.createStudioEditor(options.parent, {
        value: options.value || "", ext: normalizedExt(options.ext), wrap: options.wrap !== false,
        readOnly: Boolean(options.readOnly), aiEnabled: options.aiEnabled,
        onGhostState: options.onGhostState,
      });
    }
    const ext = normalizedExt(options.ext);
    const cm5Options = Object.assign({
      value: options.value || "", mode: CM5_MODES[ext] || null,
      theme: "material-darker", lineNumbers: true,
      lineWrapping: options.wrap !== false, readOnly: Boolean(options.readOnly),
      viewportMargin: 50, styleSelectedText: true,
    }, options.cm5Options || {});
    if (typeof window.CodeMirror !== "function") throw new Error("Atelier editor: CM5 fallback unavailable");
    const editor = window.CodeMirror(options.parent, cm5Options);
    editor.Pass = window.CodeMirror.Pass;
    editor.hasNativeGhost = false;
    editor.onInput = (fn) => editor.on("inputRead", fn);
    editor.on("renderLine", function (cm, line, element) {
      const countColumn = window.CodeMirror.countColumn || ((text) => (/^\s*/.exec(text) || [""])[0].length);
      const offset = countColumn(line.text, null, cm.getOption("tabSize")) * cm.defaultCharWidth();
      element.style.textIndent = `-${offset}px`;
      element.style.paddingLeft = `${4 + offset}px`;
    });
    editor.refresh();
    return editor;
  }

  window.AtelierEditorFactory = {resolveEngine, createEditor};
})();
