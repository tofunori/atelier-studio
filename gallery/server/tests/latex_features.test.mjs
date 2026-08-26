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

test("« 500 m » retrouve « 500~m » : recherche via les substitutions du rendu", () => {
  // Piège vécu : sélectionner « 500 m » (rendu de « 500~m ») ne faisait rien —
  // ni le littéral ni le repli blancs ne traversent un tilde. La vue
  // transformée du source (mêmes substitutions que le rendu, offsets
  // conservés) doit retrouver la plage réelle.
  const tex = "old polygons. At 500~m these surfaces cannot be separated.";
  const editor = {indexFromPos: (p) => p.ch, posFromIndex: (i) => ({line: 0, ch: i})};
  assert.equal(latex.findAnnotationRange(tex, {text: "500 m", from: {line: 0, ch: 0}}, editor), null);
  const range = latex.findRenderedText(tex, "500 m", 0, editor);
  assert.ok(range);
  assert.equal(tex.slice(range.from.ch, range.to.ch), "500~m");
  // Plusieurs occurrences : la plus proche de l'indice de départ gagne.
  const deux = "At 500~m first. Later again at 500~m second.";
  const loin = latex.findRenderedText(deux, "500 m", deux.length, editor);
  assert.equal(loin.from.ch, deux.lastIndexOf("500~m"));
});

test("ancrage par préfixe/suffixe : la prose rendue diffère du source (« \\% » → « % »)", () => {
  // Cas vécu (methods_en.tex) : la sélection commençait sur « with more than
  // 80\,% cloud cover » — rendu de « 80\,\% ». Exiger le fragment entier
  // échouait sur ce seul caractère ; l'ancrage raccourcit mot à mot.
  const tex = "Scenes with more than 80\\,\\% cloud cover are discarded, and the SCL and QA60 masks of the Level-2A product \\cite{mainknorn2017sen2cor} exclude pixels.";
  const editor = {indexFromPos: (p) => p.ch, posFromIndex: (i) => ({line: 0, ch: i})};
  // Le fragment tel que la vue Lecture le voit (vérifié via le rendu réel).
  const fragment = "with more than 80\\,% cloud cover are discarded, and the SCL and QA60 masks of the Level-2A product";
  assert.equal(latex.findAnnotationRange(tex, {text: fragment, from: {line: 0, ch: 0}}, editor), null);
  const range = latex.anchorProseFragments(tex, [fragment], 0, editor);
  assert.ok(range, "le préfixe raccourci doit s'ancrer malgré « \\% » rendu « % »");
  const extrait = tex.slice(range.from.ch, range.to.ch);
  assert.match(extrait, /^with more than/);
  assert.match(extrait, /Level-2A product$/);
  assert.match(extrait, /80\\,\\%/, "la plage couvre le passage transformé");
});

test("le texte RENDU d'une citation n'existe pas dans le source — d'où l'ancrage par fragments", () => {
  // Piège vécu : en vue Lecture, sélectionner un passage contenant une citation
  // ne faisait apparaître aucune pastille, alors qu'un passage de prose pure
  // fonctionnait. `\cite{clé}` est rendu « [clé] » : la sélection brute n'a
  // aucun équivalent littéral dans le fichier.
  const src = "The study area covers western North America \\cite{rgi7consortium2023} over 22 melt seasons.";
  const editor = {indexFromPos: (p) => p.ch, posFromIndex: (i) => ({line: 0, ch: i})};
  const rendu = "western North America [rgi7consortium2023] over 22 melt";
  assert.equal(latex.findAnnotationRange(src, {text: rendu, from: {line: 0, ch: 0}}, editor), null);
  // Les fragments de prose qui l'encadrent, eux, s'ancrent : c'est sur eux que
  // la vue Lecture borne la sélection.
  const head = latex.findAnnotationRange(src, {text: "western North America", from: {line: 0, ch: 0}}, editor);
  const tail = latex.findAnnotationRange(src, {text: "over 22 melt", from: {line: 0, ch: 0}}, editor);
  assert.ok(head && tail);
  assert.ok(tail.to.ch > head.from.ch);
  assert.match(src.slice(head.from.ch, tail.to.ch), /\\cite\{rgi7consortium2023\}/);
});

