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
// numérotées, tableaux (tabular, booktabs, \multicolumn), notes de bas de
// page (appel numéroté, texte en infobulle), macros sans argument du
// préambule, préambule replié, typographie (~, --, ---, ``…'', \%).
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
import {StateEffect, StateField, type ChangeDesc, type Text, type Transaction, type EditorState, type Extension, type Range, type SelectionRange} from "@codemirror/state";
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
const ESCAPED: Record<string, string> = {"\\ ": " ", "\\,": "\u2009", "\\%": "%", "\\&": "&", "\\_": "_", "\\#": "#", "\\$": "$", "\\{": "{", "\\}": "}"};
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

/** Positions des \footnote du corps (commentaires et préambule exclus), par document. */
const footnoteStarts = new WeakMap<Text, number[]>();
function footnoteNumber(state: EditorState, at: number): number {
  let starts = footnoteStarts.get(state.doc);
  if (!starts) {
    starts = [];
    const text = state.doc.toString();
    const body = text.indexOf("\\begin{document}");
    const pattern = /\\[\\%]|%[^\n]*|\\footnote(?![a-zA-Z])/g;
    pattern.lastIndex = Math.max(0, body);
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) if (match[0] === "\\footnote") starts.push(match.index);
    footnoteStarts.set(state.doc, starts);
  }
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (starts[mid]! < at) low = mid + 1; else high = mid;
  }
  return low + 1;
}

/** Note de bas de page repliée en appel de note ; son texte en infobulle. */
function footnoteCandidate(state: EditorState, node: SyntaxNode, context: VisualContext): Candidate | null {
  const argument = node.getChild("TextArgument");
  if (!argument || !sameLine(state, node.from, node.to)) return null;
  const note = plainCaption(state.sliceDoc(argument.from + 1, argument.to - 1), context);
  const marker = new TextWidget(String(footnoteNumber(state, node.from)), "cm-vis-footnote", note);
  return {from: node.from, to: node.to, always: [], rendered: replaced(state, node.from, node.to, marker)};
}

