// latex_lang — LaTeX pour CodeMirror 6 sur le parseur LR incrémental
// d'Overleaf (@overleaf/lezer-latex, AGPL-3.0). Le paquet ne livre que le
// parseur : ce module porte le câblage CM6 — styleTags, pliage, plan par
// nœuds, diagnostics de structure — dans le vocabulaire d'Atelier.
//
// Nœuds utiles (sonde 2026-09-06) : Book/Part/Chapter/Section/SubSection/
// SubSubSection/Paragraph/SubParagraph { SectioningCommand{…CtrlSeq,
// SectioningArgument}, Content } ; Environment/KnownEnvironment>*Environment
// { BeginEnv{Begin, EnvNameGroup}, Content, EndEnv } ; Comment ; DollarMath/
// DisplayMath/BracketMath ; Math ; ⚠ (erreur : groupe/env non fermé).
import {LRLanguage, LanguageSupport, foldNodeProp, foldInside, syntaxTree, ensureSyntaxTree} from "@codemirror/language";
import {styleTags, tags as t} from "@lezer/highlight";
import {parser} from "@overleaf/lezer-latex";

const SECTION_LEVELS = {
  Book: 0, Part: 0, Chapter: 1, Section: 1, SubSection: 2, SubSubSection: 3, Paragraph: 3, SubParagraph: 3,
};
const SECTION_NODES = new Set(Object.keys(SECTION_LEVELS));

function trimTrailingBlank(content, state) {
  // Le Content d'une section avale les sauts de ligne finaux : garder la
  // section suivante sur sa propre ligne une fois le bloc plié.
  let to = content.to;
  const text = state.sliceDoc(content.from, content.to);
  const match = /\n+$/.exec(text);
  if (match) to -= match[0].length;
  return to > content.from ? {from: content.from, to} : null;
}

// Les ~90 séquences de contrôle spécialisées par la grammaire (ItemCtrlSeq,
// TextBoldCtrlSeq, CaptionCtrlSeq…) ne sont PAS des CtrlSeq génériques :
// les colorer par famille de nom, sans en dresser la liste à la main.
// @lezer/highlight garde la PREMIÈRE règle de même spécificité pour un nom :
// les noms qui ont une règle explicite plus bas sont exclus ici, sinon la
// famille les masquerait (vérifié 2026-09-06 : \documentclass restait keyword).
const EXPLICIT_STYLE_NAMES = new Set([
  "DocumentClassCtrlSeq", "UsePackageCtrlSeq",
  "LabelCtrlSeq", "RefCtrlSeq", "RefStarrableCtrlSeq", "CiteCtrlSeq", "CiteStarrableCtrlSeq",
  "LeftCtrlSeq", "RightCtrlSeq", "LineBreakCtrlSym",
]);
function familyStyles() {
  const styles = {};
  for (const type of parser.nodeSet.types) {
    const name = type.name;
    if (!name || /[^A-Za-z]/.test(name) || EXPLICIT_STYLE_NAMES.has(name)) continue;
    if (name.endsWith("CtrlSeq")) styles[name] = t.keyword;
    else if (name.endsWith("CtrlSym")) styles[name] = t.literal;
    else if (name.endsWith("EnvName")) styles[name] = t.typeName;
  }
  return styles;
}

