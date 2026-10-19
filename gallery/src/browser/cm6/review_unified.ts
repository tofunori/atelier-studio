// Diff unifié du .tex (maquette A, 2026-10-18) : un paragraphe entièrement
// ajouté ou retiré n'a pas de mots « changés » à distinguer — le voile de
// ligne suffit. On marque ces passages d'une classe, la CSS retire alors le
// surlignage de mots (sinon tout le paragraphe passe au ton fort).
import {RangeSetBuilder, StateField, type EditorState} from "@codemirror/state";
import {Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate} from "@codemirror/view";
import {getChunks} from "@codemirror/merge";

const pureLine = Decoration.line({class: "atelier-pure-change"});

function pureInsertions(state: EditorState): DecorationSet {
  const chunks = getChunks(state)?.chunks;
  if (!chunks?.length) return Decoration.none;
  const doc = state.doc, builder = new RangeSetBuilder<Decoration>();
  for (const chunk of chunks) {
    if (chunk.fromA < chunk.toA || chunk.fromB >= chunk.toB) continue;
    const last = doc.lineAt(Math.max(chunk.fromB, Math.min(doc.length, chunk.toB - 1))).number;
    for (let n = doc.lineAt(chunk.fromB).number; n <= last; n++) builder.add(doc.line(n).from, doc.line(n).from, pureLine);
  }
  return builder.finish();
}

const insertions = StateField.define<DecorationSet>({
  create: pureInsertions,
  update(deco, tr) {
    return getChunks(tr.state)?.chunks !== getChunks(tr.startState)?.chunks ? pureInsertions(tr.state) : deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Le widget des lignes retirées est construit par @codemirror/merge : on le
// repère dans le DOM et on lui pose la classe quand rien n'a remplacé ce texte.
const deletions = ViewPlugin.fromClass(class {
  constructor(view: EditorView) { this.mark(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks)
      update.view.requestMeasure({read: () => null, write: () => this.mark(update.view)});
  }
  mark(view: EditorView) {
    const chunks = getChunks(view.state)?.chunks || [];
    for (const el of view.contentDOM.querySelectorAll<HTMLElement>(".cm-deletedChunk")) {
      let at: number;
      try { at = view.posAtDOM(el); } catch { continue; }
      const chunk = chunks.find((c) => c.fromB === at || (c.fromB <= at && c.endB >= at));
      el.classList.toggle("atelier-pure-change", !!chunk && chunk.fromB === chunk.toB);
    }
  }
});

export const reviewUnified = [insertions, deletions, EditorView.editorAttributes.of({class: "atelier-unified-review"})];
