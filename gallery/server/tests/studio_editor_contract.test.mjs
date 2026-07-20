import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/cm6/studio_editor.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const studioHtml = await readFile(new URL("../../assets/latex_studio.html", import.meta.url), "utf8");
const editorFactory = await readFile(new URL("../../assets/editor_factory.js", import.meta.url), "utf8").catch(() => "");
const editorFactorySource = await readFile(new URL("../../src/studio/core/editor_factory.ts", import.meta.url), "utf8");
const codeHtml = await readFile(new URL("../../assets/code_editor.html", import.meta.url), "utf8");
const csvTable = await readFile(new URL("../../assets/csv_table.js", import.meta.url), "utf8");
const markdownHtml = await readFile(new URL("../../assets/md_viewer.html", import.meta.url), "utf8");
const themeBridge = await readFile(new URL("../../assets/atelier_theme.js", import.meta.url), "utf8");
const diffViewer = await readFile(new URL("../../assets/diff_viewer.html", import.meta.url), "utf8");
const diffVersionsSource = await readFile(new URL("../../assets/diff_versions.js", import.meta.url), "utf8");
const codeMirrorDiffSource = await readFile(new URL("../../assets/cm6/atelier_diff.mjs", import.meta.url), "utf8");
const selectionBridgeSource = await readFile(new URL("../../src/studio/core/selection_bridge.ts", import.meta.url), "utf8");
const latexFeatureSource = await readFile(new URL("../../src/studio/features/latex/compile.ts", import.meta.url), "utf8");
const latexStatusSource = await readFile(new URL("../../src/studio/features/latex/status_bar.ts", import.meta.url), "utf8");
const latexPdfControlsSource = await readFile(new URL("../../src/studio/features/latex/pdf_controls.ts", import.meta.url), "utf8");
const codeCsvViewSource = await readFile(new URL("../../src/studio/features/code/csv_view.ts", import.meta.url), "utf8");
const latexSurfaceSource = await readFile(new URL("../../src/studio/surfaces/latex.ts", import.meta.url), "utf8");
const codeSurfaceSource = await readFile(new URL("../../src/studio/surfaces/code.ts", import.meta.url), "utf8");
const markdownSurfaceSource = await readFile(new URL("../../src/studio/surfaces/markdown.ts", import.meta.url), "utf8");
const {languageKindFor} = await import("../../assets/cm6/studio_editor.mjs");

