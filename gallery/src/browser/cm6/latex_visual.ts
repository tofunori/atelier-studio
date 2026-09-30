// latex_visual — éditeur visuel LaTeX, à la manière du « Visual Editor »
// d'Overleaf, écrit pour Atelier (le code d'Overleaf, AGPL, n'est pas repris).
//
// Le fichier .tex reste la seule vérité : on tape toujours dans la source.
// Des décorations CodeMirror cachent le balisage (\section{…}, \emph{…},
// \citep{…}, $…$) et le remplacent par son rendu. Règle unique : une
// construction touchée par le curseur (ou par une extrémité de la sélection)
// se montre en source ; ailleurs, elle est rendue.
//
// Rendu : titres, italique/gras/petites capitales/machine/souligné,
// citations et renvois en pastilles, étiquettes, maths en ligne et centrées
// (KaTeX, numéro tiré du .aux), figures (image + légende), listes à puces et
// numérotées, typographie (~, --, ---, ``…'', \%). Les tableaux et les
// macros du préambule restent en source pour l'instant.
//
// Contraintes (docs/PIEGES_CONNUS.md) :
// - n°15 : rien de coûteux sur un mouvement de curseur. Les candidats sont
//   calculés une fois par (document, arbre, viewport, contexte) ; un
//   mouvement de curseur ne reconstruit les décorations que si l'ensemble des
//   constructions montrées en source change.
// - n°17 : aucune reconstruction du DOM pendant un geste de sélection à la
//   souris (l'ancre native du glisser se détacherait). Pendant le glisser,
//   les décorations sont figées ; elles suivent au relâchement.
// - Une décoration fournie par un plugin ne peut pas remplacer un saut de
//   ligne : toute construction qui en traverse un reste en source.
import {StateEffect, StateField, type ChangeDesc, type Transaction, type EditorState, type Extension, type Range, type SelectionRange} from "@codemirror/state";
import {Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType} from "@codemirror/view";
import {syntaxTree} from "@codemirror/language";
import type {SyntaxNode, SyntaxNodeRef} from "@lezer/common";

export interface VisualCitation {label?: string; title?: string; url?: string}
export interface VisualContext {
  citations?: Record<string, VisualCitation>;
  references?: Record<string, string>;
  macros?: Record<string, string>;
}
export interface VisualMath {
  renderToString(tex: string, options: Record<string, unknown>): string;
}
export interface LatexVisualOptions {
  /** Bibliographie et numéros du dernier .aux — même source que la Lecture. */
  getContext(): VisualContext;
  /** KaTeX de la page (window.katex) ; absent : les maths restent en source. */
  getMath?(): VisualMath | null | undefined;
  /** Dossiers où chercher les images (\includegraphics) : racine du document, fichier courant. */
  getImageBases?(): string[];
  /** Vrai quand une vue ne doit rien cacher (revue des modifications ouverte). */
  suspended?(state: EditorState): boolean;
}

/** Relance le calcul (contexte bibliographique arrivé, geste terminé). */
export const refreshLatexVisual = StateEffect.define<null>();

const SECTION_LEVEL: Record<string, number> = {
  Book: 0, Part: 0, Chapter: 0, Section: 1, SubSection: 2, SubSubSection: 3, Paragraph: 4, SubParagraph: 4,
};
const TEXT_STYLE: Record<string, string> = {
  EmphasisCommand: "cm-vis-em",
  TextItalicCommand: "cm-vis-em",
  TextSlantedCommand: "cm-vis-em",
  TextBoldCommand: "cm-vis-strong",
  TextSmallCapsCommand: "cm-vis-sc",
  TextTeletypeCommand: "cm-vis-tt",
  UnderlineCommand: "cm-vis-u",
};
const PROSE_PARENTS = new Set(["Content", "Text", "LongArg"]);
const ESCAPED: Record<string, string> = {"\\%": "%", "\\&": "&", "\\_": "_", "\\#": "#", "\\$": "$", "\\{": "{", "\\}": "}"};
const TYPOGRAPHY = /---|--|``|''/g;
const TYPOGRAPHY_TEXT: Record<string, string> = {"---": "—", "--": "–", "``": "“", "''": "”"};

// ---------------------------------------------------------------- widgets --

class TextWidget extends WidgetType {
  readonly text: string;
  readonly className: string;
  readonly title: string;
  constructor(text: string, className: string, title = "") {
    super();
    this.text = text;
    this.className = className;
    this.title = title;
  }
  eq(other: TextWidget) { return other.text === this.text && other.className === this.className && other.title === this.title; }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    if (this.title) span.title = this.title;
    return span;
  }
  // Un clic sur la pastille place le curseur contre elle : elle s'ouvre alors
  // en source, comme chez Overleaf.
  ignoreEvent() { return false; }
}

