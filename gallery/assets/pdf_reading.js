// Mode lecture : fonctions pures (DOM de la colonne, découpes de figures,
// sélection → rectangles d'annotation, ancrage des annotations, position).
// UMD classique comme pdf_passage.js : chargé par <script>, testé sous node.
(function(root, factory){
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfReading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(root){
  /** Texte tel qu'affiché : lignes jointes par un espace. Les offsets de la
   *  sélection et de l'ancrage se calculent sur CETTE chaîne. */
  function readingText(block){
    return (block.lines || []).map(function(l){ return l.text; }).join(" ");
  }

  function buildReadingDom(doc, hooks){
    var d = hooks.document, frag = d.createDocumentFragment(), list = null;
    (doc.blocks || []).forEach(function(b){
      var el;
      if (b.kind === "list") {
        if (!list) { list = d.createElement("ul"); frag.appendChild(list); }
        el = d.createElement("li");
        el.textContent = readingText(b).replace(/^\s*(?:[•\-–]|\d+[.)])\s+/, "");
        list.appendChild(el);
      } else {
        list = null;
        if (b.kind === "heading") { el = d.createElement("h" + Math.min(3, Math.max(1, b.level || 1))); el.textContent = readingText(b); }
        else if (b.kind === "figure" || b.kind === "table" || b.kind === "math") { el = d.createElement("figure"); el.className = b.kind; el.appendChild(hooks.makeFigure(b)); }
        else { el = d.createElement("p"); if (b.kind !== "paragraph") el.className = b.kind; el.textContent = readingText(b); }
        frag.appendChild(el);
      }
      el.dataset.block = String(b.id); el.dataset.page = String(b.page);
    });
    return frag;
  }

  function cropViewport(pdfPage, block, cssScale, dpr){
    var x1 = block.bbox[0], y1 = block.bbox[1], x2 = block.bbox[2], y2 = block.bbox[3];
    var viewport = pdfPage.getViewport({scale: cssScale, offsetX: -x1 * cssScale, offsetY: -y1 * cssScale});
    var width = (x2 - x1) * cssScale, height = (y2 - y1) * cssScale;
    return {viewport: viewport, width: width, height: height, canvasWidth: Math.round(width * dpr), canvasHeight: Math.round(height * dpr)};
  }

  /** Offsets [start,end) dans readingText(block) → {page, text, rects normalisés}. */
  function selectionToAnnotation(block, start, end, pageDim){
    var lines = block.lines || [], rects = [], pos = 0, text = readingText(block).slice(start, end);
    lines.forEach(function(l){
      var len = l.text.length, ls = pos, le = pos + len;
      pos = le + 1; // + espace de jointure
      if (le <= start || ls >= end) return;
      var a = Math.max(start, ls) - ls, b = Math.min(end, le) - ls;
      var w = l.bbox[2] - l.bbox[0], h = l.bbox[3] - l.bbox[1];
      var x = l.bbox[0] + w * (len ? a / len : 0), xe = l.bbox[0] + w * (len ? b / len : 1);
      rects.push([x / pageDim.w, l.bbox[1] / pageDim.h, (xe - x) / pageDim.w, h / pageDim.h]);
    });
    return {page: block.page, text: text, rects: rects};
  }

  function anchorAnnotations(doc, annots){
    var passage = root.AtelierPdfPassage, out = [];
    if (!passage) return out;
    (annots || []).forEach(function(a){
      if (!(a.kind === "comment" || a.kind === "hl") || !a.text) return;
      var page = Number(a.page) || 1;
      var candidates = (doc.blocks || []).filter(function(b){ return b.lines && b.lines.length && Math.abs(b.page - page) <= 1; });
      candidates.sort(function(x, y){ return Math.abs(x.page - page) - Math.abs(y.page - page); });
      for (var i = 0; i < candidates.length; i++) {
        var b = candidates[i], texts = b.lines.map(function(l){ return l.text; });
        var m = passage.findAllSpanRanges(texts, a.text);
        if (!m || !m.length) continue;
        var r = m[0], offs = [], p = 0;
        texts.forEach(function(t){ offs.push(p); p += t.length + 1; });
        // findAllSpanRanges renvoie {start, end} en index de spans ; on
        // affine aux caractères en normalisant en forme COMPACTE (sans
        // espaces) les deux côtés, car c'est la forme que findAllSpanRanges
        // utilise pour son second index (tolérance à la césure/espacement).
        var slice = texts.slice(r.start, r.end + 1).join(" ");
        var norm = passage.normalize, target = norm(a.text).replace(/ /g, ""), lo = 0, hi = slice.length;
        for (var s = 0; s < slice.length; s++) {
          if (norm(slice.slice(s)).replace(/ /g, "").indexOf(target) === 0) { lo = s; break; }
        }
        for (var e = lo + 1; e <= slice.length; e++) {
          if (norm(slice.slice(lo, e)).replace(/ /g, "") === target) { hi = e; break; }
        }
        out.push({annotId: a.id, blockId: b.id, start: offs[r.start] + lo, end: offs[r.start] + hi});
        return;
      }
    });
    return out;
  }

  function blockAtScrollTop(entries, top){
    var best = entries.length ? entries[0].id : null;
    for (var i = 0; i < entries.length; i++) { if (entries[i].top <= top + 1) best = entries[i].id; else break; }
    return best;
  }
  function pageForBlock(doc, id){
    var b = (doc.blocks || []).find(function(x){ return x.id === id; });
    return b ? b.page : 1;
  }

  return {readingText: readingText, buildReadingDom: buildReadingDom, cropViewport: cropViewport,
    selectionToAnnotation: selectionToAnnotation, anchorAnnotations: anchorAnnotations,
    blockAtScrollTop: blockAtScrollTop, pageForBlock: pageForBlock};
});