test("CM6 facade exposes the complete engine-neutral diff contract", () => {
  for (const method of [
    "posFromIndex", "indexFromPos", "getRange", "setSelection", "setBookmark", "operation",
    "setGutterMarker", "clearGutter", "getViewportAnchor",
  ]) {
    assert.match(source, new RegExp(`\\b${method}\\s*:`), `missing ${method}`);
  }
  assert.doesNotMatch(source, /const facade = \{\s*view[,\s]/,
    "EditorView must stay private to the engine adapter");
});

test("CM6 preserves viewport state and accepts CM5 scroll ranges", () => {
  assert.match(source, /captureScrollableState/);
  assert.match(source, /scrollSnapshot is intentionally not used across a full/);
  assert.match(source, /normalizeScrollTarget/);
  assert.match(source, /EditorSelection\.range/);
  assert.match(source, /y:\s*["']nearest["']/);
  assert.match(source, /yMargin/);
  assert.match(source, /requestMeasure/);
  assert.doesNotMatch(source, /scrollIntoView:\s*\(pos[^]*?y:\s*["']center["']/);
});

test("CM6 selection highlighting is derived without a follow-up mark transaction", () => {
  assert.match(source, /EditorView\.decorations\.compute\(\["selection"\]/);
  assert.match(source, /hasNativeSelectionHighlight:\s*true/);
  assert.match(selectionBridgeSource, /hasNativeSelectionHighlight/);
  assert.match(selectionBridgeSource, /editor\.markText/);
});

test("CM6 uses native tracked decorations, readOnly compartments, and gutter markers", () => {
  assert.match(source, /Decoration\.widget/);
  assert.match(source, /EditorState\.readOnly/);
  assert.match(source, /EditorView\.editable/);
  assert.match(source, /GutterMarker/);
  assert.match(source, /gutterClick/);
});

test("CM6 exposes the official merge renderer behind the engine-neutral diff journal", () => {
  assert.match(source, /from ["']@codemirror\/merge["']/);
  assert.match(source, /hasNativeMergeDiff:\s*true/);
  assert.match(source, /showMergeDiff:/);
  assert.match(source, /hideMergeDiff:/);
  assert.match(source, /unifiedMergeView/);
  assert.match(source, /allowInlineDiffs:\s*true/);
  assert.match(source, /mergeControls:\s*false/);
  assert.match(source, /collapseUnchanged/);
  assert.match(diffVersionsSource, /cm\.hasNativeMergeDiff/);
  assert.match(diffVersionsSource, /cm\.getViewportAnchor/);
  assert.match(diffVersionsSource, /requestAnimationFrame\(\(\) => requestAnimationFrame\(restoreViewport\)\)/);
});

test("CM6 selectAll and native hanging indent are implemented", () => {
  assert.match(source, /selectAll/);
  assert.match(source, /hangingIndent/);
  assert.match(editorFactorySource, /legacyOn\(\s*["']renderLine["']/);
  assert.match(editorFactorySource, /countColumn/);
});

test("CM6 line-class removal handles the Decoration.line attribute shape", () => {
  assert.match(source, /d\.spec\.attributes\?\.class/);
});

test("wrap menu chooses a visible side of the status bar and clamps to the viewport", () => {
  assert.match(latexStatusSource, /const below = viewport\.height - anchor\.bottom - margin/);
  assert.match(latexStatusSource, /below >= menu\.height \|\| below >= above/);
  assert.match(latexStatusSource, /viewport\.height - menu\.height - margin/);
  assert.doesNotMatch(studioHtml, /function openWrapMenu\(/);
});

test("CM6 bundles have one repository-owned deterministic build recipe", async () => {
  assert.equal(pkg.scripts["build:cm6"], "node scripts/build-cm6.mjs");
  assert.equal(pkg.scripts["typecheck:studio"], "tsc -p tsconfig.json");
  const build = await readFile(new URL("../../scripts/build-cm6.mjs", import.meta.url), "utf8");
  assert.match(build, /studio_editor\.mjs/);
  assert.match(build, /latex_cm6_src\.js/);
  assert.match(build, /atelier_diff\.mjs/);
  assert.match(build, /src\/studio\/host\/runtime\.ts/);
  assert.match(build, /src\/studio\/core\/editor_factory\.ts/);
  assert.match(build, /src\/studio\/features\/latex\/index\.ts/);
  assert.match(build, /src\/studio\/features\/code\/index\.ts/);
  assert.match(build, /src\/studio\/features\/markdown\/index\.ts/);
  assert.match(build, /src\/studio\/surfaces\/index\.ts/);
  assert.doesNotMatch(build, /pierre/i);
  assert.match(build, /legalComments:\s*["']none["']/);
});

test("all editor surfaces boot through the shared TypeScript host runtime", () => {
  for (const html of [studioHtml, codeHtml, markdownHtml]) {
    assert.match(html, /studio_runtime\.bundle\.js/);
    assert.match(html, /AtelierStudioRuntime\.bootstrap/);
    assert.doesNotMatch(html, /var orig = window\.fetch\.bind\(window\)/);
  }
  assert.match(studioHtml, /hostBridge:true/);
  assert.match(studioHtml, /latexDisplayPolicy:true/);
});

test("all editor surfaces delegate document lifecycle to the shared TypeScript session", () => {
  for (const html of [studioHtml, codeHtml, markdownHtml]) {
    assert.match(html, /studio_core\.bundle\.js/);
    assert.doesNotMatch(html, /let\s+[^;]*\bdiskMtime\b/);
    assert.doesNotMatch(html, /let\s+[^;]*\blastSavedText\b/);
  }
  for (const implementation of [latexSurfaceSource, codeSurfaceSource, markdownSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?createDocumentSession/);
  }
  assert.match(latexSurfaceSource, /externalReload:\s*["']always["']/);
  assert.match(codeSurfaceSource, /externalReload:\s*["']always["']/);
  assert.match(markdownSurfaceSource, /externalReload:\s*["']when-clean["']/);
});

test("LaTeX and Code share the typed recent-files and picker controller", () => {
  for (const implementation of [latexSurfaceSource, codeSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?createStudioFilePicker/);
    assert.doesNotMatch(implementation, /const EDITABLE =|async function pickerShow\(dir\)/);
  }
});

test("all editor surfaces delegate selection publication to the shared TypeScript bridge", () => {
  for (const implementation of [latexSurfaceSource, codeSurfaceSource, markdownSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?attachEditorSelection/);
  }
  assert.match(latexSurfaceSource, /canPublish:\s*\(\)\s*=>\s*!diff\.isShown\(\)/);
  assert.doesNotMatch(codeHtml, /let\s+selT\s*=/);
  assert.doesNotMatch(markdownHtml, /let\s+selT\s*=/);
});

test("all editor surfaces route keyboard commands through the typed command layer", () => {
  for (const implementation of [latexSurfaceSource, codeSurfaceSource, markdownSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?installStudioCommands/);
  }
});

test("LaTeX and Code share the typed editor wrap controller", () => {
  for (const implementation of [latexSurfaceSource, codeSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?createEditorWrapController/);
    assert.doesNotMatch(implementation, /function applyWrap\(/);
  }
});

test("LaTeX and Code compose the legacy version journal through the typed diff controller", () => {
  for (const implementation of [latexSurfaceSource, codeSurfaceSource]) {
    assert.match(implementation, /(?:AtelierStudioCore\.)?createStudioDiffController/);
    assert.doesNotMatch(implementation, /const\s+__dv\s*=\s*DiffVersions\(/);
  }
});

test("LaTeX line navigation delegates range-aware scrolling to the shared viewport module", () => {
  assert.match(latexSurfaceSource, /revealLineRange/);
  assert.match(latexSurfaceSource, /contextAfter:\s*3/);
  assert.doesNotMatch(latexSurfaceSource, /editor\.scrollIntoView\(\{line:/);
});

test("LaTeX compilation and preflight are owned by the typed feature bundle", () => {
  assert.match(studioHtml, /latex_features\.bundle\.js/);
  assert.match(latexSurfaceSource, /createLatexCompileCoordinator/);
  assert.match(latexFeatureSource, /texPreflight/);
  assert.match(latexFeatureSource, /analyzeCompileResponse/);
  assert.doesNotMatch(studioHtml, /function texPreflight\(/);
});

test("legacy LaTeX ghost compatibility is isolated in TypeScript while CM6 keeps its native extension", () => {
  assert.match(latexSurfaceSource, /installLegacyLatexGhost/);
  assert.doesNotMatch(studioHtml, /function ghostSuggestion\(|LATEX_GHOST_COMMANDS/);
  assert.match(source, /ghostAiExtension/);
  assert.match(source, /hasNativeGhost:\s*opts\.ext\s*===\s*["']tex["']/);
});

test("LaTeX rewrap is composed from the typed feature instead of nested in editor bootstrap", () => {
  assert.match(latexSurfaceSource, /createRewrapController/);
  assert.doesNotMatch(studioHtml, /function rewrapCol\(|function rewrapAll\(/);
});

test("PDF rendering and bidirectional SyncTeX are owned by the typed LaTeX controller", () => {
  assert.match(latexSurfaceSource, /createLatexPdfSyncController/);
  assert.doesNotMatch(studioHtml, /let _pdfToken|let __lastEditAt|bc\.onmessage\s*=/);
  assert.match(latexSurfaceSource, /win\.synctexView\s*=\s*\(silent\)\s*=>\s*ensurePdfSync\(\)\.synctexView\(silent\)/);
});

test("anchored LaTeX comments and their panel are owned by the typed feature", () => {
  assert.match(latexSurfaceSource, /createLatexAnnotationsController/);
  assert.doesNotMatch(studioHtml, /function texcFind\(|let texcAll|texcPanel\.addEventListener/);
});

test("LaTeX selection pill geometry and comment handoff are owned by the typed feature", () => {
  assert.match(latexSurfaceSource, /createLatexSelectionPill/);
  assert.doesNotMatch(studioHtml, /const\s+selApi\s*=\s*SelPill\.attach|function\s+selPillShow\([^]*getBoundingClientRect/);
});

test("LaTeX outline parsing and navigation are owned by the typed feature", () => {
  assert.match(latexSurfaceSource, /createLatexOutlineController/);
  assert.doesNotMatch(studioHtml, /function buildOutline\(|const RE = \^\\s\*\\\\/);
});

test("LaTeX prose reading mode and KaTeX rendering are owned by the typed feature", () => {
  assert.match(latexSurfaceSource, /createLatexReadingController/);
  assert.doesNotMatch(studioHtml, /function texToHtml\(|function renderRead\(/);
});

test("LaTeX status chrome and PDF surface controls are owned by typed controllers", () => {
  assert.match(latexSurfaceSource, /createStudioStatusBar/);
  assert.match(latexSurfaceSource, /createLatexPdfControls/);
  assert.match(latexStatusSource, /export function createStudioStatusBar/);
  assert.match(latexPdfControlsSource, /export function createLatexPdfControls/);
  assert.doesNotMatch(studioHtml, /function setZoom\(|let lintMarks\s*=/);
});

test("Markdown preview modes, rendered selection, and annotations are typed features", () => {
  assert.match(markdownHtml, /studio_surfaces\.bundle\.js/);
  assert.match(markdownHtml, /AtelierStudioSurfaces\.bootstrapMarkdownSurface/);
  assert.match(markdownSurfaceSource, /createMarkdownPreviewController/);
  assert.match(markdownSurfaceSource, /createMarkdownAnnotationsController/);
  assert.doesNotMatch(markdownHtml, /function setMode\(|function ensureOverlay\(|function pushPreviewSel\(/);
});

test("Edited review uses the shared CodeMirror merge view for code, Markdown, and LaTeX", () => {
  assert.match(diffViewer, /atelier_diff\.bundle\.js/);
  assert.match(diffViewer, /Review changes/);
  assert.match(diffViewer, /Unified/);
  assert.match(diffViewer, /Split/);
  assert.match(diffViewer, /githead\?path=/);
  assert.match(diffViewer, /\/code\?path=/);
  assert.match(codeMirrorDiffSource, /from ["']@codemirror\/merge["']/);
  assert.match(codeMirrorDiffSource, /unifiedMergeView/);
  assert.match(codeMirrorDiffSource, /new MergeView/);
  assert.match(codeMirrorDiffSource, /allowInlineDiffs:\s*true/);
  assert.match(codeMirrorDiffSource, /collapseUnchanged/);
});

function factoryHarness({search = "", stored = null, cm6 = true, cm5 = true} = {}) {
  const calls = [];
  const storage = {getItem: key => key === "studioEngine" ? stored : null};
  const document = {documentElement: {dataset: {}}};
  const window = {localStorage: storage};
  if (cm6) window.AtelierStudioCM6 = {createStudioEditor: (parent, options) => {
    calls.push({engine: "cm6", parent, options}); return {engine: "cm6"};
  }};
  if (cm5) window.CodeMirror = (parent, options) => {
    calls.push({engine: "cm5", parent, options});
    const events = [];
    return {
      engine: "cm5", events,
      on() {}, refresh() {}, getOption: () => 2, defaultCharWidth: () => 8,
      getCursor: (side) => side === "anchor" ? {line: 4, ch: 2} : {line: 4, ch: 7},
      getScrollInfo: () => ({left: 11, top: 240}),
      setValue: (text) => events.push(["setValue", text]),
      setSelection: (anchor, head) => events.push(["setSelection", anchor, head]),
      scrollTo: (left, top) => events.push(["scrollTo", left, top]),
    };
  };
  window.CodeMirror && (window.CodeMirror.Pass = Symbol("pass"));
  vm.runInNewContext(editorFactory, {window, document, location: {search}, URLSearchParams, console: {info() {}, warn() {}}});
  return {factory: window.AtelierEditorFactory, calls, storage, document, window};
}

test("shared editor factory executes query then storage then default precedence", () => {
  assert.equal(factoryHarness({search: "?engine=cm6", stored: "cm5"}).factory.resolveEngine("?engine=cm6", {getItem: () => "cm5"}, "cm5"), "cm6");
  assert.equal(factoryHarness().factory.resolveEngine("?engine=bad", {getItem: () => "cm5"}, "cm6"), "cm5");
  assert.equal(factoryHarness().factory.resolveEngine("?engine=bad", {getItem: () => "bad"}, "cm6"), "cm6");
});

test("shared editor factory owns CM5 and CM6 creation for all editor surfaces", () => {
  for (const html of [studioHtml, codeHtml, markdownHtml]) {
    assert.match(html, /editor_factory\.js/);
    assert.match(html, /AtelierEditorFactory/);
  }
  for (const implementation of [latexSurfaceSource, codeSurfaceSource, markdownSurfaceSource]) {
    assert.match(implementation, /(?:AtelierEditorFactory|dependencies\.editorFactory)\.createEditor/);
    assert.match(implementation, /defaultEngine:\s*["']cm6["']/);
  }
  assert.match(editorFactorySource, /AtelierStudioCM6.*createStudioEditor/);
  assert.match(editorFactorySource, /codeMirror\(options\.parent/);
});

test("createEditor behavior routes every extension and unknown text safely", () => {
  const extensions = ["tex", "sty", "bib", "py", "md", "r", "R", "jl", "sh", "bash", "js", "ts", "json", "yaml", "yml", "toml", "unknown"];
  for (const ext of extensions) {
    const cm6 = factoryHarness({search: "?engine=cm6"});
    cm6.factory.createEditor({parent: {}, value: "x", ext, wrap: true, readOnly: false, defaultEngine: "cm6"});
    assert.equal(cm6.calls[0].options.ext, ext === "R" ? "r" : ext);
    const cm5 = factoryHarness({search: "?engine=cm5"});
    assert.doesNotThrow(() => cm5.factory.createEditor({parent: {}, value: "x", ext, defaultEngine: "cm6"}));
    if (["yaml", "yml", "toml", "unknown"].includes(ext)) assert.equal(cm5.calls[0].options.mode, null);
  }
  const json = factoryHarness({search: "?engine=cm5"});
  json.factory.createEditor({parent: {}, value: "{}", ext: "json", defaultEngine: "cm6"});
  assert.equal(json.calls[0].options.mode.name, "javascript");
  assert.equal(json.calls[0].options.mode.json, true);
});

test("the real CM6 resolver selects syntax for every required extension", () => {
  const expected = {
    tex: "stex", sty: "stex", bib: "stex", py: "python", md: "markdown",
    r: "r", R: "r", jl: "julia", sh: "shell", bash: "shell",
    js: "javascript", ts: "typescript", json: "json", yaml: "yaml",
    yml: "yaml", toml: "toml",
  };
  for (const [ext, kind] of Object.entries(expected)) assert.equal(languageKindFor(ext), kind, ext);
  assert.equal(languageKindFor("unknown"), "plain");
  assert.notEqual(new Set(Object.keys(expected).map(languageKindFor)).size, 1);
});

test("missing CM6 reports a controlled CM5 fallback", () => {
  const harness = factoryHarness({search: "?engine=cm6", cm6: false, cm5: true});
  const editor = harness.factory.createEditor({parent: {}, value: "x", ext: "txt", defaultEngine: "cm6"});
  assert.equal(editor.engine, "cm5");
  assert.equal(harness.document.documentElement.dataset.editorEngine, "cm5");
});

test("CM5 fallback preserves selection and viewport when replacing the document", () => {
  const harness = factoryHarness({search: "?engine=cm5"});
  const editor = harness.factory.createEditor({parent: {}, value: "x", ext: "txt", defaultEngine: "cm6"});
  editor.setValue("replacement");
  assert.deepEqual(editor.events, [
    ["setValue", "replacement"],
    ["setSelection", {line: 4, ch: 2}, {line: 4, ch: 7}],
    ["scrollTo", 11, 240],
  ]);
});

test("editor surfaces do not call CM5 APIs outside the factory seam", () => {
  for (const [name, html] of [["latex", studioHtml], ["code", codeHtml], ["markdown", markdownHtml]]) {
    assert.doesNotMatch(html, /\bCodeMirror\.(?:Pass|countColumn)|\bCodeMirror\s*\(|["'](?:inputRead|renderLine)["']/, `${name} leaks a CM5 API`);
  }
});

test("CSV files default to a semantic data table while preserving the source editor", () => {
  assert.match(codeHtml, /csv_table\.js/);
  assert.match(codeHtml, /studio_surfaces\.bundle\.js/);
  assert.match(codeHtml, /AtelierStudioSurfaces\.bootstrapCodeSurface/);
  assert.match(codeSurfaceSource, /createCsvViewController/);
  assert.match(codeHtml, /id="csvView"/);
  assert.match(codeHtml, /id="csvTableBtn"[^>]+aria-pressed="true"/);
  assert.match(codeHtml, /id="csvSourceBtn"[^>]+aria-pressed="false"/);
  assert.match(codeCsvViewSource, /options\.toolkit\.parse\(editor\.getValue\(\)\)/);
  assert.match(csvTable, /detectDelimiter/);
  assert.match(csvTable, /classify/);
  assert.doesNotMatch(codeHtml, /function renderCsv\(|function csvCell\(/);
});

test("every embedded HTML surface loads the shared Atelier theme bridge", async () => {
  const names = [
    "latex_studio.html", "latex_cm6.html", "code_editor.html",
    "md_studio.html", "md_viewer.html", "pdf_viewer.html", "svg_viewer.html", "diff_viewer.html",
  ];
  for (const name of names) {
    const html = await readFile(new URL(`../../assets/${name}`, import.meta.url), "utf8");
    assert.match(html, /atelier_theme\.js/, `${name} must inherit the Atelier theme`);
  }
  assert.match(themeBridge, /atelier-theme-request/);
  assert.match(themeBridge, /atelier-theme-applied/);
  assert.match(themeBridge, /--surface-app/);
  assert.match(themeBridge, /style\.setProperty/);
  const galleryTemplate = await readFile(new URL("../../assets/gallery_template.html", import.meta.url), "utf8");
  assert.match(galleryTemplate, /atelier-theme-request/, "Gallery keeps its build-safe inline bridge");
});