const mathCache = new Map<string, string>();
class MathWidget extends WidgetType {
  readonly html: string;
  constructor(html: string) {
    super();
    this.html = html;
  }
  eq(other: MathWidget) { return other.html === this.html; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-vis-math";
    span.innerHTML = this.html;
    return span;
  }
  ignoreEvent() { return false; }
}

function renderMath(math: VisualMath, tex: string, macros: Record<string, string>, macroKey: string, displayMode = false): string | null {
  const key = `${displayMode ? "D" : "I"}${macroKey}\u0000${tex}`;
  const cached = mathCache.get(key);
  if (cached !== undefined) return cached;
  let html: string;
  try {
    html = math.renderToString(tex, {displayMode, throwOnError: true, macros: {...macros}});
  } catch {
    // Formule que KaTeX ne sait pas lire : la laisser en source plutôt que
    // d'afficher un rendu d'erreur au milieu de la prose.
    html = "";
  }
  if (mathCache.size > 800) mathCache.delete(mathCache.keys().next().value!);
  mathCache.set(key, html);
  return html || null;
}

// ------------------------------------------------------- mise en forme ----

/** Citation à la natbib : (Ren et al., 2021; Smith, 2020), (voir Ren et al.,
 * 2021, p. 3) ; \citet sans parenthèses. Un argument optionnel = note après,
 * deux = note avant puis note après. */
export function formatCitation(command: string, notes: string[], keys: string[], context: VisualContext): {text: string; title: string} {
  const entries = keys.map(key => key.trim()).filter(Boolean).map(key => ({key, entry: context.citations?.[key]}));
  const labels = entries.map(({key, entry}) => entry?.label || key).join("; ");
  const title = entries.map(({key, entry}) => entry?.title ? `${entry.label || key} : ${entry.title}` : `Référence non résolue : ${key}`).join("\n");
  const cleaned = notes.map(note => note.replace(/~/g, " ").trim());
  const [pre, post] = cleaned.length >= 2 ? cleaned : ["", cleaned[0] || ""];
  const textual = /^(citet|textcite|citeauthor)$/i.test(command.replace(/^\\/, "").replace(/\*$/, ""));
  const inner = `${pre ? pre + " " : ""}${labels}${post ? ", " + post : ""}`;
  return {text: textual ? inner : `(${inner})`, title};
}

const CREF_PREFIX: Array<[RegExp, string, string]> = [
  [/^fig/i, "fig.", "Fig."], [/^tab/i, "tab.", "Tab."], [/^eq/i, "eq.", "Eq."],
  [/^(sec|ssec|subsec)/i, "sec.", "Sec."], [/^(chap|ch)[:.-]/i, "chap.", "Chap."],
];
/** \ref → 3 ; \eqref → (3) ; \cref → fig. 3 (préfixe deviné d'après la clé). */
export function formatReference(command: string, key: string, context: VisualContext): {text: string; title: string; resolved: boolean} {
  const name = command.replace(/^\\/, "").replace(/\*$/, "");
  const number = context.references?.[key];
  if (!number) return {text: key, title: `Renvoi non résolu (compiler pour le numéro) : ${key}`, resolved: false};
  if (name === "eqref") return {text: `(${number})`, title: key, resolved: true};
  if (name === "cref" || name === "Cref" || name === "autoref") {
    const prefix = CREF_PREFIX.find(([pattern]) => pattern.test(key));
    if (prefix) return {text: `${name === "cref" ? prefix[1] : prefix[2]} ${number}`, title: key, resolved: true};
  }
  return {text: number, title: key, resolved: true};
}

// ------------------------------------------------------------ candidats ----

/**
 * Une construction décorable : [from, to] est la zone qui, touchée par le
 * curseur, se montre en source. `always` reste posé dans les deux cas
 * (italique du texte, titre agrandi) ; `rendered` seulement hors du curseur.
 */
interface Candidate {
  from: number;
  to: number;
  always: Range<Decoration>[];
  rendered: Range<Decoration>[];
}

const sameLine = (state: EditorState, from: number, to: number): boolean =>
  from <= to && state.doc.lineAt(from).number === state.doc.lineAt(Math.max(from, to)).number;

const hide = Decoration.replace({});
const hidden = (state: EditorState, from: number, to: number): Range<Decoration>[] =>
  to > from && sameLine(state, from, to) ? [hide.range(from, to)] : [];
const replaced = (state: EditorState, from: number, to: number, widget: WidgetType): Range<Decoration>[] =>
  to > from && sameLine(state, from, to) ? [Decoration.replace({widget}).range(from, to)] : [];

function argumentText(state: EditorState, node: SyntaxNode | null): string {
  if (!node) return "";
  return state.sliceDoc(node.from, node.to).replace(/^[{[]|[}\]]$/g, "");
}

