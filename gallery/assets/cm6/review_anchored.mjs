import {StateEffect, StateField} from "@codemirror/state";
import {Decoration, EditorView, WidgetType, layer, RectangleMarker} from "@codemirror/view";
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
    // Un clic ou une sélection de l'utilisateur reprend la main : le passage
    // courant redevient celui sous le curseur (Thierry 2026-09-11 — en
    // défilant, la rangée restait sur le passage de ‹ ›, hors écran).
    if (tr.isUserEvent("select")) value = null;
    for (const e of tr.effects) if (e.is(setReviewFocus)) value = e.value;
    return value == null ? null : tr.changes.mapPos(value);
  },
});

/** Offset (fromB) du passage courant — pour les raccourcis ⌥↩ / ⌥⌫. */
export function currentReviewOffset(state) {
  const chunk = currentChunk(state);
  return chunk ? chunk.fromB : null;
}

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

/** Étendue RÉELLE du changement côté B : les modifications inline du chunk
 * (mots) quand le moteur les connaît, sinon le chunk entier. C'est ce qui
 * permet de poser la pilule après le dernier mot changé et de tracer le
 * trait sur les mots, pas sur tout le paragraphe (une ligne source). */
function extentB(state, chunk) {
  const doc = state.doc;
  const inline = (chunk.changes || []).filter(c => c.toB > c.fromB || c.toA > c.fromA);
  if (inline.length) {
    const from = Math.min(doc.length, chunk.fromB + Math.min(...inline.map(c => c.fromB)));
    const to = Math.min(doc.length, Math.max(from, chunk.fromB + Math.max(...inline.map(c => c.toB))));
    return {from, to: Math.min(to, Math.max(from, chunk.endB)), count: inline.length};
  }
  return {from: Math.min(doc.length, chunk.fromB), to: Math.min(doc.length, Math.max(chunk.fromB, chunk.endB)), count: 1};
}

function describe(state, chunk) {
  const doc = state.doc;
  const ext = extentB(state, chunk);
  const first = doc.lineAt(ext.from).number;
  const last = doc.lineAt(Math.max(ext.from, ext.to - 1)).number;
  const where = first === last ? `l. ${first}` : `l. ${first}–${last}`;
  if (chunk.fromB === chunk.toB) return `${where} · suppression`;
  const lines = last - first + 1;
  // Pas de décompte des fragments : le diff de mots en produit plus que de
  // retouches réelles, et un nombre qui ne correspond à rien de visible
  // trouble plus qu'il n'aide (Thierry 2026-09-10).
  return lines > 1 ? `${where} · ${lines} lignes` : where;
}

class PillWidget extends WidgetType {
  constructor(chunk, label, config, isCurrent) { super(); this.chunk = chunk; this.label = label; this.config = config; this.isCurrent = isCurrent; }
  eq(other) {
    return other.chunk.fromB === this.chunk.fromB && other.chunk.toB === this.chunk.toB
      && other.label === this.label && other.config.readOnly === this.config.readOnly && other.isCurrent === this.isCurrent;
  }
  ignoreEvent() { return true; }
  toDOM(view) {
    const root = document.createElement("div");
    root.className = "atelier-review-pill" + (this.config.readOnly ? " is-readonly" : "") + (this.isCurrent ? " is-current" : "");
    root.setAttribute("role", "toolbar"); root.setAttribute("aria-label", "Décision sur ce passage");
    const where = document.createElement("span"); where.className = "atelier-review-where"; where.textContent = this.label;
    root.append(where);
    const button = (cls, d, text, title, onClick, withText = false) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "atelier-review-act " + cls; b.title = title; b.setAttribute("aria-label", text);
      if (d) b.append(svg(d));
      // Garder / Ignorer : le symbole seul, le libellé reste en infobulle et
      // pour les lecteurs d'écran (Thierry 2026-09-10, « juste le symbole »).
      if (withText) { const t = document.createElement("span"); t.textContent = text; b.append(t); }
      b.onmousedown = e => e.preventDefault();
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); onClick(); };
      return b;
    };
    const chunk = this.chunk;
    if (this.config.readOnly) {
      const hint = document.createElement("span"); hint.className = "atelier-review-hint"; hint.textContent = "Lecture seule";
      root.append(hint);
      if (this.config.onLatest) root.append(button("latest", null, "Dernière intervention ›", "Aller à la dernière intervention pour décider (⌥→)", () => this.config.onLatest(), true));
      return root;
    }
    root.append(
      button("drop", "M6 6l12 12M18 6L6 18", "Ignorer", "Ignorer ce passage (⌥⌫)", () => this.config.onDecision(this.config.decide("reject", chunk))),
      button("keep", "M5 12l5 5L20 7", "Garder", "Garder ce passage (⌥↩)", () => this.config.onDecision(this.config.decide("accept", chunk))),
    );
    return root;
  }
}

