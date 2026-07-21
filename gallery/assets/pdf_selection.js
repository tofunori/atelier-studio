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
    scaledFontAscent:scaledFontAscent,
    scaledFontHeight:scaledFontHeight,
  };
});