/** Macro sans argument du préambule (\newcommand{\modis}{MODIS}) : son texte. */
function macroCandidate(state: EditorState, node: SyntaxNode, context: VisualContext): Candidate | null {
  const control = node.getChild("CtrlSeq");
  if (!control || !context.macros || !PROSE_PARENTS.has(node.parent?.parent?.name || "")) return null;
  const name = state.sliceDoc(control.from, control.to);
  const value = context.macros[name];
  if (value === undefined) return null;
  const text = plainCaption(value, context);
  if (!text) return null;
  // \modis{} : les accolades vides font partie de l'appel.
  const argument = node.getChild("TextArgument");
  const to = argument && argument.to - argument.from === 2 && argument.from === control.to ? argument.to : control.to;
  return {from: node.from, to, always: [], rendered: replaced(state, node.from, to, new TextWidget(text, "cm-vis-macro", name))};
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
          case "FootnoteCommand": push(footnoteCandidate(state, ref.node, context)); return false;
          case "UnknownCommand": {
            const candidate = macroCandidate(state, ref.node, context);
            if (!candidate) return true;
            push(candidate);
            return false;
          }
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

/** Macros sans argument du préambule (\newcommand{\modis}{MODIS}) remplacées par leur texte. */
export function expandMacros(source: string, macros: Record<string, string> | undefined): string {
  if (!macros || !source.includes("\\")) return source;
  let text = source;
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(/\\[a-zA-Z]+(?![a-zA-Z])(?:\{\})?/g, whole => macros[whole.replace(/\{\}$/, "")] ?? whole);
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Texte lisible d'un fragment de prose, blancs repliés mais pas rognés. */
function plainInline(source: string, context: VisualContext): string {
  let text = expandMacros(source, context.macros);
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/\\(?:emph|textit|textbf|textsc|texttt|underline|textsl|mbox|text|textrm|textsf|textup|textnormal)\{([^{}]*)\}/g, "$1");
  }
  return text
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\footnote\{[^{}]*\}/g, "")
    .replace(/\\(?:cite[a-z]*|parencite|textcite|autocite)(?:\[[^\]]*\])*\{([^}]*)\}/g, (_m, keys: string) =>
      formatCitation("\\citep", [], keys.split(","), context).text)
    .replace(/\\(eqref|ref|cref|Cref|autoref)\{([^}]*)\}/g, (_m, kind: string, key: string) => formatReference(`\\${kind}`, key.trim(), context).text)
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\\\(?:\[[^\]]*\])?/g, " ").replace(/\\ /g, " ")
    .replace(/~/g, " ").replace(/\\([%&_#$])/g, "$1").replace(/---/g, "—").replace(/--/g, "–").replace(/``/g, "“").replace(/''/g, "”")
    .replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ");
}

/** Légende lisible : commandes de mise en forme retirées, pas de rendu riche. */
export function plainCaption(source: string, context: VisualContext): string {
  return plainInline(source, context).trim();
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[char]!);

/** HTML d'un fragment de prose (légende, cellule) : texte lisible, maths en KaTeX. */
export function richInline(source: string, context: VisualContext, math: VisualMath | null, macroKey = ""): string {
  let html = "";
  let last = 0;
  const pattern = /(?<!\\)\$([^$]+)\$|\\\(([\s\S]*?)\\\)/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const tex = (match[1] ?? match[2] ?? "").trim();
    const rendered = math && tex ? renderMath(math, tex, context.macros || {}, macroKey) : null;
    html += escapeHtml(plainInline(source.slice(last, match.index), context));
    html += rendered ? `<span class="cm-vis-math">${rendered}</span>` : escapeHtml(tex);
    last = match.index + match[0].length;
  }
  html += escapeHtml(plainInline(source.slice(last), context));
  return html.replace(/^\s+|\s+$/g, "");
}

// ------------------------------------------------------------ tableaux ----

export interface TableCell {html: string; span: number; align: string}
export interface TableRow {cells: TableCell[]; ruleAbove: boolean; ruleBelow: boolean; header: boolean}

const ALIGN: Record<string, string> = {l: "left", c: "center", r: "right", p: "left", m: "left", b: "left", X: "left", S: "center"};

/** Alignements d'une spécification de colonnes : {l|c r}, p{3cm}, *{3}{c}, @{}, >{…}. */
export function columnAligns(spec: string): string[] {
  const out: string[] = [];
  const group = (from: number): {value: string; end: number} => {
    let depth = 0;
    for (let i = from; i < spec.length; i++) {
      if (spec[i] === "{") depth++;
      else if (spec[i] === "}" && --depth === 0) return {value: spec.slice(from + 1, i), end: i + 1};
    }
    return {value: spec.slice(from + 1), end: spec.length};
  };
  for (let i = 0; i < spec.length;) {
    const char = spec[i]!;
    if (char === "*" && spec[i + 1] === "{") {
      const count = group(i + 1);
      const body = count.end < spec.length && spec[count.end] === "{" ? group(count.end) : {value: "", end: count.end};
      const inner = columnAligns(body.value);
      for (let n = 0; n < Math.min(Number.parseInt(count.value, 10) || 0, 50); n++) out.push(...inner);
      i = body.end;
    } else if ((char === "@" || char === ">" || char === "<" || char === "!") && spec[i + 1] === "{") {
      i = group(i + 1).end;
    } else if (char in ALIGN) {
      out.push(ALIGN[char]!);
      i = spec[i + 1] === "{" && "pmb".includes(char) ? group(i + 1).end : i + 1;
    } else i++;
  }
  return out;
}

const RULE = /\\(?:toprule|midrule|bottomrule|hline|specialrule\{[^}]*\}\{[^}]*\}\{[^}]*\}|cline\{[^}]*\}|cmidrule(?:\([^)]*\))?\{[^}]*\}|addlinespace(?:\[[^\]]*\])?)/g;