function pillDecorations(state, config) {
  const chunks = getChunks(state)?.chunks || [];
  if (!chunks.length) return Decoration.none;
  const current = currentChunk(state);
  // Une rangée SOUS chaque passage (la courante en accent) : on décide là où
  // l'on est, sans avoir à ramener le passage courant à l'écran (Thierry
  // 2026-09-11). Rangée à part entière sous la dernière ligne changée : une
  // pilule inline au milieu d'une phrase se fondait dans le texte.
  const ranges = chunks.map(chunk => {
    const at = state.doc.lineAt(extentB(state, chunk).to).to;
    return Decoration.widget({widget: new PillWidget(chunk, describe(state, chunk), config, chunk === current), block: true, side: 1}).range(at);
  });
  return Decoration.set(ranges, true);
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
    const ext = extentB(view.state, chunk);
    const a = view.coordsAtPos(ext.from, 1);
    const b = view.coordsAtPos(ext.to, -1);
    if (!a || !b) continue;
    let top = a.top, bottom = Math.max(a.bottom, b.bottom);
    // Une suppression en bloc s'affiche au-dessus, dans le widget de la
    // ligne effacée : le trait commence en haut de ce widget.
    const widget = deleted.find(el => view.posAtDOM(el) === chunk.fromB);
    if (widget) top = Math.min(top, widget.getBoundingClientRect().top);
    const row = view.contentDOM.querySelectorAll(".atelier-review-pill")[chunks.indexOf(chunk)];
    if (row) bottom = Math.max(bottom, row.getBoundingClientRect().bottom);
    const cls = "atelier-review-bracket" + (chunk === current ? " is-current" : "");
    markers.push(new RectangleMarker(cls, contentLeft - 9, top - base.top, 2, bottom - top));
  }
  return markers;
}

/** Extensions de la revue ancrée. `config` : {onDecision, decide(kind, chunk),
 * readOnly, onLatest}. Sans `onDecision`, la pilule passe en lecture seule. */
export function reviewAnchored(config) {
  // Décoration en BLOC (rangée sous le passage) : CodeMirror l'exige depuis
  // un champ d'état, jamais depuis un plugin de vue.
  const pills = StateField.define({
    create: state => pillDecorations(state, config),
    update(deco, tr) {
      if (tr.docChanged || tr.reconfigured || tr.isUserEvent("select") || tr.effects.some(e => e.is(setReviewFocus))) return pillDecorations(tr.state, config);
      return deco;
    },
    provide: f => EditorView.decorations.from(f),
  });
  const brackets = layer({
    above: false,
    class: "atelier-review-brackets",
    update: update => update.docChanged || update.viewportChanged || update.geometryChanged || update.selectionSet
      || update.transactions.some(tr => tr.effects.some(e => e.is(setReviewFocus))),
    markers: view => bracketMarkers(view),
  });
  return [reviewFocus, pills, brackets, EditorView.editorAttributes.of({class: "atelier-review-anchored"})];
}
