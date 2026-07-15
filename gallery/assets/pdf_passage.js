(function(root, factory){
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfPassage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  function norm(value){
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function findPassageSpanRange(texts, quote){
    var ranges = [], joined = "";
    (texts || []).forEach(function(text, index){
      var clean = norm(text);
      if (!clean) return;
      if (joined) joined += " ";
      var start = joined.length;
      joined += clean;
      ranges.push({index:index, start:start, end:joined.length});
    });
    var needle = norm(quote);
    if (!joined || !needle) return null;
    var pos = joined.indexOf(needle), length = needle.length;
    if (pos < 0) {
      var words = needle.split(" ").filter(Boolean);
      for (var count = Math.min(18, words.length); count >= Math.min(5, words.length); count--){
        var anchor = words.slice(0, count).join(" ");
        pos = joined.indexOf(anchor);
        if (pos >= 0){ length = needle.length; break; }
      }
    }
    if (pos < 0) return null;
    var end = pos + length;
    var hits = ranges.filter(function(range){ return range.end > pos && range.start < end; });
    if (!hits.length) return null;
    return {start:hits[0].index, end:hits[hits.length - 1].index};
  }
  return {normalize:norm, findPassageSpanRange:findPassageSpanRange};
});