/** Cellules d'un tabular : lignes coupées sur \\, cellules sur & (hors accolades). */
export function parseTabular(body: string, spec: string, context: VisualContext, math: VisualMath | null = null, macroKey = ""): TableRow[] {
  const source = body.split("\n").map(line => line.replace(/(?<!\\)%.*$/, "")).join("\n");
  const aligns = columnAligns(spec);
  const rawRows: string[][] = [[]];
  let cell = "";
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (char === "\\") {
      const next = source[i + 1] || "";
      if (next === "\\" && depth === 0) {
        rawRows.at(-1)!.push(cell);
        cell = "";
        rawRows.push([]);
        i++;
        const option = /^\s*\[[^\]]*\]/.exec(source.slice(i + 1));
        if (option) i += option[0].length;
        continue;
      }
      cell += char + next;
      i++;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") depth = Math.max(0, depth - 1);
    if (char === "&" && depth === 0) { rawRows.at(-1)!.push(cell); cell = ""; continue; }
    cell += char;
  }
  rawRows.at(-1)!.push(cell);
  const rows: TableRow[] = [];
  let pendingRule = false;
  let sawMidrule = false;
  for (const raw of rawRows) {
    // Filets en tête de ligne (\hline, \toprule…) : bordure au-dessus.
    const head = raw[0] ?? "";
    const rules = head.match(RULE) || [];
    const cleaned = raw.map((text, index) => (index === 0 ? text.replace(RULE, "") : text));
    if (rules.some(rule => /midrule/.test(rule)) && rows.length && !sawMidrule) {
      sawMidrule = true;
      for (const row of rows) row.header = true;
    }
    const hasRule = rules.length > 0;
    if (cleaned.length === 1 && !cleaned[0]!.trim()) {
      if (hasRule && rows.length) rows.at(-1)!.ruleBelow = true;
      else if (hasRule) pendingRule = true;
      continue;
    }
    const cells: TableCell[] = [];
    let column = 0;
    for (const text of cleaned) {
      const multi = /^\s*\\multicolumn\{(\d+)\}\{([^}]*)\}\{([\s\S]*)\}\s*$/.exec(text);
      const multirow = /^\s*\\multirow\{[^}]*\}\{[^}]*\}\{([\s\S]*)\}\s*$/.exec(text);
      const span = multi ? Math.max(1, Number.parseInt(multi[1]!, 10)) : 1;
      const content = multi ? multi[3]! : multirow ? multirow[1]! : text;
      const align = multi ? columnAligns(multi[2]!)[0] || "left" : aligns[column] || "left";
      cells.push({html: richInline(content, context, math, macroKey), span, align});
      column += span;
    }
    rows.push({cells, ruleAbove: hasRule || pendingRule, ruleBelow: false, header: false});
    pendingRule = false;
  }
  return rows;
}