function wrappedCommand(state: EditorState, node: SyntaxNode, markClass: string): Candidate | null {
  const argument = node.getChild("TextArgument");
  const open = argument?.getChild("OpenBrace");
  const close = argument?.getChild("CloseBrace");
  if (!argument || !open || !close) return null;
  const always: Range<Decoration>[] = [];
  if (close.from > open.to) always.push(Decoration.mark({class: markClass}).range(open.to, close.from));
  return {
    from: node.from,
    to: node.to,
    always,
    rendered: [...hidden(state, node.from, open.to), ...hidden(state, close.from, close.to)],
  };
}

function sectionCandidate(state: EditorState, section: SyntaxNode, level: number): Candidate | null {
  const command = section.getChild("SectioningCommand");
  const argument = command?.getChild("SectioningArgument");
  const open = argument?.getChild("OpenBrace");
  const close = argument?.getChild("CloseBrace");
  if (!command || !argument || !open || !close) return null;
  const line = state.doc.lineAt(command.from);
  const always: Range<Decoration>[] = [Decoration.line({class: `cm-vis-heading cm-vis-h${level}`}).range(line.from)];
  return {
    from: command.from,
    to: command.to,
    always,
    rendered: [...hidden(state, command.from, open.to), ...hidden(state, close.from, close.to)],
  };
}

function citeCandidate(state: EditorState, node: SyntaxNode, context: VisualContext): Candidate | null {
  const control = node.firstChild;
  const keys = node.getChild("BibKeyArgument");
  if (!control || !keys || !sameLine(state, node.from, node.to)) return null;
  const notes = node.getChildren("OptionalArgument").map(arg => argumentText(state, arg));
  const {text, title} = formatCitation(state.sliceDoc(control.from, control.to), notes, argumentText(state, keys).split(","), context);
  return {from: node.from, to: node.to, always: [], rendered: replaced(state, node.from, node.to, new TextWidget(text, "cm-vis-chip cm-vis-cite", title))};
}

function refCandidate(state: EditorState, node: SyntaxNode, context: VisualContext): Candidate | null {
  const control = node.firstChild;
  const argument = node.getChild("RefArgument");
  if (!control || !argument || !sameLine(state, node.from, node.to)) return null;
  const key = argumentText(state, argument).trim();
  const {text, title, resolved} = formatReference(state.sliceDoc(control.from, control.to), key, context);
  const className = `cm-vis-chip cm-vis-ref${resolved ? "" : " cm-vis-unresolved"}`;
  return {from: node.from, to: node.to, always: [], rendered: replaced(state, node.from, node.to, new TextWidget(text, className, title))};
}

function labelCandidate(state: EditorState, node: SyntaxNode): Candidate | null {
  const argument = node.getChild("LabelArgument");
  if (!argument || !sameLine(state, node.from, node.to)) return null;
  const key = argumentText(state, argument).trim();
  return {from: node.from, to: node.to, always: [], rendered: replaced(state, node.from, node.to, new TextWidget(key, "cm-vis-label", `Étiquette : ${key}`))};
}

function mathCandidate(state: EditorState, node: SyntaxNode, math: VisualMath | null, context: VisualContext, macroKey: string): Candidate | null {
  if (!math || !sameLine(state, node.from, node.to)) return null;
  const body = node.name === "DollarMath" ? node.getChild("InlineMath") : node.getChild("Math");
  if (!body) return null; // $$…$$ (DisplayMath) : étape 2
  const tex = state.sliceDoc(body.from, body.to).trim();
  if (!tex) return null;
  const html = renderMath(math, tex, context.macros || {}, macroKey);
  if (!html) return null;
  return {from: node.from, to: node.to, always: [], rendered: replaced(state, node.from, node.to, new MathWidget(html))};
}

/** Rang d'un \item dans SA liste (les listes imbriquées comptent à part). */
function itemIndex(item: SyntaxNode, list: SyntaxNode): number {
  let index = 0;
  const cursor = list.cursor();
  while (cursor.next() && cursor.from < item.from) {
    if (cursor.name !== "Item") continue;
    let owner = cursor.node.parent;
    while (owner && owner.name !== "ListEnvironment") owner = owner.parent;
    if (owner && owner.from === list.from) index++;
  }
  return index + 1;
}

