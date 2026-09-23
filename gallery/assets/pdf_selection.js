(function(root, factory){
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfSelection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  function clamp(value, min, max){
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function normalizePoint(texts, point){
    if (!point || !(texts || []).length) return null;
    var index = clamp(Math.trunc(point.index), 0, texts.length - 1);
    var text = String(texts[index] || "");
    return {index:index, offset:clamp(Math.trunc(point.offset), 0, text.length)};
  }

  function comparePoints(a, b){
    return a.index - b.index || a.offset - b.offset;
  }

  function scaledFontAscent(style, fontSize){
    var size = Number(fontSize) || 0;
    if (!style) return size;
    var ascent = Number(style.ascent);
    if (Number.isFinite(ascent)) return ascent * size;
    var descent = Number(style.descent);
    if (Number.isFinite(descent)) return (1 + descent) * size;
    return size;
  }

  function scaledFontHeight(style, fontSize){
    var size = Number(fontSize) || 0;
    if (!style) return size;
    var ascent = Number(style.ascent), descent = Number(style.descent);
    if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > descent)
      return (ascent - descent) * size;
    return size;
  }

  function fitRectToFontMetrics(rect, fontSize, fontHeight){
    var size = Number(fontSize), height = Number(fontHeight);
    var ratio = size > 0 && height > 0 ? height / size : 1;
    var fittedHeight = Number(rect.height) * ratio;
    return {
      left:Number(rect.left),
      right:Number(rect.right),
      top:Number(rect.top),
      bottom:Number(rect.top) + fittedHeight,
      width:Number(rect.width),
      height:fittedHeight,
    };
  }

  /** Fond les rectangles d'une même ligne en un seul rectangle continu.
   *  pdf.js pose un span par mot : un surlignage stocké tel quel montre des
   *  trous entre les mots (vécu 2026-09-19). Deux rectangles sont sur la même
   *  ligne s'ils se recouvrent verticalement d'au moins la moitié du plus
   *  petit ; ils fusionnent si l'écart horizontal reste sous `gap` hauteurs
   *  de ligne (défaut 1,2), ce qui laisse une colonne voisine intacte.
   *  Les rectangles sont normalisés [x, y, w, h] (fractions de la page) ;
   *  `aspect` = hauteur/largeur de la page ramène la hauteur dans l'unité
   *  des x pour comparer l'écart. */
  function mergeLineRects(rects, options){
    options = options || {};
    var gapRatio = Number(options.gap) > 0 ? Number(options.gap) : 1.2;
    var aspect = Number(options.aspect) > 0 ? Number(options.aspect) : 1;
    var boxes = (rects || []).map(function(r){
      return {l:Number(r[0]), t:Number(r[1]), r:Number(r[0]) + Number(r[2]), b:Number(r[1]) + Number(r[3])};
    }).filter(function(box){ return box.r > box.l && box.b > box.t; });
    boxes.sort(function(a, b){ return (a.t - b.t) || (a.l - b.l); });
    var lines = [];
    boxes.forEach(function(box){
      var line = null;
      for (var i = lines.length - 1; i >= 0; i--){
        var candidate = lines[i];
        var overlap = Math.min(candidate.b, box.b) - Math.max(candidate.t, box.t);
        var minH = Math.min(candidate.b - candidate.t, box.b - box.t);
        if (overlap >= minH * 0.5){ line = candidate; break; }
        if (candidate.b < box.t) break;
      }
      if (!line){ lines.push({t:box.t, b:box.b, runs:[{l:box.l, r:box.r, t:box.t, b:box.b}]}); return; }
      line.t = Math.min(line.t, box.t); line.b = Math.max(line.b, box.b);
      var runs = line.runs;
      var placed = false;
      for (var k = 0; k < runs.length; k++){
        var run = runs[k];
        var maxGap = gapRatio * Math.max(run.b - run.t, box.b - box.t) * aspect;
        if (box.l <= run.r + maxGap && box.r >= run.l - maxGap){
          run.l = Math.min(run.l, box.l); run.r = Math.max(run.r, box.r);
          run.t = Math.min(run.t, box.t); run.b = Math.max(run.b, box.b);
          placed = true; break;
        }
      }
      if (!placed) runs.push({l:box.l, r:box.r, t:box.t, b:box.b});
    });
    var out = [];
    lines.forEach(function(line){
      line.runs.sort(function(a, b){ return a.l - b.l; });
      line.runs.forEach(function(run){ out.push([run.l, run.t, run.r - run.l, run.b - run.t]); });
    });
    return out;
  }

  function buildSelection(texts, anchor, focus){
    texts = (texts || []).map(function(text){ return String(text || ""); });
    var a = normalizePoint(texts, anchor), f = normalizePoint(texts, focus);
    if (!a || !f || comparePoints(a, f) === 0) return null;
    var start = comparePoints(a, f) < 0 ? a : f;
    var end = comparePoints(a, f) < 0 ? f : a;
    var segments = [];
    for (var index = start.index; index <= end.index; index++){
      var text = texts[index];
      var from = index === start.index ? start.offset : 0;
      var to = index === end.index ? end.offset : text.length;
      if (to <= from) continue;
      segments.push({index:index, start:from, end:to, text:text.slice(from, to)});
    }
    if (!segments.length) return null;
    var selectedText = segments.map(function(segment){ return segment.text; })
      .join(" ").replace(/\s+/g, " ").trim();
    if (!selectedText) return null;
    return {start:start, end:end, segments:segments, text:selectedText};
  }

  return {
    buildSelection:buildSelection,
    comparePoints:comparePoints,
    fitRectToFontMetrics:fitRectToFontMetrics,
    mergeLineRects:mergeLineRects,
    scaledFontAscent:scaledFontAscent,
    scaledFontHeight:scaledFontHeight,
  };
});
