import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/latex_features.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const latex = context.AtelierStudioLatex;

test("LaTeX preflight catches active Markdown typos and ignores comments or macro parameters", () => {
  assert.equal(latex.texPreflight("texte\n###{Titre}\n").line, 2);
  assert.equal(latex.texPreflight("texte\n### Titre\n").line, 2);
  assert.equal(latex.texPreflight("texte\n```\n").line, 2);
  assert.equal(latex.texPreflight("% ### brouillon\n"), null);
  assert.equal(latex.texPreflight("\\newcommand{\\x}[1]{#1}\n"), null);
  assert.equal(latex.texPreflight("\\section{Intro}\nTexte avec 50\\%.\n"), null);
});

test("legacy LaTeX ghost helpers strip syntax and track the innermost open environment", () => {
  assert.deepEqual(
    [...latex.latexGhostTokens("Texte utile % commentaire caché\n\\section{Titre} albedo response")],
    ["texte", "utile", "albedo", "response"],
  );
  assert.equal(
    latex.openLatexEnvironment("\\begin{document}\n\\begin{figure}\n\\end{figure}\n"),
    "document",
  );
});

test("legacy LaTeX ghost controller suggests commands without exposing CM5 logic to HTML", () => {
  let value = "\\sec";
  const handlers = {};
  const editor = {
    Pass: Symbol("pass"),
    hasNativeGhost: false,
    hasNativeSelectionHighlight: false,
    getValue: () => value,
    getCursor: () => ({line: 0, ch: value.length}),
    getLine: () => value,
    somethingSelected: () => false,
    addKeyMap: (map) => { handlers.keyMap = map; },
    onInput: (handler) => { handlers.input = handler; },
    on: (event, handler) => { handlers[event] = handler; },
    setBookmark: () => ({clear() {}, find: () => ({line: 0, ch: value.length})}),
    replaceRange: (text) => { value += text; },
  };
  const doc = {createElement: () => ({className: "", innerHTML: ""})};
  const controller = latex.installLegacyLatexGhost(editor, doc);
  assert.equal(controller.suggestion(), "tion");
  value = "\\begin{figure}\n\\end{";
  assert.equal(controller.suggestion(), "figure}");
  assert.equal(typeof handlers.keyMap.Tab, "function");
  assert.equal(typeof handlers.cursorActivity, "function");
});

test("annotation reanchoring survives rewrap whitespace and chooses the nearest occurrence", () => {
  const text = "alpha temperature moyenne\nbeta fin\n---\ntemperature moyenne beta fin\n";
  const editor = {
    indexFromPos: () => text.lastIndexOf("temperature"),
    posFromIndex: (index) => ({line: 0, ch: index}),
  };
  const range = latex.findAnnotationRange(text, {
    text: "temperature moyenne beta",
    from: {line: 99, ch: 0},
  }, editor);
  assert.equal(range.from.ch, text.lastIndexOf("temperature"));
  assert.equal(text.slice(range.from.ch, range.to.ch).replace(/\s+/g, " "), "temperature moyenne beta");
  assert.equal(latex.findAnnotationRange(text, {text: "missing", from: {line: 0, ch: 0}}, editor), null);
});

test("LaTeX reading renderer preserves prose structure, source lines, and math", () => {
  const html = latex.renderLatexReadingHtml([
    "\\begin{document}",
    "\\section{Results}",
    "A \\textbf{strong} result with $x^2$.",
    "\\begin{itemize}",
    "\\item First",
    "\\end{itemize}",
    "\\end{document}",
  ].join("\n"), {renderToString: source => `<math>${source}</math>`});
  assert.match(html, /<h2 data-line="2">Results<\/h2>/);
  assert.match(html, /<strong>strong<\/strong>/);
  assert.match(html, /<math>x\^2<\/math>/);
  assert.match(html, /<li data-line="5">First<\/li>/);
});

test("compile log analysis escapes HTML, counts diagnostics, and creates line jumps", () => {
  const result = latex.analyzeCompileResponse({
    ok: false,
    log: "! Fatal <tag> at l.12\nLaTeX Warning: lines 8--9\nOverfull box",
  });
  assert.equal(result.errors, 1);
  assert.equal(result.warnings, 2);
  assert.match(result.html, /&lt;tag>/);
  assert.match(result.html, /data-l="12"/);
  assert.match(result.html, /data-l="8"/);
  assert.doesNotMatch(result.html, /<tag>/);
});

