// Mode lecture : fonctions pures (DOM de la colonne, découpes de figures,
// sélection → rectangles d'annotation, ancrage des annotations, position).
// UMD classique comme pdf_passage.js : chargé par <script>, testé sous node.
(function(root, factory){
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfReading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(root){
  /** Minuscule au sens de `char::is_lowercase` (Rust) : un chiffre n'en est
   *  pas une (`toUpperCase() === toLowerCase()`). */
  function isLower(c){ return !!c && c.toLowerCase() === c && c.toUpperCase() !== c; }

  /** Jointure des lignes d'un bloc, MÊME RÈGLE que `join_lines` côté Rust :
   *  accumulé finissant par `-` suivi d'une minuscule → le `-` disparaît et la
   *  jointure est sans espace ; sinon une espace. Renvoie le texte affiché,
   *  l'offset de début de chaque ligne dans ce texte, et pour chaque ligne si
   *  son trait d'union final a été absorbé (il reste PEINT sur la page, d'où
   *  l'écart entre longueur affichée et longueur de la ligne). */
  function layout(texts){
    var text = "", offs = [], absorbed = [];
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i] == null ? "" : String(texts[i]);
      absorbed.push(false);
      if (i === 0) { offs.push(0); text = t; continue; }
      if (text.slice(-1) === "-" && isLower(t.charAt(0))) { text = text.slice(0, -1); absorbed[i - 1] = true; }
      else { text += " "; }
      offs.push(text.length);
      text += t;
    }
    return {text: text, offs: offs, absorbed: absorbed};
  }
  function blockTexts(block){
    return (block.lines || []).map(function(l){ return l.text; });
  }
  /** Texte tel qu'affiché, dé-césuré : égal à `block.text` produit par Rust.
   *  Les offsets de la sélection et de l'ancrage se calculent sur CETTE
   *  chaîne, via `lineOffsets`. */
  function readingText(block){ return layout(blockTexts(block)).text; }
  /** Offset de début de chaque ligne dans `readingText(block)`. */
  function lineOffsets(block){ return layout(blockTexts(block)).offs; }

  function buildReadingDom(doc, hooks){
    var d = hooks.document, frag = d.createDocumentFragment(), list = null;
    (doc.blocks || []).forEach(function(b){
      var el;
      if (b.kind === "list") {
        if (!list) { list = d.createElement("ul"); frag.appendChild(list); }
        el = d.createElement("li");
        // Le marqueur de puce/numéro RESTE dans le texte : textContent doit
        // valoir readingText(block) pour tout bloc, les offsets d'annotation
        // en dépendent (revue plan 078 T6 fix 1, ruling a). La puce du
        // navigateur est masquée côté CSS (#reading ul{list-style:none}).
        el.textContent = readingText(b);
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

  /** Offsets [start,end) dans readingText(block) → {page, text, rects normalisés}.
   *  `pages` = `doc.pages`. Un bloc peut être un paragraphe FUSIONNÉ d'une
   *  page à l'autre : une annotation n'ayant qu'une page, on ne garde que les
   *  lignes de la page de la première ligne couverte et on normalise avec les
   *  dimensions de CETTE page (sinon les rects de la suite atterrissaient sur
   *  la page du début, à une échelle qui n'est même pas la sienne). */
  function selectionToAnnotation(block, start, end, pages){
    var lines = block.lines || [], info = layout(blockTexts(block)), rects = [];
    var text = info.text.slice(start, end), page = 0, dim = null;
    lines.forEach(function(l, i){
      // longueur PEINTE (avec le trait d'union) vs longueur AFFICHÉE (sans).
      var len = l.text.length, vis = len - (info.absorbed[i] ? 1 : 0);
      var ls = info.offs[i], le = ls + vis;
      if (le <= start || ls >= end) return;
      var lp = l.page || block.page;
      if (!page) { page = lp; dim = (pages || [])[page - 1]; }
      if (lp !== page || !dim) return;
      var a = Math.max(start, ls) - ls, b = Math.min(end, le) - ls;
      // sélection jusqu'au bout d'une ligne césurée : le `-` est le dernier
      // caractère peint, le rect doit l'englober.
      if (info.absorbed[i] && b >= vis) b = len;
      var w = l.bbox[2] - l.bbox[0], h = l.bbox[3] - l.bbox[1];
      var x = l.bbox[0] + w * (len ? a / len : 0), xe = l.bbox[0] + w * (len ? b / len : 1);
      rects.push([x / dim.w, l.bbox[1] / dim.h, (xe - x) / dim.w, h / dim.h]);
    });
    return {page: page || block.page, text: text, rects: rects};
  }

  function anchorAnnotations(doc, annots){
    var passage = root.AtelierPdfPassage, out = [];
    if (!passage) return out;
    (annots || []).forEach(function(a){
      // toutes les marques de TEXTE (les seules qui aient une citation) :
      // surlignage, soulignement, barré, commentaire. `area`/`note` ont une
      // géométrie de page, pas de texte à ancrer.
      if (["comment", "hl", "ul", "st"].indexOf(a.kind) < 0 || !a.text) return;
      var page = Number(a.page) || 1;
      var candidates = (doc.blocks || []).filter(function(b){ return b.lines && b.lines.length && Math.abs(b.page - page) <= 1; });
      candidates.sort(function(x, y){ return Math.abs(x.page - page) - Math.abs(y.page - page); });
      for (var i = 0; i < candidates.length; i++) {
        var b = candidates[i], texts = b.lines.map(function(l){ return l.text; });
        var m = passage.findAllSpanRanges(texts, a.text);
        if (!m || !m.length) continue;
        var r = m[0], offs = lineOffsets(b);
        // findAllSpanRanges renvoie {start, end} en index de spans ; on
        // affine aux caractères en normalisant en forme COMPACTE (sans
        // espaces) les deux côtés, car c'est la forme que findAllSpanRanges
        // utilise pour son second index (tolérance à la césure/espacement).
        // la tranche est jointe comme le texte affiché (dé-césurée) : sinon
        // `lo`/`hi` seraient comptés sur une chaîne plus longue que celle des
        // offsets et décaleraient toutes les marques.
        var slice = layout(texts.slice(r.start, r.end + 1)).text;
        var norm = passage.normalize, target = norm(a.text).replace(/ /g, ""), lo = 0, hi = slice.length;
        for (var s = 0; s < slice.length; s++) {
          if (norm(slice.slice(s)).replace(/ /g, "").indexOf(target) === 0) { lo = s; break; }
        }
        // La forme compacte ignore les espaces : `lo` tombe un caractère trop
        // tôt quand le passage suit une espace (revue plan 078 T6 fix 1,
        // ruling b). On avance sur les espaces de tête.
        while (lo < slice.length && slice[lo] === " ") lo++;
        for (var e = lo + 1; e <= slice.length; e++) {
          if (norm(slice.slice(lo, e)).replace(/ /g, "") === target) { hi = e; break; }
        }
        out.push({annotId: a.id, blockId: b.id, start: offs[r.start] + lo, end: offs[r.start] + hi});
        return;
      }
    });
    return out;
  }

  /** `entries` = [{id, top}] TRIÉ PAR `top` croissant (l'ordre du DOM de la
   *  colonne) : la boucle s'arrête au premier bloc situé sous la position. */
  function blockAtScrollTop(entries, top){
    var best = entries.length ? entries[0].id : null;
    for (var i = 0; i < entries.length; i++) { if (entries[i].top <= top + 1) best = entries[i].id; else break; }
    return best;
  }
  function pageForBlock(doc, id){
    var b = (doc.blocks || []).find(function(x){ return x.id === id; });
    return b ? b.page : 1;
  }

  return {readingText: readingText, lineOffsets: lineOffsets, buildReadingDom: buildReadingDom, cropViewport: cropViewport,
    selectionToAnnotation: selectionToAnnotation, anchorAnnotations: anchorAnnotations,
    blockAtScrollTop: blockAtScrollTop, pageForBlock: pageForBlock};
});
