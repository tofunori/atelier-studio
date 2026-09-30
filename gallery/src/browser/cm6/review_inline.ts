// Revue LaTeX tout en ligne (Thierry 2026-09-30 : « je ne veux pas ça » à
// propos de l'ancienne version affichée en bloc au-dessus d'un paragraphe
// dont le nombre de lignes change).
//
// @codemirror/merge n'affiche en ligne qu'un passage de même nombre de lignes
// (< 10) sans retour à la ligne supprimé ; sinon il pose l'ancienne version
// dans un widget de bloc. Pour le .tex, on lui retire le rendu (inline et
// surlignage) et on dessine nous-mêmes chaque changement dans le texte : mots
// partants en <del class="cm-deletedText">, mots arrivants en
// .cm-changedText. Le widget de bloc reste (vide, hauteur nulle) : la revue
// ancrée s'y repère. Un changement fait uniquement d'espaces (retour à la
// ligne ↔ espace d'un paragraphe réagencé) ne se dessine pas.
import {StateField, type EditorState, type Range} from "@codemirror/state";
import {Decoration, EditorView, WidgetType, type DecorationSet} from "@codemirror/view";
import {getChunks, getOriginalDoc} from "@codemirror/merge";

class InlineDeletion extends WidgetType {
  readonly text: string;
  constructor(text: string) { super(); this.text = text; }
  eq(other: InlineDeletion) { return other.text === this.text; }
  toDOM() {
    const el = document.createElement("del");
    el.className = "cm-deletedText";
    el.textContent = this.text;
    return el;
  }
}

const changedText = Decoration.mark({class: "cm-changedText"});

/** Texte retiré tel qu'il s'affiche dans la ligne : retours à la ligne
 * aplatis en espaces ; vide s'il n'y avait que des espaces. */
export function inlineDeletedText(raw: string) {
  return /\S/.test(raw) ? raw.replace(/\s*\n\s*/g, " ").trim() : "";
}

function build(state: EditorState): DecorationSet {
  const chunks = getChunks(state)?.chunks;
  if (!chunks?.length) return Decoration.none;
  const a = getOriginalDoc(state), b = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (const chunk of chunks) {
    for (const ch of chunk.changes) {
      const at = chunk.fromB + ch.fromB;
      if (ch.fromA < ch.toA) {
        const raw = a.sliceString(chunk.fromA + ch.fromA, chunk.fromA + ch.toA);
        const text = inlineDeletedText(raw);
        if (text) {
          // Des lignes entières retirées : on les montre au bout de la ligne
          // d'avant (souvent la ligne vide entre deux paragraphes) plutôt que
          // collées au début de la suivante.
          const wholeLines = raw.endsWith("\n") && at > 0 && b.sliceString(at - 1, at) === "\n";
          const pos = wholeLines ? at - 1 : at;
          ranges.push(Decoration.widget({widget: new InlineDeletion(text), side: wholeLines ? 1 : -1}).range(pos));
        }
      }
      if (ch.fromB < ch.toB) {
        // Surlignage à ras des mots : pas d'espace ni de retour à la ligne
        // teinté au bord de l'ajout.
        const ins = b.sliceString(at, chunk.fromB + ch.toB);
        const lead = ins.length - ins.trimStart().length, body = ins.trim();
        if (body) ranges.push(changedText.range(at + lead, at + lead + body.length));
      }
    }
  }
  return Decoration.set(ranges, true);
}

export const reviewInline = [
  StateField.define<DecorationSet>({
    create: build,
    update(deco, tr) {
      return getChunks(tr.state)?.chunks !== getChunks(tr.startState)?.chunks ? build(tr.state) : deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.editorAttributes.of({class: "atelier-inline-review"}),
];