function itemCandidate(state: EditorState, node: SyntaxNode): Candidate | null {
  let list = node.parent;
  let depth = 0;
  for (let owner: SyntaxNode | null = node.parent; owner; owner = owner.parent) if (owner.name === "ListEnvironment") depth++;
  while (list && list.name !== "ListEnvironment") list = list.parent;
  if (!list) return null;
  const kind = state.sliceDoc(list.getChild("BeginEnv")?.from ?? list.from, list.getChild("BeginEnv")?.to ?? list.from);
  const option = node.getChild("OptionalArgument");
  let marker = "\u2022";
  if (option) marker = argumentText(state, option).replace(/~/g, " ").trim();
  else if (/\{enumerate\}/.test(kind)) marker = `${itemIndex(node, list)}.`;
  // En tête de ligne : l'indentation source et \item cèdent la place à une
  // puce en retrait suspendu (les lignes repliées s'alignent sur le texte) ;
  // 10 px = marge gauche des lignes du thème (studio_editor.ts, .cm-line).
  const line = state.doc.lineAt(node.from);
  const leading = !state.sliceDoc(line.from, node.from).trim();
  const from = leading ? line.from : node.from;
  const always: Range<Decoration>[] = leading
    ? [Decoration.line({class: "cm-vis-li", attributes: {style: `padding-left:${10 + depth * 24}px;text-indent:-24px`}}).range(line.from)]
    : [];
  return {from: node.from, to: node.to, always, rendered: replaced(state, from, node.to, new TextWidget(marker, option ? "cm-vis-item cm-vis-item-label" : "cm-vis-item"))};
}

function typographyCandidates(state: EditorState, node: SyntaxNodeRef, out: Candidate[]) {
  const text = state.sliceDoc(node.from, node.to);
  TYPOGRAPHY.lastIndex = 0;
  for (let match = TYPOGRAPHY.exec(text); match; match = TYPOGRAPHY.exec(text)) {
    const from = node.from + match.index;
    const to = from + match[0].length;
    out.push({from, to, always: [], rendered: replaced(state, from, to, new TextWidget(TYPOGRAPHY_TEXT[match[0]]!, "cm-vis-glyph"))});
  }
}

