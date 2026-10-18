import {EditorSelection} from "@codemirror/state";
import {EditorView} from "@codemirror/view";

// Un clic reste un clic (PIEGES_CONNUS §18, 2026-09-30). Deux gestes de
// CodeMirror transformaient un clic ordinaire en sélection :
// - la souris qui bouge d'un ou deux pixels pendant l'appui : CM6 étend la
//   sélection au premier `mousemove`, sans seuil, et un pixel qui franchit la
//   limite entre deux rangées sélectionne une rangée entière ;
// - un clic DANS la sélection existante : CM6 laisse alors le mousedown au
//   navigateur pour permettre le glisser-déposer du texte. Quelques pixels de
//   mouvement suffisent à lancer un glisser natif : la sélection reste, la vue
//   défile quand le pointeur approche d'un bord, et le dépôt DÉPLACE le texte.

/** Mouvement (px) en dessous duquel un appui reste un clic. */
export const CLICK_SLOP = 4;

const plainClick = (event: MouseEvent) => event.button === 0 && event.detail <= 1
  && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;

export const clickGesture = [
  EditorView.domEventHandlers({
    // Avant le gestionnaire de CM6 : la sélection repliée au point du clic, il
    // prend le geste en charge lui-même (pas de glisser natif possible).
    mousedown(event, view) {
      const main = view.state.selection.main;
      if (!plainClick(event) || main.empty || view.state.selection.ranges.length > 1) return false;
      const pos = view.posAtCoords({x: event.clientX, y: event.clientY});
      if (pos != null && pos >= main.from && pos <= main.to) {
        view.dispatch({selection: EditorSelection.cursor(pos), userEvent: "select.pointer"});
      }
      return false;
    },
    // Filet : aucun texte de l'éditeur ne part en glisser natif.
    dragstart(event, view) {
      if (!view.contentDOM.contains(event.target as Node)) return false;
      event.preventDefault();
      return true;
    },
  }),
  EditorView.mouseSelectionStyle.of((view, start) => {
    if (!plainClick(start)) return null;
    let anchor = view.posAndSideAtCoords({x: start.clientX, y: start.clientY}, false);
    let dragging = false;
    return {
      update(update) {
        if (update.docChanged) anchor = {pos: update.changes.mapPos(anchor.pos), assoc: anchor.assoc};
        return false;
      },
      get(event) {
        if (!dragging && Math.max(Math.abs(event.clientX - start.clientX), Math.abs(event.clientY - start.clientY)) < CLICK_SLOP) {
          return EditorSelection.create([EditorSelection.cursor(anchor.pos, anchor.assoc)]);
        }
        dragging = true;
        const head = view.posAndSideAtCoords({x: event.clientX, y: event.clientY}, false);
        return EditorSelection.create([EditorSelection.range(anchor.pos, head.pos, head.assoc)]);
      },
    };
  }),
];