class TableWidget extends WidgetType {
  readonly rows: TableRow[];
  readonly caption: string;
  readonly label: string;
  readonly captionFirst: boolean;
  constructor(rows: TableRow[], caption: string, label: string, captionFirst: boolean) {
    super();
    this.rows = rows;
    this.caption = caption;
    this.label = label;
    this.captionFirst = captionFirst;
  }
  eq(other: TableWidget) {
    return other.caption === this.caption && other.label === this.label && other.captionFirst === this.captionFirst
      && JSON.stringify(other.rows) === JSON.stringify(this.rows);
  }
  toDOM() {
    const box = document.createElement("div");
    box.className = "cm-vis-table";
    const table = document.createElement("table");
    for (const row of this.rows) {
      const tr = document.createElement("tr");
      if (row.ruleAbove) tr.classList.add("cm-vis-rule-above");
      if (row.ruleBelow) tr.classList.add("cm-vis-rule-below");
      for (const cell of row.cells) {
        const td = document.createElement(row.header ? "th" : "td");
        td.innerHTML = cell.html;
        if (cell.span > 1) td.colSpan = cell.span;
        td.style.textAlign = cell.align;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    const wrap = document.createElement("div");
    wrap.className = "cm-vis-table-scroll";
    wrap.appendChild(table);
    if (this.caption || this.label) {
      const caption = document.createElement("div");
      caption.className = "cm-vis-figure-caption";
      if (this.label) {
        const label = document.createElement("span");
        label.className = "cm-vis-figure-label";
        label.textContent = this.label;
        caption.appendChild(label);
        if (this.caption) caption.appendChild(document.createTextNode(" : "));
      }
      const text = document.createElement("span");
      text.innerHTML = this.caption;
      caption.appendChild(text);
      box.append(...(this.captionFirst ? [caption, wrap] : [wrap, caption]));
    } else box.appendChild(wrap);
    return box;
  }
  ignoreEvent() { return false; }
}

/** Préambule replié : une rangée ; un clic le déplie (curseur posé dedans). */
class PreambleWidget extends WidgetType {
  readonly lines: number;
  readonly target: number;
  constructor(lines: number, target: number) {
    super();
    this.lines = lines;
    this.target = target;
  }
  eq(other: PreambleWidget) { return other.lines === this.lines && other.target === this.target; }
  toDOM(view: EditorView) {
    // Pas de marge sur un widget de bloc : CodeMirror mesure la boîte sans
    // elle et les clics plus bas tomberaient une ligne trop loin.
    const box = document.createElement("div");
    box.className = "cm-vis-preamble-row";
    const row = document.createElement("div");
    row.className = "cm-vis-preamble";
    row.textContent = `Préambule · ${this.lines} lignes`;
    row.title = "Afficher le préambule";
    box.appendChild(row);
    row.addEventListener("mousedown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({selection: {anchor: Math.min(this.target, view.state.doc.length)}, scrollIntoView: true});
      view.focus();
    });
    return box;
  }
  ignoreEvent(event: Event) { return event.type === "mousedown"; }
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

function firstDescendant(node: SyntaxNode, name: string): SyntaxNode | null {
  const cursor = node.cursor();
  while (cursor.next() && cursor.from < node.to) if (cursor.name === name) return cursor.node;
  return null;
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
  const preamble = state.doc.sliceString(0, Math.min(state.doc.length, 20000));
  const tableName = /\\usepackage\[[^\]]*\bfrench\b[^\]]*\]\{babel\}|\\setdefaultlanguage\{french\}|\\usepackage\{french\}/.test(preamble) ? "Tableau" : "Table";
  const tabularRows = (tabular: SyntaxNode): TableRow[] | null => {
    const content = tabular.getChild("Content") ?? firstDescendant(tabular, "TabularContent");
    const specs = tabular.getChild("BeginEnv")?.getChildren("TextArgument") ?? [];
    if (!content || !specs.length) return null;
    const spec = state.sliceDoc(specs.at(-1)!.from + 1, specs.at(-1)!.to - 1);
    const rows = parseTabular(state.sliceDoc(content.from, content.to), spec, context, math, macroKey);
    return rows.length ? rows : null;
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
        case "TableEnvironment": {
          const node = ref.node;
          const lines = wholeLines(state, node.from, node.to);
          const tabular = firstDescendant(node, "TabularEnvironment");
          if (!lines || !tabular) return false;
          const rows = tabularRows(tabular);
          if (!rows) return false;
          const labels: string[] = [];
          let caption = "";
          let captionAt = -1;
          const cursor = node.cursor();
          while (cursor.next() && cursor.from < node.to) {
            if (cursor.name === "Caption" && captionAt < 0) {
              const argument = cursor.node.getChild("TextArgument");
              captionAt = cursor.from;
              if (argument) caption = richInline(state.sliceDoc(argument.from + 1, argument.to - 1), context, math, macroKey);
            } else if (cursor.name === "LabelArgument") {
              labels.push(state.sliceDoc(cursor.from, cursor.to).replace(/^\{|\}$/g, "").trim());
            }
          }
          const number = numberFor(labels, context);
          const label = captionAt >= 0 || number ? `${tableName}${number ? " " + number : ""}` : "";
          out.push({from: node.from, to: node.to, decorations: [blockReplace(lines.from, lines.to, new TableWidget(rows, caption, label, captionAt >= 0 && captionAt < tabular.from))]});
          return false;
        }
        case "TabularEnvironment": {
          const lines = wholeLines(state, ref.from, ref.to);
          const rows = lines && tabularRows(ref.node);
          if (lines && rows) out.push({from: ref.from, to: ref.to, decorations: [blockReplace(lines.from, lines.to, new TableWidget(rows, "", "", false))]});
          return false;
        }
        case "DocumentEnvironment": {
          // Préambule replié jusqu'à \begin{document} inclus. Zone de
          // révélation à partir de 1 : le curseur posé en tête de fichier à
          // l'ouverture ne le déplie pas.
          const begin = ref.node.getChild("BeginEnv");
          if (begin) {
            const beginLine = state.doc.lineAt(begin.to);
            if (beginLine.number > 1 && !state.sliceDoc(begin.to, beginLine.to).trim() && state.doc.lineAt(begin.from).from === begin.from) {
              out.push({from: 1, to: beginLine.to, decorations: [blockReplace(0, beginLine.to, new PreambleWidget(beginLine.number, beginLine.to))]});
            }
          }
          const end = ref.node.getChild("EndEnv");
          const endLines = end && wholeLines(state, end.from, end.to);
          if (end && endLines && state.doc.lineAt(end.from).number === state.doc.lineAt(end.to).number) {
            out.push({from: end.from, to: end.to, decorations: [blockReplace(endLines.from, endLines.to, hiddenLine)]});
          }
          return true;
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