export const latexLanguage = LRLanguage.define({
  name: "latex",
  parser: parser.configure({
    props: [
      foldNodeProp.add({
        Group: foldInside,
        NonEmptyGroup: foldInside,
        TextArgument: foldInside,
        $Environment: (node, state) => {
          const content = node.getChild("Content");
          return content ? trimTrailingBlank(content, state) : null;
        },
        $Section: (node, state) => {
          const content = node.getChild("Content");
          return content ? trimTrailingBlank(content, state) : null;
        },
      }),
      styleTags({
        ...familyStyles(),
        Comment: t.lineComment,
        "CtrlSeq Csname": t.keyword,
        "SectioningArgument/LongArg/...": t.heading,
        "DocumentClassCtrlSeq UsePackageCtrlSeq": t.definitionKeyword,
        "Begin End": t.controlKeyword,
        "EnvNameGroup/...": t.typeName,
        "LabelCtrlSeq RefCtrlSeq RefStarrableCtrlSeq CiteCtrlSeq CiteStarrableCtrlSeq": t.keyword,
        "LabelArgument/... RefArgument/... BibKeyArgument/...": t.labelName,
        "IncludeGraphicsArgument/... InputArgument/... IncludeArgument/... FilePathArgument/... BareFilePathArgument/...": t.string,
        "UrlArgument/... HrefCommand/ShortTextArgument/...": t.link,
        "TextBoldCommand/TextArgument/...": t.strong,
        "TextItalicCommand/TextArgument/... EmphasisCommand/TextArgument/...": t.emphasis,
        "Dollar DoubleDollar OpenBracketMath CloseBracketMath OpenParenMath CloseParenMath": t.string,
        "Math MathChar MathSpecialChar MathCommand/... InlineMath/... DisplayMath/...": t.string,
        "Math/Number": t.number,
        "MathDelimiter LeftCtrlSeq RightCtrlSeq": t.literal,
        Number: t.number,
        "OpenBrace CloseBrace": t.brace,
        "OpenBracket CloseBracket": t.squareBracket,
        "Ampersand Tilde LineBreakCtrlSym LineBreak": t.operator,
        "CtrlSym KnownCtrlSym": t.literal,
        "VerbContent LstInlineContent VerbatimContent": t.monospace,
        "MacroParameter OptionalMacroParameter": t.special(t.variableName),
        "⚠": t.invalid,
      }),
    ],
  }),
  languageData: {
    commentTokens: {line: "%"},
    closeBrackets: {brackets: ["(", "[", "{", "$"]},
  },
});

export function latex() {
  return new LanguageSupport(latexLanguage);
}

/** Plan du document, par nœuds : [{level, title, line (0-based), from}]. */
export function latexOutline(state) {
  // À la demande (ouverture du plan) : finir l'analyse d'un long document
  // plutôt que de servir un plan tronqué à l'arbre partiel.
  const tree = ensureSyntaxTree(state, state.doc.length, 400) || syntaxTree(state);
  const items = [];
  tree.iterate({
    enter(node) {
      if (!SECTION_NODES.has(node.name)) return true;
      const command = node.node.getChild("SectioningCommand");
      const argument = command?.getChild("SectioningArgument");
      let title = "";
      if (argument) {
        title = state.sliceDoc(argument.from, argument.to).replace(/^\{|\}$/g, "").replace(/\s+/g, " ").trim();
      }
      items.push({
        level: SECTION_LEVELS[node.name],
        title,
        line: state.doc.lineAt(node.from).number - 1,
        from: node.from,
      });
      return true;
    },
  });
  return items;
}

/**
 * Diagnostics de structure tirés des nœuds d'erreur du parseur : accolade ou
 * environnement laissés ouverts, \end sans \begin. Sévérité « warning » — la
 * grammaire d'Overleaf ne connaît pas tout TeX (\def acrobatiques, catcodes).
 */
export function latexStructureDiagnostics(state, limit = 40) {
  const tree = syntaxTree(state);
  const diagnostics = [];
  tree.iterate({
    enter(node) {
      if (!node.type.isError || diagnostics.length >= limit) return diagnostics.length < limit;
      let from = node.from;
      let to = node.to;
      // Un nœud d'erreur vide marque l'endroit où le parseur attendait une
      // fermeture : souligner un caractère, pas un point de largeur nulle.
      if (to === from) {
        if (from >= state.doc.length) from = Math.max(0, from - 1);
        to = Math.min(state.doc.length, from + 1);
      }
      if (to <= from) return false;
      const parent = node.node.parent;
      const context = parent?.name || "";
      let message = "structure invalide (accolade ou environnement non fermé ?)";
      // Ancrer sur l'OUVERTURE restée sans fermeture (l'accolade, le \begin)
      // plutôt que sur l'endroit lointain où le parseur a renoncé.
      if (/Environment/.test(context)) {
        message = "environnement non fermé ou \\end inattendu";
        const begin = parent.getChild("BeginEnv");
        if (begin) { from = begin.from; to = begin.to; }
      } else if (/Group|Argument/.test(context)) {
        message = "accolade non fermée";
        const brace = parent.getChild("OpenBrace") || parent.getChild("OpenBracket");
        if (brace) { from = brace.from; to = brace.to; }
      }
      diagnostics.push({from, to, severity: "warning", source: "structure", message});
      return false;
    },
  });
  return diagnostics;
}
