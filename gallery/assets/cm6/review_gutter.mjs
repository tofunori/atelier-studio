import {ViewPlugin} from "@codemirror/view";
import {getChunks} from "@codemirror/merge";

// Controls remain in CM6's deletion widget (and retain its decision handler),
// but are absolutely positioned in the content's reserved left gutter.
// Measure the entire chunk, including wrapped replacement lines, without
// adding block widgets or changing the document's line heights.
export const reviewGutter = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.measure = {
      read: () => {
        const chunks = new Map((getChunks(view.state)?.chunks || []).map(c => [c.fromB, c]));
        const head = view.state.selection.main.head;
        return [...view.contentDOM.querySelectorAll(".cm-deletedChunk:has(.atelier-review-decision)")].flatMap(widget => {
          const chunk = chunks.get(view.posAtDOM(widget));
          if (!chunk) return [];
          const rect = widget.getBoundingClientRect();
          const end = Math.min(view.state.doc.length, chunk.endB);
          const bottom = chunk.fromB === chunk.toB ? rect.bottom : view.documentTop + view.lineBlockAt(end).bottom;
          return [{widget, height: Math.max(1, bottom - rect.top), active: head >= chunk.fromB && head <= chunk.endB}];
        });
      },
      write: measurements => {
        for (const {widget, height, active} of measurements) {
          widget.style.setProperty("--review-height", `${height}px`);
          widget.classList.toggle("atelier-review-compact", height < 48);
          widget.classList.toggle("atelier-review-active", active);
        }
      },
    };
    view.requestMeasure(this.measure);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged || update.selectionSet || update.transactions.length)
      this.view.requestMeasure(this.measure);
  }
});