test("compile coordinator blocks once on preflight then permits an immediate forced compile", async () => {
  const chips = [];
  const states = [];
  const logs = [];
  const compiled = [];
  const stopped = [];
  let requests = 0;
  const coordinator = latex.createLatexCompileCoordinator({
    isTex: true,
    getText: () => "### Titre Markdown\n",
    isDirty: () => false,
    save: async () => true,
    requestCompile: async () => {
      requests += 1;
      return {ok: true, pdf: "/tmp/main.pdf", log: "ok"};
    },
    revealIssue: (issue) => states.push(["reveal", issue.line]),
    setState: (kind, message) => states.push([kind, message]),
    setChip: (kind, message) => chips.push([kind, message]),
    renderLog: (log) => logs.push(log),
    onCompiled: (response) => compiled.push(response.pdf),
    now: () => 100_000,
    clockLabel: () => "12:34",
    startInterval: () => 17,
    stopInterval: (handle) => stopped.push(handle),
  });

  await coordinator.compile();
  assert.equal(requests, 0);
  assert.deepEqual(states[0], ["reveal", 1]);
  assert.match(chips.at(-1)[1], /^L\.1/);

  await coordinator.compile();
  assert.equal(requests, 1);
  assert.equal(logs.length, 1);
  assert.deepEqual(compiled, ["/tmp/main.pdf"]);
  assert.deepEqual(chips.at(-1), ["ok", "compilé en 0,0 s · 12:34"]);
  assert.deepEqual(stopped, [17]);
});

test("compile coordinator never starts compilation when a dirty document cannot be saved", async () => {
  let requested = false;
  const chips = [];
  const states = [];
  const coordinator = latex.createLatexCompileCoordinator({
    isTex: true,
    getText: () => "\\section{Ok}\n",
    isDirty: () => true,
    save: async () => false,
    requestCompile: async () => { requested = true; return {ok: true}; },
    revealIssue: () => {},
    setState: (...args) => states.push(args),
    setChip: (...args) => chips.push(args),
    renderLog: () => {},
    onCompiled: () => {},
    startInterval: () => 1,
    stopInterval: () => {},
  });
  await coordinator.compile();
  assert.equal(requested, false);
  assert.deepEqual(chips.at(-1), ["err", "sauvegarde refusée — compilation annulée"]);
  assert.deepEqual(states.at(-1), ["err", "sauvegarde refusée — compilation annulée"]);
});

test("PDF zoom normalization rejects corrupt storage and clamps supported zoom", () => {
  assert.equal(latex.normalizePdfZoom(null), 1);
  assert.equal(latex.normalizePdfZoom("not-a-number"), 1);
  assert.equal(latex.normalizePdfZoom(0.1), 0.4);
  assert.equal(latex.normalizePdfZoom(9), 3);
  assert.equal(latex.normalizePdfZoom("1.25"), 1.25);
});

test("floating status menus prefer the visible side and remain inside the viewport", () => {
  assert.deepEqual(
    {...latex.floatingMenuPosition({left: 90, top: 20, bottom: 40}, {width: 80, height: 60}, {width: 200, height: 160})},
    {left: 90, top: 46},
  );
  assert.deepEqual(
    {...latex.floatingMenuPosition({left: 190, top: 130, bottom: 150}, {width: 80, height: 80}, {width: 200, height: 160})},
    {left: 112, top: 44},
  );
});

test("automatic LaTeX rewrap remains opt-in and respects the stored preference", () => {
  assert.equal(latex.isAutoRewrapEnabled({getItem: () => null}), false);
  assert.equal(latex.isAutoRewrapEnabled({getItem: () => "1"}), true);
  assert.equal(latex.isAutoRewrapEnabled({getItem: () => "0"}), false);
});

test("window rewrap column uses the real text rectangle with a safety margin", () => {
  const line = {ownerDocument: {defaultView: {getComputedStyle: () => ({paddingLeft: "10px", paddingRight: "14px"})}}};
  const wrapper = {
    clientWidth: 772,
    querySelector: selector => selector.includes("cm-content") ? {clientWidth: 715} : line,
  };
  const editor = {
    getWrapperElement: () => wrapper,
    getGutterElement: () => ({offsetWidth: 42}),
    defaultCharWidth: () => 7.8268,
  };
  assert.equal(latex.rewrapColumn(editor, "win"), 86);
  assert.equal(latex.rewrapColumn(editor, "80"), 80);
});

test("LaTeX selection pill stays inside the actual editor rectangle", () => {
  assert.deepEqual({...latex.selectionPillPosition(
    {left: 100, right: 500, top: 40, bottom: 340, width: 400, height: 300},
    {left: 480, top: 300, bottom: 320},
    {width: 180, height: 42},
  )}, {left: 314, top: 248});
  assert.equal(latex.selectionPillPosition(
    {left: 0, right: 10, top: 0, bottom: 10, width: 10, height: 10},
    {left: 0, top: 0, bottom: 0},
    {width: 20, height: 20},
  ), null);
});
