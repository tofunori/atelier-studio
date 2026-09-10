import {StateEffect, StateField} from "@codemirror/state";
import {Decoration, EditorView, ViewPlugin, WidgetType, layer, RectangleMarker} from "@codemirror/view";
import {getChunks} from "@codemirror/merge";

// Revue « ancrée au passage » (variante F2, 2026-09-10) : la décision est
// posée SUR le changement qu'elle gouverne, pas dans une carte ni une barre.
//  - une pilule inline « l. 173–175 · 3 lignes · Ignorer · Garder » juste
//    après le dernier caractère du changement COURANT ;
//  - un trait gris à gauche, sur les rangées VISUELLES de chaque changement
//    (calculé d'après les coordonnées, donc exact au milieu d'un paragraphe
//    LaTeX, qui n'est qu'une ligne source repliée) ; plus marqué sur le courant.
// Rien de réservé dans le texte, rien dans la barre du haut.

export const setReviewFocus = StateEffect.define();

const reviewFocus = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setReviewFocus)) value = e.value;
    return value == null ? null : tr.changes.mapPos(value);
  },
});

function currentChunk(state) {
  const chunks = getChunks(state)?.chunks || [];
  if (!chunks.length) return null;
  const at = state.field(reviewFocus, false);
  const pos = at == null ? state.selection.main.head : Math.max(0, Math.min(state.doc.length, at));
  return chunks.find(c => c.fromB <= pos && c.endB >= pos) || chunks.find(c => c.fromB >= pos) || chunks[chunks.length - 1];
}

function svg(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d); s.append(p);
  return s;
}

function describe(state, chunk) {
  const doc = state.doc;
  const first = doc.lineAt(chunk.fromB).number;
  const last = doc.lineAt(Math.max(chunk.fromB, chunk.endB - 1)).number;
  const where = first === last ? `l. ${first}` : `l. ${first}–${last}`;
  if (chunk.fromB === chunk.toB) return `${where} · suppression`;
  const lines = last - first + 1;
  if (lines > 1) return `${where} · ${lines} lignes`;
  const words = doc.sliceString(chunk.fromB, chunk.endB).trim().split(/\s+/u).filter(Boolean).length;
  return `${where} · ${words} mot${words > 1 ? "s" : ""}`;
}

class PillWidget extends WidgetType {
  constructor(chunk, label, config) { super(); this.chunk = chunk; this.label = label; this.config = config; }
  eq(other) {
    return other.chunk.fromB === this.chunk.fromB && other.chunk.toB === this.chunk.toB
      && other.label === this.label && other.config.readOnly === this.config.readOnly;
  }
  ignoreEvent() { return true; }
  toDOM(view) {
    const root = document.createElement("span");
    root.className = "atelier-review-pill" + (this.config.readOnly ? " is-readonly" : "");
    root.setAttribute("role", "toolbar"); root.setAttribute("aria-label", "Décision sur ce passage");
    const where = document.createElement("span"); where.className = "atelier-review-where"; where.textContent = this.label;
    root.append(where);
    const button = (cls, d, text, title, onClick) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "atelier-review-act " + cls; b.title = title; b.setAttribute("aria-label", text);
      if (d) b.append(svg(d));
      const t = document.createElement("span"); t.textContent = text; b.append(t);
      b.onmousedown = e => e.preventDefault();
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); onClick(); };
      return b;
    };
    const chunk = this.chunk;
    if (this.config.readOnly) {
      const hint = document.createElement("span"); hint.className = "atelier-review-hint"; hint.textContent = "Lecture seule";
      root.append(hint);
      if (this.config.onLatest) root.append(button("latest", null, "Dernière intervention ›", "Aller à la dernière intervention pour décider (⌥→)", () => this.config.onLatest()));
      return root;
    }
    root.append(
      button("drop", "M6 6l12 12M18 6L6 18", "Ignorer", "Ignorer ce passage (⌥⌫)", () => this.config.onDecision(this.config.decide("reject", chunk))),
      button("keep", "M5 12l5 5L20 7", "Garder", "Garder ce passage (⌥↩)", () => this.config.onDecision(this.config.decide("accept", chunk))),
    );
    return root;
  }
}

function pillDecorations(view, config) {
  const chunk = currentChunk(view.state);
  if (!chunk) return Decoration.none;
  const at = Math.min(view.state.doc.length, chunk.endB);
  const widget = new PillWidget(chunk, describe(view.state, chunk), config);
  return Decoration.set([Decoration.widget({widget, side: 1}).range(at)]);
}

function bracketMarkers(view) {
  const chunks = getChunks(view.state)?.chunks || [];
  if (!chunks.length) return [];
  const current = currentChunk(view.state);
  const scroll = view.scrollDOM.getBoundingClientRect();
  const base = {left: scroll.left - view.scrollDOM.scrollLeft, top: scroll.top - view.scrollDOM.scrollTop};
  const contentLeft = view.contentDOM.getBoundingClientRect().left - base.left;
  const deleted = [...view.contentDOM.querySelectorAll(".cm-deletedChunk")];
  const markers = [];
  for (const chunk of chunks) {
    if (chunk.endB < view.viewport.from || chunk.fromB > view.viewport.to) continue;
    const a = view.coordsAtPos(Math.min(view.state.doc.length, chunk.fromB), 1);
    const b = view.coordsAtPos(Math.min(view.state.doc.length, Math.max(chunk.fromB, chunk.endB)), -1);
    if (!a || !b) continue;
    let top = a.top, bottom = Math.max(a.bottom, b.bottom);
    // Une suppression en bloc s'affiche au-dessus, dans le widget de la
    // ligne effacée : le trait commence en haut de ce widget.
    const widget = deleted.find(el => view.posAtDOM(el) === chunk.fromB);
    if (widget) top = Math.min(top, widget.getBoundingClientRect().top);
    const cls = "atelier-review-bracket" + (chunk === current ? " is-current" : "");
    markers.push(new RectangleMarker(cls, contentLeft - 9, top - base.top, 2, bottom - top));
  }
  return markers;
}

/** Extensions de la revue ancrée. `config` : {onDecision, decide(kind, chunk),
 * readOnly, onLatest}. Sans `onDecision`, la pilule passe en lecture seule. */
export function reviewAnchored(config) {
  const pills = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = pillDecorations(view, config); }
    update(update) {
      if (update.docChanged || update.viewportChanged
        || update.transactions.some(tr => tr.effects.some(e => e.is(setReviewFocus))))
        this.decorations = pillDecorations(update.view, config);
    }
  }, {decorations: v => v.decorations});
  const brackets = layer({
    above: false,
    class: "atelier-review-brackets",
    update: update => update.docChanged || update.viewportChanged || update.geometryChanged
      || update.transactions.some(tr => tr.effects.some(e => e.is(setReviewFocus))),
    markers: view => bracketMarkers(view),
  });
  return [reviewFocus, pills, brackets, EditorView.editorAttributes.of({class: "atelier-review-anchored"})];
}