/** Collecte les constructions décorables dans [from, to]. Exportée pour les tests. */
export function collectCandidates(state: EditorState, ranges: ReadonlyArray<{from: number; to: number}>, context: VisualContext, math: VisualMath | null): Candidate[] {
  const out: Candidate[] = [];
  const macroKey = JSON.stringify(Object.entries(context.macros || {}).sort(([a], [b]) => a.localeCompare(b)));
  const tree = syntaxTree(state);
  // Un nœud qui déborde sur deux plages visibles (une section entière) est
  // visité deux fois : un seul candidat.
  const seen = new Set<string>();
  const push = (candidate: Candidate | null) => {
    if (!candidate) return;
    const key = `${candidate.from}:${candidate.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };
  for (const {from, to} of ranges) {
    tree.iterate({
      from, to,
      enter(ref) {
        const name = ref.name;
        if (name in SECTION_LEVEL) { push(sectionCandidate(state, ref.node, SECTION_LEVEL[name]!)); return true; }
        const style = TEXT_STYLE[name];
        if (style) { push(wrappedCommand(state, ref.node, style)); return true; }
        switch (name) {
          case "Cite": push(citeCandidate(state, ref.node, context)); return false;
          case "Ref": push(refCandidate(state, ref.node, context)); return false;
          case "Label": push(labelCandidate(state, ref.node)); return false;
          case "Item": push(itemCandidate(state, ref.node)); return false;
          case "DollarMath": case "ParenMath": push(mathCandidate(state, ref.node, math, context, macroKey)); return false;
          case "BracketMath": case "DisplayMath": case "Comment": return false;
          case "Tilde": {
            const parent = ref.node.parent?.name || "";
            if (PROSE_PARENTS.has(parent)) push({from: ref.from, to: ref.to, always: [], rendered: replaced(state, ref.from, ref.to, new TextWidget(" ", "cm-vis-glyph"))});
            return false;
          }
          case "CtrlSym": {
            const glyph = ESCAPED[state.sliceDoc(ref.from, ref.to)];
            if (glyph) push({from: ref.from, to: ref.to, always: [], rendered: replaced(state, ref.from, ref.to, new TextWidget(glyph, "cm-vis-glyph"))});
            return false;
          }
          case "Normal": {
            if (PROSE_PARENTS.has(ref.node.parent?.name || "")) typographyCandidates(state, ref, out);
            return false;
          }
        }
        return true;
      },
    });
  }
  return out;
}

// ------------------------------------------------------------- curseur ----

/** Le curseur (ou une extrémité de sélection) touche-t-il [from, to] ? */
function touches(ranges: readonly SelectionRange[], from: number, to: number): boolean {
  for (const range of ranges) {
    // Extrémités seulement : une sélection qui traverse une citation ne
    // l'ouvre pas (sinon le texte bougerait sous la souris pendant le geste).
    if (range.head >= from && range.head <= to) return true;
    if (range.anchor >= from && range.anchor <= to) return true;
  }
  return false;
}

export function revealedKey(candidates: readonly Candidate[], ranges: readonly SelectionRange[]): string {
  let key = "";
  for (let i = 0; i < candidates.length; i++) if (touches(ranges, candidates[i]!.from, candidates[i]!.to)) key += `${i},`;
  return key;
}

export function buildDecorations(candidates: readonly Candidate[], ranges: readonly SelectionRange[], editable: boolean): DecorationSet {
  const all: Range<Decoration>[] = [];
  for (const candidate of candidates) {
    all.push(...candidate.always);
    if (!editable || !touches(ranges, candidate.from, candidate.to)) all.push(...candidate.rendered);
  }
  return Decoration.set(all, true);
}

// -------------------------------------------------------------- blocs ----
//
// Équations centrées, figures, lignes \begin/\end des listes : ces rendus
// remplacent des lignes entières, donc ils doivent venir d'un StateField
// (CodeMirror refuse qu'un plugin remplace un saut de ligne).

/** Geste de souris en cours : rien ne s'ouvre ni ne se ferme sous le pointeur. */
const setGesture = StateEffect.define<boolean>();
const gestureField = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    for (const effect of tr.effects) if (effect.is(setGesture)) return effect.value;
    return value;
  },
});

const MATH_ARRAY_WRAP: Record<string, string> = {
  align: "aligned", flalign: "aligned", alignat: "alignedat", gather: "gathered", multline: "gathered", eqnarray: "array",
};

/** Source KaTeX d'un environnement mathématique centré (sans \label, \nonumber). */
export function displayMathSource(envName: string, body: string): {tex: string; labels: string[]; numbered: boolean} {
  const labels: string[] = [];
  let tex = body.replace(/\\label\{([^}]*)\}/g, (_m, key: string) => { labels.push(key.trim()); return ""; })
    .replace(/\\(nonumber|notag)\b/g, "").trim();
  const base = envName.replace(/\*$/, "");
  const numbered = !envName.endsWith("*") && base !== "displaymath";
  const wrap = MATH_ARRAY_WRAP[base];
  if (wrap === "array") tex = `\\begin{array}{rcl}${tex}\\end{array}`;
  else if (wrap === "alignedat") tex = `\\begin{alignedat}${tex}\\end{alignedat}`;
  else if (wrap) tex = `\\begin{${wrap}}${tex}\\end{${wrap}}`;
  return {tex, labels, numbered};
}

/** Chemins possibles d'une image \includegraphics (sans extension, \graphicspath). */
export function imageCandidates(rel: string, bases: readonly string[], graphicsPaths: readonly string[] = []): string[] {
  const clean = rel.trim().replace(/^\.\//, "");
  if (!clean) return [];
  const hasExt = /\.(pdf|png|jpe?g|gif|svg|eps|webp)$/i.test(clean);
  const names = hasExt ? [clean] : [".pdf", ".png", ".jpg", ".jpeg", ""].map(ext => clean + ext);
  const out: string[] = [];
  const dirs = clean.startsWith("/") ? [""] : bases.flatMap(base => ["", ...graphicsPaths].map(prefix => {
    const dir = base.replace(/\/+$/, "");
    const sub = prefix.replace(/^\.\//, "").replace(/\/+$/, "");
    return sub ? (sub.startsWith("/") ? sub : `${dir}/${sub}`) : dir;
  }));
  for (const dir of dirs) for (const name of names) {
    const full = dir ? `${dir}/${name}` : name;
    if (!out.includes(full)) out.push(full);
  }
  return out;
}

class DisplayMathWidget extends WidgetType {
  readonly html: string;
  readonly number: string;
  constructor(html: string, number: string) {
    super();
    this.html = html;
    this.number = number;
  }
  eq(other: DisplayMathWidget) { return other.html === this.html && other.number === this.number; }
  toDOM() {
    const box = document.createElement("div");
    box.className = "cm-vis-display";
    const body = document.createElement("div");
    body.className = "cm-vis-display-body";
    body.innerHTML = this.html;
    box.appendChild(body);
    if (this.number) {
      const number = document.createElement("span");
      number.className = "cm-vis-display-number";
      number.textContent = `(${this.number})`;
      box.appendChild(number);
    }
    return box;
  }
  ignoreEvent() { return false; }
}

class FigureWidget extends WidgetType {
  readonly sources: string[][];
  readonly caption: string;
  readonly number: string;
  constructor(sources: string[][], caption: string, number: string) {
    super();
    this.sources = sources;
    this.caption = caption;
    this.number = number;
  }
  eq(other: FigureWidget) {
    return other.caption === this.caption && other.number === this.number
      && JSON.stringify(other.sources) === JSON.stringify(this.sources);
  }
  toDOM() {
    const figure = document.createElement("div");
    figure.className = "cm-vis-figure";
    const row = document.createElement("div");
    row.className = "cm-vis-figure-images";
    for (const candidates of this.sources) {
      const image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      let next = 0;
      const tryNext = () => {
        const url = candidates[next++];
        if (!url) { image.replaceWith(Object.assign(document.createElement("span"), {className: "cm-vis-figure-missing", textContent: "Image introuvable"})); return; }
        image.src = url;
      };
      image.onerror = tryNext;
      tryNext();
      row.appendChild(image);
    }
    if (this.sources.length) figure.appendChild(row);
    if (this.caption || this.number) {
      const caption = document.createElement("div");
      caption.className = "cm-vis-figure-caption";
      if (this.number) {
        const label = document.createElement("span");
        label.className = "cm-vis-figure-label";
        label.textContent = `Figure ${this.number}`;
        caption.appendChild(label);
        if (this.caption) caption.appendChild(document.createTextNode(" : "));
      }
      caption.appendChild(document.createTextNode(this.caption));
      figure.appendChild(caption);
    }
    return figure;
  }
  ignoreEvent() { return false; }
}

class HiddenLineWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const line = document.createElement("div");
    line.className = "cm-vis-hidden-line";
    return line;
  }
  ignoreEvent() { return false; }
}
const hiddenLine = new HiddenLineWidget();

/** Légende lisible : commandes de mise en forme retirées, pas de rendu riche. */
export function plainCaption(source: string, context: VisualContext): string {
  let text = source;
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/\\(?:emph|textit|textbf|textsc|texttt|underline|textsl|mbox|text)\{([^{}]*)\}/g, "$1");
  }
  return text
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\(?:cite[a-z]*|parencite|textcite|autocite)(?:\[[^\]]*\])*\{([^}]*)\}/g, (_m, keys: string) =>
      formatCitation("\\citep", [], keys.split(","), context).text)
    .replace(/\\(eqref|ref|cref|Cref|autoref)\{([^}]*)\}/g, (_m, kind: string, key: string) => formatReference(`\\${kind}`, key.trim(), context).text)
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/~/g, " ").replace(/\\%/g, "%").replace(/\\&/g, "&").replace(/---/g, "—").replace(/--/g, "–")
    .replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

interface BlockCandidate {
  /** Zone qui, touchée par le curseur, se montre en source. */
  from: number;
  to: number;
  decorations: Range<Decoration>[];
}

export interface BlockEnvironment {
  getContext(): VisualContext;
  getMath(): VisualMath | null;
  getImageBases(): string[];
}

/** Débords de la ligne : seul du blanc autour de [from, to] ? */
function wholeLines(state: EditorState, from: number, to: number): {from: number; to: number} | null {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  if (state.sliceDoc(first.from, from).trim() || state.sliceDoc(to, last.to).trim()) return null;
  return {from: first.from, to: last.to};
}

const blockReplace = (from: number, to: number, widget: WidgetType) =>
  Decoration.replace({widget, block: true}).range(from, to);

function numberFor(labels: readonly string[], context: VisualContext): string {
  for (const label of labels) {
    const number = context.references?.[label];
    if (number) return number;
  }
  return "";
}

/** Toutes les constructions en bloc du document. Parcours élagué : ni prose, ni commandes. */
export function collectBlocks(state: EditorState, env: BlockEnvironment): BlockCandidate[] {
  const context = env.getContext() || {};
  const math = env.getMath();
  const macroKey = JSON.stringify(Object.entries(context.macros || {}).sort(([a], [b]) => a.localeCompare(b)));
  const graphicsPaths = [...state.doc.sliceString(0, Math.min(state.doc.length, 20000)).matchAll(/\\graphicspath\{((?:\{[^}]*\})+)\}/g)]
    .flatMap(match => [...match[1]!.matchAll(/\{([^}]*)\}/g)].map(group => group[1]!));
  const out: BlockCandidate[] = [];
  const displayMath = (node: SyntaxNode, envName: string, body: string, labels: string[] = []) => {
    if (!math) return;
    const lines = wholeLines(state, node.from, node.to);
    if (!lines) return;
    const source = displayMathSource(envName, body);
    if (!source.tex) return;
    const html = renderMath(math, source.tex, context.macros || {}, macroKey, true);
    if (!html) return;
    const number = source.numbered ? numberFor([...labels, ...source.labels], context) : "";
    out.push({from: node.from, to: node.to, decorations: [blockReplace(lines.from, lines.to, new DisplayMathWidget(html, number))]});
  };
  syntaxTree(state).iterate({
    enter(ref) {
      switch (ref.name) {
        case "EquationEnvironment": case "EquationArrayEnvironment": {
          const node = ref.node;
          const name = state.sliceDoc(node.getChild("BeginEnv")?.getChild("EnvNameGroup")?.from ?? node.from, node.getChild("BeginEnv")?.getChild("EnvNameGroup")?.to ?? node.from).replace(/[{}]/g, "");
          const content = node.getChild("Content");
          if (name && content) displayMath(node, name, state.sliceDoc(content.from, content.to));
          return false;
        }
        case "BracketMath": {
          const body = ref.node.getChild("Math");
          if (body) displayMath(ref.node, "displaymath", state.sliceDoc(body.from, body.to));
          return false;
        }
        case "DollarMath": {
          const display = ref.node.getChild("DisplayMath")?.getChild("Math");
          if (display) displayMath(ref.node, "displaymath", state.sliceDoc(display.from, display.to));
          return false;
        }
        case "FigureEnvironment": {
          const node = ref.node;
          const lines = wholeLines(state, node.from, node.to);
          if (!lines) return false;
          const images: string[][] = [];
          const labels: string[] = [];
          let caption = "";
          const cursor = node.cursor();
          const bases = env.getImageBases();
          while (cursor.next() && cursor.from < node.to) {
            if (cursor.name === "IncludeGraphicsArgument") {
              const rel = state.sliceDoc(cursor.from, cursor.to).replace(/^\{|\}$/g, "");
              const candidates = imageCandidates(rel, bases, graphicsPaths).map(path => `/thumb?path=${encodeURIComponent(path)}&w=1200`);
              if (candidates.length) images.push(candidates);
            } else if (cursor.name === "Caption" && !caption) {
              const argument = cursor.node.getChild("TextArgument");
              if (argument) caption = plainCaption(state.sliceDoc(argument.from + 1, argument.to - 1), context);
            } else if (cursor.name === "LabelArgument") {
              labels.push(state.sliceDoc(cursor.from, cursor.to).replace(/^\{|\}$/g, "").trim());
            }
          }
          out.push({from: node.from, to: node.to, decorations: [blockReplace(lines.from, lines.to, new FigureWidget(images, caption, numberFor(labels, context)))]});
          return false;
        }
        case "ListEnvironment": {
          // Les lignes \begin{itemize} / \end{itemize} disparaissent ; chacune
          // ne s'ouvre que si le curseur la touche (éditer un \item ne fait
          // pas bouger la liste).
          for (const part of [ref.node.getChild("BeginEnv"), ref.node.getChild("EndEnv")]) {
            if (!part) continue;
            const lines = wholeLines(state, part.from, part.to);
            if (lines && lines.from === state.doc.lineAt(part.from).from && state.doc.lineAt(part.from).number === state.doc.lineAt(part.to).number) {
              out.push({from: part.from, to: part.to, decorations: [blockReplace(lines.from, lines.to, hiddenLine)]});
            }
          }
          return true;
        }
        // Rien de ce qui suit ne contient d'environnement en bloc : élaguer.
        case "Command": case "Normal": case "Whitespace": case "NewLine": case "Comment":
        case "ParenMath": case "Math": return false;
      }
      return true;
    },
  });
  return out;
}

interface BlockState {
  blocks: BlockCandidate[];
  revealed: string;
  decorations: DecorationSet;
}

function revealBlocks(blocks: readonly BlockCandidate[], state: EditorState): {revealed: string; decorations: DecorationSet} {
  const ranges = state.selection.ranges;
  const editable = state.facet(EditorView.editable);
  let revealed = "";
  const all: Range<Decoration>[] = [];
  blocks.forEach((block, index) => {
    if (editable && touches(ranges, block.from, block.to)) { revealed += `${index},`; return; }
    all.push(...block.decorations);
  });
  return {revealed, decorations: Decoration.set(all, true)};
}

const PROSE_EDIT = /^[^\\$%{}[\]&#^_~\n]*$/;
/** Modification de prose pure, loin de tout bloc : aucun bloc ne peut naître ni changer. */
function proseOnly(tr: Transaction, blocks: readonly BlockCandidate[]): boolean {
  let prose = true;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (!prose) return;
    if (!PROSE_EDIT.test(inserted.toString()) || !PROSE_EDIT.test(tr.startState.sliceDoc(fromA, toA))) { prose = false; return; }
    // Une lettre dans \begin{equatio|} ou entre $…$ peut faire naître un bloc.
    const line = tr.startState.doc.lineAt(fromA);
    if (/\\(begin|end|\[|\])|\$\$/.test(line.text)) { prose = false; return; }
    for (const block of blocks) if (fromA <= block.to && toA >= block.from) { prose = false; return; }
  });
  return prose;
}

function mapBlock(block: BlockCandidate, changes: ChangeDesc): BlockCandidate {
  return {
    from: changes.mapPos(block.from, 1),
    to: changes.mapPos(block.to, -1),
    decorations: block.decorations.map(range => range.value.range(changes.mapPos(range.from, 1), changes.mapPos(range.to, -1))),
  };
}

function blockField(env: BlockEnvironment, suspended?: (state: EditorState) => boolean) {
  const build = (state: EditorState): BlockState => {
    if (suspended?.(state)) return {blocks: [], revealed: "", decorations: Decoration.none};
    const blocks = collectBlocks(state, env);
    return {blocks, ...revealBlocks(blocks, state)};
  };
  return StateField.define<BlockState>({
    create: build,
    update(value, tr) {
      const gesture = tr.state.field(gestureField, false);
      const refresh = tr.effects.some(effect => effect.is(refreshLatexVisual) || effect.is(setGesture));
      // Frappe de prose hors de tout bloc : décaler les blocs suffit, sans
      // reparcourir le document (piège n°15 : rien de coûteux par caractère).
      if (tr.docChanged && !refresh && proseOnly(tr, value.blocks)) {
        const blocks = value.blocks.map(block => mapBlock(block, tr.changes));
        return {blocks, ...revealBlocks(blocks, tr.state)};
      }
      // L'arbre qui change sans que le texte change = l'analyse avance
      // (long document) : ne reconstruire que si elle couvre plus de texte.
      const parsed = !tr.docChanged && syntaxTree(tr.state).length !== syntaxTree(tr.startState).length;
      const structural = tr.docChanged || refresh || parsed
        || tr.startState.facet(EditorView.editable) !== tr.state.facet(EditorView.editable)
        || (suspended?.(tr.state) ?? false) !== (suspended?.(tr.startState) ?? false);
      if (gesture && !tr.docChanged) return value;
      if (structural) return build(tr.state);
      if (!tr.selection) return value;
      const next = revealBlocks(value.blocks, tr.state);
      if (next.revealed === value.revealed) return value;
      return {blocks: value.blocks, ...next};
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
  });
}

// -------------------------------------------------------------- plugin ----

export function latexVisual(options: LatexVisualOptions): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    candidates: Candidate[] = [];
    revealed = "";
    readonly onPointerDown: (event: MouseEvent) => void;
    readonly onPointerUp: () => void;
    readonly onContext: () => void;
    readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      // Capture : le geste est déclaré AVANT que CodeMirror ne pose la
      // sélection du mousedown, sinon la construction s'ouvrirait sous la souris.
      this.onPointerDown = (event) => {
        if (event.button === 0 && !this.view.state.field(gestureField)) this.view.dispatch({effects: setGesture.of(true)});
      };
      this.onPointerUp = () => {
        if (!this.view.state.field(gestureField, false)) return;
        // Après la sélection du mouseup de CodeMirror, hors de son cycle.
        queueMicrotask(() => { if (this.view.dom.isConnected) this.view.dispatch({effects: setGesture.of(false)}); });
      };
      this.onContext = () => { if (this.view.dom.isConnected) this.view.dispatch({effects: refreshLatexVisual.of(null)}); };
      view.dom.addEventListener("mousedown", this.onPointerDown, true);
      view.dom.ownerDocument.addEventListener("mouseup", this.onPointerUp, true);
      view.dom.ownerDocument.addEventListener("pointercancel", this.onPointerUp, true);
      view.dom.ownerDocument.defaultView?.addEventListener("atelier-latex-context", this.onContext);
      this.recompute(view);
    }

    recompute(view: EditorView) {
      if (options.suspended?.(view.state)) {
        this.candidates = [];
        this.revealed = "";
        this.decorations = Decoration.none;
        return;
      }
      this.candidates = collectCandidates(view.state, view.visibleRanges, options.getContext() || {}, options.getMath?.() || null);
      const ranges = view.state.selection.ranges;
      this.revealed = revealedKey(this.candidates, ranges);
      this.decorations = buildDecorations(this.candidates, ranges, view.state.facet(EditorView.editable));
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshLatexVisual) || effect.is(setGesture)));
      const structural = update.docChanged || update.viewportChanged || refresh
        || syntaxTree(update.state) !== syntaxTree(update.startState)
        || update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
        || (options.suspended?.(update.state) ?? false) !== (options.suspended?.(update.startState) ?? false);
      // Geste de souris en cours : ne rien reconstruire sur un simple
      // déplacement de sélection (piège n°17), le relâchement relance.
      if (update.state.field(gestureField) && !update.docChanged) return;
      if (structural) { this.recompute(update.view); return; }
      if (!update.selectionSet) return;
      const ranges = update.state.selection.ranges;
      const key = revealedKey(this.candidates, ranges);
      if (key === this.revealed) return;
      this.revealed = key;
      this.decorations = buildDecorations(this.candidates, ranges, update.state.facet(EditorView.editable));
    }

    destroy() {
      this.view.dom.removeEventListener("mousedown", this.onPointerDown, true);
      this.view.dom.ownerDocument.removeEventListener("mouseup", this.onPointerUp, true);
      this.view.dom.ownerDocument.removeEventListener("pointercancel", this.onPointerUp, true);
      this.view.dom.ownerDocument.defaultView?.removeEventListener("atelier-latex-context", this.onContext);
    }
  }, {decorations: value => value.decorations});

  const blocks = blockField({
    getContext: () => options.getContext() || {},
    getMath: () => options.getMath?.() || null,
    getImageBases: () => options.getImageBases?.() || [],
  }, options.suspended);

  return [gestureField, blocks, plugin, EditorView.editorAttributes.of({class: "cm-latex-visual"})];
}
