// latex_visual — éditeur visuel LaTeX, à la manière du « Visual Editor »
// d'Overleaf, écrit pour Atelier (le code d'Overleaf, AGPL, n'est pas repris).
//
// Le fichier .tex reste la seule vérité : on tape toujours dans la source.
// Des décorations CodeMirror cachent le balisage (\section{…}, \emph{…},
// \citep{…}, $…$) et le remplacent par son rendu. Règle unique : une
// construction touchée par le curseur (ou par une extrémité de la sélection)
// se montre en source ; ailleurs, elle est rendue.
//
// Étape 1 : titres, italique/gras/petites capitales/machine/souligné,
// citations et renvois en pastilles, étiquettes, maths en ligne (KaTeX),
// typographie (~, --, ---, ``…'', \%). Les équations centrées, figures,
// listes et tableaux restent en source pour l'instant.
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
import {StateEffect, type EditorState, type Extension, type Range, type SelectionRange} from "@codemirror/state";
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

function renderMath(math: VisualMath, tex: string, macros: Record<string, string>, macroKey: string): string | null {
  const key = `${macroKey}\u0000${tex}`;
  const cached = mathCache.get(key);
  if (cached !== undefined) return cached;
  let html: string;
  try {
    html = math.renderToString(tex, {displayMode: false, throwOnError: true, macros: {...macros}});
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

// -------------------------------------------------------------- plugin ----

export function latexVisual(options: LatexVisualOptions): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    candidates: Candidate[] = [];
    revealed = "";
    pointerDown = false;
    readonly onPointerDown: (event: MouseEvent) => void;
    readonly onPointerUp: () => void;
    readonly onContext: () => void;

    readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.onPointerDown = (event) => { if (event.button === 0) this.pointerDown = true; };
      this.onPointerUp = () => {
        if (!this.pointerDown) return;
        this.pointerDown = false;
        // Hors du cycle de mise à jour : relancer le calcul au relâchement.
        queueMicrotask(() => { if (this.view.dom.isConnected) this.view.dispatch({effects: refreshLatexVisual.of(null)}); });
      };
      this.onContext = () => { if (this.view.dom.isConnected) this.view.dispatch({effects: refreshLatexVisual.of(null)}); };
      // Capture : le drapeau doit être levé AVANT que CodeMirror ne pose la
      // sélection du mousedown, sinon la construction s'ouvrirait sous la souris.
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
      const structural = update.docChanged || update.viewportChanged
        || syntaxTree(update.state) !== syntaxTree(update.startState)
        || update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshLatexVisual)))
        || update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
        || (options.suspended?.(update.state) ?? false) !== (options.suspended?.(update.startState) ?? false);
      // Geste de souris en cours : ne rien reconstruire sur un simple
      // déplacement de sélection (piège n°17), le relâchement relance.
      if (this.pointerDown && !update.docChanged) {
        if (update.viewportChanged) this.decorations = this.decorations.map(update.changes);
        return;
      }
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

  return [plugin, EditorView.editorAttributes.of({class: "cm-latex-visual"})];
}