test("LaTeX reading renderer drops the loader plumbing of an included fragment", () => {
  // Cas réel : un chapitre sans \begin{document}, chargé par un fichier racine.
  // Le préambule est de la plomberie TeX, pas du texte à lire.
  const html = latex.renderLatexReadingHtml([
    "% !TEX root = main_ncomms.tex",
    "\\makeatletter",
    "\\def\\AlbedoLoadNComms{%",
    "  \\IfFileExists{main_ncomms.tex}{\\input{main_ncomms}\\endinput}{%",
    "    \\ifx\\input@path\\@undefined\\def\\input@path{}\\fi",
    "    \\g@addto@macro\\input@path{{manuscript_ch1/}}%",
    "  }%",
    "}",
    "\\makeatother",
    "\\ifdefined\\AlbedoNCommsRoot\\else\\expandafter\\AlbedoLoadNComms\\fi",
    "\\section{Study area}",
    "The study area covers western North America.",
  ].join("\n"), {renderToString: source => `<math>${source}</math>`});
  assert.doesNotMatch(html, /@path|@undefined|addto@macro|main_ncomms|manuscript_ch1/);
  assert.match(html, /<h2 data-line="11">Study area<\/h2>/);
  assert.match(html, /The study area covers western North America\./);
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

test("la compilation automatique est opt-in, hydratée et persistée comme le rewrap", async () => {
  assert.equal(latex.isAutoCompileEnabled({getItem: () => null}), false);
  assert.equal(latex.isAutoCompileEnabled({getItem: () => "1"}), true);
  // hydratation : la valeur serveur amorce le cache local
  const cache = new Map();
  const storage = {getItem: (k) => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v)};
  const fetchServer = async () => ({json: async () => ({texAutoCompile: true})});
  assert.equal(await latex.hydrateAutoCompile(storage, fetchServer), true);
  assert.equal(cache.get("texAutoCompile"), "1");
  // persistance : fusion avec l'état existant, sans l'écraser
  const posts = [];
  const fetchMerge = async (url, init) => {
    if (init?.method === "POST") { posts.push(JSON.parse(init.body)); return {json: async () => ({})}; }
    return {json: async () => ({autre: "réglage", texAutoRewrap: true})};
  };
  await latex.persistAutoCompile(true, fetchMerge);
  assert.deepEqual(posts, [{autre: "réglage", texAutoRewrap: true, texAutoCompile: true}]);
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

test("proseRunRanges maps each findable prose run to its own rendered segment", () => {
  // Texte SOURCE avec une commande au milieu : deux suites de prose.
  const source = "carbon is the sum of \\citep{Chen2019} secondary organic matter";
  // Prose RENDUE : la citation devient « [Chen2019] » — introuvable telle quelle.
  const rendered = "Fire carbon is the sum of [Chen2019] secondary organic matter (POM).";
  const segments = latex.proseRunRanges(rendered, latex.proseRuns(source));
  assert.equal(segments.length, 2);
  assert.equal(rendered.slice(segments[0].start, segments[0].end), "carbon is the sum of");
  assert.equal(rendered.slice(segments[1].start, segments[1].end), "secondary organic matter");
  // Les segments progressent strictement (jamais de retour en arrière).
  assert.ok(segments[1].start >= segments[0].end);
});

test("proseRunRanges skips runs missing from the rendered block without giving up", () => {
  const rendered = "alpha beta gamma delta";
  const segments = latex.proseRunRanges(rendered, ["alpha beta", "absent entirely", "delta long"]);
  // Array.from LOCAL : segments vient du realm VM (prototype d'Array différent)
  assert.deepEqual(Array.from(segments, (s) => rendered.slice(s.start, s.end)), ["alpha beta"]);
  // tableau issu du realm VM : comparer la longueur, pas le prototype
  assert.equal(latex.proseRunRanges("rien ici", ["introuvable totalement"]).length, 0);
});

test("rail de lecture : les sections du fichier, tous niveaux confondus", () => {
  const tex = [
    "\\section{Methodes}",
    "du texte",
    "  \\subsection{Priors}",
    "\\paragraph{Note}",
    "pas une section",
  ].join("\n");
  assert.equal(
    latex.readingSections(tex).map((s) => `${s.line}:${s.title}`).join(" | "),
    "0:Methodes | 2:Priors | 3:Note",
  );
});

test("rail : marques dans l ordre, signet orphelin exclu, libelle sans commandes", () => {
  const pins = [
    {id: "p1", line: 12, text: "les lois a priori sont faiblement informatives", color: "blue"},
    {id: "p2", line: null, text: "passage reecrit, ancrage perdu"},
  ];
  const marks = latex.deriveReadingMarks(pins);
  // un rail ne peut pas montrer une position fausse : l orphelin n a pas d encoche
  assert.equal(marks.length, 1);
  assert.ok(!marks.some((m) => m.id === "p2"));
  assert.equal(marks[0].color, "blue");
  // le libelle d un passage SOURCE est debarrasse des commandes LaTeX
  const cite = latex.deriveReadingMarks([{id: "c", line: 1, text: "albedo \\cite{smith2020} estival"}]);
  assert.ok(!cite[0].label.includes("cite"), cite[0].label);
  // couleur inconnue ou absente : la teinte par defaut (bleu, pas l ambre des
  // commentaires), jamais une classe morte
  assert.equal(latex.deriveReadingMarks([{id: "x", line: 1, text: "abc"}])[0].color, "blue");
  assert.equal(latex.margeColor("chartreuse"), "blue");
});

test("rail : chaque marque tombe sous la derniere section qui la precede", () => {
  const sections = [{line: 10, title: "Priors"}, {line: 40, title: "Inference"}];
  const marks = latex.deriveReadingMarks([
    {id: "a", line: 12, text: "sous Priors"},
    {id: "b", line: 41, text: "sous Inference"},
    {id: "c", line: 3, text: "avant toute section"},
  ]);
  const groups = latex.groupReadingMarge(sections, marks);
  assert.equal(groups.map((g) => g.title || "(tete)").join(" | "), "(tete) | Priors | Inference");
  assert.equal(groups.map((g) => g.marks.length).join(","), "1,1,1");
  assert.equal(groups[1].marks[0].label, "sous Priors");
  // rien avant la premiere section : pas de groupe anonyme fantome
  const propre = latex.groupReadingMarge(sections, latex.deriveReadingMarks(
    [{id: "a", line: 12, text: "sous Priors"}]));
  assert.equal(propre.map((g) => g.title).join(" | "), "Priors | Inference");
});

test("rail : le pli garde les sections marquees et laisse tomber les vides", () => {
  const sections = Array.from({length: 30}, (_, i) => ({line: i * 10, title: `S${i}`}));
  assert.equal(latex.margeMode(sections.length), "marks");
  assert.equal(latex.margeMode(10), "all");
  const marks = latex.deriveReadingMarks([{id: "a", line: 55, text: "un passage epingle"}]);
  const plie = latex.groupReadingMarge(sections, marks, {mode: "marks"});
  assert.equal(plie.length, 1);
  assert.equal(plie[0].title, "S5");
  // rien n est perdu : « tout » rend la vue complete
  assert.equal(latex.groupReadingMarge(sections, marks, {mode: "all"}).length, 30);
});

test("rail : l encoche « ici » suit le defilement, et le bas du document est designe", () => {
  const tops = [0, 200, 400, 600];
  // limite = tiers haut de la fenetre : le dernier point deja passe gagne
  assert.equal(latex.activeMargeIndex(tops, 150, false), 0);
  assert.equal(latex.activeMargeIndex(tops, 450, false), 2);
  // avant la premiere entree : aucune
  assert.equal(latex.activeMargeIndex(tops, -10, false), -1);
  // au bas du document, la derniere entree gagne quel que soit le seuil —
  // sinon la fin n est jamais designee
  assert.equal(latex.activeMargeIndex(tops, 0, true), 3);
  assert.equal(latex.activeMargeIndex([], 100, false), -1);
});

test("signet : ancre par le TEXTE, donc insensible aux lignes ajoutees au-dessus", () => {
  const passage = "les lois a priori sont faiblement informatives";
  const editor = {indexFromPos: (p) => p.ch, posFromIndex: (i) => ({line: 0, ch: i})};
  const pins = [{id: "p1", text: passage, from: {line: 1, ch: 0}, created: 0}];
  const decale = "ligne\n".repeat(200) + passage + "\n";
  assert.notEqual(latex.resolvePins(decale, pins, editor)[0].line, null);
  assert.equal(latex.resolvePins("un texte entierement different\n", pins, editor)[0].line, null);
});

test("rail : il ne montre QUE les marques posees, jamais les commentaires", () => {
  // Vecu 2026-08-26 : le rail derivait les annotations du fichier, donc un
  // chapitre commente donnait un rail plein d ambre que personne n avait
  // demande. Une carte de ce qu on a marque ne se peuple pas toute seule.
  assert.equal(latex.deriveReadingMarks([]).length, 0);
  assert.equal(latex.deriveReadingMarks.length, 1, "une seule entree : les marques");
});

test("ancre d une marque : une suite de prose SOURCE, bornee, sans commandes", () => {
  const src = "Les lois \\emph{a priori} sont faiblement informatives et fixees ainsi avant tout le reste.";
  const anchor = latex.margeAnchorText(src);
  assert.ok(anchor.length >= 4, anchor);
  assert.ok(!anchor.includes("\\"), anchor);
  assert.ok(!anchor.includes("{"), anchor);
  assert.ok(anchor.split(" ").length <= 12, anchor);
  assert.ok(src.startsWith(anchor.split(" ")[0]), anchor);
});
